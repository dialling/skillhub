import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

/**
 * Every real file in the skill folder, relative to it.
 *
 * `lstatSync`, not `statSync`: a symlink is a pointer to somewhere else on this
 * machine, not something the author put in the folder, and following one
 * published files from outside the skill — a linked `references` directory that
 * happened to point at another project went up with the submission. A dangling
 * link is the same case from the other side: it threw, and one broken link
 * failed the whole submission. Links are skipped, and an entry that cannot be
 * read is skipped too rather than taking the other 119 files with it.
 *
 * Skipped links are logged, not counted in the manifest's `skipped`, which the
 * record documents as media and oversized files: a link is not a file that was
 * dropped from the skill, and calling it one would misdescribe the entry.
 */
function walk(dir: string, base = dir, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err: any) {
    // The root of the walk is the skill folder itself: if that cannot be read
    // there is nothing to submit, and reporting it as an empty folder would
    // name the wrong cause. Deeper down, one unreadable directory is skipped
    // instead of failing the submission over it.
    if (dir === base) throw err
    console.warn(`[submit] 跳过无法读取的目录 ${dir}：${err?.message || err}`)
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let st: ReturnType<typeof lstatSync>
    try {
      st = lstatSync(full)
    } catch (err: any) {
      console.warn(`[submit] 跳过无法读取的条目 ${full}：${err?.message || err}`)
      continue
    }
    if (st.isSymbolicLink()) {
      console.warn(`[submit] 跳过符号链接 ${full}`)
      continue
    }
    if (st.isDirectory()) walk(full, base, out)
    else if (st.isFile()) out.push(relative(base, full))
  }
  return out
}

/** A failure as one line, in the shape the toasts already show it. */
function errText(err: any): string {
  return err instanceof GitHubError ? `${err.status} ${err.message}` : err?.message || String(err)
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

/** DELETE one file. The Contents API needs the SHA of the blob it removes. */
async function deleteFile(path: string, sha: string, message: string): Promise<void> {
  await ghFetch(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: BRANCH })
  })
}

/**
 * Every file published under one repository folder, recursively, with the SHA
 * needed to delete it.
 *
 * The walk starts at the folder it is handed and only descends into paths this
 * very listing returned, so it can never reach outside that submission's own
 * folder. A folder that is not there is not a failure: a first submission has
 * nothing published yet.
 */
async function listRemoteFiles(dir: string): Promise<{ path: string; sha: string }[]> {
  let entries: any
  try {
    entries = await ghFetch<any>(`/repos/${OWNER}/${REPO}/contents/${dir}?ref=${BRANCH}`)
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return []
    throw err
  }
  if (!Array.isArray(entries)) return []
  const files: { path: string; sha: string }[] = []
  for (const entry of entries) {
    const { path, sha, type } = entry || {}
    if (typeof path !== 'string' || typeof sha !== 'string') continue
    if (type === 'dir') files.push(...(await listRemoteFiles(path)))
    else files.push({ path, sha })
  }
  return files
}

/**
 * The shared review index, or an empty one when the repository has none yet.
 *
 * Only a 404 means "no manifest": a rate limit, a dropped connection, a
 * truncated body, JSON that does not parse, or a file too large for the
 * Contents API to return are all failures. Reporting them as an empty manifest
 * is what made a submission overwrite `submissions/index.json` with a single
 * entry — every other pending submission disappeared from the review list, and
 * nothing in the result said so.
 */
