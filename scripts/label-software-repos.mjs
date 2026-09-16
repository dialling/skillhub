#!/usr/bin/env node
/**
 * Label repositories whose skills need an application to be installed.
 *
 * `repoKind: 'software'` already says "this is an application, not a skill pack",
 * but the store showed that as a quiet chip next to everything else. The skills
 * inside such a repository reach for that application's daemon, credentials and
 * dependencies — installing the markdown alone produces an agent that explains it
 * had to improvise. Knowing *which* application is the useful part.
 *
 * Two labels, in order of what can be established:
 *
 *   appAgent   the repository says it is a plugin *for* one agent
 *              ("Best DeepSeek Harness Design Plugin") → "<agent> 专用"
 *   appNeeds   otherwise, the application's own name → "需要 <app>"
 *
 * An agent named merely in passing is not a target: several of these list four or
 * five tools in a feature list, and picking the first would mislabel them.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'curated-catalog.json')
const catalog = JSON.parse(readFileSync(file, 'utf8'))

/** Agent display names, matched against a repository's own words. */
const AGENTS = [
  ['claude-code', /\bclaude\s*code\b/i, 'Claude Code'],
  ['codex', /\bcodex\b/i, 'Codex'],
  ['cursor', /\bcursor\b/i, 'Cursor'],
  ['github-copilot', /\bcopilot\b/i, 'Copilot'],
  ['gemini-cli', /\bgemini\b/i, 'Gemini CLI'],
  ['windsurf', /\bwindsurf\b/i, 'Windsurf'],
  ['dsh', /\bdeepseek\s+harness\b|\bdsh\b/i, 'DeepSeek Harness']
]

let agents = 0
let needs = 0
for (const r of catalog.repos) {
  delete r.appAgent
  delete r.appNeeds
  if (r.repoKind !== 'software') continue

  const text = `${r.name} ${r.descriptionEn || ''}`

  // "X plugin" / "plugin for X" states a target; a name in a list does not.
  const pluginOf = AGENTS.filter(([, re, label]) => {
    const name = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${name}\\b[^.]{0,40}\\bplugin\\b|\\bplugin\\b[^.]{0,40}\\b${name}\\b`, 'i').test(text)
  })

  if (pluginOf.length === 1) {
    r.appAgent = pluginOf[0][0]
    agents++
  } else {
    r.appNeeds = r.name
    needs++
  }
}

/*
  --check verifies the published catalog carries the labels without rewriting it,
  so the gate catches a catalog that was regenerated without this pass.
*/
if (process.argv.includes('--check')) {
  const software = catalog.repos.filter((r) => r.repoKind === 'software')
  const unlabelled = software.filter((r) => !r.appAgent && !r.appNeeds)
  if (unlabelled.length) {
    console.log(`\n✗ ${unlabelled.length} 个软件类仓库没有应用标注：${unlabelled.map((r) => r.name).join(', ')}\n`)
    process.exit(1)
  }
  console.log(`PASS — ${software.length} 个软件类仓库均已标注（${agents} 个插件型 · ${needs} 个应用型）`)
  process.exit(0)
}

catalog.appLabelsAt = new Date().toISOString()
writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

console.log(`  插件型（标为「X 专用」）: ${agents}`)
console.log(`  其他应用型（标为「需要 X」）: ${needs}`)
for (const r of catalog.repos.filter((x) => x.appAgent)) {
  console.log(`    ${r.name} → ${r.appAgent}`)
}
