import {
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstallMode, InstallProgress, InstallRecord, InstallRequest, SkillEntry } from '../../shared/types'
import { expandPath } from './paths'
import { installs, library, logActivity, settings } from './db'
import { agentDisplayName, listAgents, loadRegistry, resolveAgentDir } from './agents'
import { m } from './msg'
import { isInside, isWindows } from './platform'

const MARKER = '.skillhub-install.json'

export interface InstallOutcome {
  ok: InstallRecord[]
  skipped: { skillId: string; agentId: string; reason: string }[]
  errors: { skillId: string; agentId: string; reason: string }[]
}

function sanitizeName(name: string): string {
  return (
    name
      .replace(/[/\\:]+/g, '-')
      .replace(/[^A-Za-z0-9._@+-]+/g, '-')
      .replace(/^[.-]+/, '')
      .replace(/-+$/, '') || 'skill'
  )
}

/** True when the path is a SkillHub-owned install (symlink into the library,
 *  or a copy carrying our marker file). */
export function isManagedPath(p: string, libraryRoot: string): boolean {
  try {
    const st = lstatSync(p)
    if (st.isSymbolicLink()) {
      const target = expandPath(require('node:fs').readlinkSync(p))
      return isInside(target, libraryRoot)
    }
    if (st.isDirectory() && existsSync(join(p, MARKER))) return true
  } catch {
    return false
  }
  return false
}

/**
 * Resolve a skill id to something installable.
 *
 * Library ids are `owner/repo::path`. Skills that exist only on this machine —
 * a folder in `~/.cursor/skills`, say — have no library entry, and everything
 * that installs was therefore blind to them: the library showed a launch button
 * and no install button, because there was nothing to resolve. They carry a
 * `local:<path>` id instead, which resolves against the filesystem.
 */
function findSkill(skillId: string): { skill: SkillEntry; repoFullName: string } | null {
  if (skillId.startsWith('local:')) {
    const dir = expandPath(skillId.slice('local:'.length))
    if (!existsSync(join(dir, 'SKILL.md'))) return null
    const name = dir.split(/[\\/]/).filter(Boolean).pop() || 'skill'
    const skill: SkillEntry = {
      id: skillId,
      repoFullName: 'local',
      path: '',
      name,
      title: name,
      tags: [],
      source: 'local',
      localPath: dir
    }
    return { skill, repoFullName: 'local' }
  }
  const [repoFullName] = skillId.split('::')
  const item = library.get().items.find((i) => i.id === repoFullName)
  if (!item) return null
  const skill = item.skills.find((s) => s.id === skillId)
  if (!skill) return null
  return { skill, repoFullName }
}

export function installRecords(): InstallRecord[] {
  return installs.get().records
}

/** Map of skillId -> agentIds currently installed. */
export function installMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const r of installs.get().records) {
    if (!existsSync(r.linkPath)) continue
    ;(map[r.skillId] ||= []).push(r.agentId)
  }
  return map
}

