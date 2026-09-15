import { existsSync, readdirSync, lstatSync, readlinkSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentTarget } from '../../shared/types'
import { curatedAgentRegistryPath, expandPath, tildify } from './paths'
import { settings } from './db'
import { m } from './msg'
import { isAbsoluteOrHome, isInside, which } from './platform'

/** Built-in fallback registry used only when data/agent-registry.json is absent. */
interface RegistryEntry {
  id: string
  name: string
  vendor?: string
  color?: string
  globalSkillsDir?: string | null
  projectSkillsDir?: string | null
  detect?: { dirs?: string[]; files?: string[]; binaries?: string[] }
  confidence?: 'high' | 'medium' | 'low'
  sourceUrl?: string | null
  readsUniversalDir?: boolean
  supportsSymlink?: boolean
  projectOnly?: boolean
  launch?: {
    kind: 'cli' | 'app' | 'web'
    command?: string
    promptArg?: boolean
    appName?: string
    url?: string
    instructionFile?: string
  }
}

const FALLBACK_REGISTRY: RegistryEntry[] = [
  {
    id: 'dsh',
    name: 'DeepSeek Harness',
    vendor: 'DeepSeek',
    color: '#4D6BFE',
    globalSkillsDir: '~/.dsh/skills',
    projectSkillsDir: '.dsh/skills',
    detect: { dirs: ['~/.dsh'], binaries: ['dsh'] }
  },
  {
    id: 'agents-standard',
    name: 'Universal (.agents)',
    vendor: 'Agent Skills convention',
    color: '#22D3EE',
    globalSkillsDir: '~/.agents/skills',
    projectSkillsDir: '.agents/skills',
    detect: { dirs: ['~/.agents'] }
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    color: '#D97757',
    globalSkillsDir: '~/.claude/skills',
    projectSkillsDir: '.claude/skills',
    detect: { dirs: ['~/.claude'], binaries: ['claude'] }
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    vendor: 'OpenAI',
    color: '#10A37F',
    globalSkillsDir: '~/.codex/skills',
    projectSkillsDir: '.codex/skills',
    detect: { dirs: ['~/.codex'], binaries: ['codex'] }
  },
  {
    id: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    color: '#8B8B8B',
    globalSkillsDir: '~/.cursor/skills',
    projectSkillsDir: '.cursor/skills',
    detect: { dirs: ['~/.cursor'], binaries: ['cursor'] }
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    vendor: 'Google',
    color: '#4285F4',
    globalSkillsDir: '~/.gemini/skills',
    projectSkillsDir: '.gemini/skills',
    detect: { dirs: ['~/.gemini'], binaries: ['gemini'] }
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    vendor: 'SST',
    color: '#F97316',
    globalSkillsDir: '~/.config/opencode/skills',
    projectSkillsDir: '.opencode/skills',
    detect: { dirs: ['~/.config/opencode'], binaries: ['opencode'] }
  }
]

let registryCache: RegistryEntry[] | null = null

export function loadRegistry(): RegistryEntry[] {
  if (registryCache) return registryCache
  try {
    const p = curatedAgentRegistryPath()
    if (existsSync(p)) {
      const parsed = JSON.parse(readFileSync(p, 'utf8'))
      if (Array.isArray(parsed?.agents) && parsed.agents.length) {
        // The shipped registry is authoritative; it was verified against vendor
        // documentation and is intentionally not merged with the fallback.
        registryCache = parsed.agents as RegistryEntry[]
        return registryCache
      }
    }
  } catch (err) {
    console.error('[agents] failed to read registry file', err)
  }
  registryCache = FALLBACK_REGISTRY
  return registryCache
}

function resolveBinary(name: string): string | null {
  return which(name)
}

/**
 * Two different products can ship a binary with the same name — Kimi CLI and
 * Kimi Code both install `kimi`, and only the latter is present on a Kimi Code
 * machine. A binary that lives inside *another* registered agent's own directory
 * is that agent's evidence, not ours, so don't count it.
 */
function binaryIsForeign(binPath: string, ownId: string): boolean {
  for (const other of loadRegistry()) {
    if (other.id === ownId) continue
    const roots = [
      ...(other.detect?.dirs || []),
      other.globalSkillsDir ? other.globalSkillsDir.replace(/\/skills$/, '') : null
    ].filter(Boolean) as string[]
    for (const root of roots) {
      if (isInside(binPath, expandPath(root))) return true
    }
  }
  return false
}

function binaryExists(name: string, ownId: string): boolean {
  const bin = resolveBinary(name)
  return bin ? !binaryIsForeign(bin, ownId) : false
}

export function countSkills(dir: string): number {
  const abs = expandPath(dir)
  if (!existsSync(abs)) return 0
  try {
    return readdirSync(abs, { withFileTypes: true }).filter((e) => {
      if (e.name.startsWith('.')) return false
      if (e.isDirectory()) return existsSync(join(abs, e.name, 'SKILL.md'))
      if (e.isSymbolicLink()) return true
      return false
    }).length
  } catch {
    return 0
  }
}

function detect(entry: RegistryEntry): { detected: boolean; by?: AgentTarget['detectedBy'] } {
  const d = entry.detect || {}
  for (const dir of d.dirs || []) {
    if (existsSync(expandPath(dir))) return { detected: true, by: 'dir' }
  }
  for (const f of d.files || []) {
    if (existsSync(expandPath(f))) return { detected: true, by: 'config' }
  }
  // A skills directory that already exists is itself strong evidence.
  if (entry.globalSkillsDir && existsSync(expandPath(entry.globalSkillsDir))) {
    return { detected: true, by: 'dir' }
  }
  for (const b of d.binaries || []) {
    if (binaryExists(b, entry.id)) return { detected: true, by: 'binary' }
  }
  return { detected: false }
}

