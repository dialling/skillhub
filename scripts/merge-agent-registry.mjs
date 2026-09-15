#!/usr/bin/env node
/**
 * Merge the research staging files into data/agent-registry.json.
 *
 *   node scripts/merge-agent-registry.mjs
 *
 * Reads data/agent-registry.zh.json and data/agent-registry.intl.json (written
 * by the research pass), folds them into the canonical registry, de-duplicates
 * by id (existing entries win), validates every record, and prints a summary.
 * The staging files are removed on success.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'data', 'agent-registry.json')
const stagings = [
  join(root, 'data', 'agent-registry.zh.json'),
  join(root, 'data', 'agent-registry.intl.json')
]

const REQUIRED = ['id', 'name', 'color']
const CONFIDENCE = new Set(['high', 'medium', 'low'])

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Reject anything that would break the registry consumers. */
function validate(agent, seen) {
  for (const key of REQUIRED) {
    if (!agent[key]) throw new Error(`${agent.id || '?'}: missing ${key}`)
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(agent.id)) throw new Error(`${agent.id}: id must be kebab-case`)
  if (seen.has(agent.id)) throw new Error(`${agent.id}: duplicate id`)
  if (!agent.globalSkillsDir && !agent.projectSkillsDir) {
    throw new Error(`${agent.id}: needs at least one skills directory`)
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(agent.color)) throw new Error(`${agent.id}: bad color ${agent.color}`)
  if (agent.confidence && !CONFIDENCE.has(agent.confidence)) {
    throw new Error(`${agent.id}: bad confidence ${agent.confidence}`)
  }
  for (const key of ['globalSkillsDir', 'projectSkillsDir']) {
    const v = agent[key]
    if (v == null) continue
    if (typeof v !== 'string' || v.endsWith('/')) throw new Error(`${agent.id}: ${key} has a trailing slash`)
    if (key === 'globalSkillsDir' && !v.startsWith('~')) {
      throw new Error(`${agent.id}: globalSkillsDir must start with ~ (got ${v})`)
    }
    if (key === 'projectSkillsDir' && v.startsWith('/')) {
      throw new Error(`${agent.id}: projectSkillsDir must be relative`)
    }
  }
  if (!agent.detect) agent.detect = { dirs: [], files: [], binaries: [] }
  for (const key of ['dirs', 'files', 'binaries']) {
    if (!Array.isArray(agent.detect[key])) agent.detect[key] = []
  }
  return agent
}

/**
 * Reading order for the README table and the Agents view: most widely used
 * first. Anything not listed keeps its insertion order after these.
 */
const MAINSTREAM = [
  'claude-code',
  'codex',
  'cursor',
  'gemini-cli',
  'github-copilot',
  'kimi-code',
  'kimi-cli',
  'windsurf',
  'cline',
  'qwen-code',
  'roo-code',
  'kilo-code',
  'opencode',
  'trae',
  'kiro',
  'amp',
  'goose',
  'continue',
  'zed',
  'warp',
  'factory-droid',
  'dsh',
  'agents-standard'
]

function orderAgents(agents) {
  const rank = new Map(MAINSTREAM.map((id, i) => [id, i]))
  return agents
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const rx = rank.has(x.a.id) ? rank.get(x.a.id) : 1000 + x.i
      const ry = rank.has(y.a.id) ? rank.get(y.a.id) : 1000 + y.i
      return rx - ry
    })
    .map((x) => x.a)
}

const CONF_RANK = { low: 0, medium: 1, high: 2 }

/**
 * Two independent research passes disagreed on a handful of entries. Each
 * resolution is recorded here rather than silently letting file order decide.
 */
const RESOLUTIONS = {
  deepcode: {
    why: '中文调研只记录到通用目录，国际调研找到了专用目录 —— 保留专用目录，同时标注它也读取通用目录。',
    patch: { globalSkillsDir: '~/.deepcode/skills', readsUniversalDir: true }
  }
}

