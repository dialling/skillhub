import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { settings } from './db'
import { expandPath } from './paths'
import { isInside } from './platform'

/**
 * The one definition of "SkillHub put this here".
 *
 * Two files used to answer this question independently, and they disagreed:
 * `installer.isManagedPath` tested the marker or a link into
 * `settings.libraryDir`, while `agents.scanAgentDir` tested a hardcoded
 * `~/.skillhub/store` — a directory nothing has ever created. Every entry this
 * app placed was therefore reported as unmanaged by the scan, and the "managed
 * by SkillHub" chips, the discover ordering and `skillhub paths` were all wrong
 * at once.
 *
 * The predicate lives here, next to neither of its callers, so the two cannot
 * drift again.
 */
export const MARKER = '.skillhub-install.json'

export interface InstallMarker {
  skillId?: string
  repoFullName?: string
  installedAt?: number
  mode?: string
  /** the library checkout or local folder the entry was copied from */
  sourcePath?: string
}

/** The library root every install is recorded against. */
export function libraryRoot(): string {
  return expandPath(settings.get().libraryDir)
}

/** True when the path is a SkillHub-owned install: a link into the library, or
 *  a copy carrying our marker file. */
export function isManagedPath(p: string, libRoot: string = libraryRoot()): boolean {
  try {
    const st = lstatSync(p)
    if (st.isSymbolicLink()) {
      return isInside(expandPath(readlinkSync(p)), libRoot)
    }
    if (st.isDirectory() && existsSync(join(p, MARKER))) return true
  } catch {
    return false
  }
  return false
}

export function readMarker(dir: string): InstallMarker | null {
  try {
    const raw = readFileSync(join(dir, MARKER), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as InstallMarker) : null
  } catch {
    return null
  }
}

/**
 * Who owns the entry standing at `target`.
 *
 * `isManagedPath` answers "did we place this path", which is the wrong question
 * when the answer decides whether the entry may be deleted: two different skills
 * can legitimately want the same folder name, and the first one's install was
 * being removed to make room for the second, while both records still claimed to
 * be installed.
 *
 * - `free`    — nothing is there; safe to write.
 * - `ours`    — the same skill, by marker identity or by link target. Replacing
 *               it in place is what an upgrade is.
 * - `other`   — a SkillHub entry belonging to something else, or one whose marker
 *               cannot be read. Never delete it; place beside it instead.
 * - `foreign` — something that is not a SkillHub entry at all: the user's own
 *               folder, or a link pointing elsewhere. Also never delete it.
 */
export type EntryOwner = 'free' | 'ours' | 'other' | 'foreign'

export function entryOwner(
  target: string,
  meta: { skillId: string; sourcePath: string },
  libRoot: string = libraryRoot()
): EntryOwner {
  let st: ReturnType<typeof lstatSync>
  try {
    st = lstatSync(target)
  } catch {
    return 'free'
  }
  try {
    if (st.isSymbolicLink()) {
      const dest = expandPath(readlinkSync(target))
      if (!isInside(dest, libRoot)) return 'foreign'
      return samePath(dest, meta.sourcePath) ? 'ours' : 'other'
    }
    if (st.isDirectory() && existsSync(join(target, MARKER))) {
      const marker = readMarker(target)
      if (!marker) return 'other'
      if (marker.skillId && marker.skillId === meta.skillId) return 'ours'
      // A local folder and a library checkout of the same skill carry different
      // ids (`local:<path>` vs `owner/repo::path`); the source they were copied
      // from is what makes them the same install.
      if (marker.sourcePath && samePath(expandPath(marker.sourcePath), meta.sourcePath)) return 'ours'
      return 'other'
    }
    return 'foreign'
  } catch {
    // Unreadable rather than ours: never claim a path we cannot identify.
    return 'foreign'
  }
}

/** Was this entry placed as a real copy rather than a link? */
export function isCopiedEntry(target: string): boolean {
  try {
    if (lstatSync(target).isSymbolicLink()) return false
    return existsSync(join(target, MARKER))
  } catch {
    return false
  }
}

function samePath(a: string, b: string): boolean {
  return expandPath(a) === expandPath(b)
}
