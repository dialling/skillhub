#!/usr/bin/env node
/**
 * Classify every catalog entry: is this actually a source of agent skills, or
 * is it somebody's software project / a link list?
 *
 *   node scripts/classify-catalog.mjs [--dry-run]
 *
 * The crawl that built the catalog only looked for directories containing a
 * SKILL.md. That is necessary but not sufficient: plenty of applications ship a
 * SKILL.md describing themselves, and plenty of "awesome" lists contain none at
 * all. Presenting either as "install skills from here" is wrong.
 *
 * Rule (deterministic, re-runnable):
 *   no skills at all                      → reference  (nothing to install)
 *   build manifest + a real src/ tree      → software   (an application)
 *   build manifest, no substantial source  → skills     (a skill pack with helpers)
 *   otherwise                              → skills
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'curated-catalog.json')
const dryRun = process.argv.includes('--dry-run')
/**
 * `--check` is the gate form: it verifies locally that every entry *has* been
 * classified, without re-querying GitHub (202 API calls is too slow for
 * `npm run verify`). Re-run the script itself to refresh the classification.
 */
const checkOnly = process.argv.includes('--check')

if (checkOnly) {
  const catalog = JSON.parse(readFileSync(file, 'utf8'))
  const unclassified = catalog.repos.filter((r) => !r.repoKind || !r.repoFacts)
  if (unclassified.length) {
    console.error(`以下 ${unclassified.length} 个仓库尚未分类，请运行 node scripts/classify-catalog.mjs：`)
    for (const r of unclassified) console.error(`  - ${r.fullName}`)
    process.exit(1)
  }
  const kinds = {}
  for (const r of catalog.repos) kinds[r.repoKind] = (kinds[r.repoKind] || 0) + 1
  const parts = Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · ')
  console.log(`PASS — ${catalog.repos.length} 个仓库均已分类（${parts}）`)
  process.exit(0)
}

/** Files that mean "you build this", not "you install this". */
const MANIFESTS = /^(package\.json|Cargo\.toml|pyproject\.toml|setup\.py|go\.mod|CMakeLists\.txt|Makefile|build\.gradle|pom\.xml|Gemfile|composer\.json|requirements\.txt|tsconfig\.json)$/i
/** Directories that hold application source rather than markdown. */
const SRC_DIRS = /^(src|lib|app|packages|crates|internal|cmd)\//
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|c|cc|cpp|h|hpp|swift|cs|scala|dart)$/i
/** Below this many source files a "src/" is usually a helper script folder. */
const SOFTWARE_SRC_THRESHOLD = 8

const gh = (args) => {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28 }))
  } catch {
    return null
  }
}

const catalog = JSON.parse(readFileSync(file, 'utf8'))
const tally = {}
let changed = 0

for (const repo of catalog.repos) {
  const meta = gh(['api', `repos/${repo.fullName}`])
  const tree = gh(['api', `repos/${repo.fullName}/git/trees/HEAD?recursive=1`])
  if (!meta || !tree) {
    console.error(`  ! ${repo.fullName}: 无法读取，跳过`)
    continue
  }

  const blobs = (tree.tree || []).filter((n) => n.type === 'blob')
  const rootFiles = blobs.filter((b) => !b.path.includes('/')).map((b) => b.path)
  const manifests = rootFiles.filter((f) => MANIFESTS.test(f))
  const srcFiles = blobs.filter((b) => SRC_DIRS.test(b.path) && CODE.test(b.path)).length
  const codeFiles = blobs.filter((b) => CODE.test(b.path)).length
  const markdown = blobs.filter((b) => /\.md$/i.test(b.path)).length

  const skills = repo.skillCount ?? (repo.skillDirs || []).length
  const kind =
    skills === 0
      ? 'reference'
      : manifests.length > 0 && srcFiles >= SOFTWARE_SRC_THRESHOLD
        ? 'software'
        : 'skills'

  repo.repoKind = kind
  repo.repoFacts = { language: meta.language || null, markdown, codeFiles, srcFiles, manifests: manifests.slice(0, 4) }
  tally[kind] = (tally[kind] || 0) + 1
  changed++
  process.stdout.write('.')
}

console.log()
catalog.classifiedAt = new Date().toISOString()

if (!dryRun) writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

console.log(`已分类 ${changed} 个仓库：`)
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${n}`)

const byKind = (k) => catalog.repos.filter((r) => r.repoKind === k)
console.log('\n软件项目（可能附带技能，但仓库本身是应用）：')
for (const r of byKind('software').sort((a, b) => b.stars - a.stars).slice(0, 30)) {
  console.log(`  ${String(r.stars).padStart(7)}  ${r.fullName.padEnd(42)} 技能 ${String(r.skillCount).padStart(4)}  源码 ${String(r.repoFacts.srcFiles).padStart(6)}`)
}
console.log('\n不含任何技能的资料 / 规范：')
for (const r of byKind('reference')) console.log(`  ${String(r.stars).padStart(7)}  ${r.fullName}`)