export function installSkills(
  req: InstallRequest,
  onProgress?: (p: InstallProgress) => void
): InstallOutcome {
  /*
    The install mode is per agent, not global.

    `supportsSymlink: false` was recorded in the registry for DeepSeek Harness,
    Cursor, Kimi and pi, shown in the UI, and then never consulted: everything was
    installed as a symlink because that is the global default. An agent that does
    not follow symlinks therefore never saw the skill — it reported "unknown or no
    longer available" while the link sat in its own skills directory, which is
    what every one of those reports turned out to be.
  */
  const requestedMode: InstallMode | undefined = req.mode || settings.get().installMode
  const libRoot = expandPath(settings.get().libraryDir)
  const outcome: InstallOutcome = { ok: [], skipped: [], errors: [] }
  const total = req.skillIds.length * req.agentIds.length
  let current = 0
  const report = (p: Partial<InstallProgress>): void => {
    onProgress?.({
      phase: 'link',
      message: '',
      current,
      total,
      ...p
    } as InstallProgress)
  }

  for (const skillId of req.skillIds) {
    const found = findSkill(skillId)
    if (!found) {
      for (const agentId of req.agentIds) {
        outcome.errors.push({ skillId, agentId, reason: m('install.notInLibrary') })
      }
      current += req.agentIds.length
      continue
    }
    const { skill } = found
    const source = skill.localPath && existsSync(skill.localPath) ? skill.localPath : null
    /** resolved agent skills dir -> link path already created for this skill */
    const handledDirs = new Map<string, string>()
    if (!source) {
      for (const agentId of req.agentIds) {
        outcome.errors.push({ skillId, agentId, reason: m('install.sourceMissing') })
      }
      current += req.agentIds.length
      continue
    }
    if (!existsSync(join(source, 'SKILL.md'))) {
      for (const agentId of req.agentIds) {
        outcome.errors.push({ skillId, agentId, reason: m('install.noSkillFile') })
      }
      current += req.agentIds.length
      continue
    }

    for (const agentId of req.agentIds) {
      current++
      const entry = loadRegistry().find((e) => e.id === agentId)
      // An agent that cannot follow symlinks gets a real copy, whatever the
      // global preference says: a link it cannot read is not an install.
      const mode: InstallMode =
        entry?.supportsSymlink === false ? 'copy' : requestedMode || 'symlink'
      const agentDir = resolveAgentDir(agentId)
      const agentName = agentDisplayName(agentId)
      if (!agentDir) {
        outcome.errors.push({ skillId, agentId, reason: m('install.noAgentDir') })
        report({ message: m('install.skippedAgent', { agent: agentName }) })
        continue
      }

      // Several agents can share one physical directory (e.g. Zed, Goose and the
      // .agents standard all read ~/.agents/skills). Do the filesystem work once
      // and record a row per agent so the UI stays truthful.
      const already = handledDirs.get(agentDir)
      if (already) {
        const record: InstallRecord = {
          id: `${skillId}@${agentId}`,
          skillId,
          skillName: skill.name,
          repoFullName: found.repoFullName,
          agentId,
          agentName,
          targetDir: agentDir,
          linkPath: already,
          mode,
          installedAt: Date.now(),
          sourcePath: source
        }
        installs.update((d) => {
          d.records = d.records.filter((r) => !(r.skillId === skillId && r.agentId === agentId))
          d.records.push(record)
        })
        outcome.ok.push(record)
        report({ skillId, skillName: skill.name, agentId, agentName, message: m('install.sharedDir', { dir: agentDir }) })
        continue
      }

      let target = join(agentDir, sanitizeName(skill.name))
      try {
        mkdirSync(agentDir, { recursive: true })

        // Resolve naming conflicts inside the same agent directory.
        if (existsSync(target) && !isManagedPath(target, libRoot)) {
          const alt = `${sanitizeName(skill.name)}-${sanitizeName(found.repoFullName.split('/')[0])}`
          const altPath = join(agentDir, alt)
          if (!existsSync(altPath)) {
            target = altPath
          } else if (!isManagedPath(altPath, libRoot)) {
            outcome.skipped.push({ skillId, agentId, reason: m('install.conflict', { path: target }) })
            report({ message: m('install.conflictShort', { path: target }) })
            continue
          } else {
            target = altPath
          }
        }

        // Remove any previous SkillHub-owned entry.
        if (existsSync(target) || isSymlink(target)) {
          if (isSymlink(target)) unlinkSync(target)
          else rmSync(target, { recursive: true, force: true })
        }

        if (mode === 'symlink') {
          // Windows can only create a symlink with Developer Mode or elevation,
          // but a *junction* needs neither and works for directories.
          if (isWindows) {
            try {
              symlinkSync(source, target, 'junction')
            } catch {
              cpSync(source, target, { recursive: true, dereference: true })
            }
          } else {
            symlinkSync(source, target, 'dir')
          }
        } else {
          cpSync(source, target, { recursive: true, dereference: true })
          writeFileSync(
            join(target, MARKER),
            JSON.stringify(
              { skillId, repoFullName: found.repoFullName, installedAt: Date.now(), mode },
              null,
              2
            ),
            'utf8'
          )
        }

        // Replace any stale record for this skill/agent pair.
        const record: InstallRecord = {
          id: `${skillId}@${agentId}`,
          skillId,
          skillName: skill.name,
          repoFullName: found.repoFullName,
          agentId,
          agentName,
          targetDir: agentDir,
          linkPath: target,
          mode,
          installedAt: Date.now(),
          sourcePath: source
        }
        installs.update((d) => {
          d.records = d.records.filter((r) => !(r.skillId === skillId && r.agentId === agentId))
          d.records.push(record)
        })
        outcome.ok.push(record)
        handledDirs.set(agentDir, target)
        report({
          skillId,
          skillName: skill.name,
          agentId,
          agentName,
          message: m('install.done', { skill: skill.name, agent: agentName })
        })
      } catch (err: any) {
        outcome.errors.push({ skillId, agentId, reason: err?.message || String(err) })
        report({ message: m('install.itemFailed', { skill: skill.name, agent: agentName, error: err?.message || err }) })
      }
    }
  }

  onProgress?.({
    phase: 'done',
    message: m('install.summary', {
      ok: outcome.ok.length,
      skipped: outcome.skipped.length,
      failed: outcome.errors.length
    }),
    current: total,
    total,
    ok: outcome.errors.length === 0
  })
  if (outcome.ok.length) {
    logActivity('install', 'activity.installed', {
      count: outcome.ok.length,
      agents: [...new Set(outcome.ok.map((r) => r.agentName))].join(', ')
    })
  }
  return outcome
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

export function uninstall(skillId: string, agentId: string): boolean {
  const rec = installs.get().records.find((r) => r.skillId === skillId && r.agentId === agentId)
  if (!rec) return false
  try {
    if (existsSync(rec.linkPath) || isSymlink(rec.linkPath)) {
      if (isSymlink(rec.linkPath)) unlinkSync(rec.linkPath)
      else rmSync(rec.linkPath, { recursive: true, force: true })
    }
  } catch (err) {
    console.error('[installer] uninstall failed', err)
    return false
  }
  installs.update((d) => {
    d.records = d.records.filter((r) => r.id !== rec.id)
  })
  logActivity('uninstall', 'activity.uninstalled', { skill: rec.skillName, agent: rec.agentName })
  return true
}

export function uninstallAll(skillId: string): number {
  const recs = installs.get().records.filter((r) => r.skillId === skillId)
  let n = 0
  for (const r of recs) if (uninstall(skillId, r.agentId)) n++
  return n
}

/** Remove a raw path from an agent directory (for skills not installed by us). */
export function removeRawPath(p: string): boolean {
  if (!p || !existsSync(p)) return false
  const libRoot = expandPath(settings.get().libraryDir)
  // Guard: only ever delete inside a known agent skills directory.
  const dir = dirname(p)
  if (!dir || dir === p) return false
  void libRoot
  try {
    if (isSymlink(p)) unlinkSync(p)
    else rmSync(p, { recursive: true, force: true })
    installs.update((d) => {
      d.records = d.records.filter((r) => r.linkPath !== p)
    })
    return true
  } catch (err) {
    console.error('[installer] removeRawPath failed', err)
    return false
  }
}

export interface InstalledSkillView {
  skillId: string
  skillName: string
  repoFullName: string
  agentId: string
  agentName: string
  path: string
  mode: InstallMode
  installedAt: number
  exists: boolean
}

export function installedSkills(): InstalledSkillView[] {
  return installs
    .get()
    .records.map((r) => ({
      skillId: r.skillId,
      skillName: r.skillName,
      repoFullName: r.repoFullName,
      agentId: r.agentId,
      agentName: r.agentName,
      path: r.linkPath,
      mode: r.mode,
      installedAt: r.installedAt,
      exists: existsSync(r.linkPath)
    }))
    .sort((a, b) => b.installedAt - a.installedAt)
}

/** Count skills currently present in agent directories that SkillHub manages. */
export function managedCountByAgent(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of installs.get().records) {
    if (existsSync(r.linkPath)) out[r.agentId] = (out[r.agentId] || 0) + 1
  }
  return out
}

