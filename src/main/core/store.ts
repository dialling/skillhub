import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
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
  private defaults: T

  constructor(name: string, defaults: T) {
    this.file = join(userDataDir(), `${name}.json`)
    this.defaults = defaults
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

  get(): T {
    return this.data
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.schedule()
    return this.data
  }

  replace(next: T): T {
    this.data = next
    this.schedule()
    return this.data
  }

  /** Mutate through a callback, then persist. */
  update<R>(fn: (draft: T) => R): R {
    const result = fn(this.data)
    this.schedule()
    return result
  }

  private schedule(): void {
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

export function appConfigDir(): string {
  return app.getPath('userData')
}
