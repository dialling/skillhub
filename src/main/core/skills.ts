import matter from 'gray-matter'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { SkillEntry } from '../../shared/types'

export interface ParsedSkill {
  name?: string
  description?: string
  title?: string
  license?: string
  allowedTools?: string[]
  tags: string[]
  body: string
  raw: string
}

/** Parse the YAML frontmatter + body of a SKILL.md file. */
export function parseSkillMd(text: string): ParsedSkill {
  let data: Record<string, any> = {}
  let body = text
  try {
    const parsed = matter(text)
    data = parsed.data || {}
    body = parsed.content || ''
  } catch {
    // Malformed frontmatter: fall back to a naive header scan.
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
    if (m) {
      for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim())
        if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
      }
      body = text.slice(m[0].length)
    }
  }

  const tags: string[] = []
  if (Array.isArray(data.tags)) tags.push(...data.tags.map(String))
  else if (typeof data.tags === 'string') tags.push(...data.tags.split(/[,\s]+/).filter(Boolean))
  if (Array.isArray(data.keywords)) tags.push(...data.keywords.map(String))

  const description =
    (typeof data.description === 'string' && data.description.trim()) ||
    firstParagraph(body) ||
    ''

  return {
    name: typeof data.name === 'string' ? data.name.trim() : undefined,
    description: description.trim(),
    title: typeof data.title === 'string' ? data.title.trim() : undefined,
    license: typeof data.license === 'string' ? data.license : undefined,
    allowedTools: Array.isArray(data['allowed-tools']) ? data['allowed-tools'].map(String) : undefined,
    tags: [...new Set(tags.map((t) => t.replace(/^#/, '')).filter(Boolean))].slice(0, 12),
    body,
    raw: text
  }
}

function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/)
  const buf: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      if (buf.length) break
      continue
    }
    if (t.startsWith('#') || t.startsWith('```') || t.startsWith('![')) {
      if (buf.length) break
      continue
    }
    buf.push(t.replace(/[*_`>#]/g, '').trim())
  }
  return buf.join(' ').slice(0, 400)
}

export function readSkillDir(dir: string): ParsedSkill | null {
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) return null
  try {
    return parseSkillMd(readFileSync(file, 'utf8'))
  } catch (err) {
    console.error('[skills] failed to read', file, err)
    return null
  }
}

/** Recursively find every directory containing a SKILL.md. */
export function discoverSkillDirs(root: string, maxDepth = 5): string[] {
  const found: string[] = []
  const skip = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build', '__pycache__'])
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return
    if (existsSync(join(dir, 'SKILL.md'))) {
      found.push(dir)
      // A skill directory may still contain nested skills; keep walking.
    }
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.') || skip.has(name)) continue
      const full = join(dir, name)
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1)
      } catch {
        /* ignore */
      }
    }
  }
  if (existsSync(root)) walk(root, 1)
  return found
}

/** Build SkillEntry records for a checked-out repository. */
export function buildLocalSkills(fullName: string, root: string, meta?: { stars?: number; avatarUrl?: string; license?: string | null }): SkillEntry[] {
  return discoverSkillDirs(root).map((dir) => {
    const rel = relative(root, dir).split('\\').join('/')
    const parsed = readSkillDir(dir)
    const folderName = rel ? rel.split('/').pop()! : fullName.split('/').pop()!
    return {
      id: `${fullName}::${rel}`,
      repoFullName: fullName,
      path: rel,
      name: folderName,
      title: parsed?.title || parsed?.name || folderName,
      descriptionEn: parsed?.description,
      tags: parsed?.tags || [],
      license: parsed?.license || meta?.license || null,
      source: 'github' as const,
      repoStars: meta?.stars,
      repoAvatarUrl: meta?.avatarUrl,
      localPath: dir,
      available: true
    }
  })
}

/** Build SkillEntry placeholders from remote tree paths (no local checkout). */
export function buildRemoteSkills(
  fullName: string,
  dirs: string[],
  meta?: { stars?: number; avatarUrl?: string; license?: string | null }
): SkillEntry[] {
  return dirs.map((rel) => {
    const folderName = rel ? rel.split('/').pop()! : fullName.split('/').pop()!
    return {
      id: `${fullName}::${rel}`,
      repoFullName: fullName,
      path: rel,
      name: folderName,
      title: folderName,
      tags: [],
      license: meta?.license ?? null,
      source: 'github' as const,
      repoStars: meta?.stars,
      repoAvatarUrl: meta?.avatarUrl,
      available: false
    }
  })
}
