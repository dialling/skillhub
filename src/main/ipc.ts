import { ipcMain, shell, dialog, app } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  DiskStats,
  InstallProgress,
  JobProgress,
  RepoMeta,
  Settings,
  SkillEntry
} from '../shared/types'
import { settings, library, activity, logActivity, snapshotStars } from './core/db'
import {
  clearCaches,
  getRawFile,
  getRawReadme,
  getRepo,
  getUser,
  listSkillDirs,
  rateLimit,
  searchRepos,
  searchSkills,
  starsGained,
  tokenSource,
  verifyToken,
  viewer
} from './core/github'
import {
  catalogByFunction,
  catalogGeneratedAt,
  catalogSections,
  curatedCatalog,
  refreshCuratedStars,
  scenarioRepos,
  scenarios
} from './core/catalog'
import { addLocalDir, addRepo, fetchRemoteSkillMeta, getItem, getItemEnriched, libraryItems, libraryItemsEnriched, readSkillFile, removeItem, setProgressSink, syncItem } from './core/library'
import {
  activeAgents,
  listAgents,
  projectTargets,
  scanAgentDir,
  agentDisplayName,
  resolveAgentDir
} from './core/agents'
import {
  installFromGithub,
  installMap,
  installRecords,
  installedSkills,
  managedCountByAgent,
  reconcileInstalls,
  removeRawPath,
  uninstall,
  uninstallAll,
  uninstallFrom
} from './core/installer'
import { leaderboard, snapshotCoverage, topByStars, type GrowthWindow } from './core/leaderboard'
import { expandPath, userDataDir as stateDir } from './core/paths'
import { m } from './core/msg'
import { buildRemoteSkills, parseSkillMd } from './core/skills'
import { cleanSkillDirs } from './core/skilldirs'
import {
  auditAgentDirs,
  detectLocalSkills,
  recommendInstallTarget,
  setInstallRoot
} from './core/discover'
import { liveStatus, refreshLiveData } from './core/live'
import { searchSkillIndex, skillIndex, skillShard } from './core/skillsindex'
import { listStarred, setStar, starState } from './core/starring'
import { checkUpdates, dismissUpdate, isDismissed } from './core/update'
import { listSubmissions, submitSkill } from './core/submit'

type Broadcast = (channel: string, payload: unknown) => void
let broadcast: Broadcast = () => {}

