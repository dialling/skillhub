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

const base = readJson(target)
const existing = new Set(base.agents.map((a) => a.id))
const added = []
const skipped = []

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
      skipped.push(`${raw.id} (已存在)`)
      continue
    }
    const agent = validate(raw, existing)
    existing.add(agent.id)
    added.push(agent)
  }
}

if (!added.length) {
  console.log('\n没有新增条目。')
  process.exit(0)
}

base.agents = [...base.agents, ...added]
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
if (skipped.length) console.log(`\n跳过 ${skipped.length} 个：${skipped.join(', ')}`)
console.log(`\n注册表现在共 ${base.agents.length} 个 agent，置信度分布 ${JSON.stringify(byConfidence)}`)
