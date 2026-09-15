import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GitHubUser, RateLimit, RepoMeta, SearchResult } from '../../shared/types'
import { cache, settings, stars } from './db'

const API = 'https://api.github.com'
const UA = 'SkillHub/0.1 (+https://github.com/skillhub)'

let ghTokenCache: { value: string | null; at: number } | null = null

/** Locate the `gh` binary even when launched from Finder with a minimal PATH. */
function findGh(): string | null {
  const candidates = [
    'gh',
    join(homedir(), '.local', 'bin', 'gh'),
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
    '/usr/bin/gh'
  ]
  for (const c of candidates) {
    if (c === 'gh' || existsSync(c)) return c
  }
  return null
}

export function ghCliToken(): string | null {
  if (ghTokenCache && Date.now() - ghTokenCache.at < 60_000) return ghTokenCache.value
  let value: string | null = null
  const bin = findGh()
  if (bin) {
    try {
      const out = execFileSync(bin, ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const trimmed = out.trim()
      if (trimmed) value = trimmed
    } catch {
      value = null
    }
  }
  ghTokenCache = { value, at: Date.now() }
  return value
}

export function activeToken(): string {
  const s = settings.get()
  if (s.token && s.token.trim()) return s.token.trim()
  return ghCliToken() || ''
}

export function tokenSource(): 'settings' | 'gh-cli' | 'env' | 'none' {
  const s = settings.get()
  if (s.token && s.token.trim()) return 'settings'
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return 'env'
  if (ghCliToken()) return 'gh-cli'
  return 'none'
}

export function envToken(): string {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = activeToken() || envToken()
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
    ...extra
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function ghFetch<T = any>(
  path: string,
  init: RequestInit & { raw?: boolean } = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API}${path}`
  const res = await fetch(url, {
    ...init,
    headers: headers((init.headers as Record<string, string>) || {})
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body: any = await res.json()
      detail = body?.message || ''
    } catch {
      /* ignore */
    }
    throw new GitHubError(detail || `GitHub ${res.status} ${res.statusText}`, res.status)
  }
  if (init.raw) return (await res.text()) as unknown as T
  return (await res.json()) as T
}

/** GitHub topics are usually slugs, but some repos stuff URLs in there. */
export function cleanTopics(topics: unknown): string[] {
  if (!Array.isArray(topics)) return []
  return topics
    .filter(
      (t): t is string =>
        typeof t === 'string' &&
        t.length > 0 &&
        t.length < 40 &&
        !t.includes('://') &&
        /^[A-Za-z0-9._-]+$/.test(t)
    )
    .slice(0, 16)
}

export function toRepoMeta(r: any): RepoMeta {
  return {
    fullName: r.full_name,
    owner: r.owner?.login || r.full_name?.split('/')[0] || '',
    name: r.name,
    descriptionEn: r.description || '',
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    openIssues: r.open_issues_count ?? 0,
    topics: cleanTopics(r.topics),
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
    homepage: r.homepage || null,
    avatarUrl: r.owner?.avatar_url,
    defaultBranch: r.default_branch || 'main',
    pushedAt: r.pushed_at,
    archived: !!r.archived,
    htmlUrl: r.html_url,
    installHint: `npx skills add ${r.full_name}`
  }
}

export async function getRepo(fullName: string, opts: { force?: boolean } = {}): Promise<RepoMeta> {
  const cached = cache.get().repos[fullName]
  if (!opts.force && cached && Date.now() - cached.at < 10 * 60_000) return cached.meta
  const raw = await ghFetch<any>(`/repos/${fullName}`)
  const meta = toRepoMeta(raw)
  cache.update((d) => {
    d.repos[fullName] = { at: Date.now(), meta, origin: 'detail' }
  })
  return meta
}

export async function listSkillDirs(
  fullName: string,
  branch?: string
): Promise<{ dirs: string[]; truncated: boolean }> {
  const ref = branch || (await getRepo(fullName)).defaultBranch || 'HEAD'
  const tree = await ghFetch<any>(`/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`)
  const dirs = new Set<string>()
  for (const node of tree.tree || []) {
    if (node.type !== 'blob') continue
    const p: string = node.path || ''
    const base = p.split('/').pop()
    if (base !== 'SKILL.md' && base !== 'skill.md') continue
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    dirs.add(dir)
  }
  return { dirs: [...dirs].sort(), truncated: !!tree.truncated }
}

export async function getReadme(fullName: string): Promise<string> {
  const cached = cache.get().readme[fullName]
  if (cached && Date.now() - cached.at < 6 * 60 * 60_000) return cached.text
  try {
    const text = await ghFetch<string>(`/repos/${fullName}/readme`, {
      raw: true,
      headers: { Accept: 'application/vnd.github.raw' }
    })
    cache.update((d) => {
      d.readme[fullName] = { at: Date.now(), text }
    })
    return text
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return ''
    throw err
  }
}

export async function getFileText(fullName: string, path: string): Promise<string> {
  try {
    return await ghFetch<string>(`/repos/${fullName}/contents/${encodeURI(path)}`, {
      raw: true,
      headers: { Accept: 'application/vnd.github.raw' }
    })
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return ''
    throw err
  }
}

/**
 * raw.githubusercontent.com is the cheapest way to read files (it does not
 * consume REST quota), but it is also the endpoint most likely to be blocked by
 * a corporate proxy or firewall. Track its health so a deployment that cannot
 * reach it degrades to the Contents API instead of hanging on every file.
 */
let rawHealth: { ok: number; fail: number; disabledUntil: number } = { ok: 0, fail: 0, disabledUntil: 0 }
const RAW_TIMEOUT_MS = 3000
const RAW_FAIL_THRESHOLD = 3
const RAW_RETRY_AFTER_MS = 10 * 60_000

export function rawHostStatus(): { enabled: boolean; ok: number; fail: number } {
  return { enabled: Date.now() >= rawHealth.disabledUntil, ok: rawHealth.ok, fail: rawHealth.fail }
}

/**
 * Pay the reachability cost once at startup instead of on the user's first
 * repository click. Fire-and-forget.
 */
export async function probeRawHost(fullName: string, branch: string): Promise<void> {
  if (Date.now() < rawHealth.disabledUntil) return
  await fetchRawText(
    `https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(branch)}/README.md`
  )
}

async function fetchRawText(url: string): Promise<string | null> {
  if (Date.now() < rawHealth.disabledUntil) return null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(RAW_TIMEOUT_MS)
    })
    if (!res.ok) {
      rawHealth.fail++
      if (rawHealth.fail >= RAW_FAIL_THRESHOLD) rawHealth.disabledUntil = Date.now() + RAW_RETRY_AFTER_MS
      return null
    }
    rawHealth.ok++
    return await res.text()
  } catch (err: any) {
    rawHealth.fail++
    // A transport-level failure (DNS, proxy, TLS, timeout) before we have ever
    // succeeded is decisive: stop paying the timeout on every subsequent file.
    const decisive = rawHealth.ok === 0 || rawHealth.fail >= RAW_FAIL_THRESHOLD
    if (decisive) {
      rawHealth.disabledUntil = Date.now() + RAW_RETRY_AFTER_MS
      console.warn(
        `[github] raw.githubusercontent.com unreachable (${err?.name || err}); using the Contents API for the next 10 minutes`
      )
    }
    return null
  }
}

/** Fetch a file from raw.githubusercontent.com, falling back to the Contents API. */
export async function getRawFile(
  fullName: string,
  branch: string,
  path: string
): Promise<string | null> {
  const clean = path.replace(/^\/+/, '')
  const encoded = clean
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  const url = `https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(branch)}/${encoded}`
  const raw = await fetchRawText(url)
  if (raw !== null) return raw

  try {
    const query = branch && branch !== 'HEAD' ? `?ref=${encodeURIComponent(branch)}` : ''
    return await ghFetch<string>(`/repos/${fullName}/contents/${encoded}${query}`, {
      raw: true,
      headers: { Accept: 'application/vnd.github.raw' }
    })
  } catch {
    return null
  }
}

/** Try the common README filenames, then the repository README endpoint. */
export async function getRawReadme(fullName: string, branch: string): Promise<string | null> {
  const cached = cache.get().readme[fullName]
  if (cached && Date.now() - cached.at < 6 * 60 * 60_000) return cached.text

  for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README.markdown']) {
    const text = await getRawFile(fullName, branch, name)
    if (text && text.trim()) {
      cache.update((d) => {
        d.readme[fullName] = { at: Date.now(), text }
      })
      return text
    }
  }

  try {
    const text = await getReadme(fullName)
    if (text && text.trim()) {
      cache.update((d) => {
        d.readme[fullName] = { at: Date.now(), text }
      })
      return text
    }
  } catch {
    /* no readme */
  }
  return null
}

export async function getUser(login: string): Promise<GitHubUser> {
  const raw = await ghFetch<any>(`/users/${login}`)
  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
    bio: raw.bio,
    company: raw.company,
    location: raw.location,
    publicRepos: raw.public_repos,
    followers: raw.followers,
    following: raw.following
  }
}

export async function viewer(): Promise<GitHubUser> {
  const raw = await ghFetch<any>('/user')
  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
    bio: raw.bio,
    company: raw.company,
    location: raw.location,
    publicRepos: raw.public_repos,
    followers: raw.followers,
    following: raw.following
  }
}

let rateCache: { at: number; value: RateLimit } | null = null

export async function rateLimit(force = false): Promise<RateLimit> {
  if (!force && rateCache && Date.now() - rateCache.at < 30_000) return rateCache.value
  try {
    const raw = await ghFetch<any>('/rate_limit')
    const login = settings.get().user?.login || null
    const value: RateLimit = {
      limit: raw.resources.core.limit,
      remaining: raw.resources.core.remaining,
      used: raw.resources.core.used,
      reset: raw.resources.core.reset,
      searchLimit: raw.resources.search.limit,
      searchRemaining: raw.resources.search.remaining,
      searchReset: raw.resources.search.reset,
      ok: true,
      login,
      checkedAt: Date.now()
    }
    rateCache = { at: Date.now(), value }
    return value
  } catch (err: any) {
    const value: RateLimit = {
      limit: 0,
      remaining: 0,
      used: 0,
      reset: 0,
      searchLimit: 0,
      searchRemaining: 0,
      searchReset: 0,
      ok: false,
      login: null,
      checkedAt: Date.now(),
      error: err?.message || String(err)
    }
    rateCache = { at: Date.now(), value }
    return value
  }
}

const searchCache = new Map<string, { at: number; value: SearchResult }>()

export async function searchRepos(
  query: string,
  opts: { sort?: 'stars' | 'updated' | 'best-match'; page?: number; perPage?: number; fresh?: boolean } = {}
): Promise<SearchResult> {
  const perPage = Math.min(opts.perPage || 30, 100)
  const page = opts.page || 1
  const sort = opts.sort || 'stars'
  const key = `${query}|${sort}|${page}|${perPage}`
  const hit = searchCache.get(key)
  if (!opts.fresh && hit && Date.now() - hit.at < 5 * 60_000) return hit.value

  const started = Date.now()
  const params = new URLSearchParams({
    q: query,
    per_page: String(perPage),
    page: String(page)
  })
  if (sort !== 'best-match') params.set('sort', sort)
  if (sort === 'stars') params.set('order', 'desc')

  const raw = await ghFetch<any>(`/search/repositories?${params.toString()}`)
  const value: SearchResult = {
    repos: (raw.items || []).map(toRepoMeta),
    total: raw.total_count || 0,
    incomplete: !!raw.incomplete_results,
    query,
    source: 'github',
    elapsedMs: Date.now() - started
  }
  searchCache.set(key, { at: Date.now(), value })
  for (const r of value.repos) {
    cache.update((d) => {
      const prev = d.repos[r.fullName]
      d.repos[r.fullName] = {
        at: Date.now(),
        meta: { ...(prev?.meta || ({} as RepoMeta)), ...r },
        // Never downgrade a repo the user actually opened to a plain search hit.
        origin: prev?.origin === 'detail' ? 'detail' : 'search'
      }
    })
  }
  return value
}

/**
 * Skill-aware repository search: GitHub's own relevance search is weak for this
 * domain, so we run several targeted queries and merge them.
 */
export async function searchSkills(
  term: string,
  opts: { page?: number; perPage?: number } = {}
): Promise<SearchResult> {
  const t = term.trim()
  const started = Date.now()
  if (!t) return { repos: [], total: 0, incomplete: false, query: t, source: 'github', elapsedMs: 0 }

  const perPage = opts.perPage || 40
  const queries = [
    `${t} topic:agent-skills`,
    `${t} topic:claude-skills`,
    `${t} SKILL.md in:readme`,
    `${t} agent skills in:name,description,readme`
  ]

  const seen = new Map<string, RepoMeta>()
  const results = await Promise.allSettled(
    queries.map((q) => searchRepos(q, { sort: 'stars', perPage: 25 }))
  )
  let total = 0
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    total += r.value.total
    for (const repo of r.value.repos) {
      const prev = seen.get(repo.fullName)
      if (!prev || repo.stars > prev.stars) seen.set(repo.fullName, repo)
    }
  }

  // Also fold in locally known curated repos that match the term.
  const { curatedCatalog } = await import('./catalog')
  const curated = await curatedCatalog()
  const lower = t.toLowerCase()
  for (const repo of curated) {
    if (
      repo.fullName.toLowerCase().includes(lower) ||
      (repo.descriptionEn || '').toLowerCase().includes(lower) ||
      (repo.descriptionZh || '').includes(t) ||
      repo.topics.some((x) => x.toLowerCase().includes(lower))
    ) {
      if (!seen.has(repo.fullName)) seen.set(repo.fullName, repo)
    }
  }

  const repos = [...seen.values()].sort((a, b) => b.stars - a.stars).slice(0, perPage)
  return {
    repos,
    total,
    incomplete: results.some((r) => r.status === 'rejected'),
    query: t,
    source: 'github',
    elapsedMs: Date.now() - started
  }
}

export interface StarGrowth {
  gained: number
  source: 'stargazers-api' | 'events-api' | 'unavailable'
  /** the events feed only exposes the most recent ~300 events, so a busy repo
   *  yields a lower bound rather than an exact figure */
  approx: boolean
  coveredHours: number
}

/**
 * Star velocity for a repository.
 *
 * GitHub exposes no star-history endpoint, so SkillHub tries two real sources
 * in order and reports which one produced the number:
 *
 *  1. `/stargazers` with the `star+json` media type — exact, paginated by star
 *     date, found via binary search. Not available on every deployment.
 *  2. `/events` — the public activity feed, filtered to `WatchEvent`. Exact for
 *     quiet repos and a lower bound for busy ones (the feed is capped).
 *
 * Locally recorded daily snapshots are preferred over both and are handled by
 * the leaderboard before this function is called.
 */
export async function starsGained(
  fullName: string,
  totalStars: number,
  days: number
): Promise<StarGrowth> {
  // The version prefix invalidates entries written by older builds that did not
  // record which source produced the number.
  const cacheKey = `v2|${fullName}|${days}`
  const cached = stars.get().growth[cacheKey]
  if (cached && cached.source && Date.now() - cached.at < 6 * 3600_000) {
    return {
      gained: cached.gained,
      source: cached.source as StarGrowth['source'],
      approx: !!cached.approx,
      coveredHours: cached.coveredHours ?? days * 24
    }
  }

  const remember = (result: StarGrowth): StarGrowth => {
    stars.update((d) => {
      d.growth[cacheKey] = {
        at: Date.now(),
        days,
        gained: result.gained,
        source: result.source,
        approx: result.approx,
        coveredHours: result.coveredHours
      }
    })
    return result
  }

  const viaStargazers = await starsGainedFromStargazers(fullName, totalStars, days)
  if (viaStargazers) return remember(viaStargazers)

  const viaEvents = await starsGainedFromEvents(fullName, days)
  if (viaEvents) return remember(viaEvents)

  return remember({ gained: 0, source: 'unavailable', approx: true, coveredHours: 0 })
}

async function starsGainedFromStargazers(
  fullName: string,
  totalStars: number,
  days: number
): Promise<StarGrowth | null> {
  if (totalStars <= 0) return { gained: 0, source: 'stargazers-api', approx: false, coveredHours: days * 24 }
  const cutoff = Date.now() - days * 86400_000
  const pages = Math.max(1, Math.ceil(totalStars / 100))

  const fetchPage = async (page: number): Promise<{ starred_at: string }[]> =>
    ghFetch<any[]>(`/repos/${fullName}/stargazers?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github.star+json' }
    })

  try {
    const lastPage = await fetchPage(pages)
    if (!lastPage.length) {
      return { gained: 0, source: 'stargazers-api', approx: false, coveredHours: days * 24 }
    }
    const lastTs = Date.parse(lastPage[lastPage.length - 1].starred_at)
    if (!Number.isFinite(lastTs)) return null
    if (lastTs < cutoff) {
      return { gained: 0, source: 'stargazers-api', approx: false, coveredHours: days * 24 }
    }

    let lo = 1
    let hi = pages
    let boundary = pages
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const items = mid === pages ? lastPage : await fetchPage(mid)
      const ts = items.length ? Date.parse(items[items.length - 1].starred_at) : 0
      if (ts >= cutoff) {
        boundary = mid
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }
    const items = boundary === pages ? lastPage : await fetchPage(boundary)
    let withinPage = 0
    for (const it of items) {
      if (Date.parse(it.starred_at) >= cutoff) withinPage++
    }
    const gained = Math.max(0, totalStars - (boundary - 1) * 100 - withinPage)
    return { gained, source: 'stargazers-api', approx: false, coveredHours: days * 24 }
  } catch {
    return null
  }
}