export function registerIpc(send: Broadcast): void {
  broadcast = send
  setProgressSink((p: JobProgress) => broadcast('job:progress', p))

  const handle = (channel: string, fn: (...args: any[]) => any): void => {
    ipcMain.handle(channel, async (_e, ...args: any[]) => {
      try {
        const data = await fn(...args)
        return { ok: true, data }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err), status: err?.status }
      }
    })
  }

  /* ---------------------------------------------------------------- settings */
  handle('settings:get', () => settings.get())
  handle('settings:update', (patch: Partial<Settings>) => {
    const next = settings.set(patch)
    return next
  })
  handle('settings:flush', () => {
    settings.flush()
    library.flush()
    return true
  })

  /* ------------------------------------------------------------------ github */
  handle('github:status', async () => {
    const limit = await rateLimit()
    return {
      tokenSource: tokenSource(),
      hasToken: !!settings.get().token || limit.ok,
      rate: limit,
      user: settings.get().user
    }
  })
  handle('github:rate', (force: boolean) => rateLimit(force))
  /*
    Validate the candidate BEFORE storing it.

    This used to store first and validate second, then wipe the setting on
    failure. The working token was already overwritten by then, so replacing a
    credential while GitHub was unreachable (or rate-limited, or behind a flaky
    proxy) destroyed a token that still worked — and the renderer only saw a
    toast, while every screen kept showing the old account as connected.
  */
  handle('github:login', async (token: string) => {
    const previous = settings.get().token
    const check = await verifyToken(token)
    if (!check.ok) throw new Error(check.error || m('auth.tokenInvalid'))
    settings.set({ token: token.trim() })
    clearCaches()
    const limit = await rateLimit(true)
    if (!limit.ok) {
      // It answered a moment ago, so this failure is environmental: put the
      // credential that was here back rather than leaving the user without one.
      settings.set({ token: previous })
      clearCaches()
      throw new Error(limit.error || m('auth.tokenInvalid'))
    }
    settings.set({ user: check.user, firstRunDone: true })
    logActivity('settings', 'activity.loggedIn', { login: check.user.login })
    return check.user
  })
  handle('github:loginWithCli', async () => {
    clearCaches()
    const limit = await rateLimit(true)
    if (!limit.ok) throw new Error(limit.error || m('auth.noCredentials'))
    const me = await viewer()
    settings.set({ user: me })
    logActivity('settings', 'activity.loggedInCli', { login: me.login })
    return me
  })
  handle('github:logout', () => {
    settings.set({ token: '', user: null })
    clearCaches()
    return true
  })
  handle('github:user', (login: string) => getUser(login))
  handle('github:search', (q: string, opts: { page?: number; perPage?: number; sort?: 'stars' | 'updated' } = {}) =>
    searchSkills(q, opts)
  )
  handle('github:searchRaw', (q: string, opts: any = {}) => searchRepos(q, opts))
  handle(
    'github:repoDetail',
    async (fullName: string, opts: { withSkills?: boolean; withReadme?: boolean } = {}) => {
      const trace = process.env.SKILLHUB_TRACE ? createTracer('repoDetail') : null
      const live = await getRepo(fullName, { force: true })
      // Live API metadata wins on facts (stars, pushed_at), but the bundled
      // catalog carries the hand-written tagline, useWhen and about text that
      // the API knows nothing about. Merging keeps both.
      const catalogEntry = (await curatedCatalog()).find((r) => r.fullName === fullName)
      const meta: RepoMeta = catalogEntry ? { ...catalogEntry, ...live } : live
      trace?.('repo')
      snapshotStars(fullName, meta.stars)
      const branch = meta.defaultBranch || 'main'
      const inLibrary = libraryItems().some((i) => i.fullName === fullName)
      let dirs: string[] = meta.skillDirs || []
      if (opts.withSkills !== false) {
        try {
          const tree = await listSkillDirs(fullName, branch)
          // Clean before caching: the raw crawl over-counts repos that package
          // the same skills once per agent, or that ship templates.
          const cleaned = cleanSkillDirs(tree.dirs)
          dirs = cleaned.dirs
          meta.skillDirs = cleaned.dirs
          meta.skillCount = cleaned.dirs.length
          meta.truncatedTree = tree.truncated
        } catch {
          /* keep whatever we had */
        }
      }
      trace?.(`tree(${dirs.length})`)
      let readme: string | null = null
      if (opts.withReadme !== false) {
        readme = await getRawReadme(fullName, branch)
      }
      trace?.('readme')
      const skills: SkillEntry[] = buildRemoteSkills(fullName, dirs, {
        stars: meta.stars,
        avatarUrl: meta.avatarUrl,
        license: meta.license
      })
      // A repo already in the library has every SKILL.md on disk, so the remote
      // metadata pass is pure overhead.
      // Reading every SKILL.md costs one request per skill (the raw host is not
      // always reachable, in which case these fall back to the Contents API), so
      // cap it: a 124-skill repo would otherwise stall the detail page.
      if (dirs.length && !inLibrary) {
        const details = await fetchRemoteSkillMeta(fullName, branch, dirs.slice(0, 24))
        for (const s of skills) {
          const d = details[s.path]
          if (d) {
            s.descriptionEn = d.descriptionEn
            s.descriptionZh = d.descriptionZh
            if (d.tags?.length) s.tags = d.tags
          }
        }
      }
      trace?.(`skills(${skills.length})`)
      return { meta, skills, readme }
    }
  )
  handle('github:skillFile', async (fullName: string, branch: string, path: string) => {
    const local = readSkillFile(fullName, path)
    if (local) return local
    const rel = path ? `${path}/SKILL.md` : 'SKILL.md'
    const remote = await getRawFile(fullName, branch, rel)
    return remote || ''
  })

  /* ----------------------------------------------------------------- catalog */
  handle('catalog:curated', async () => {
    const repos = await curatedCatalog()
    return { repos, generatedAt: catalogGeneratedAt() }
  })
  handle('catalog:sections', () => catalogSections())
  handle('catalog:byFunction', () => catalogByFunction())
  handle('catalog:scenarios', () => scenarios())
  handle('catalog:scenarioRepos', (id: string) => scenarioRepos(id))
  handle('catalog:refresh', async (limit?: number) => refreshCuratedStars(limit))

  /* ----------------------------------------------------------------- library */
  handle('library:list', () => libraryItemsEnriched())
  handle('library:get', (id: string) => getItemEnriched(id))
  handle('library:add', (req: { fullName: string; skillDirs?: string[] } | string) => {
    const fullName = typeof req === 'string' ? req : req.fullName
    return addRepo(fullName, typeof req === 'string' ? {} : { skillDirs: req.skillDirs })
  })
  handle('library:addLocal', (dir: string) => addLocalDir(dir))
  handle('library:sync', (id: string) => syncItem(id))
  handle('library:remove', (id: string, deleteFiles?: boolean) => removeItem(id, deleteFiles !== false))
  handle('library:addWithSkills', async (fullName: string) => {
    const item = await addRepo(fullName)
    return item
  })
  handle('library:readme', async (id: string) => {
    const item = getItem(id)
    if (!item) throw new Error(m('agent.notFound'))
    if (item.local) {
      return ''
    }
    return (await getRawReadme(item.fullName, item.branch || item.meta.defaultBranch || 'main')) || ''
  })
  handle('library:refreshSkills', async (id: string) => {
    const item = getItem(id)
    if (!item) throw new Error(m('agent.notFound'))
    return syncItem(id)
  })

  /* ------------------------------------------------------------------ agents */
  handle('agents:list', () => listAgents())
  handle('agents:active', () => activeAgents())
  handle('agents:project', (dir: string) => projectTargets(dir))
  handle('agents:scan', (agentId: string) => scanAgentDir(agentId))
  handle('agents:resolveDir', (agentId: string) => resolveAgentDir(agentId))
  handle('agents:setEnabled', (ids: string[]) => {
    settings.set({ enabledAgents: ids })
    return listAgents()
  })
  handle('agents:toggle', (agentId: string, enabled: boolean) => {
    const current = new Set(settings.get().enabledAgents.length ? settings.get().enabledAgents : listAgents().filter((a) => a.enabled).map((a) => a.id))
    if (enabled) current.add(agentId)
    else current.delete(agentId)
    settings.set({ enabledAgents: [...current] })
    return listAgents()
  })
  handle('agents:addCustom', (name: string, path: string) => {
    const id = `${Date.now().toString(36)}`
    settings.update((d) => {
      d.customAgents.push({ id, name, path })
    })
    return listAgents()
  })
  handle('agents:removeCustom', (id: string) => {
    settings.update((d) => {
      d.customAgents = d.customAgents.filter((c) => c.id !== id)
      d.enabledAgents = d.enabledAgents.filter((a) => a !== `custom:${id}`)
    })
    return listAgents()
  })
  handle('agents:removeRaw', (p: string) => removeRawPath(p))
  handle('agents:reveal', async (p: string) => {
    shell.openPath(expandPath(p))
    return true
  })

  /* ----------------------------------------------------------------- install */
  /*
    Install straight from GitHub.

    `skills` are upstream coordinates (owner/repo + path); the destination is the
    folder the user chose. Nothing is read from a local checkout, because there
    is none — the store is an index and the files come from the source.
  */
  handle(
    'install:fromGithub',
    (input: {
      skills: { skillId: string; fullName: string; path: string; name: string; localPath?: string }[]
      destination: string
    }) => installFromGithub({ ...input, onProgress: (p) => broadcast('install:progress', p) })
  )
  handle('install:uninstall', (skillId: string, agentId: string) => uninstallFrom(skillId, agentId))
  handle('install:uninstallAll', (skillId: string) => uninstallAll(skillId))
  handle('install:records', () => installRecords())
  /*
    Reconcile before reporting.

    The filesystem decides what exists; the record says who placed it. When the
    two drift — a lost record, a deleted link — the app either shows an install
    it cannot manage or, worse, hides one that is really there. Comparing them on
    every read keeps the two honest, and the scan is one readdir per directory.
  */
  handle('install:map', () => {
    reconcileInstalls()
    return installMap()
  })
  handle('install:list', () => installedSkills())
  handle('install:managedByAgent', () => managedCountByAgent())

  /* ------------------------------------------------------------- leaderboard */
  handle('board:growth', (days: GrowthWindow, limit?: number, useApi?: boolean, apiBudget?: number) =>
    leaderboard({ days, limit, useApi, apiBudget })
  )
  handle('board:top', (limit?: number) => topByStars(limit))
  handle('board:coverage', () => snapshotCoverage())
  handle('board:growthOne', async (fullName: string, days: GrowthWindow) => {
    const m = await getRepo(fullName)
    const g = await starsGained(fullName, m.stars, days)
    return g
  })

  /* ----------------------------------------------------------------- profile */
  handle('profile:stats', async () => {
    const items = libraryItems()
    const records = installRecords()
    const agents = listAgents()
    const skills = items.reduce((n, i) => n + i.skills.length, 0)
    let bytes = 0
    for (const item of items) {
      try {
        if (!item.local && existsSync(item.sourcePath)) {
          bytes += dirSize(item.sourcePath, 0)
        }
      } catch {
        /* ignore */
      }
    }
    const stats: DiskStats = {
      libraryDir: settings.get().libraryDir,
      libraryBytes: bytes,
      libraryItems: items.length,
      installedSkills: records.filter((r) => existsSync(r.linkPath)).length,
      agents: agents.filter((a) => a.enabled).length,
      skillsOnDisk: skills
    }
    return stats
  })
  handle('profile:activity', () => activity.get().events.slice(0, 60))
  handle('profile:refresh', async () => {
    const me = settings.get().user
    if (!me) return null
    const fresh = await viewer()
    settings.set({ user: fresh })
    return fresh
  })
  handle('profile:starred', async () => {
    const me = settings.get().user
    if (!me) return []
    const out: any[] = []
    for (let page = 1; page <= 3; page++) {
      try {
        const items = await (
          await import('./core/github')
        ).ghFetch<any[]>(`/users/${me.login}/starred?per_page=100&page=${page}`)
        out.push(...items.map((r: any) => ({ fullName: r.full_name, stars: r.stargazers_count, avatarUrl: r.owner?.avatar_url, descriptionEn: r.description })))
        if (items.length < 100) break
      } catch {
        break
      }
    }
    return out
  })

  /* --------------------------------------------------------------- discovery */
  handle('discover:localSkills', () => detectLocalSkills())
  handle('discover:audit', () => auditAgentDirs())
  handle('discover:installTarget', () => recommendInstallTarget())
  handle('discover:setInstallTarget', (path: string) => setInstallRoot(path))
  handle('discover:adopt', (repoFullName: string) => addRepo(repoFullName))

  /* -------------------------------------------------------------- live data */
  // Pulled from this project's own repository: the scheduled Action there keeps
  // star counts and the growth leaderboard current for everyone, so no server
  // is involved and a fresh install still gets real history.
  handle('live:refresh', () => refreshLiveData())
  handle('live:status', () => liveStatus())

  /* --------------------------------------------------------------- update -- */
  // Every check answers "is the remote newer", never "is it different": an
  // older-but-different copy must not overwrite newer local state.
  handle('update:check', () => checkUpdates())
  handle('update:dismiss', (version: string | null) => {
    dismissUpdate(version)
    return true
  })
  handle('update:isDismissed', (version: string) => isDismissed(version))

  /* ---------------------------------------------------------- submissions -- */
  // Local skills that are not in the store go to the repository's submissions
  // area for review. Nothing here touches the catalog, so the store is
  // unaffected until the entry has been written up and accepted.
  handle('submit:list', () => listSubmissions())
  handle('submit:skill', (input: { localPath: string; name: string; origin?: string }) => submitSkill(input))

  /* ------------------------------------------------------------- starring -- */
  // Writes to the user's real GitHub account, not to a local list.
  handle('star:state', (fullName: string) => starState(fullName))
  handle('star:set', (fullName: string, on: boolean) => setStar(fullName, on))
  handle('star:list', (force?: boolean) => listStarred(!!force).then((s) => [...s]))

  /* ------------------------------------------------------- skill index ----- */
  // The individual skills inside the catalog's repositories, published as
  // per-category shards so a client pulls only what it is showing.
  handle('skills:index', () => skillIndex())
  handle('skills:shard', (fn: string) => skillShard(fn))
  handle('skills:search', (term: string, limit?: number) => searchSkillIndex(term, limit))

  /* ------------------------------------------------------------------ system */
  handle('system:boot', () => ({
    // Deep-link support: `skillhub --view=charts --repo=obra/superpowers`
    platform: process.platform,
    initialView: readArg('view'),
    initialRepo: readArg('repo'),
    initialQuery: readArg('q'),
    argv: process.argv.slice(1)
  }))
  handle('system:stats', async () => {
    const items = libraryItems()
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: `${process.platform} ${process.arch}`,
      userData: app.getPath('userData'),
      stateDir: stateDir(),
      libraryDir: settings.get().libraryDir,
      agents: listAgents().length,
      items: items.length,
      settingsPath: join(stateDir(), 'settings.json')
    }
  })
  handle('system:pickDirectory', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: m('dialog.pickDirectory')
    })
    if (res.canceled || !res.filePaths.length) return null
    return res.filePaths[0]
  })
  handle('system:openPath', async (p: string) => {
    await shell.openPath(expandPath(p))
    return true
  })
  handle('system:openExternal', async (url: string) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
    return true
  })
  handle('system:checkPaths', (paths: string[]) =>
    paths.map((p) => {
      const abs = expandPath(p)
      let exists = false
      let isDir = false
      try {
        const st = statSync(abs)
        exists = true
        isDir = st.isDirectory()
      } catch {
        /* ignore */
      }
      return { path: p, abs, exists, isDir }
    })
  )
  handle('system:parseSkill', (text: string) => parseSkillMd(text))
  handle('system:agentName', (id: string) => agentDisplayName(id))
}

/** Lightweight phase timer, enabled with SKILLHUB_TRACE=1. */
function createTracer(label: string): (phase: string) => void {
  const start = Date.now()
  let last = start
  return (phase: string) => {
    const now = Date.now()
    console.log(`[trace] ${label} ${phase}: +${now - last}ms (total ${now - start}ms)`)
    last = now
  }
}

function readArg(name: string): string | null {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  if (hit) return hit.slice(prefix.length)
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1]
  return null
}

function dirSize(dir: string, depth: number): number {
  if (depth > 5) return 0
  let total = 0
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    for (const name of readdirSync(dir)) {
      if (name === '.git') continue
      const full = join(dir, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) total += dirSize(full, depth + 1)
        else total += st.size
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return total
}
