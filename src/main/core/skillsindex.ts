import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillIndexEntry, SkillShardInfo } from '../../shared/types'
import { ensureDir, userDataDir } from './paths'
import { settings } from './db'

/**
 * The individual skills inside the catalog's repositories.
 *
 * The catalog knows every skill's path but nothing about what it does; that
 * lives in each SKILL.md, which is one file per skill. `scripts/extract-skills.mjs`
 * clones each repository sparsely, reads the frontmatter and publishes the result
 * as shards under `data/live/skills/`, so a client can pull just the category it
 * is showing instead of a multi-megabyte index.
 *
 * Shards are cached on disk: they change once a day at most, and re-fetching a
 * megabyte to browse a list would be wasteful.
 */
const OWNER = 'dialling'
const REPO = 'skillhub'
const BRANCH = 'main'
const BASE = 'data/live/skills'

export interface SkillIndex {
  updatedAt: string
  total: number
  shards: Record<string, SkillShardInfo>
}

function cacheDir(): string {
  const dir = join(userDataDir(), 'skills-index')
  ensureDir(dir)
  return dir
}

function cacheFile(name: string): string {
  return join(cacheDir(), name)
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'skillhub' },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (res.ok) return await res.text()
  } catch {
    /* mirror unavailable */
  }
  return null
}

/** Try each mirror in turn, then the authenticated API as a last resort. */
async function fetchFromMirrors(path: string, timeoutMs = 15000): Promise<string | null> {
  const urls = [
    `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${path}`,
    `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`
  ]
  for (const url of urls) {
    const text = await fetchText(url, timeoutMs)
    if (text) return text
  }
  const token = settings.get().token
  if (token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'skillhub' },
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (res.ok) {
        const json = (await res.json()) as { content?: string }
        if (json.content) return Buffer.from(json.content, 'base64').toString('utf8')
      }
    } catch {
      /* fall through */
    }
  }
  return null
}

/** What shards exist. Cached for a day; it changes once per scheduled run. */
export async function skillIndex(): Promise<SkillIndex> {
  const cached = cacheFile('index.json')
  if (existsSync(cached)) {
    try {
      const parsed = JSON.parse(readFileSync(cached, 'utf8')) as SkillIndex & { fetchedAt?: number }
      if (parsed.fetchedAt && Date.now() - parsed.fetchedAt < 24 * 3600_000) return parsed
    } catch {
      /* stale or corrupt; refetch */
    }
  }
  const text = await fetchFromMirrors(`${BASE}/index.json`, 10000)
  if (text) {
    try {
      const parsed = JSON.parse(text) as SkillIndex
      writeFileSync(cached, JSON.stringify({ ...parsed, fetchedAt: Date.now() }), 'utf8')
      return parsed
    } catch {
      /* fall through to whatever cache exists */
    }
  }
  if (existsSync(cached)) {
    try {
      return JSON.parse(readFileSync(cached, 'utf8')) as SkillIndex
    } catch {
      /* nothing usable */
    }
  }
  return { updatedAt: '', total: 0, shards: {} }
}

/** One category's skills, from cache when possible. */
export async function skillShard(fn: string): Promise<SkillIndexEntry[]> {
  const safe = fn.replace(/[^a-z]/gi, '')
  if (!safe) return []
  const file = cacheFile(`${safe}.json`)
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { skills?: SkillIndexEntry[] }
      if (Array.isArray(parsed.skills)) return parsed.skills
    } catch {
      /* refetch */
    }
  }
  const text = await fetchFromMirrors(`${BASE}/${safe}.json`, 25000)
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as { skills?: SkillIndexEntry[] }
    if (!Array.isArray(parsed.skills)) return []
    mkdirSync(cacheDir(), { recursive: true })
    writeFileSync(file, text, 'utf8')
    return parsed.skills
  } catch {
    return []
  }
}

/** Search across every shard. Loads the ones not yet cached. */
export async function searchSkillIndex(term: string, limit = 60): Promise<SkillIndexEntry[]> {
  const q = term.trim().toLowerCase()
  if (!q) return []
  const index = await skillIndex()
  const fns = Object.keys(index.shards)
  const all: SkillIndexEntry[] = []
  for (const fn of fns) {
    const list = await skillShard(fn)
    for (const s of list) {
      if (s.n.toLowerCase().includes(q) || (s.d || '').toLowerCase().includes(q)) all.push(s)
    }
    if (all.length > limit * 6) break
  }
  all.sort((a, b) => b.s - a.s || a.n.localeCompare(b.n))
  return all.slice(0, limit)
}
