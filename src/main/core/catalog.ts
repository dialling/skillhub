import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Category, CuratedCatalog, FnCategory, RepoMeta, Scenario } from '../../shared/types'
import { curatedCatalogPath, fetchedCatalogPath, scenariosPath } from './paths'
import { cache, settings, snapshotStars } from './db'
import { getRepo, cleanTopics } from './github'

let catalogCache: { at: number; repos: RepoMeta[] } | null = null

function parseCatalog(raw: string): CuratedCatalog | null {
  try {
    const parsed = JSON.parse(raw) as CuratedCatalog
    // Validate before trusting: a truncated download must not be allowed to
    // empty the store, and the version is what every comparison keys on.
    if (!parsed || !Array.isArray(parsed.repos) || typeof parsed.version !== 'number') return null
    if (!parsed.repos.length) return null
    return parsed
  } catch {
    return null
  }
}

function readFile(path: string): CuratedCatalog | null {
  try {
    if (!existsSync(path)) return null
    return parseCatalog(readFileSync(path, 'utf8'))
  } catch (err) {
    console.error('[catalog] failed to read catalog', path, err)
    return null
  }
}

/**
 * The catalog this install is actually using.
 *
 * The bundled copy ships inside the asar; a downloaded copy lands in the state
 * directory. The downloaded one wins only when it is genuinely newer, which is
 * the same "never go backwards" rule the live star data uses — a stale CDN edge
 * serving last month's catalog must not replace a newer one that arrived with
 * the build.
 *
 * Without this, the update check had a signal it could not honour: the manifest
 * carries the *repository's* catalog version, so any catalog edit made every
 * installed app report "目录有更新" while the only button on offer refreshed
 * star counts. There was no code path that could change the catalog, so the
 * notice could never be satisfied.
 */
function readBundled(): CuratedCatalog | null {
  const bundled = readFile(curatedCatalogPath())
  const fetched = readFile(fetchedCatalogPath())
  if (!fetched) return bundled
  if (!bundled) return fetched
  return (fetched.version || 0) > (bundled.version || 0) ? fetched : bundled
}

/**
 * Adopt a published catalog, if it is newer than the one in hand.
 *
 * Returns what happened so the caller can say so — `stale` is a normal outcome,
 * not an error.
 */
export function applyFetchedCatalog(raw: string): { ok: boolean; version: number; stale: boolean } {
  const incoming = parseCatalog(raw)
  if (!incoming) return { ok: false, version: 0, stale: false }
  const current = readBundled()
  if (current && (incoming.version || 0) <= (current.version || 0)) {
    return { ok: true, version: current.version || 0, stale: true }
  }
  try {
    writeFileSync(fetchedCatalogPath(), raw, 'utf8')
  } catch (err) {
    console.error('[catalog] failed to store fetched catalog', err)
    return { ok: false, version: 0, stale: false }
  }
  catalogCache = null
  return { ok: true, version: incoming.version || 0, stale: false }
}

/** The version of the catalog in use, or 0 when it carries none. */
export function localCatalogVersion(): number {
  return readBundled()?.version || 0
}

/** The offline seed catalog, enriched with fresh star counts from cache. */
export async function curatedCatalog(): Promise<RepoMeta[]> {
  if (catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.repos
  const bundled = readBundled()
  if (!bundled) {
    catalogCache = { at: Date.now(), repos: [] }
    return []
  }
  const repoCache = cache.get().repos
  const repos = bundled.repos.map((r) => {
    const fresh = repoCache[r.fullName]
    if (!fresh) return { ...r, topics: cleanTopics(r.topics) }
    // Live API metadata wins on *facts* (stars, forks, pushedAt). Everything
    // the bundled catalog authors must be restored afterwards, because
    // `...fresh.meta` overwrites the whole object indiscriminately — and for a
    // repository with no GitHub description the API value is empty, which
    // silently blanked hand-written copy (JimLiu/baoyu-skills, MiniMax-AI/skills).
    /*
      Overlay only the *facts* the API knows, on top of the bundled entry.

      This used to run the other way — start from the live cache, then restore a
      hand-written allow-list — which meant every authored field had to be
      remembered here or it silently vanished. That has gone wrong twice: authored
      descriptions were blanked for repositories whose GitHub description is
      empty, and later the `appAgent` label disappeared the same way. An allow-list
      of facts cannot lose an authored field, because it never touches them.
    */
    const merged: RepoMeta = {
      ...r,
      stars: fresh.meta.stars ?? r.stars,
      forks: fresh.meta.forks ?? r.forks,
      pushedAt: fresh.meta.pushedAt || r.pushedAt,
      avatarUrl: fresh.meta.avatarUrl || r.avatarUrl,
      htmlUrl: fresh.meta.htmlUrl || r.htmlUrl,
      topics: cleanTopics(fresh.meta.topics?.length ? fresh.meta.topics : r.topics),
      // The API description is a fallback, never an overwrite: a repository with
      // no GitHub description would otherwise blank authored copy.
      descriptionEn: r.descriptionEn || fresh.meta.descriptionEn,
      descriptionZh: r.descriptionZh || fresh.meta.descriptionZh
    }
    return { ...merged, topics: cleanTopics(merged.topics) }
  })
  for (const r of repos) snapshotStars(r.fullName, r.stars)
  catalogCache = { at: Date.now(), repos }
  return repos
}

export function catalogGeneratedAt(): string | null {
  return readBundled()?.generatedAt || null
}

/** Refresh star counts for the curated set with a bounded number of API calls. */
export async function refreshCuratedStars(limit = 60): Promise<{ updated: number; failed: number }> {
  const repos = await curatedCatalog()
  const targets = repos.slice(0, limit)
  let updated = 0
  let failed = 0
  const concurrency = 6
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < targets.length) {
      const repo = targets[cursor++]
      try {
        const meta = await getRepo(repo.fullName, { force: true })
        cache.update((d) => {
          d.repos[repo.fullName] = { at: Date.now(), meta: { ...repo, ...meta } }
        })
        snapshotStars(repo.fullName, meta.stars)
        updated++
      } catch {
        failed++
      }
    }
  })
  await Promise.all(workers)
  catalogCache = null
  settings.set({ curatedUpdatedAt: Date.now() })
  return { updated, failed }
}

