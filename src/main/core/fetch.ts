import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { m } from './msg'
import { gitAvailable } from './platform'

/**
 * Fetch one skill's files straight from GitHub.
 *
 * Nothing is kept: the store is an index, and installing a skill means putting
 * that skill's files where the user asked for them. There is no local checkout of
 * the repository to keep in step, no cache to expire and no copy of the upstream
 * project on disk.
 *
 * Sparse checkout rather than a tarball, because it fetches only the blobs this
 * skill actually has: measured on a 69-skill repository, 264 KB against 5.3 MB
 * for the whole tree — twenty times less, for the same folder.
 */
const CLONE_TIMEOUT = 180_000

export interface FetchedRepo {
  /** root of the temporary checkout; caller must call release() */
  root: string
  /** absolute path of one fetched folder inside the checkout */
  dirFor: (path: string) => string
  release: () => void
}

function run(cmd: string, args: string[], timeout = CLONE_TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err) => (err ? reject(err) : resolve()))
  })
}

function measure(dir: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        files++
        try {
          bytes += statSync(full).size
        } catch {
          /* raced with cleanup */
        }
      }
    }
  }
  walk(dir)
  return { files, bytes }
}

/**
 * Download a set of folders from one repository.
 *
 * Takes every folder in a single checkout: installing five skills from the same
 * repository should clone once, not five times. An empty path means the skill is
 * the whole repository, in which case everything except `.git` is fetched.
 */
export async function fetchPaths(input: {
  fullName: string
  paths: string[]
  onProgress?: (message: string) => void
}): Promise<FetchedRepo> {
  const { fullName, paths, onProgress } = input
  /*
    Say what is actually missing.

    Installing reads the source with git — there is no tarball or API fallback —
    so a machine without git fails here and nowhere earlier: browsing, searching
    and indexing all go through the GitHub API. Without this check the user got
    a raw `spawn git ENOENT` from three frames down, which reads as a bug in the
    app rather than a tool they have not installed.
  */
  if (!gitAvailable()) throw new Error(m('fetch.noGit'))
  const repoDir = join(tmpdir(), `skillhub-fetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const root = join(repoDir, 'r')
  mkdirSync(repoDir, { recursive: true })

  const release = (): void => {
    try {
      rmSync(repoDir, { recursive: true, force: true })
    } catch {
      /* a leftover temp directory is not worth failing an install over */
    }
  }

  try {
    onProgress?.(m('fetch.downloading', { repo: fullName }))
    await run('git', [
      'clone',
      '--depth',
      '1',
      '--filter=blob:none',
      '--sparse',
      '--quiet',
      `https://github.com/${fullName}.git`,
      root
    ])

    onProgress?.(m('fetch.extracting'))
    // One `sparse-checkout set` with every pattern: calling it per path would
    // leave only the last one selected.
    const patterns = [...new Set(paths.map((p) => (p ? `${p}/*` : '*'))) ]
    await run('git', ['-C', root, 'sparse-checkout', 'set', '--no-cone', ...patterns])

    const dirFor = (path: string): string => (path ? join(root, path) : root)
    for (const p of paths) {
      const dir = dirFor(p)
      if (!existsSync(dir) || !measure(dir).files) {
        throw new Error(m('fetch.empty', { path: p || fullName }))
      }
    }
    return { root, dirFor, release }
  } catch (err) {
    release()
    throw err
  }
}

/** Copy a fetched skill into the destination the user chose. */
export function placeFetched(source: string, destination: string): { files: number; bytes: number } {
  mkdirSync(destination, { recursive: true })
  cpSync(source, destination, { recursive: true, dereference: true })
  // The checkout's own metadata is not part of the skill.
  rmSync(join(destination, '.git'), { recursive: true, force: true })
  return measure(destination)
}
