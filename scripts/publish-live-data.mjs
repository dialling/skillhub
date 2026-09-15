#!/usr/bin/env node
/**
 * Publish the shared star history to the repository.
 *
 *   node scripts/publish-live-data.mjs        # run by the GitHub Action
 *
 * The app has always recorded a local star snapshot per day, per machine. That
 * means a user who installed yesterday has no history, and the leaderboard has
 * nothing to compute growth from — the one thing a client genuinely cannot know
 * on its own. Running this on a schedule turns the repository itself into the
 * shared store of that history, so no server is needed: every client reads the
 * same file through a CDN.
 *
 * Writes:
 *   data/live/stars.json     current star count per repo
 *   data/live/growth.json    precomputed 1 / 7 / 30 day growth, ready to render
 *   data/live/meta.json      when it last ran, and how it went
 *   data/live/history.json   the raw series, kept as the archive
 *
 * Clients fetch stars.json and growth.json only. The full history reaches
 * megabytes once there are a few hundred days of it, and a client has no use
 * for it — it wants "how much did this grow", which is what growth.json already
 * says. The series stays in the repository as the record everything is derived
 * from.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const liveDir = join(root, 'data', 'live')
const catalogPath = join(root, 'data', 'curated-catalog.json')

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const today = new Date().toISOString().slice(0, 10)

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const repos = catalog.repos.map((r) => r.fullName)
console.log(`目录 ${repos.length} 个仓库，抓取星标…`)

/** One repos/{owner}/{repo} call per entry, batched so the run stays short. */
async function fetchStars(fullNames) {
  const out = {}
  const BATCH = 8
  let failed = 0
  for (let i = 0; i < fullNames.length; i += BATCH) {
    const slice = fullNames.slice(i, i + BATCH)
    const results = await Promise.all(
      slice.map(async (fullName) => {
        try {
          const res = await fetch(`https://api.github.com/repos/${fullName}`, {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'skillhub-live-data',
              ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
            },
            signal: AbortSignal.timeout(15000)
          })
          if (!res.ok) return null
          const json = await res.json()
          return [fullName, json.stargazers_count]
        } catch {
          return null
        }
      })
    )
    for (const r of results) {
      if (r) out[r[0]] = r[1]
      else failed++
    }
    process.stdout.write('.')
  }
  console.log()
  return { stars: out, failed }
}

const { stars, failed } = await fetchStars(repos)
const fetched = Object.keys(stars).length
console.log(`成功 ${fetched} · 失败 ${failed}`)

if (fetched < repos.length * 0.5) {
  console.error('抓取成功率过低，拒绝写入，避免把残缺数据提交进仓库')
  process.exit(1)
}

mkdirSync(liveDir, { recursive: true })

// ---- history: merge today's reading into the accumulated series -------------
const historyPath = join(liveDir, 'history.json')
const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : {}
let appended = 0
let repointed = 0

for (const [fullName, value] of Object.entries(stars)) {
  const list = history[fullName] || []
  const last = list[list.length - 1]
  if (last && last.d === today) {
    // Re-running on the same day should correct the reading, not add a second
    // point — two entries for one date would break every growth calculation.
    if (last.s !== value) {
      last.s = value
      repointed++
    }
    continue
  }
  list.push({ d: today, s: value })
  history[fullName] = list.slice(-400)
  appended++
}

// Repos that left the catalog keep their history; it is small and a repo may
// come back. Only drop entries that have not been touched in a very long time.
for (const fullName of Object.keys(history)) {
  if (history[fullName].length > 400) history[fullName] = history[fullName].slice(-400)
}

writeFileSync(historyPath, JSON.stringify(history) + '\n', 'utf8')
writeFileSync(
  join(liveDir, 'stars.json'),
  JSON.stringify({ updatedAt: new Date().toISOString(), stars }, null, 0) + '\n',
  'utf8'
)

// ---- growth: precomputed so clients never fetch the raw series ---------------
/**
 * Growth over `days`, measured against the snapshot nearest to the target date.
 *
 * Only repos with real coverage are listed. A repo whose series starts three
 * days ago has no seven-day delta, and inventing one — or reporting +0 — would
 * be the same dishonesty the local leaderboard already avoids.
 */
function computeGrowth(days) {
  const target = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const rows = []
  for (const [fullName, list] of Object.entries(history)) {
    if (!list.length) continue
    const latest = list[list.length - 1]
    if (latest.d !== today) continue // only rank what we actually refreshed today
    // nearest reading at or before the target date
    let base = null
    for (const p of list) {
      if (p.d <= target) base = p
      else break
    }
    if (!base || base.d === latest.d) continue
    const coveredDays = Math.round((Date.parse(latest.d) - Date.parse(base.d)) / 86400000)
    // Refuse a window that is far shorter than asked for; a 1-day delta labelled
    // as 30-day growth is worse than no row.
    if (coveredDays < days * 0.6) continue
    const entry = catalog.repos.find((r) => r.fullName === fullName)
    rows.push({
      fullName,
      name: entry?.name || fullName.split('/')[1],
      owner: entry?.owner || fullName.split('/')[0],
      avatarUrl: entry?.avatarUrl,
      stars: latest.s,
      gained: latest.s - base.s,
      days: coveredDays,
      perDay: (latest.s - base.s) / Math.max(1, coveredDays),
      category: entry?.category,
      descriptionZh: entry?.descriptionZh,
      descriptionEn: entry?.descriptionEn
    })
  }
  rows.sort((a, b) => b.gained - a.gained || b.stars - a.stars)
  return rows
}

const growth = { '1': computeGrowth(1), '7': computeGrowth(7), '30': computeGrowth(30) }
writeFileSync(
  join(liveDir, 'growth.json'),
  JSON.stringify({ updatedAt: new Date().toISOString(), date: today, growth }, null, 0) + '\n',
  'utf8'
)
console.log(
  `增长榜：1 天 ${growth['1'].length} 条 · 7 天 ${growth['7'].length} 条 · 30 天 ${growth['30'].length} 条`
)

// ---- meta ------------------------------------------------------------------
const seriesLengths = Object.values(history).map((l) => l.length)
writeFileSync(
  join(liveDir, 'meta.json'),
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      date: today,
      repos: repos.length,
      fetched,
      failed,
      appended,
      corrected: repointed,
      tracked: Object.keys(history).length,
      maxDays: seriesLengths.length ? Math.max(...seriesLengths) : 0,
      growthRows: { '1': growth['1'].length, '7': growth['7'].length, '30': growth['30'].length }
    },
    null,
    2
  ) + '\n',
  'utf8'
)

console.log(`历史新增 ${appended} 天 · 修正 ${repointed} 条 · 跟踪 ${Object.keys(history).length} 个仓库`)
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  console.log('（提交由 workflow 负责）')
} catch {
  /* not in a git checkout; fine when run locally */
}
