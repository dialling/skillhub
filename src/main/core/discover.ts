import { existsSync, readdirSync } from 'node:fs'
import type { LocalSkill, InstallTargetAdvice, InstallTargetCandidate } from '../../shared/types'
import { expandPath, tildify, ensureDir } from './paths'
import { library, settings } from './db'
import { listAgents, resolveAgentDir, scanAgentDir } from './agents'
import { pathEndsWith } from './platform'
import { curatedCatalog } from './catalog'
import { readSkillDir } from './skills'

/**
 * Everything already on this machine that looks like an agent skill.
 *
 * Users accumulate skills long before they install this app — dropped into
 * `~/.claude/skills` by hand, pulled in by `npx skills add`, copied between
 * tools. Surfacing those and matching them back to catalog entries is what
 * turns the store from "browse and install" into "manage what I have".
 */
export async function detectLocalSkills(): Promise<LocalSkill[]> {
  const seen = new Set<string>()
  const out: LocalSkill[] = []

  // index: skill folder name (lowercase) -> catalog entry
  const catalogIndex = new Map<string, { repo: string; path: string }>()
  for (const repo of await curatedCatalog()) {
    for (const dir of repo.skillDirs || []) {
      // A skill living at the repository root is stored as "." or "", and its
      // on-disk folder name is the repository name — not "." .
      const name = (dir && dir !== '.' ? dir.split('/').pop()! : repo.name).toLowerCase()
      if (!catalogIndex.has(name)) catalogIndex.set(name, { repo: repo.fullName, path: dir })
    }
  }

  const libraryRepos = new Set(library.get().items.map((i) => i.fullName))
  const librarySkillNames = new Set(
    library
      .get()
      .items.flatMap((i) => i.skills.map((s) => s.name.toLowerCase()))
  )

  for (const agent of listAgents()) {
    const dir = resolveAgentDir(agent.id)
    if (!dir || !existsSync(dir)) continue
    for (const entry of scanAgentDir(agent.id)) {
      // Agent skill folders often hold bookkeeping files next to the skills
      // (WorkBuddy keeps a .json index, others keep READMEs). Only a directory
      // with a SKILL.md, or a symlink, is actually a skill.
      if (!entry.hasSkillFile && !entry.isSymlink) continue

      const real = entry.isSymlink && entry.linkTarget ? expandPath(entry.linkTarget) : entry.path
      // Several agents share one physical directory; report each location once.
      const key = `${real}`
      if (seen.has(key)) continue
      seen.add(key)

      const parsed = readSkillDir(real)
      const lookup = entry.name.toLowerCase()
      const hit = catalogIndex.get(lookup)
      const item = hit ? library.get().items.find((i) => i.fullName === hit.repo) : undefined

      out.push({
        name: parsed?.title || entry.name,
        folder: entry.name,
        path: entry.path,
        realPath: real,
        agentId: agent.id,
        agentName: agent.name,
        managed: entry.managed,
        hasSkillFile: entry.hasSkillFile,
        description: parsed?.description?.slice(0, 200),
        inLibrary: !!item || libraryRepos.has(hit?.repo || '') || librarySkillNames.has(lookup),
        matchedRepo: hit?.repo || null,
        matchedSkillPath: hit?.path ?? null
      })
    }
  }

  // richest matches first, then whatever is already managed
  return out.sort(
    (a, b) =>
      Number(!!b.matchedRepo) - Number(!!a.matchedRepo) ||
      Number(b.managed) - Number(a.managed) ||
      a.name.localeCompare(b.name)
  )
}

/**
 * Where a newly downloaded skill should go.
 *
 * 1. an explicit choice the user already made
 * 2. the agent skills directory that already holds the most skills — the user
 *    has clearly been installing somewhere, so keep their habit
 * 3. `~/.agents/skills`, the cross-tool convention most agents read
 * 4. nothing exists yet: create `~/.agents/skills` rather than guessing at a
 *    vendor directory the user may never install
 */