export function listAgents(): AgentTarget[] {
  const s = settings.get()
  const enabled = new Set(s.enabledAgents)
  const out: AgentTarget[] = []

  const projectBase = s.projectDir

  for (const entry of loadRegistry()) {
    // Agents that document only a project-level directory (ona, qodo, replit…)
    // still need to be visible and installable, so resolve them against the
    // configured project directory instead of dropping them silently.
    let path = entry.globalSkillsDir || null
    let kind: AgentTarget['kind'] = 'global'
    if (!path) {
      if (!entry.projectSkillsDir) continue
      kind = 'project'
      path = projectBase ? join(projectBase, entry.projectSkillsDir) : entry.projectSkillsDir
    }
    const det = isAbsoluteOrHome(path) ? detect(entry) : { detected: false }
    const found = countSkills(path)
    out.push({
      id: entry.id,
      name: entry.name,
      vendor: entry.vendor,
      color: entry.color,
      kind,
      path,
      detected: 'detected' in det ? !!det.detected : false,
      detectedBy: 'by' in det ? det.by : undefined,
      enabled: enabled.has(entry.id) || (kind === 'global' && det.detected && !s.enabledAgents.length),
      found,
      projectOnly: !entry.globalSkillsDir,
      confidence: entry.confidence,
      sourceUrl: entry.sourceUrl || undefined,
      readsUniversalDir: entry.readsUniversalDir,
      supportsSymlink: entry.supportsSymlink
    })
  }

  for (const c of s.customAgents) {
    out.push({
      id: `custom:${c.id}`,
      name: c.name,
      vendor: m('agent.customLabel'),
      kind: 'custom',
      path: c.path,
      detected: existsSync(expandPath(c.path)),
      detectedBy: 'manual',
      enabled: true,
      found: countSkills(c.path)
    })
  }

  return out
}

/** Agents that should receive an install: enabled AND detected on this machine. */
export function activeAgents(): AgentTarget[] {
  return listAgents().filter((a) => a.enabled)
}

export function projectTargets(projectDir: string): AgentTarget[] {
  const out: AgentTarget[] = []
  for (const entry of loadRegistry()) {
    if (!entry.projectSkillsDir) continue
    out.push({
      id: `project:${entry.id}`,
      name: entry.name,
      vendor: entry.vendor,
      color: entry.color,
      kind: 'project',
      path: join(projectDir, entry.projectSkillsDir),
      detected: existsSync(join(projectDir, entry.projectSkillsDir)),
      detectedBy: 'manual',
      enabled: false,
      found: countSkills(join(projectDir, entry.projectSkillsDir))
    })
  }
  return out
}

/** Resolve the skills dir a skill should be installed into for an agent id. */
export function resolveAgentDir(agentId: string): string | null {
  if (agentId.startsWith('custom:')) {
    const c = settings.get().customAgents.find((x) => `custom:${x.id}` === agentId)
    return c ? expandPath(c.path) : null
  }
  if (agentId.startsWith('project:')) {
    const base = settings.get().projectDir
    if (!base) return null
    const realId = agentId.slice('project:'.length)
    const entry = loadRegistry().find((e) => e.id === realId)
    return entry?.projectSkillsDir ? join(base, entry.projectSkillsDir) : null
  }
  const entry = loadRegistry().find((e) => e.id === agentId)
  if (!entry) return null
  if (entry.globalSkillsDir) return expandPath(entry.globalSkillsDir)
  const base = settings.get().projectDir
  return base && entry.projectSkillsDir ? join(base, entry.projectSkillsDir) : null
}

export function agentDisplayName(agentId: string): string {
  if (agentId.startsWith('custom:')) {
    const c = settings.get().customAgents.find((x) => `custom:${x.id}` === agentId)
    return c ? m('agent.customSuffix', { name: c.name }) : agentId
  }
  if (agentId.startsWith('project:')) {
    const realId = agentId.slice('project:'.length)
    const entry = loadRegistry().find((e) => e.id === realId)
    return entry ? m('agent.projectSuffix', { name: entry.name }) : agentId
  }
  return loadRegistry().find((e) => e.id === agentId)?.name || agentId
}

/**
 * On first run, freeze the auto-detected agent set into settings so the choice
 * is explicit and stable — afterwards the user's toggles are the only source of
 * truth, and a newly installed agent is not silently opted in.
 */
export function ensureEnabledAgents(): void {
  const s = settings.get()
  if (s.enabledAgents.length > 0) return
  const detected = listAgents()
    .filter((a) => a.enabled)
    .map((a) => a.id)
  settings.set({ enabledAgents: detected, firstRunDone: true })
}

export interface DirEntry {
  name: string
  path: string
  isSymlink: boolean
  linkTarget?: string
  managed: boolean
  hasSkillFile: boolean
  mtimeMs: number
}

/** Inspect what is already sitting inside an agent's skills directory. */
export function scanAgentDir(agentId: string): DirEntry[] {
  const dir = resolveAgentDir(agentId)
  if (!dir || !existsSync(dir)) return []
  const storeRoot = join(homedir(), '.skillhub', 'store')
  const out: DirEntry[] = []
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let isSymlink = false
    let linkTarget: string | undefined
    let mtimeMs = 0
    try {
      const st = lstatSync(full)
      isSymlink = st.isSymbolicLink()
      mtimeMs = st.mtimeMs
      if (isSymlink) linkTarget = readlinkSync(full)
    } catch {
      continue
    }
    const real = isSymlink && linkTarget ? expandPath(linkTarget) : full
    out.push({
      name,
      path: full,
      isSymlink,
      linkTarget,
      managed: isInside(real, storeRoot),
      hasSkillFile: existsSync(join(real, 'SKILL.md')),
      mtimeMs
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
