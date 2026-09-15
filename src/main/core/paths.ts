import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * `app` is undefined when the Electron binary was started in Node mode
 * (ELECTRON_RUN_AS_NODE). Module-level initialisers run before any guard in
 * index.ts, so every app.* access goes through this helper and degrades to a
 * sane fallback instead of throwing.
 */
export function appPath(name: 'userData' | 'appPath'): string | null {
  try {
    if (!app || typeof app.getPath !== 'function') return null
    return name === 'appPath' ? app.getAppPath() : app.getPath(name)
  } catch {
    return null
  }
}

/** Root of the SkillHub-owned data plane: ~/.skillhub */
/**
 * Where SkillHub keeps everything.
 *
 * `SKILLHUB_HOME` overrides it, and the self-test depends on that: without an
 * override the test suite read and wrote the real library, the real install
 * records and the real agent directories — and its cleanup step uninstalled
 * every recorded skill, which is not a hypothetical: it removed 201 real
 * installations from Cursor, Copilot and DeepSeek Harness the first time it was
 * run after those existed.
 */
export function skillhubRoot(): string {
  const override = process.env.SKILLHUB_HOME
  const dir = override ? override : join(homedir(), '.skillhub')
  ensureDir(dir)
  return dir
}

/**
 * Where a launched skill runs by default.
 *
 * Launching writes into the chosen directory: an AGENTS.md instruction block and
 * a copy of the skill. Pointing that at a folder the user already works in means
 * modifying something that was not ours to modify — during development a test
 * launch put an AGENTS.md and a skill folder into a real projects directory.
 *
 * The sandbox gives every skill its own folder under SkillHub's own home, so a
 * launch touches nothing the user did not hand over. One folder per skill, not
 * one shared folder, because two skills would otherwise both want to own
 * AGENTS.md.
 */
export function sandboxDir(): string {
  const dir = join(skillhubRoot(), 'sandbox')
  ensureDir(dir)
  return dir
}

/** The sandbox folder for one skill, created on demand. */
export function sandboxFor(skillName: string): string {
  const dir = join(sandboxDir(), safeSegment(skillName) || 'skill')
  ensureDir(dir)
  return dir
}

/** Where git checkouts of "入库" repositories live. */
export function defaultLibraryDir(): string {
  return join(skillhubRoot(), 'library')
}

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Expand a leading ~ and make the path absolute. */
export function expandPath(p: string): string {
  if (!p) return p
  let out = p.trim()
  if (out === '~') out = homedir()
  else if (out.startsWith('~/')) out = join(homedir(), out.slice(2))
  return isAbsolute(out) ? resolve(out) : resolve(homedir(), out)
}

/** Collapse the home directory back to ~ for display. */
export function tildify(p: string): string {
  const home = homedir()
  return p.startsWith(home) ? '~' + p.slice(home.length) : p
}

/** Bundled seed catalog shipped with the app. */
export function curatedCatalogPath(): string {
  const base = appPath('appPath') || process.cwd()
  const candidates = [
    join(base, 'data', 'curated-catalog.json'),
    join(process.resourcesPath || '', 'data', 'curated-catalog.json'),
    join(base, '..', 'data', 'curated-catalog.json'),
    join(__dirname, '..', '..', 'data', 'curated-catalog.json')
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return candidates[0]
}

/**
 * The icon a bare Electron build shows in the Dock.
 *
 * Not cosmetic: WeChat DevTools is an Electron app that was packaged WITHOUT
 * changing Electron's default bundle identifier, so `com.github.Electron` maps
 * to two applications on this machine and LaunchServices hands the Dock the one
 * installed in /Applications. Setting the icon explicitly at runtime overrides
 * that resolution. The real fix is a unique bundle id, which needs packaging.
 */
export function electronDefaultIconPath(): string | null {
  const base = appPath('appPath') || process.cwd()
  const candidates = [
    join(base, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Resources', 'electron.icns'),
    join(base, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Resources', 'electron.icns'),
    join(process.resourcesPath || '', 'electron.icns')
  ]
  return candidates.find((c) => c && existsSync(c)) || null
}

/** Bundled "what are you trying to do?" scenario definitions. */
export function scenariosPath(): string {
  const base = appPath('appPath') || process.cwd()
  const candidates = [
    join(base, 'data', 'scenarios.json'),
    join(process.resourcesPath || '', 'data', 'scenarios.json'),
    join(base, '..', 'data', 'scenarios.json'),
    join(__dirname, '..', '..', 'data', 'scenarios.json')
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return candidates[0]
}

/** Bundled agent path registry shipped with the app. */
export function curatedAgentRegistryPath(): string {
  const base = appPath('appPath') || process.cwd()
  const candidates = [
    join(base, 'data', 'agent-registry.json'),
    join(process.resourcesPath || '', 'data', 'agent-registry.json'),
    join(base, '..', 'data', 'agent-registry.json'),
    join(__dirname, '..', '..', 'data', 'agent-registry.json')
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return candidates[0]
}

/**
 * Directory for the persistent JSON stores.
 *
 * This deliberately lives under ~/.skillhub rather than Electron's userData so
 * that the desktop app and the CLI read and write the *same* library, install
 * records, settings and star history. Electron's own userData still holds the
 * Chromium caches.
 */
export function userDataDir(): string {
  return ensureDir(join(skillhubRoot(), 'state'))
}

/** Make an arbitrary GitHub path segment safe to use as a folder name. */
export function safeSegment(input: string): string {
  return (
    input
      .replace(/[\/\\:]+/g, '__')
      .replace(/[^A-Za-z0-9._@+-]+/g, '-')
      .replace(/^[.-]+/, '')
      .replace(/-+$/, '')
      .slice(0, 120) || 'unnamed'
  )
}

/** Deterministic folder name for a library checkout. */
export function libraryFolderName(fullName: string): string {
  return safeSegment(fullName.replace('/', '__'))
}