async function starsGainedFromEvents(fullName: string, days: number): Promise<StarGrowth | null> {
  const cutoff = Date.now() - days * 86400_000
  let watched = 0
  let oldest = Date.now()

  for (let page = 1; page <= 3; page++) {
    let events: any[]
    try {
      events = await ghFetch<any[]>(`/repos/${fullName}/events?per_page=100&page=${page}`)
    } catch {
      return page === 1 ? null : finalise()
    }
    if (!Array.isArray(events) || events.length === 0) break
    for (const e of events) {
      const ts = Date.parse(e?.created_at)
      if (!Number.isFinite(ts)) continue
      if (ts < oldest) oldest = ts
      if (e.type === 'WatchEvent' && ts >= cutoff) watched++
    }
    if (oldest < cutoff) break
  }

  function finalise(): StarGrowth {
    const coveredMs = Math.max(1000, Date.now() - oldest)
    return {
      gained: watched,
      source: 'events-api',
      // We ran out of feed before reaching the cutoff, so the true number is
      // at least what we counted.
      approx: oldest > cutoff,
      coveredHours: Math.round(coveredMs / 3600_000)
    }
  }
  return finalise()
}

export function clearCaches(): void {
  searchCache.clear()
  rateCache = null
  ghTokenCache = null
}
