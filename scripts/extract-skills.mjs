#!/usr/bin/env node
/**
 * Extract the individual skills out of the catalog's repositories.
 *
 *   node scripts/extract-skills.mjs [--limit N] [--keep]
 *
 * A "collection" repository is only interesting for the skills inside it. The
 * catalog already knows every skill's path, but not what any of them do — that
 * lives in each SKILL.md's frontmatter, one file per skill, which is far too
 * many to fetch over the API one at a time.
 *
 * So instead of 11k HTTP requests this clones each repository sparsely: git
 * fetches only the SKILL.md blobs (`--filter=blob:none --sparse`), which takes
 * about three seconds for a repository holding six thousand skills and a tenth
 * of the disk a full shallow clone needs. Repositories are processed one at a
 * time and removed immediately, so peak usage stays at one checkout.
 *
 * Output is sharded by functional category. A single file holding every skill
 * would be a few megabytes; sharded, a client fetches only the part it is
 * showing, and search can pull the rest in the background.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const liveDir = join(root, 'data', 'live')
const catalog = JSON.parse(readFileSync(join(root, 'data', 'curated-catalog.json'), 'utf8'))

/**
 * Which agent a skill is written for, when that can be said with confidence.
 *
 * Two signals, both structural rather than keyword-guessing:
 *
 *   1. The repository says so. "My Codex Skills" or "marketing skills for
 *      Claude Code" is the author telling us the target, and it applies to
 *      everything inside.
 *   2. The path. A skill stored under `.claude/skills/` or `.gemini/skills/`
 *      sits in that agent's own directory, which is where it gets installed.
 *      `.agents/` is the portable convention and implies no particular agent.
 *
 * Deliberately NOT used: mentions of an agent in a skill's description. Those
 * overwhelmingly mean the skill *calls* that service — "Automate Gemini tasks
 * via Rube MCP" is a skill that drives the Gemini API, not one written for the
 * Gemini CLI — and labelling those would be worse than labelling nothing.
 *
 * When the signals disagree, or name more than one agent, the skill gets no
 * label: a skill that is not specifically for one agent is for all of them.
 */
const REPO_AGENTS = [
  ['claude-code', /\bclaude\s+code\b|\bclaude-code\b|\bclaudecode\b/i],
  ['codex', /\bcodex\b/i],
  ['copilot', /\bcopilot\b/i],
  ['windsurf', /\bwindsurf\b/i],
  ['opencode', /\bopencode\b/i],
  ['antigravity', /\bantigravity\b/i],
  ['cursor', /\bcursor\b/i],
  ['kiro', /\bkiro\b/i]
]

/** Agents named by a repository's own name or description, with the evidence. */
function repoAgents(repo) {
  const text = `${repo.name} ${repo.descriptionEn || ''}`
  const hits = REPO_AGENTS.filter(([, re]) => re.test(text)).map(([id]) => id)
  return hits
}

const DIR_AGENT = {
  '.claude': 'claude-code',
  '.codex': 'codex',
  '.cursor': 'cursor',
  '.gemini': 'gemini-cli',
  '.windsurf': 'windsurf',
  '.opencode': 'opencode',
  '.roo': 'roo-code',
  '.kiro': 'kiro'
}

/** The agent a skill is for, or null when it is not specific to one. */
function agentFor(skillPath, repoAgentList) {
  const byDir = new Set()
  for (const seg of skillPath.split('/')) {
    const hit = DIR_AGENT[seg]
    if (hit) byDir.add(hit)
  }
  if (byDir.size === 1) return [...byDir][0]
  if (byDir.size > 1) return null // the path itself is ambiguous
  // No directory signal: fall back to the repository, and only when the author
  // named exactly one agent.
  if (repoAgentList.length === 1) return repoAgentList[0]
  return null
}

const argv = process.argv.slice(2)
const limitArg = argv.indexOf('--limit')
/** Repos below this many skills contribute little and cost a full clone. */
const MIN_SKILLS = 12
const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : Infinity

/** Repos worth cloning, richest first. */
const targets = catalog.repos
  .filter((r) => (r.skillCount || 0) >= MIN_SKILLS)
  .sort((a, b) => (b.skillCount || 0) - (a.skillCount || 0))
  .slice(0, limit)

console.log(`从 ${targets.length} 个仓库提取技能（技能数 ≥${MIN_SKILLS}）`)

/** Long descriptions are model triggers; the store needs the gist. */
function summarize(text, max = 200) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf('\u3002'))
  return (cut > 60 ? slice.slice(0, cut + 1) : slice.trimEnd()).trim()
}

/** Minimal frontmatter reader: name and description, block or inline. */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end < 0) return null
  const head = text.slice(3, end)
  const out = {}
  const lines = head.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\w[\w-]*):\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const key = m[1]
    let value = m[2].trim()
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      // block scalar: collect the indented lines that follow
      const parts = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+\S/.test(lines[j])) parts.push(lines[j].trim())
        else if (lines[j].trim() === '') parts.push('')
        else break
      }
      value = parts.join(' ').trim()
      i += parts.length
    }
    out[key] = value.replace(/^['"]|['"]$/g, '')
  }
  return out
}