export async function recommendInstallTarget(): Promise<InstallTargetAdvice> {
  const configured = settings.get().installRoot
  const candidates: InstallTargetCandidate[] = []

  for (const agent of listAgents()) {
    const dir = resolveAgentDir(agent.id)
    if (!dir) continue
    const abs = expandPath(dir)
    const exists = existsSync(abs)
    let count = 0
    if (exists) {
      try {
        count = readdirSync(abs).filter((n) => !n.startsWith('.')).length
      } catch {
        count = 0
      }
    }
    candidates.push({
      path: tildify(abs),
      absPath: abs,
      label: agent.name,
      count,
      exists,
      agentId: agent.id
    })
  }

  /**
   * Several agents share one physical directory (~/.agents/skills is read by
   * Goose, Zed, OpenHands and the portable convention). Collapse them into one
   * candidate whose label names the best-known reader, otherwise the picker
   * shows the same path four times.
   */
  const byPath = new Map<string, InstallTargetCandidate>()
  for (const c of candidates) {
    const prev = byPath.get(c.absPath)
    if (!prev) {
      byPath.set(c.absPath, { ...c })
      continue
    }
    prev.count = Math.max(prev.count, c.count)
    prev.exists = prev.exists || c.exists
  }
  candidates.length = 0
  candidates.push(...byPath.values())

  // Most-populated first; ties go to the most widely-read directory so the
  // default is the one the most agents will actually pick up.
  const COMPAT: Array<[string, number]> = [
    ['.agents/skills', 0],
    ['.claude/skills', 1],
    ['.cursor/skills', 2],
    ['.dsh/skills', 3]
  ]
  const weight = (p: string): number => COMPAT.find(([s]) => p.endsWith(s))?.[1] ?? 9
  candidates.sort(
    (a, b) => b.count - a.count || weight(a.absPath) - weight(b.absPath) || a.path.localeCompare(b.path)
  )

  if (configured) {
    const abs = expandPath(configured)
    return {
      path: tildify(abs),
      absPath: abs,
      reason: 'configured',
      exists: existsSync(abs),
      candidates
    }
  }

  const populated = candidates.filter((c) => c.exists && c.count > 0)
  if (populated.length) {
    // Prefer the portable directory when it is already in use, otherwise the
    // busiest one.
    const universal = populated.find((c) => pathEndsWith(c.absPath, '/.agents/skills'))
    const chosen = universal || populated[0]
    return {
      path: chosen.path,
      absPath: chosen.absPath,
      reason: universal ? 'universal' : 'detected',
      exists: true,
      candidates
    }
  }

  const universalPath = expandPath('~/.agents/skills')
  return {
    path: tildify(universalPath),
    absPath: universalPath,
    reason: 'default',
    exists: existsSync(universalPath),
    candidates
  }
}

/** Materialise the recommended (or user-chosen) target directory. */
export function ensureInstallRoot(path: string): string {
  const abs = expandPath(path)
  ensureDir(abs)
  return abs
}

export interface AgentDirHealth {
  agentId: string
  agentName: string
  path: string
  exists: boolean
  skills: number
  managed: number
  brokenLinks: number
}

/** Per-agent audit used by the discovery panel. */
export function auditAgentDirs(): AgentDirHealth[] {
  const out: AgentDirHealth[] = []
  for (const agent of listAgents()) {
    const dir = resolveAgentDir(agent.id)
    if (!dir) continue
    const abs = expandPath(dir)
    if (!existsSync(abs)) {
      out.push({ agentId: agent.id, agentName: agent.name, path: tildify(abs), exists: false, skills: 0, managed: 0, brokenLinks: 0 })
      continue
    }
    const entries = scanAgentDir(agent.id)
    let broken = 0
    for (const e of entries) {
      const real = e.isSymlink && e.linkTarget ? expandPath(e.linkTarget) : e.path
      if (!existsSync(real)) broken++
    }
    out.push({
      agentId: agent.id,
      agentName: agent.name,
      path: tildify(abs),
      exists: true,
      skills: entries.length,
      managed: entries.filter((e) => e.managed).length,
      brokenLinks: broken
    })
  }
  return out.filter((d) => d.exists || d.managed > 0)
}

/** Write the choice and make sure the directory is really there. */
export function setInstallRoot(path: string): InstallTargetAdvice {
  const abs = ensureInstallRoot(path)
  settings.set({ installRoot: tildify(abs) })
  return {
    path: tildify(abs),
    absPath: abs,
    reason: 'configured',
    exists: true,
    candidates: []
  }
}
