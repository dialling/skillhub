import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { JobProgress, LibraryItem, RepoMeta, SkillEntry } from '../../shared/types'
import { ensureDir, expandPath, libraryFolderName } from './paths'
import { cache, installs, library, logActivity, settings } from './db'
import { getRepo, listSkillDirs, activeToken, getRawFile } from './github'
import { buildLocalSkills, buildRemoteSkills, parseSkillMd } from './skills'
import { m } from './msg'
import { hasBinary } from './platform'

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

export function gitAvailable(): boolean {
  return hasBinary('git')
}

function run(cmd: string, args: string[], opts: { cwd?: string; onLine?: (s: string) => void } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          GCM_INTERACTIVE: 'never'
        },
        maxBuffer: 32 * 1024 * 1024
      },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(String(stderr || err.message).trim()))
        else resolve()
      }
    )
    child.stderr?.on('data', (buf: Buffer) => {
      const text = buf.toString()
      for (const line of text.split(/\r?\n|\r/)) {
        if (line.trim()) opts.onLine?.(line.trim())
      }
    })
  })
}

function authedUrl(fullName: string): string {
  const token = activeToken()
  return token
    ? `https://x-access-token:${token}@github.com/${fullName}.git`
    : `https://github.com/${fullName}.git`
}

function cleanUrl(fullName: string): string {
  return `https://github.com/${fullName}.git`
}

export function libraryDir(): string {
  const dir = settings.get().libraryDir || join(ensureDir(join(require('node:os').homedir(), '.skillhub')), 'library')
  return ensureDir(expandPath(dir))
}

export function libraryItems(): LibraryItem[] {
  return library.get().items
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

/** Read every SKILL.md inside a local checkout to produce rich skill entries. */
async function enrichSkills(
  fullName: string,
  root: string,
  meta: RepoMeta,
  remoteDirs: string[],
  onProgress?: (msg: string, pct?: number) => void
): Promise<SkillEntry[]> {
  const skills = buildLocalSkills(fullName, root, {
    stars: meta.stars,
    avatarUrl: meta.avatarUrl,
    license: meta.license
  })
  if (!skills.length && remoteDirs.length) {
    // Checkout has no SKILL.md (e.g. skills live on another branch) — keep the
    // remote listing so the repo is still usable.
    return buildRemoteSkills(fullName, remoteDirs, {
      stars: meta.stars,
      avatarUrl: meta.avatarUrl,
      license: meta.license
    })
  }
  void onProgress
  return skills
}

export interface AddOptions {
  /** restrict the checkout to specific skill dirs (still a full clone today) */
  skillDirs?: string[]
  /** shallow clone depth */
  depth?: number
}

export async function addRepo(fullName: string, opts: AddOptions = {}): Promise<LibraryItem> {
  const id = fullName
  const existing = getItem(id)
  if (existing && existing.status === 'ready') return existing

  const meta = await getRepo(fullName, { force: true })
  const dir = join(libraryDir(), libraryFolderName(fullName))

  const item: LibraryItem = {
    id,
    fullName,
    addedAt: existing?.addedAt || Date.now(),
    updatedAt: Date.now(),
    status: 'downloading',
    sourcePath: dir,
    branch: meta.defaultBranch,
    meta,
    skills: []
  }
  upsert(item)
  emit({ job: 'clone', id, phase: 'start', message: m('library.cloning', { name: fullName }), percent: 2 })

  try {
    let remoteDirs: string[] = []
    try {
      const tree = await listSkillDirs(fullName, meta.defaultBranch)
      remoteDirs = tree.dirs
      if (tree.truncated) meta.truncatedTree = true
    } catch {
      /* non fatal */
    }

    if (existsSync(join(dir, '.git'))) {
      emit({ job: 'clone', id, phase: 'progress', message: m('library.alreadyCloned'), percent: 20 })
      await run('git', ['-C', dir, 'pull', '--ff-only', '--depth', '1'], {
        onLine: (l) => emit({ job: 'clone', id, phase: 'progress', message: l })
      }).catch(async () => {
        await run('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', meta.defaultBranch || 'main'])
        await run('git', ['-C', dir, 'reset', '--hard', 'FETCH_HEAD'])
      })
    } else {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const depth = String(opts.depth || 1)
      const args = ['clone', '--depth', depth, '--single-branch']
      if (meta.defaultBranch) args.push('--branch', meta.defaultBranch)
      args.push(cleanUrl(fullName), dir)
      try {
        await run('git', args, {
          onLine: (l) => emit({ job: 'clone', id, phase: 'progress', message: l })
        })
      } catch (err: any) {
        // Private repo or auth failure: retry with an authenticated URL, then
        // scrub the token from the stored remote.
        const token = activeToken()
        if (!token) throw err
        emit({ job: 'clone', id, phase: 'progress', message: m('library.retryAuth') })
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
        await run('git', [...args.filter((a) => a !== cleanUrl(fullName) && a !== dir), authedUrl(fullName), dir], {
          onLine: (l) => emit({ job: 'clone', id, phase: 'progress', message: l })
        })
        await run('git', ['-C', dir, 'remote', 'set-url', 'origin', cleanUrl(fullName)]).catch(() => {})
      }
    }

    emit({ job: 'clone', id, phase: 'progress', message: m('library.parsing'), percent: 85 })
    const skills = await enrichSkills(fullName, dir, meta, remoteDirs)
    const ready: LibraryItem = {
      ...item,
      status: 'ready',
      lastSyncAt: Date.now(),
      updatedAt: Date.now(),
      skills,
      meta: { ...meta, skillDirs: remoteDirs.length ? remoteDirs : skills.map((s) => s.path), skillCount: skills.length }
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
    await run('git', ['-C', item.sourcePath, 'pull', '--ff-only', '--depth', '1'], {
      onLine: (l) => emit({ job: 'sync', id, phase: 'progress', message: l })
    })
    const meta = await getRepo(id, { force: true })
    const skills = buildLocalSkills(id, item.sourcePath, {
      stars: meta.stars,
      avatarUrl: meta.avatarUrl,
      license: meta.license
    })
    const next: LibraryItem = {
      ...item,
      meta: { ...meta, skillDirs: skills.map((s) => s.path), skillCount: skills.length },
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

/** Which library items already contain this fullName. */
export function isInLibrary(fullName: string): boolean {
  return library.get().items.some((i) => i.id === fullName)
}

/** Read a single SKILL.md from a checkout. */
export function readSkillFile(fullName: string, relPath: string): string | null {
  const item = getItem(fullName)
  if (!item) return null
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

export function diskUsage(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  const walk = (p: string, depth: number): void => {
    if (depth > 6) return
    let entries: string[] = []
    try {
      entries = readdirSync(p)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(p, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) walk(full, depth + 1)
        else total += st.size
      } catch {
        /* ignore */
      }
    }
  }
  walk(dir, 0)
  return total
}

export { cpSync }
