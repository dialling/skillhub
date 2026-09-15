import type { GrowthRow, RepoMeta } from '../../shared/types'
import { cache, growthFromSnapshots, stars } from './db'
import { curatedCatalog } from './catalog'
import { libraryItems } from './library'
import { starsGained } from './github'

export type GrowthWindow = 1 | 7 | 30

export interface LeaderboardOptions {
  days: GrowthWindow
  limit?: number
  /** include library repos in addition to the curated catalog */
  includeLibrary?: boolean
  /** query the GitHub APIs for repos with no local snapshot history */
  useApi?: boolean
  /** how many repos to measure through the API, highest stars first */
  apiBudget?: number
  onProgress?: (done: number, total: number) => void
}

/** Build a star-growth leaderboard with an explicit, honest data source per row. */
export async function leaderboard(opts: LeaderboardOptions): Promise<GrowthRow[]> {
  const { days, limit = 30, includeLibrary = true, useApi = true, apiBudget = 90 } = opts

  const map = new Map<string, RepoMeta>()
  for (const r of await curatedCatalog()) map.set(r.fullName, r)
  if (includeLibrary) {
    for (const item of libraryItems()) {
      if (!map.has(item.fullName)) map.set(item.fullName, item.meta)
    }
  }
  // Only repos the user actually opened — never incidental search results.
  const repoCache = cache.get().repos
  for (const [fullName, entry] of Object.entries(repoCache)) {
    // Strictly opt-in: legacy entries written before origin tracking existed are
    // treated as search hits rather than silently polluting the chart.
    if (entry.origin !== 'detail') continue
    if (!map.has(fullName)) map.set(fullName, entry.meta)
  }

  const repos = [...map.values()].filter((r) => (r.stars || 0) > 0)
  const rows: GrowthRow[] = []

  // Pass 1 — locally recorded daily snapshots are exact and free.
  const needApi: RepoMeta[] = []
  for (const repo of repos) {
    const snap = growthFromSnapshots(repo.fullName, days)
    if (snap !== null) rows.push(toRow(repo, snap, days, 'snapshot'))
    else needApi.push(repo)
  }

  // Pass 2 — measure the rest, highest-starred first, within the API budget.
  if (useApi && needApi.length) {
    const apiTargets = needApi.sort((a, b) => b.stars - a.stars).slice(0, apiBudget)
    // The events feed is the bottleneck (1-3 sequential requests per repo), so
    // fan out generously — the total request count stays far below the 5000/h
    // core rate limit, and every result is cached for six hours afterwards.
    const concurrency = 12
    let cursor = 0
    let done = 0
    const total = apiTargets.length
    const collected: GrowthRow[] = []
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < apiTargets.length) {
          const repo = apiTargets[cursor++]
          try {
            const g = await starsGained(repo.fullName, repo.stars, days)
            // A repo we could not measure is omitted rather than reported as zero.
            if (g.source !== 'unavailable') {
              collected.push(toRow(repo, g.gained, days, g.source, g.approx, g.coveredHours))
            }
          } catch {
            /* omit */
          }
          opts.onProgress?.(++done, total)
        }
      })
    )
    rows.push(...collected)
  }

  return rows
    .sort((a, b) => b.gained - a.gained || b.perDay - a.perDay || b.stars - a.stars)
    .slice(0, limit)
}

function toRow(
  repo: RepoMeta,
  gained: number,
  days: number,
  source: GrowthRow['source'],
  approx = false,
  coveredHours = days * 24
): GrowthRow {
  return {
    fullName: repo.fullName,
    name: repo.name,
    owner: repo.owner,
    avatarUrl: repo.avatarUrl,
    stars: repo.stars || 0,
    gained,
    days,
    perDay: gained / days,
    source,
    approx,
    coveredHours,
    descriptionZh: repo.descriptionZh,
    descriptionEn: repo.descriptionEn,
    category: repo.category
  }
}

/** Simple top-by-total-stars table. */
export async function topByStars(limit = 30): Promise<RepoMeta[]> {
  const map = new Map<string, RepoMeta>()
  for (const r of await curatedCatalog()) map.set(r.fullName, r)
  for (const item of libraryItems()) if (!map.has(item.fullName)) map.set(item.fullName, item.meta)
  return [...map.values()].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, limit)
}

/** How many snapshots have been recorded so far (drives the "history" hint). */
export function snapshotCoverage(): { repos: number; days: number } {
  const history = stars.get().history
  const names = Object.keys(history)
  const maxDays = names.reduce((acc, n) => Math.max(acc, history[n].length), 0)
  return { repos: names.length, days: maxDays }
}
