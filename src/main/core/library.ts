import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { JobProgress, LibraryItem, RepoMeta } from '../../shared/types'
import { expandPath } from './paths'
import { cache, installs, library, logActivity } from './db'
import { getRepo, listSkillDirs, getRawFile } from './github'
import { buildLocalSkills, buildRemoteSkills, parseSkillMd } from './skills'
import { m } from './msg'
import { curatedCatalog } from './catalog'

export type ProgressSink = (p: JobProgress) => void

let sink: ProgressSink = () => {}
export function setProgressSink(fn: ProgressSink): void {
  sink = fn
}

function emit(p: JobProgress): void {
  try {
    sink(p)
  } catch {
    /* renderer may be gone */
  }
}

/**
 * One entry per distinct skill, deduped on the way out.
 *
 * Deduping at the point of scanning is not enough: the skill list is persisted
 * when a repository is added, so items already in the library keep whatever the
 * older scan produced and go on disagreeing with the catalog. Doing it here
 * covers both — new scans and everything already stored — without rewriting
 * anyone's state.
 *
 * The shallowest path wins, matching how the catalog counts.
 */
function dedupeByName(skills: LibraryItem['skills']): LibraryItem['skills'] {
  const best = new Map<string, LibraryItem['skills'][number]>()
  for (const s of skills) {
    const prev = best.get(s.name)
    if (!prev) {
      best.set(s.name, s)
      continue
    }
    const depth = (p: string): number => p.split('/').filter(Boolean).length
    if (depth(s.path) < depth(prev.path) || (depth(s.path) === depth(prev.path) && s.path < prev.path)) {
      best.set(s.name, s)
    }
  }
  return best.size === skills.length ? skills : [...best.values()]
}

export function libraryItems(): LibraryItem[] {
  const items = library.get().items
  return items.map((i) => {
    const skills = dedupeByName(i.skills)
    return skills === i.skills ? i : { ...i, skills }
  })
}

/**
 * Library items with the catalog's authored copy merged over the stored meta.
 *
 * `meta` is saved from the GitHub API, which knows nothing about the tagline,
 * use-case, long description or functional category we write by hand — so the
 * library was showing repositories stripped of the one thing that tells you at
 * a glance what they do. Merging happens on read rather than on write so that
 * repositories added before this existed, and copy improved afterwards, both
 * pick the change up. Never writes: the stored meta stays pure API data.
 */
export async function libraryItemsEnriched(): Promise<LibraryItem[]> {
  const items = library.get().items
  if (!items.length) return items
  const byName = new Map((await curatedCatalog()).map((r) => [r.fullName, r]))
  return items.map((item) => {
    // Dedupe here too: this is the accessor the UI actually reads, and the
    // stored list predates the dedupe for anything added before it.
    const skills = dedupeByName(item.skills)
    const curated = byName.get(item.fullName)
    if (!curated) return skills === item.skills ? item : { ...item, skills }
    return {
      ...item,
      skills,
      meta: {
        ...item.meta,
        // authored copy wins
        taglineZh: curated.taglineZh,
        taglineEn: curated.taglineEn,
        descriptionEn: curated.descriptionEn || item.meta.descriptionEn,
        descriptionZh: curated.descriptionZh,
        aboutZh: curated.aboutZh,
        useWhen: curated.useWhen,
        useWhenEn: curated.useWhenEn,
        // classification and functional grouping
        fn: curated.fn,
        category: curated.category,
        repoKind: curated.repoKind
      }
    }
  })
}

/** One library item, enriched the same way. */
export async function getItemEnriched(id: string): Promise<LibraryItem | null> {
  return (await libraryItemsEnriched()).find((i) => i.id === id) || null
}

export function getItem(id: string): LibraryItem | null {
  return library.get().items.find((i) => i.id === id) || null
}