/**
 * Rebuild install records from what is actually on disk.
 *
 * A record is the only thing that tells the app a link was placed deliberately,
 * so a lost record makes the link unmanageable: it cannot be listed, and it
 * cannot be removed. That happened for real — a debounced write lost the record
 * while the symlink stayed, and the library then reported "0 installed" for a
 * skill that was installed.
 *
 * The filesystem is the authority for what exists; the record says who put it
 * there. Scanning is how the two are brought back together, and it is cheap: one
 * readdir per agent directory.
 */
/**
 * The library skill a link points at, if any.
 *
 * Compared by real path, because the link target is the checkout directory while
 * the library stores the same thing with `~` unexpanded.
 */
function libraryOwnerOf(target: string): { skill: SkillEntry; fullName: string } | null {
  const real = target
  for (const item of library.get().items) {
    for (const skill of item.skills) {
      if (skill.localPath && expandPath(skill.localPath) === real) {
        return { skill, fullName: item.fullName }
      }
    }
  }
  return null
}

export function reconcileInstalls(): number {
  const libRoot = expandPath(settings.get().libraryDir)
  const known = new Set(installs.get().records.map((r) => `${r.linkPath}`))
  const found: InstallRecord[] = []

  for (const agent of listAgents()) {
    const dir = resolveAgentDir(agent.id)
    if (!dir || !existsSync(dir)) continue
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const link = join(dir, name)
      // Only links into the library are ours. A folder the user made themselves
      // is not something this app placed, and claiming it would be wrong.
      let target: string | null = null
      try {
        if (lstatSync(link).isSymbolicLink()) target = expandPath(readlinkSync(link))
      } catch {
        continue
      }
      if (!target || !isInside(target, libRoot)) continue
      if (known.has(link)) continue

      /*
        Match the link target to the library entry that owns it.

        Reconstructing the id from the path is not enough: the id is
        `owner/repo::<path inside the repo>`, and that path is not the folder
        name — `design-templates/audio-jingle`, not `audio-jingle`. A guessed id
        produces a record that looks right and matches nothing, so the library
        still reports zero installed. The library already knows the real path of
        every skill it materialized, so ask it.
      */
      const owner = libraryOwnerOf(target)
      const relative = target.slice(libRoot.length + 1)
      const [repoPart] = relative.split('/')
      const repoFullName = owner?.fullName || (repoPart ? repoPart.replace('__', '/') : '')
      found.push({
        id: `${owner?.skill.id || `${repoFullName}::${name}`}@${agent.id}`,
        skillId: owner?.skill.id || `${repoFullName}::${name}`,
        skillName: owner?.skill.name || name,
        repoFullName,
        agentId: agent.id,
        agentName: agent.name,
        targetDir: dir,
        linkPath: link,
        mode: 'symlink',
        installedAt: Date.now(),
        sourcePath: target
      })
    }
  }

  if (found.length) {
    installs.update((d) => {
      d.records.push(...found)
    })
    logActivity('install', 'activity.reconciled', { count: found.length })
  }
  return found.length
}