/** Primary browse axis: the functional category assigned by the catalog rewrite. */
export function fnOf(repo: RepoMeta): FnCategory {
  if (repo.fn) return repo.fn
  // Fall back to the provenance category for repos that predate the rewrite.
  const c = repo.category
  if (c === 'spec') return 'spec'
  if (c === 'tooling') return 'tooling'
  if (c === 'collection') return 'collections'
  if (c === 'official') return 'coding'
  return 'coding'
}

/** Group the catalog by functional category for the sidebar and browse grid. */
export async function catalogByFunction(): Promise<Record<string, RepoMeta[]>> {
  const repos = await curatedCatalog()
  const out: Record<string, RepoMeta[]> = {}
  for (const r of repos) {
    const fn = fnOf(r)
    ;(out[fn] ||= []).push(r)
  }
  for (const key of Object.keys(out)) out[key].sort((a, b) => b.stars - a.stars)
  return out
}

let scenarioCache: { at: number; list: Scenario[] } | null = null

export function scenarios(): Scenario[] {
  if (scenarioCache && Date.now() - scenarioCache.at < 5 * 60_000) return scenarioCache.list
  try {
    const p = scenariosPath()
    if (existsSync(p)) {
      const parsed = JSON.parse(readFileSync(p, 'utf8'))
      if (Array.isArray(parsed?.scenarios)) {
        scenarioCache = { at: Date.now(), list: parsed.scenarios as Scenario[] }
        return scenarioCache.list
      }
    }
  } catch (err) {
    console.error('[catalog] failed to read scenarios', err)
  }
  scenarioCache = { at: Date.now(), list: [] }
  return []
}

/** Resolve a scenario to the repos it recommends, pinned entries first. */
export async function scenarioRepos(id: string): Promise<RepoMeta[]> {
  const scenario = scenarios().find((s) => s.id === id)
  if (!scenario) return []
  const repos = await curatedCatalog()
  const byName = new Map(repos.map((r) => [r.fullName, r]))
  const pinned = scenario.repos.map((n) => byName.get(n)).filter(Boolean) as RepoMeta[]
  const seen = new Set(pinned.map((r) => r.fullName))
  const extra = repos.filter((r) => {
    if (seen.has(r.fullName)) return false
    const hay = `${r.fullName} ${r.name} ${r.taglineZh || ''} ${r.taglineEn || ''} ${r.descriptionZh || ''} ${
      r.descriptionEn || ''
    } ${(r.topics || []).join(' ')}`.toLowerCase()
    return scenario.keywords.some((k) => hay.includes(k.toLowerCase()))
  })
  return [...pinned, ...extra.sort((a, b) => b.stars - a.stars)].slice(0, 24)
}

export function categoryOf(repo: RepoMeta): Category {
  if (repo.category) return repo.category
  const topics = (repo.topics || []).map((t) => t.toLowerCase())
  const name = repo.name.toLowerCase()
  if (topics.includes('specification') || name.includes('spec')) return 'spec'
  if (topics.some((t) => t.includes('awesome')) || name.includes('awesome')) return 'collection'
  if (topics.some((t) => t.includes('skill-manager') || t.includes('package-manager'))) return 'tooling'
  return 'collection'
}

/** A de-duplicated, category-aware view of the catalog for the Discover page. */
export async function catalogSections(): Promise<{
  featured: RepoMeta[]
  byCategory: Record<string, RepoMeta[]>
  top: RepoMeta[]
}> {
  const repos = await curatedCatalog()
  const byCategory: Record<string, RepoMeta[]> = {}
  for (const r of repos) {
    const c = categoryOf(r)
    ;(byCategory[c] ||= []).push(r)
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].sort((a, b) => b.stars - a.stars)
  }
  const featured = [...repos]
    .filter((r) => (r.skillDirs?.length || 0) > 0 || r.category === 'collection' || r.category === 'official')
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 18)
  const top = [...repos].sort((a, b) => b.stars - a.stars).slice(0, 24)
  return { featured, byCategory, top }
}
