/**
 * Platform differences, in one place.
 *
 * The app was written on macOS and quietly assumed it: `command -v` via
 * /bin/sh, POSIX symlinks, `~/.local/bin/gh`, a frameless window sized around
 * the traffic lights. Each of those either throws or silently misbehaves on
 * Windows, so they are collected here rather than sprinkled through the code.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

export const isMac = process.platform === 'darwin'
export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'

/**
 * Locate an executable on PATH without a shell.
 *
 * `command -v` needs /bin/sh, which Windows does not have; `where` is its
 * equivalent there. Returns an absolute path so callers can also check whether
 * a binary belongs to a different application (the Kimi case).
 */
export function which(name: string): string | null {
  try {
    if (isWindows) {
      const out = execFileSync('where', [name], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      })
      const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      return first || null
    }
    const out = execFileSync('/bin/sh', ['-lc', `command -v ${name}`], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const first = out.split('\n').map((s) => s.trim()).find(Boolean)
    return first || null
  } catch {
    return null
  }
}

/** True when an executable is reachable. */
export function hasBinary(name: string): boolean {
  return which(name) !== null
}

/**
 * Extra directories a packaged GUI app does not inherit from a login shell.
 * macOS/Linux only — Windows resolves via PATH/PATHEXT in `where`.
 */
export function loginShellDirs(home: string): string[] {
  if (isWindows) return []
  return [
    join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin'
  ]
}

/** True when the app can run `git`. */
export function gitAvailable(): boolean {
  return hasBinary('git')
}

/**
 * Compare two paths for containment, ignoring the separator difference.
 * Windows paths use `\` while almost everything the app builds uses `/`.
 */
export function normalizePath(p: string): string {
  return isWindows ? p.replace(/\\/g, '/').replace(/\/+$/, '') : p.replace(/\/+$/, '')
}

export function isInside(child: string, parent: string): boolean {
  const c = normalizePath(child)
  const p = normalizePath(parent)
  if (!p || p === '/') return false
  return c === p || c.startsWith(p + '/')
}

export function pathEndsWith(p: string, suffix: string): boolean {
  return normalizePath(p).endsWith(suffix)
}

/** Is this an absolute path on the current platform (including `~`)? */
export function isAbsoluteOrHome(p: string): boolean {
  return p.startsWith('~') || isAbsolute(p)
}