const base = readJson(target)
const existing = new Set(base.agents.map((a) => a.id))
const byId = new Map(base.agents.map((a) => [a.id, a]))
const added = []
const skipped = []
const corroborated = []
const conflicts = []

for (const path of stagings) {
  if (!existsSync(path)) {
    console.log(`· 跳过（不存在）${path.replace(root + '/', '')}`)
    continue
  }
  const doc = readJson(path)
  const agents = Array.isArray(doc.agents) ? doc.agents : []
  console.log(`· ${path.replace(root + '/', '')}: ${agents.length} 条`)
  for (const raw of agents) {
    if (!raw?.id) {
      skipped.push('(no id)')
      continue
    }
    if (existing.has(raw.id)) {
      const current = byId.get(raw.id)
      const samePath =
        current &&
        current.globalSkillsDir === raw.globalSkillsDir &&
        current.projectSkillsDir === raw.projectSkillsDir
      if (samePath) {
        // Independent agreement. Keep whichever pass documented it better.
        if ((CONF_RANK[raw.confidence] ?? 0) > (CONF_RANK[current.confidence] ?? 0)) {
          current.confidence = raw.confidence
          if (raw.sourceUrl) current.sourceUrl = raw.sourceUrl
        }
        corroborated.push(raw.id)
      } else {
        conflicts.push({
          id: raw.id,
          kept: `${current?.globalSkillsDir || current?.projectSkillsDir}`,
          other: `${raw.globalSkillsDir || raw.projectSkillsDir}`
        })
      }
      skipped.push(`${raw.id} (已存在)`)
      continue
    }
    const agent = validate(raw, existing)
    existing.add(agent.id)
    byId.set(agent.id, agent)
    added.push(agent)
  }
}

for (const [id, res] of Object.entries(RESOLUTIONS)) {
  const agent = byId.get(id)
  if (!agent) continue
  Object.assign(agent, res.patch)
  agent.notes = `${agent.notes ? agent.notes + ' ' : ''}[裁决] ${res.why}`
}

if (!added.length) {
  console.log('\n没有新增条目。')
  writeFileSync(target, JSON.stringify(base, null, 2) + '\n', 'utf8')
  process.exit(0)
}

base.agents = orderAgents([...base.agents, ...added])
base.generatedAt = new Date().toISOString()
base.notes =
  (base.notes || '') +
  `\n\n[${new Date().toISOString().slice(0, 10)}] 追加 ${added.length} 个 agent（Kimi 等中英文生态补全）。` +
  ' 每条路径的来源见 sourceUrl；confidence 为 low 的条目表示未能在厂商文档中核实。'

writeFileSync(target, JSON.stringify(base, null, 2) + '\n', 'utf8')

for (const path of stagings) {
  if (existsSync(path)) rmSync(path)
}

const byConfidence = base.agents.reduce((acc, a) => {
  const c = a.confidence || 'unset'
  acc[c] = (acc[c] || 0) + 1
  return acc
}, {})

console.log(`\n新增 ${added.length} 个：`)
for (const a of added) {
  console.log(`  + ${a.id.padEnd(22)} ${a.name.padEnd(24)} ${a.globalSkillsDir || a.projectSkillsDir}  [${a.confidence || 'unset'}]`)
}
console.log(`\n交叉验证一致：${corroborated.length} 个（两份独立调研路径相同）`)
if (conflicts.length) {
  console.log(`\n路径冲突 ${conflicts.length} 个（保留先到的，已在 RESOLUTIONS 中裁决）：`)
  for (const c of conflicts) console.log(`  ! ${c.id}: 保留 ${c.kept} / 另一来源 ${c.other}`)
}
if (skipped.length) console.log(`\n跳过 ${skipped.length} 个：${skipped.join(', ')}`)
console.log(`\n注册表现在共 ${base.agents.length} 个 agent，置信度分布 ${JSON.stringify(byConfidence)}`)