function walk(dir, out = []) {
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === '.git') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (name === 'SKILL.md') out.push(full)
  }
  return out
}

const workRoot = join(tmpdir(), 'skillhub-extract')
rmSync(workRoot, { recursive: true, force: true })
mkdirSync(workRoot, { recursive: true })

const skills = []
const perRepo = []
let failures = 0

for (const [i, repo] of targets.entries()) {
  const dir = join(workRoot, `r${i}`)
  const label = `${repo.fullName}`.padEnd(46)
  try {
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--quiet', repo.htmlUrl, dir], {
      stdio: 'pipe',
      timeout: 180000
    })
    execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', '**/SKILL.md'], {
      stdio: 'pipe',
      timeout: 180000
    })
  } catch (err) {
    console.log(`  ✗ ${label} 克隆失败：${String(err.message).split('\n')[0].slice(0, 60)}`)
    failures++
    rmSync(dir, { recursive: true, force: true })
    continue
  }

  const repoAgentList = repoAgents(repo)
  const files = walk(dir)
  const seen = new Set()
  let kept = 0
  for (const file of files) {
    const rel = relative(dir, file).replace(/\/SKILL\.md$/, '')
    const folder = rel.split('/').pop() || repo.name
    // The same skill is often repeated across plugin bundles; keep one.
    if (seen.has(folder.toLowerCase())) continue
    seen.add(folder.toLowerCase())

    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const fm = parseFrontmatter(text)
    const description = fm?.description ? summarize(fm.description) : ''
    const agent = agentFor(rel, repoAgentList)
    skills.push({
      n: fm?.name || folder,
      r: repo.fullName,
      p: rel,
      d: description,
      f: repo.fn || 'collections',
      s: repo.stars || 0,
      ...(agent ? { a: agent } : {})
    })
    kept++
  }
  perRepo.push({ repo: repo.fullName, files: files.length, kept })
  console.log(`  ✓ ${label}${String(files.length).padStart(5)} 文件 → ${String(kept).padStart(4)} 技能`)
  rmSync(dir, { recursive: true, force: true })
}

rmSync(workRoot, { recursive: true, force: true })

// ---- write, sharded by functional category ---------------------------------
const skillsDir = join(liveDir, 'skills')
rmSync(skillsDir, { recursive: true, force: true })
mkdirSync(skillsDir, { recursive: true })

const byFn = {}
for (const s of skills) (byFn[s.f] ||= []).push(s)

const shardMeta = {}
for (const [fn, list] of Object.entries(byFn)) {
  list.sort((a, b) => b.s - a.s || a.n.localeCompare(b.n))
  const file = join(skillsDir, `${fn}.json`)
  writeFileSync(file, JSON.stringify({ fn, count: list.length, skills: list }), 'utf8')
  shardMeta[fn] = { count: list.length, bytes: statSync(file).size }
}

writeFileSync(
  join(skillsDir, 'index.json'),
  JSON.stringify({ updatedAt: new Date().toISOString(), total: skills.length, shards: shardMeta }, null, 2) + '\n',
  'utf8'
)

// ---- write the repository-level label back into the catalog ---------------
// A repository that says "My Codex Skills" is Codex-specific even where a
// particular skill inside it is generic, and the store shows repositories too.
let catalogTouched = 0
for (const repo of catalog.repos) {
  const list = repoAgents(repo)
  const agent = list.length === 1 ? list[0] : undefined
  if (agent && repo.agent !== agent) {
    repo.agent = agent
    catalogTouched++
  } else if (!agent && repo.agent) {
    delete repo.agent
    catalogTouched++
  }
}
if (catalogTouched) {
  writeFileSync(join(root, 'data', 'curated-catalog.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8')
  console.log(`目录中 ${catalogTouched} 个仓库更新了专用 agent 标注`)
}

const withDesc = skills.filter((s) => s.d).length
const byAgent = {}
for (const s of skills) if (s.a) byAgent[s.a] = (byAgent[s.a] || 0) + 1
const bytes = Object.values(shardMeta).reduce((n, s) => n + s.bytes, 0)
console.log(`\n提取 ${skills.length} 个技能（${withDesc} 个有简介）· 克隆失败 ${failures} 个`)
const agentTotal = Object.values(byAgent).reduce((n, v) => n + v, 0)
console.log(`其中 ${agentTotal} 个标注了专用 agent：${Object.entries(byAgent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '（无）'}`)
console.log(`分片 ${Object.keys(byFn).length} 个，合计 ${(bytes / 1024 / 1024).toFixed(1)} MB`)
for (const [fn, m] of Object.entries(shardMeta).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${fn.padEnd(12)} ${String(m.count).padStart(5)}  ${(m.bytes / 1024).toFixed(0).padStart(5)} KB`)
}
