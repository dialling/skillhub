import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, posix } from 'node:path'
import type { SubmissionRecord, SubmissionResult } from '../../shared/types'
import { activeToken, ghFetch, GitHubError } from './github'
import { readSkillDir } from './skills'
import { m } from './msg'
import { safeSegment } from './paths'

/**
 * Send a local skill to the project's repository for review.
 *
 * The store is a curated catalog: every entry carries a hand-written bilingual
 * tagline, a use-case and a long description, and the gates refuse an entry
 * without them. A skill that exists only on this machine has none of that, so
 * it cannot go straight into the catalog — it goes to `submissions/` instead,
 * where it waits for that copy to be written.
 *
 * Uploading through the Contents API costs one request per file, which is fine
 * for a skill (a SKILL.md plus a few references) and reason enough to refuse
 * anything that looks like a code repository rather than a skill.
 */
const OWNER = 'dialling'
const REPO = 'skillhub'
const BRANCH = 'main'
const DIR = 'submissions'

/**
 * What a skill is made of: text.
 *
 * The first version of this walked everything and capped the file count, which
 * refused a perfectly normal skill for having 1,552 files — and that skill turned
 * out to hold 22,005 files and 837 MB of gallery images, demo projects and video
 * assets. Media is the author's repository content, not the skill: the skill is
 * SKILL.md plus the documents and scripts it references. A per-file ceiling does
 * that filtering honestly, without guessing at folder names, and anything
 * skipped is reported rather than silently dropped.
 */
const MAX_FILES = 120
const MAX_BYTES = 6 * 1024 * 1024
const MAX_FILE_BYTES = 256 * 1024
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '__pycache__'])
const MEDIA = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|mp4|mov|avi|mkv|webm|mp3|wav|flac|m4a|ogg|zip|tar|gz|7z|rar|pdf|psd|sketch|fig|ttf|otf|woff2?|exe|dmg|iso|bin)$/i

export interface SubmitInput {
  /** absolute path of the skill folder on this machine */
  localPath: string
  /** folder name to use in the repository */
  name: string
  /** where it came from, for the reviewer */
  origin?: string
}

/** Cut on a sentence boundary so the manifest never stops mid-word. */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf('\u3002'))
  return (cut > 60 ? slice.slice(0, cut + 1) : slice.trimEnd()).trim()
}

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, base, out)
    else if (st.isFile()) out.push(relative(base, full))
  }
  return out
}

