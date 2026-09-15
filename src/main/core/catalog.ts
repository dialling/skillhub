import { existsSync, readFileSync } from 'node:fs'
import type { Category, CuratedCatalog, FnCategory, RepoMeta, Scenario, SkillEntry } from '../../shared/types'
import { curatedCatalogPath, scenariosPath } from './paths'
import { cache, settings, snapshotStars } from './db'
import { getRepo, cleanTopics } from './github'

let catalogCache: { at: number; repos: RepoMeta[] } | null = null

function readBundled(): CuratedCatalog | null {
  try {
    const p = curatedCatalogPath()
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8')) as CuratedCatalog
  } catch (err) {
    console.error('[catalog] failed to read curated catalog', err)
    return null
  }
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
    const merged = fresh ? { ...r, ...fresh.meta, descriptionZh: r.descriptionZh || fresh.meta.descriptionZh } : r
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

export function skillToCard(skill: SkillEntry, repo?: RepoMeta) {
  return {
    skill,
    repo: repo || null
  }
}