function upsert(item: LibraryItem): void {
  library.update((d) => {
    const idx = d.items.findIndex((i) => i.id === item.id)
    if (idx >= 0) d.items[idx] = item
    else d.items.unshift(item)
  })
}

export async function addRepo(fullName: string): Promise<LibraryItem> {
  const id = fullName
  const existing = getItem(id)
  if (existing && existing.status === 'ready') return existing

  const meta = await getRepo(fullName, { force: true })

  const item: LibraryItem = {
    id,
    fullName,
    addedAt: existing?.addedAt || Date.now(),
    updatedAt: Date.now(),
    status: 'downloading',
    sourcePath: '',
    branch: meta.defaultBranch,
    meta,
    skills: []
  }
  upsert(item)
  emit({ job: 'clone', id, phase: 'start', message: m('library.listing', { name: fullName }), percent: 5 })

  try {
    let remoteDirs: string[] = []
    try {
      const tree = await listSkillDirs(fullName, meta.defaultBranch)
      remoteDirs = tree.dirs
      if (tree.truncated) meta.truncatedTree = true
    } catch {
      /* a repo with no readable tree still gets an entry; it just has no skills */
    }

    emit({ job: 'clone', id, phase: 'progress', message: m('library.parsing'), percent: 70 })
    const skills = buildRemoteSkills(fullName, remoteDirs, {
      stars: meta.stars,
      avatarUrl: meta.avatarUrl,
      license: meta.license
    })
    const ready: LibraryItem = {
      ...item,
      status: 'ready',
      lastSyncAt: Date.now(),
      updatedAt: Date.now(),
      skills,
      meta: { ...meta, skillDirs: remoteDirs, skillCount: skills.length }
    }
    upsert(ready)
    logActivity('add', 'activity.added', { name: fullName, count: skills.length })
    emit({
      job: 'clone',
      id,
      phase: 'done',
      message: m('library.addedDone', { name: fullName, count: skills.length }),
      percent: 100
    })
    return ready
  } catch (err: any) {
    const failed: LibraryItem = {
      ...item,
      status: 'error',
      error: err?.message || String(err),
      updatedAt: Date.now()
    }
    upsert(failed)
    emit({ job: 'clone', id, phase: 'error', message: m('library.addFailed', { name: fullName, error: failed.error }) })
    return failed
  }
}

/** Register a local folder as a library source (no clone). */
export async function addLocalDir(dir: string, name?: string): Promise<LibraryItem> {
  const abs = expandPath(dir)
  if (!existsSync(abs)) throw new Error(m('library.dirMissing', { dir: abs }))
  const fullName = name || `local/${abs.split('/').filter(Boolean).pop()}`
  const skills = buildLocalSkills(fullName, abs)
  const item: LibraryItem = {
    id: fullName,
    fullName,
    addedAt: Date.now(),
    updatedAt: Date.now(),
    lastSyncAt: Date.now(),
    status: 'ready',
    sourcePath: abs,
    local: true,
    meta: {
      fullName,
      owner: 'local',
      name: fullName.split('/').pop() || fullName,
      descriptionEn: 'Local folder',
      descriptionZh: '本地目录导入',
      stars: 0,
      topics: [],
      category: 'collection',
      htmlUrl: '',
      skillDirs: skills.map((s) => s.path),
      skillCount: skills.length
    },
    skills
  }
  upsert(item)
  logActivity('add', 'activity.imported', { dir: abs, count: skills.length })
  return item
}

