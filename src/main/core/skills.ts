import matter from 'gray-matter'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { SkillEntry } from '../../shared/types'
import { loadRegistry } from './agents'

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

/**
 * Dot-directories that hold skills on purpose.
 *
 * This walk skipped every dot-prefixed name to stay out of `.git`, and that
 * silently excluded the skills the app itself installs at project level:
 * `.agents/skills/x`, `.claude/skills/x`, `.cursor/skills/x`. Those paths are in
 * the repository tree, are listed by the store, and could never be produced by
 * the local scan — so selecting one on the detail page failed with "not in the
 * library", and repositories whose skills live under an agent directory were
 * under-reported (525 such paths in the shipped catalog).
 *
 * The set comes from the agent registry rather than a list written here, so it
 * follows the agents the app actually knows about. Everything else stays skipped,
 * `.git` included.
 */
function skillDotDirs(): Set<string> {
  const out = new Set<string>()
  for (const entry of loadRegistry()) {
    const head = entry.projectSkillsDir?.split('/')[0]
    if (head && head.startsWith('.')) out.add(head)
  }
  return out
}

/** Recursively find every directory containing a SKILL.md. */
export function discoverSkillDirs(root: string, maxDepth = 5): string[] {
  const found: string[] = []
  const skip = new Set(['node_modules', '.venv', 'venv', 'dist', 'build', '__pycache__'])
  const dotDirs = skillDotDirs()
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
      if (skip.has(name)) continue
      if (name.startsWith('.') && !dotDirs.has(name)) continue
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
/**
 * One entry per skill, not per copy of it.
 *
 * Repositories commonly ship the same skill twice — `design-templates/x` beside
 * `plugins/_official/examples/x`, byte for byte identical, verified by hash. Both
 * were listed, so a repository with 385 distinct skills displayed as 532 and
 * offered each of the duplicates as a separate thing to install. The catalog
 * counts distinct skills; the library counted folders, and the two numbers sat
 * next to each other disagreeing.
 *
 * The shallowest path wins, which is the copy the repository treats as canonical
 * — the same rule the catalog was built with.
 */
export function buildLocalSkills(fullName: string, root: string, meta?: { stars?: number; avatarUrl?: string; license?: string | null }): SkillEntry[] {
  const seen = new Map<string, SkillEntry>()
  for (const dir of discoverSkillDirs(root)) {
    const rel = relative(root, dir).split('\\').join('/')
    const parsed = readSkillDir(dir)
    const folderName = rel ? rel.split('/').pop()! : fullName.split('/').pop()!
    const entry: SkillEntry = {
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
    const previous = seen.get(folderName)
    if (!previous) {
      seen.set(folderName, entry)
    } else {
      const depth = (p: string): number => p.split('/').length
      if (depth(rel) < depth(previous.path) || (depth(rel) === depth(previous.path) && rel < previous.path)) {
        seen.set(folderName, entry)
      }
    }
  }
  return [...seen.values()]
}

/** Build SkillEntry placeholders from remote tree paths (no local checkout). */
export function buildRemoteSkills(
  fullName: string,
  dirs: string[],
  meta?: { stars?: number; avatarUrl?: string; license?: string | null }
): SkillEntry[] {
  // Same rule as the local pass: one entry per distinct skill, shallowest path
  // wins, so both paths into the app agree on how many skills a repo has.
  const shallowest = new Map<string, string>()
  for (const rel of dirs) {
    const name = rel ? rel.split('/').pop()! : fullName.split('/').pop()!
    const prev = shallowest.get(name)
    const depth = (p: string): number => p.split('/').filter(Boolean).length
    if (!prev || depth(rel) < depth(prev) || (depth(rel) === depth(prev) && rel < prev)) {
      shallowest.set(name, rel)
    }
  }
  const unique = [...new Set(shallowest.values())].sort()
  return unique.map((rel) => {
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
