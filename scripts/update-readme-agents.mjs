#!/usr/bin/env node
/**
 * Regenerate the agent table in README.md from data/agent-registry.json.
 *
 *   node scripts/update-readme-agents.mjs [--check]
 *
 * The registry grows as vendors ship skills support; hand-maintaining a 40-row
 * table in the README guarantees it drifts. `--check` exits non-zero when the
 * README is stale, so CI can catch it.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = join(root, 'data', 'agent-registry.json')
const readmePath = join(root, 'README.md')

const START = '<!-- AGENT-TABLE:START -->'
const END = '<!-- AGENT-TABLE:END -->'

const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
/*
 * Only the agents the app actually lists.
 *
 * The registry is broader than the app on purpose: it also records hosted chats
 * (web AI with no skills directory anywhere), which the app skips because there
 * is nowhere to install into. Mapping every entry made the generated table
 * disagree with the 智能体 page it documents — 92 rows against 80, including a
 * dozen entries with an em dash in both directory columns, which reads as
 * missing data rather than as "this one is not an install target".
 */
const agents = registry.agents.filter((a) => a.globalSkillsDir || a.projectSkillsDir)

const dash = (v) => (v ? `\`${v}\`` : '—')
const confidenceMark = (c) => (c === 'high' ? '' : c === 'medium' ? ' ᵐ' : ' ˡ')

const rows = agents.map(
  (a) =>
    `| ${a.name}${confidenceMark(a.confidence)} | ${dash(a.globalSkillsDir)} | ${dash(
      a.projectSkillsDir
    )}${a.readsUniversalDir ? ' ·ᵁ' : ''} |`
)

const table = [
  `共 **${agents.length}** 个 agent。`,
  '',
  '| Agent | 全局技能目录 | 项目级目录 |',
  '|---|---|---|',
  ...rows,
  '',
  '> `ᵁ` = 同时读取通用目录 `~/.agents/skills`；`ᵐ` / `ˡ` = 中等 / 低置信度，',
  '> 表示该路径来自厂商源码或未能从官方文档核实，可在应用内「智能体」页点开查看出处。',
  '',
  `*由 \`scripts/update-readme-agents.mjs\` 从 \`data/agent-registry.json\` 生成，请勿手改。*`
].join('\n')

const readme = readFileSync(readmePath, 'utf8')
const startIdx = readme.indexOf(START)
const endIdx = readme.indexOf(END)

if (startIdx === -1 || endIdx === -1) {
  console.error(`README.md 缺少 ${START} / ${END} 标记，无法生成表格。`)
  process.exit(1)
}

const next =
  readme.slice(0, startIdx + START.length) + '\n' + table + '\n' + readme.slice(endIdx)

if (next === readme) {
  console.log(`README 的 agent 表格已是最新（${agents.length} 个 agent）。`)
  process.exit(0)
}

if (process.argv.includes('--check')) {
  console.error('README 的 agent 表格已过期，请运行 node scripts/update-readme-agents.mjs')
  process.exit(1)
}

writeFileSync(readmePath, next, 'utf8')
console.log(
  `README 的 agent 表格已更新：${agents.length} 个可安装 agent（注册表共 ${registry.agents.length} 条，其余为无技能目录的网页版对话）。`
)
