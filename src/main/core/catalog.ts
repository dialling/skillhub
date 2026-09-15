import { existsSync, readFileSync } from 'node:fs'
import type { Category, CuratedCatalog, RepoMeta, SkillEntry } from '../../shared/types'
import { curatedCatalogPath } from './paths'
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
