import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { userDataDir } from './paths'

/**
 * Tiny dependency-free JSON store with atomic writes and debounced flushes.
 * SkillHub's data volume is small (thousands of records), so a JSON document
 * is a better fit than a native SQLite binding that would need rebuilding
 * against Electron's ABI.
 */
export class JsonStore<T extends object> {
  private data: T
  private file: string
  private timer: NodeJS.Timeout | null = null
  /**
   * Skip the debounce and write on every update.
   *
   * For state whose loss is not merely stale but wrong: an install record with no
   * file behind it, or a file with no record, cannot be reconciled later. A
   * process that exits inside the debounce window would do exactly that.
   */
  private immediate = false
  private defaults: T
  /** mtime of the file as we last wrote it, to spot another process's writes. */
  private writtenAt = 0

  constructor(name: string, defaults: T, opts: { immediate?: boolean } = {}) {
    this.file = join(userDataDir(), `${name}.json`)
    this.defaults = defaults
    this.immediate = opts.immediate === true
    this.data = this.load()
  }

  private load(): T {
    try {
      if (existsSync(this.file)) {
        const raw = readFileSync(this.file, 'utf8')
        const parsed = JSON.parse(raw)
        return { ...structuredClone(this.defaults), ...parsed }
      }
    } catch (err) {
      console.error(`[store] failed to read ${this.file}`, err)
    }
    return structuredClone(this.defaults)
  }

  /**
   * Adopt a newer on-disk copy before mutating.
   *
   * The GUI and the CLI deliberately share `~/.skillhub/state`, so both hold the
   * same document in memory. Without this, adding a repository from the CLI
   * while the app is open would be silently reverted the next time the app
   * wrote anything — it would flush its stale copy over the CLI's addition.
   * Read-modify-write keeps the last writer from discarding the others.
   */
  private adoptExternalWrite(): void {
    // A pending timer means local edits are queued but not yet on disk. Adopting
    // the file now would throw them away — measured as three installs collapsing
    // into one record, because each update re-read the pre-install file.
    if (this.timer) return
    try {
      if (!existsSync(this.file)) return
      const mtime = statSync(this.file).mtimeMs
      if (mtime <= this.writtenAt) return
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      this.data = { ...structuredClone(this.defaults), ...parsed }
    } catch {
      // An unreadable file must not block the mutation; keep what we have.
    }
  }

  get(): T {
    return this.data
  }

  set(patch: Partial<T>): T {
    this.adoptExternalWrite()
    this.data = { ...this.data, ...patch }
    this.schedule()
    return this.data
  }

  replace(next: T): T {
    this.adoptExternalWrite()
    this.data = next
    this.schedule()
    return this.data
  }

  /** Mutate through a callback, then persist. */
  update<R>(fn: (draft: T) => R): R {
    this.adoptExternalWrite()
    const result = fn(this.data)
    this.schedule()
    return result
  }

  private schedule(): void {
    if (this.immediate) {
      this.flush()
      return
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      renameSync(tmp, this.file)
      this.writtenAt = statSync(this.file).mtimeMs
    } catch (err) {
      console.error(`[store] failed to write ${this.file}`, err)
    }
  }

  path(): string {
    return this.file
  }
}

export function flushAll(): void {
  for (const s of stores) s.flush()
}

const stores: { flush: () => void }[] = []

export function registerStore(s: { flush: () => void }): void {
  stores.push(s)
}
