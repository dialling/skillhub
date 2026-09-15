import { cache, settings, stars } from './db'
import type { GrowthRow } from '../../shared/types'

/**
 * The shared star data published by this project's own GitHub Action.
 *
 * A client cannot know a repository's star history on its own: it only sees the
 * days it happened to be running, so a fresh install has nothing to compute a
 * leaderboard from. A server would fix that; a scheduled Action committing JSON
 * to the repository does the same job for free, because GitHub serves the file
 * through a CDN and every installation reads the same numbers.
 *
 * Clients fetch the precomputed growth rather than the raw series: the series
 * reaches megabytes after a few hundred days, and "how much did this grow" is
 * already the only thing a client needs from it.
 */
const OWNER = 'dialling'
const REPO = 'skillhub'
const BRANCH = 'main'
const DIR = 'data/live'

export interface LiveMeta {
  updatedAt: string
  date: string
  repos: number
  fetched: number
  failed: number
  tracked: number
  maxDays: number
  growthRows?: Record<string, number>
}

export interface LiveResult {
  ok: boolean
  /** which mirror answered — reported rather than implied */
  source: 'jsdelivr' | 'raw' | 'api' | 'none'
  error?: string
  meta?: LiveMeta
  /** repos whose published star count differs from what we had */
  changed: number
  /** rows available per window, e.g. { '7': 92 } */
  growthRows: Record<string, number>
}

/**
 * Mirrors in preference order. jsDelivr is a real CDN and the most reliable of
 * the three; raw.githubusercontent has been observed to hang on some networks,
 * which is why it is not first; the Contents API is authenticated and slow but
 * works when both plain mirrors are blocked.
 */
async function fetchFile(
  path: string,
  timeoutMs = 8000
): Promise<{ text: string; source: LiveResult['source'] } | null> {
  const mirrors: { url: string; source: LiveResult['source'] }[] = [
    { url: `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${path}`, source: 'jsdelivr' },
    { url: `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`, source: 'raw' }
  ]
  for (const m of mirrors) {
    try {
      const res = await fetch(m.url, {
        headers: { 'User-Agent': 'skillhub' },
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (res.ok) return { text: await res.text(), source: m.source }
    } catch {
      // try the next mirror
    }
  }
  const token = settings.get().token
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'skillhub'
          },
          signal: AbortSignal.timeout(timeoutMs)
        }
      )
      if (res.ok) {
        const json = (await res.json()) as { content?: string }
        if (json.content) return { text: Buffer.from(json.content, 'base64').toString('utf8'), source: 'api' }
      }
    } catch {
      // fall through to null
    }
  }
  return null
}

interface PublishedGrowth {
  updatedAt: string
  date: string
  growth: Record<string, GrowthRow[]>
}

/**
 * Pull the published star counts and growth. Safe to call on every refresh.
 *
 * Growth being empty is a normal state, not a failure: the series needs several
 * days before a window can be measured, so a young deployment legitimately has
 * nothing to rank. The caller falls back to its own snapshots and the events
 * API in that case, exactly as it did before this existed.
 */
export async function refreshLiveData(): Promise<LiveResult> {
  const starsFile = await fetchFile(`${DIR}/stars.json`)
  if (!starsFile) {
    return { ok: false, source: 'none', error: 'stars.json unreachable', changed: 0, growthRows: {} }
  }

  let parsed: { updatedAt?: string; stars?: Record<string, number> }
  try {
    parsed = JSON.parse(starsFile.text)
  } catch (err: any) {
    return {
      ok: false,
      source: starsFile.source,
      error: `bad stars.json: ${err?.message}`,
      changed: 0,
      growthRows: {}
    }
  }

  const published = parsed.stars || {}
  const now = Date.now()
  let changed = 0

  // ---- star counts ---------------------------------------------------------
  cache.update((d) => {
    for (const [fullName, value] of Object.entries(published)) {
      if (typeof value !== 'number') continue
      const entry = d.repos[fullName]
      if (!entry) continue
      if (entry.meta?.stars !== value) changed++
      entry.meta = { ...(entry.meta || {}), stars: value } as typeof entry.meta
      entry.at = now
    }
  })

  // ---- precomputed growth --------------------------------------------------
  const growthFile = await fetchFile(`${DIR}/growth.json`, 10000)
  const growthRows: Record<string, number> = {}
  if (growthFile) {
    try {
      const g = JSON.parse(growthFile.text) as PublishedGrowth
      const shared: Record<string, GrowthRow[]> = {}
      for (const [window, rows] of Object.entries(g.growth || {})) {
        if (!Array.isArray(rows) || !rows.length) continue
        growthRows[window] = rows.length
        // Rows arrive complete from the publisher — name, owner, avatar and
        // category included — so the client renders them without a second pass.
        shared[window] = rows.map((r) => ({
          ...r,
          source: 'shared' as const,
          approx: r.days !== Number(window)
        }))
      }
      if (Object.keys(shared).length) {
        stars.update((d) => {
          d.sharedGrowth = shared
          d.sharedAt = now
        })
      }
    } catch {
      // growth is optional; the star counts above still count as a refresh
    }
  }

  const metaFile = await fetchFile(`${DIR}/meta.json`, 6000)
  let meta: LiveMeta | undefined
  if (metaFile) {
    try {
      meta = JSON.parse(metaFile.text)
    } catch {
      /* optional */
    }
  }

  settings.update((d) => {
    d.liveUpdatedAt = now
    d.liveDate = parsed.updatedAt || meta?.updatedAt || null
  })

  return { ok: true, source: starsFile.source, meta, changed, growthRows }
}

/** Shared growth cached from the last successful pull, if it is still fresh. */
export function sharedGrowth(window: string, maxAgeMs = 12 * 3600_000): GrowthRow[] | null {
  const d = stars.get()
  if (!d.sharedAt || Date.now() - d.sharedAt > maxAgeMs) return null
  const rows = d.sharedGrowth?.[window]
  return rows && rows.length ? rows : null
}

/** When the shared data was last pulled, and when it was published upstream. */
export function liveStatus(): { at: number | null; publishedAt: string | null } {
  const s = settings.get()
  return { at: s.liveUpdatedAt ?? null, publishedAt: s.liveDate ?? null }
}
