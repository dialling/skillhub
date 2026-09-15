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
const agents = registry.agents

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
  `README 的 agent 表格已更新：${agents.length} 个 agent（${agents.filter((a) => a.confidence !== 'high').length} 个非高置信度）。`
)
