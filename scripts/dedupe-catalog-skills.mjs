#!/usr/bin/env node
/**
 * Clean up the catalog's skill directory lists.
 *
 *   node scripts/dedupe-catalog-skills.mjs [--dry-run]
 *
 * The original crawl counted EVERY directory containing a SKILL.md. That
 * over-counts badly, because large repos ship the same skills several times:
 *
 *   sickn33/agentic-awesome-skills  6670 → the same 2,121 skills packaged once
 *                                   per agent under plugins/<agent>/skills
 *   gotalab/cc-sdd                   137 → 136 are scaffolds under the
 *                                   tools/cc-sdd/templates tree
 *   alirezarezvani/claude-skills     846 → .gemini/skills is a deployment copy
 *                                   of the same skills kept elsewhere
 *
 * Two rules fix it:
 *   1. DROP scaffolding and non-skill folders (templates, samples, README…).
 *   2. DEDUPE by folder name, keeping the most canonical-looking path —
 *      a top-level `skills/` beats a vendored plugins copy, a
 *      shallow path beats a deep one, and a real source dir beats a dotted
 *      deployment target like `.gemini/skills/`.
 *
 * `skillDirsAll` keeps the raw crawl count so the reduction stays auditable.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'curated-catalog.json')
const dryRun = process.argv.includes('--dry-run')

/** Folder names that are scaffolding or documentation, not installable skills. */
const JUNK = /^(readme|readme\.md|template|templates?|example|examples?|sample|samples?|docs?|test|tests?|_\w+|\.\w+)$/i

function segments(path) {
  return path ? path.split('/') : []
}

/** True when the path is a scaffold rather than a skill the user could install. */
function isScaffold(path) {
  const segs = segments(path).map((s) => s.toLowerCase())
  return segs.includes('templates') || segs.includes('template')
}

function isJunk(name) {
  return JUNK.test(name)
}

/**
 * Higher is more canonical. Used to pick one representative path per skill name.
 */
function canonicalScore(path) {
  const segs = segments(path)
  const depth = segs.length
  let score = 0
  if (segs[0] === 'skills') score += 100
  if (segs[0] && !segs[0].startsWith('.') && depth === 2) score += 50
  if (segs.some((s) => s.startsWith('.'))) score -= 30 // deployment target, not source
  if (segs.includes('plugins')) score -= 40
  if (segs.includes('dist') || segs.includes('build') || segs.includes('node_modules')) score -= 60
  score -= depth * 10
  score -= path.length / 200
  return score
}

const doc = JSON.parse(readFileSync(file, 'utf8'))

let rawTotal = 0
let keptTotal = 0
const report = []

for (const repo of doc.repos) {
  const raw = repo.skillDirs || []
  rawTotal += raw.length
  if (repo.skillDirsAll === undefined) repo.skillDirsAll = raw.length

  /** @type {Map<string, {path: string, score: number}>} */
  const best = new Map()
  let dropped = 0

  for (const path of raw) {
    if (isScaffold(path)) {
      dropped++
      continue
    }
    const name = segments(path).pop() || ''
    if (isJunk(name)) {
      dropped++
      continue
    }
    const score = canonicalScore(path)
    const prev = best.get(name)
    if (!prev || score > prev.score) best.set(name, { path, score })
  }

  const cleaned = [...best.values()].map((v) => v.path).sort()
  const removedAsDuplicate = raw.length - dropped - cleaned.length

  repo.skillDirs = cleaned
  repo.skillCount = cleaned.length
  keptTotal += cleaned.length

  if (raw.length - cleaned.length > 2) {
    report.push({
      repo: repo.fullName,
      raw: raw.length,
      kept: cleaned.length,
      scaffolds: dropped,
      duplicates: removedAsDuplicate
    })
  }
}

doc.skillCounts = {
  countedAt: new Date().toISOString(),
  raw: rawTotal,
  unique: keptTotal,
  note:
    'raw 是初次抓取时「含 SKILL.md 的目录」总数，会因仓库为不同 agent 重复打包而虚高；' +
    'unique 是按目录名去重、并剔除模板脚手架后的真实技能数。'
}

if (!dryRun) writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8')

report.sort((a, b) => b.raw - b.kept - (a.raw - a.kept))
console.log(`${dryRun ? '[dry-run] ' : ''}技能目录清理结果\n`)
console.log('仓库'.padEnd(42), '原记录'.padStart(7), '去重后'.padStart(7), '脚手架'.padStart(7), '重复'.padStart(6))
console.log('-'.repeat(76))
for (const r of report.slice(0, 12)) {
  console.log(
    r.repo.padEnd(42),
    String(r.raw).padStart(7),
    String(r.kept).padStart(7),
    String(r.scaffolds).padStart(7),
    String(r.duplicates).padStart(6)
  )
}
console.log('-'.repeat(76))
console.log('合计'.padEnd(42), String(rawTotal).padStart(7), String(keptTotal).padStart(7))
console.log(
  `\n虚高 ${(100 - (keptTotal / rawTotal) * 100).toFixed(0)}%：${rawTotal} → ${keptTotal}`
)