/** PUT one file. Returns false when the path already exists and is unchanged. */
async function putFile(path: string, content: Buffer, message: string): Promise<void> {
  // The Contents API requires the current blob SHA to replace an existing file.
  let sha: string | undefined
  try {
    const existing = await ghFetch<{ sha?: string }>(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`)
    sha = existing?.sha
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 404) throw err
  }
  await ghFetch(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: content.toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  })
}

async function readManifest(): Promise<{ submissions: SubmissionRecord[] }> {
  try {
    const raw = await ghFetch<{ content?: string }>(
      `/repos/${OWNER}/${REPO}/contents/${DIR}/index.json?ref=${BRANCH}`
    )
    if (!raw?.content) return { submissions: [] }
    return JSON.parse(Buffer.from(raw.content, 'base64').toString('utf8'))
  } catch {
    // No manifest yet, or unreadable: start a fresh one rather than failing.
    return { submissions: [] }
  }
}

export async function listSubmissions(): Promise<SubmissionRecord[]> {
  const manifest = await readManifest()
  return (manifest.submissions || []).sort((a, b) => (a.at < b.at ? 1 : -1))
}

/**
 * Upload one skill folder for review.
 *
 * Everything lands under `submissions/<name>/`, plus an entry in the manifest.
 * Nothing here touches the catalog, so the store is unaffected until the entry
 * has been reviewed and given its bilingual copy.
 */
export async function submitSkill(input: SubmitInput): Promise<SubmissionResult> {
  if (!activeToken()) throw new Error('not signed in')

  let files: string[]
  try {
    files = walk(input.localPath)
  } catch (err: any) {
    return { ok: false, uploaded: 0, message: m('submit.readFailed', { msg: err?.message || err }) }
  }
  if (!files.length) return { ok: false, uploaded: 0, message: m('submit.empty') }

  // A skill must at least have a SKILL.md, or there is nothing to review.
  const skillFile = files.find((f) => /^SKILL\.md$/i.test(f))
  if (!skillFile) return { ok: false, uploaded: 0, message: m('submit.noSkillFile') }

  // Text only: media is the author's repository content, not the skill.
  const candidates: { rel: string; size: number }[] = []
  let skipped = 0
  for (const rel of files) {
    const full = join(input.localPath, rel)
    let size = 0
    try {
      size = statSync(full).size
    } catch {
      continue
    }
    if (MEDIA.test(rel) || size > MAX_FILE_BYTES) {
      skipped++
      continue
    }
    candidates.push({ rel, size })
  }
  if (!candidates.length) {
    return { ok: false, uploaded: 0, message: m('submit.noTextFiles') }
  }

  /*
    Choose what to send when the folder holds a whole project.

    Some skills live inside repositories that also carry demos, galleries and a
    workbench — one measured here had 900 text files and 837 MB. The skill is
    SKILL.md plus the files SKILL.md points at, so those are taken first, then
    the shallowest remaining files fill up to the cap. The result is the skill
    rather than a slice of somebody's project, and the count left out is
    reported instead of hidden.
  */
  const rootSkill = candidates.find((c) => /^SKILL\.md$/i.test(c.rel))
  const chosen: { rel: string; size: number }[] = []
  const taken = new Set<string>()
  const take = (rel: string): void => {
    const hit = candidates.find((c) => c.rel === rel)
    if (hit && !taken.has(rel)) {
      taken.add(rel)
      chosen.push(hit)
    }
  }
  if (rootSkill) take(rootSkill.rel)

  // Files the skill file itself links to, relative to its own folder.
  if (rootSkill) {
    // `rel` is a filesystem path, so the separator is platform-dependent; only
    // the path *in the repository* is always POSIX.
    const dirFs = dirname(rootSkill.rel)
    const dir = dirFs === '.' ? '' : `${dirFs}/`
    const text = readFileSync(join(input.localPath, rootSkill.rel), 'utf8')
    for (const m2 of text.matchAll(/\]\(([^)\s#]+)[^)]*\)/g)) {
      const link = decodeURIComponent(m2[1]).replace(/^\.\//, '')
      if (link.includes('://')) continue
      const normalized = (dir + link).split(/[\\/]/).join('/')
      take(normalized)
      take(normalized.replace(/\/$/, '/SKILL.md'))
    }
  }

  // Then the shallowest remaining files: depth is a good proxy for "part of the
  // skill" versus "part of the project it happens to live in".
  const rest = candidates
    .filter((c) => !taken.has(c.rel))
    .sort((a, b) => a.rel.split('/').length - b.rel.split('/').length || a.rel.localeCompare(b.rel))
  for (const c of rest) {
    if (chosen.length >= MAX_FILES) break
    taken.add(c.rel)
    chosen.push(c)
  }

  let total = 0
  const payload: { rel: string; content: Buffer }[] = []
  for (const c of chosen) {
    total += c.size
    if (total > MAX_BYTES) {
      return { ok: false, uploaded: 0, message: m('submit.tooLarge', { mb: Math.round(MAX_BYTES / 1024 / 1024) }) }
    }
    payload.push({ rel: c.rel, content: readFileSync(join(input.localPath, c.rel)) })
  }
  skipped += candidates.length - chosen.length

  const slug = safeSegment(input.name)
  const parsed = readSkillDir(input.localPath)
  let uploaded = 0
  try {
    for (const file of payload) {
      const target = posix.join(DIR, slug, file.rel.split(/[\\/]/).join('/'))
      await putFile(target, file.content, `submission: ${input.name}`)
      uploaded++
    }
  } catch (err: any) {
    const msg = err instanceof GitHubError ? `${err.status} ${err.message}` : err?.message || String(err)
    return {
      ok: false,
      uploaded,
      message: uploaded
        ? m('submit.partial', { n: uploaded, msg })
        : m('submit.failed', { msg })
    }
  }

  const record: SubmissionRecord = {
    slug,
    name: parsed?.title || input.name,
    // SKILL.md descriptions are written as model triggers and run long; the
    // reviewer needs the gist, and the full text comes with the files anyway.
    description: parsed?.description ? truncate(parsed.description, 240) : '',
    files: uploaded,
    bytes: total,
    skipped,
    origin: input.origin || input.localPath,
    at: new Date().toISOString(),
    status: 'pending'
  }

  const manifest = await readManifest()
  const submissions = (manifest.submissions || []).filter((s) => s.slug !== slug)
  submissions.push(record)
  await putFile(
    `${DIR}/index.json`,
    Buffer.from(JSON.stringify({ updatedAt: new Date().toISOString(), submissions }, null, 2) + '\n', 'utf8'),
    `submission: register ${input.name}`
  )

  return {
    ok: true,
    uploaded,
    slug,
    message: skipped
      ? m('submit.doneSkipped', { n: uploaded, slug, skipped })
      : m('submit.done', { n: uploaded, slug })
  }
}