async function readManifest(): Promise<{ submissions: SubmissionRecord[] }> {
  let raw: { content?: string; encoding?: string }
  try {
    raw = await ghFetch<{ content?: string; encoding?: string }>(
      `/repos/${OWNER}/${REPO}/contents/${DIR}/index.json?ref=${BRANCH}`
    )
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return { submissions: [] }
    throw err
  }
  // Over 1 MB and GitHub answers without a body (`encoding: 'none'`). An index
  // we cannot read, not one that holds nothing.
  if (raw?.encoding && raw.encoding !== 'base64') {
    throw new Error(`submissions/index.json is too large to read (encoding=${raw.encoding})`)
  }
  // An empty file really does hold no submissions, so a fresh index loses nothing.
  const text = raw?.content ? Buffer.from(raw.content, 'base64').toString('utf8').trim() : ''
  if (!text) return { submissions: [] }
  let parsed: { submissions?: SubmissionRecord[] }
  try {
    parsed = JSON.parse(text)
  } catch (err: any) {
    throw new Error(`submissions/index.json is not valid JSON: ${err?.message || err}`)
  }
  // Valid JSON that is not this manifest: writing over it would destroy whatever
  // it actually is.
  if (!Array.isArray(parsed?.submissions)) {
    throw new Error('submissions/index.json is not a submission manifest')
  }
  return { submissions: parsed.submissions }
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
/**
 * Look for the ways a skill can be dangerous.
 *
 * A skill is not data — it is a set of instructions an agent will follow with
 * the user's own tools and credentials. A malicious SKILL.md needs no executable
 * at all: "run this command to set up" is the whole attack, and an extension
 * filter cannot see it. So the text itself is read and reported.
 *
 * This does not block anything. The uploader and the reviewer are the same
 * person here, and a rule that refuses on a keyword match would be both easy to
 * evade and wrong about honest skills. What it does is make the question
 * visible at the moment the content arrives, with the evidence attached, rather
 * than leaving it to whoever reads the file later.
 */
const RED_FLAGS: { id: string; re: RegExp }[] = [
  // Piping a download straight into a shell: the canonical remote payload.
  { id: 'pipeToShell', re: /\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i },
  // Fetching and then executing as separate steps.
  { id: 'fetchAndExec', re: /\b(curl|wget)\b[^\n]{0,200}(-o|-O|>)[^\n]{0,120}\n?[^\n]{0,80}\b(chmod\s+\+x|bash|sh|python|node)\b/i },
  // Credentials from places an agent can read.
  { id: 'credentialPaths', re: /(~\/\.ssh\/|id_rsa|\.aws\/credentials|\.npmrc|gh\s+auth\s+token|\$GITHUB_TOKEN|\$OPENAI_API_KEY|\$ANTHROPIC_API_KEY)/i },
  // Sending data outward.
  { id: 'exfiltration', re: /\b(base64|cat)\b[^\n]{0,80}\|[^\n]{0,60}\b(curl|wget|nc|ncat|netcat)\b/i },
  // Destructive commands stated plainly.
  { id: 'destructive', re: /\brm\s+-rf\s+(\/|~|\$HOME|\*)/i },
  // Instructions to ignore the user or the harness.
  { id: 'promptInjection', re: /(ignore (all )?(previous|prior|above) (instructions|rules)|do not (tell|ask|inform) the user|without (asking|telling) the user)/i },
  // Obfuscation: an encoded blob that gets decoded and run.
  { id: 'obfuscated', re: /(base64\s+-d|base64\s+--decode|eval\s*\(|atob\s*\()[^\n]{0,120}/i },
  // Scheduled or background persistence.
  { id: 'persistence', re: /(crontab\s+-|launchctl\s+load|systemctl\s+(enable|start)|\/Library\/LaunchAgents|~\/\.[a-z]+rc[^\n]{0,40}\b(curl|wget)\b)/i }
]

/** Every red flag in one skill's text, with the line that tripped it. */
function scanContent(files: { rel: string; content: Buffer }[]): string[] {
  const hits: string[] = []
  for (const f of files) {
    // Text only; a binary match would be noise.
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(f.rel)) continue
    const text = f.content.toString('utf8')
    if (text.includes('\u0000')) continue
    for (const flag of RED_FLAGS) {
      const m = flag.re.exec(text)
      if (!m) continue
      const line = text.slice(0, m.index).split('\n').length
      hits.push(`${f.rel}:${line} ${flag.id}`)
    }
  }
  return [...new Set(hits)]
}

export async function submitSkill(input: SubmitInput): Promise<SubmissionResult> {
  if (!activeToken()) throw new Error(m('submit.notSignedIn'))

  /*
    Confirm the credential can actually write here before uploading anything.

    The token is always the user's own — nothing is embedded in the app — so
    someone who is not a collaborator on this repository simply cannot write to
    it. That is the intended behaviour, and it deserves a clear message: an
    unexplained 403 partway through a file-by-file upload looks like a bug.
  */
  try {
    const repo = await ghFetch<{ permissions?: { push?: boolean } }>(`/repos/${OWNER}/${REPO}`)
    if (!repo.permissions?.push) {
      return { ok: false, uploaded: 0, message: m('submit.noWriteAccess', { repo: `${OWNER}/${REPO}` }) }
    }
  } catch (err: any) {
    return { ok: false, uploaded: 0, message: m('submit.repoUnreadable', { msg: err?.message || err }) }
  }

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

  /*
    Read the shared index before the first write, and treat a real failure as a
    failure.

    The index belongs to every submission in the repository, but the read that
    feeds the write was also the read that decided what the write replaces. A
    rate limit or a dropped connection came back as "no manifest yet", and the
    write then put a single entry where the whole review list had been: the other
    pending submissions were gone from the list, with no error to explain it.
    Reading first also means a failure here costs nothing — nothing is published
    yet, so the submission can simply be sent again.
  */
  let manifest: { submissions: SubmissionRecord[] }
  try {
    manifest = await readManifest()
  } catch (err: any) {
    return { ok: false, uploaded: 0, message: m('submit.failed', { msg: errText(err) }) }
  }

  /*
    What this slug already has published.

    A re-submission has to replace the folder, not merge into it: the manifest
    entry describes `submissions/<slug>/` as a whole, so a file left over from
    the previous upload is a file the entry claims is part of a skill that no
    longer contains it — and the reviewer reads the entry, then the folder.
  */
  let published: { path: string; sha: string }[]
  try {
    published = await listRemoteFiles(posix.join(DIR, slug))
  } catch (err: any) {
    return { ok: false, uploaded: 0, message: m('submit.failed', { msg: errText(err) }) }
  }

  let uploaded = 0
  try {
    for (const file of payload) {
      const target = posix.join(DIR, slug, file.rel.split(/[\\/]/).join('/'))
      await putFile(target, file.content, `submission: ${input.name}`)
      uploaded++
    }
  } catch (err: any) {
    const msg = errText(err)
    return {
      ok: false,
      uploaded,
      message: uploaded
        ? m('submit.partial', { n: uploaded, msg })
        : m('submit.failed', { msg })
    }
  }

  /*
    The new payload is in place, so what the previous upload left behind can go.

    Deletion comes after the upload, never before: a failure here leaves files
    the entry does not describe, which is reported, while deleting first would
    leave a published submission missing the files it does describe. Only paths
    that the listing of this slug returned are deleted, so nothing outside this
    submission's own folder can be touched.
  */
  const keep = new Set(payload.map((f) => posix.join(DIR, slug, f.rel.split(/[\\/]/).join('/'))))
  try {
    for (const file of published) {
      if (keep.has(file.path)) continue
      await deleteFile(file.path, file.sha, `submission: replace ${input.name}`)
    }
  } catch (err: any) {
    return { ok: false, uploaded, message: m('submit.partial', { n: uploaded, msg: errText(err) }) }
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

  // `readManifest` guarantees an array, so this is the whole current list minus
  // this slug's own previous entry.
  const submissions = manifest.submissions.filter((s) => s.slug !== slug)
  submissions.push(record)
  try {
    await putFile(
      `${DIR}/index.json`,
      Buffer.from(JSON.stringify({ updatedAt: new Date().toISOString(), submissions }, null, 2) + '\n', 'utf8'),
      `submission: register ${input.name}`
    )
  } catch (err: any) {
    /*
      The files are published and the entry that describes them is not, and that
      is not a success: the review list does not show this submission at all.

      The reverse report is just as wrong. This write used to sit outside the
      guard above, so a failure here rejected the whole call and the folder that
      had already been published was reported as a total failure; the count says
      what did happen — files copied, manifest not updated.
    */
    return { ok: false, uploaded, slug, message: m('submit.partial', { n: uploaded, msg: errText(err) }) }
  }

  const flags = scanContent(payload)
  if (flags.length) {
    console.warn(`[submit] 内容检查发现 ${flags.length} 处可疑写法：\n  ${flags.join('\n  ')}`)
  }

  return {
    ok: true,
    uploaded,
    slug,
    // Reported, not hidden: the reviewer needs to see this while looking at the
    // submission, not discover it later.
    flags,
    message: skipped
      ? m('submit.doneSkipped', { n: uploaded, slug, skipped })
      : m('submit.done', { n: uploaded, slug })
  }
}