export async function syncItem(id: string): Promise<LibraryItem> {
  const item = getItem(id)
  if (!item) throw new Error(m('library.itemMissing', { id }))
  if (item.local) return item
  emit({ job: 'sync', id, phase: 'start', message: m('library.syncing', { name: id }) })
  try {
    const meta = await getRepo(id, { force: true })
    let remoteDirs: string[] = []
    try {
      const tree = await listSkillDirs(id, meta.defaultBranch)
      remoteDirs = tree.dirs
    } catch {
      /* keep whatever the item already had rather than emptying it */
      remoteDirs = item.meta.skillDirs || item.skills.map((s) => s.path)
    }
    const skills = buildRemoteSkills(id, remoteDirs, {
      stars: meta.stars,
      avatarUrl: meta.avatarUrl,
      license: meta.license
    })
    const next: LibraryItem = {
      ...item,
      meta: { ...meta, skillDirs: remoteDirs, skillCount: skills.length },
      skills,
      lastSyncAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ready',
      error: undefined
    }
    upsert(next)
    logActivity('sync', 'activity.synced', { name: id, count: skills.length })
    emit({ job: 'sync', id, phase: 'done', message: m('library.synced', { name: id }) })
    return next
  } catch (err: any) {
    emit({ job: 'sync', id, phase: 'error', message: m('library.syncFailed', { error: err?.message || err }) })
    throw err
  }
}

export function removeItem(id: string, deleteFiles = true): { removedInstalls: number } {
  const item = getItem(id)
  if (!item) return { removedInstalls: 0 }
  let removedInstalls = 0
  const affected = installs.get().records.filter((r) => r.repoFullName === id)
  for (const rec of affected) {
    try {
      if (existsSync(rec.linkPath)) rmSync(rec.linkPath, { recursive: true, force: true })
      removedInstalls++
    } catch {
      /* ignore */
    }
  }
  installs.update((d) => {
    d.records = d.records.filter((r) => r.repoFullName !== id)
  })
  if (deleteFiles && !item.local && existsSync(item.sourcePath)) {
    try {
      rmSync(item.sourcePath, { recursive: true, force: true })
    } catch (err) {
      console.error('[library] failed to delete checkout', err)
    }
  }
  library.update((d) => {
    d.items = d.items.filter((i) => i.id !== id)
  })
  logActivity('remove', 'activity.removed', { name: id })
  return { removedInstalls }
}

/**
 * Read a single SKILL.md from disk — for locally imported folders only.
 *
 * There is no checkout for a GitHub repo anymore, so a null return here is the
 * normal case and the caller falls through to raw.githubusercontent.
 */
export function readSkillFile(fullName: string, relPath: string): string | null {
  const item = getItem(fullName)
  if (!item?.local || !item.sourcePath) return null
  const file = join(item.sourcePath, relPath, 'SKILL.md')
  if (!existsSync(file)) return null
  try {
    return require('node:fs').readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Fetch SKILL.md bodies for a repo that is not in the library yet, using
 * raw.githubusercontent.com (no API quota) and caching the parsed frontmatter.
 */
export async function fetchRemoteSkillMeta(
  fullName: string,
  branch: string,
  dirs: string[]
): Promise<Record<string, { descriptionEn?: string; descriptionZh?: string; tags?: string[] }>> {
  const out: Record<string, { descriptionEn?: string; descriptionZh?: string; tags?: string[] }> = {}
  const cachedMeta = cache.get().skillmeta
  const todo = dirs.filter((d) => {
    const key = `${fullName}::${d}`
    const hit = cachedMeta[key]
    if (hit && Date.now() - hit.at < 7 * 24 * 3600_000) {
      out[d] = { descriptionEn: hit.descriptionEn, descriptionZh: hit.descriptionZh }
      return false
    }
    return true
  })
  const concurrency = 8
  let cursor = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < todo.length) {
        const dir = todo[cursor++]
        const rel = dir ? `${dir}/SKILL.md` : 'SKILL.md'
        const text = await getRawFile(fullName, branch, rel)
        if (!text) continue
        const parsed = parseSkillMd(text)
        out[dir] = { descriptionEn: parsed.description, tags: parsed.tags }
        cache.update((d) => {
          d.skillmeta[`${fullName}::${dir}`] = {
            at: Date.now(),
            descriptionEn: parsed.description
          }
        })
      }
    })
  )
  return out
}
