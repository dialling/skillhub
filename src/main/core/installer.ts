import {
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
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
import { fetchPaths, placeFetched } from './fetch'
import { m } from './msg'
import { isInside, isWindows } from './platform'
import { MARKER, entryOwner, isCopiedEntry, isManagedPath, libraryRoot } from './managed'

// Re-exported so the placement rules and the scan cannot drift apart again.
export { entryOwner, isManagedPath }

/**
 * The file that makes a copy recognisable as ours.
 *
 * Every install writes one. It is what `entryOwner` reads to decide whether a
 * folder may be replaced, what `reconcileInstalls` reads to rebuild a lost
 * record, and what the "managed by SkillHub" chips are based on — so a copy
 * written without it is an entry the app can no longer see, update, or remove.
 */
function writeMarker(
  target: string,
  meta: { skillId: string; repoFullName: string },
  sourcePath: string
): void {
  try {
    writeFileSync(
      join(target, MARKER),
      JSON.stringify(
        {
          skillId: meta.skillId,
          repoFullName: meta.repoFullName,
          installedAt: Date.now(),
          mode: 'copy',
          sourcePath
        },
        null,
        2
      ),
      'utf8'
    )
  } catch (err) {
    // A missing marker degrades the entry to "someone else's folder", which is
    // safe but unmanageable; worth knowing about, not worth failing the install.
    console.error('[installer] failed to write install marker', err)
  }
}

export interface InstallOutcome {
  ok: InstallRecord[]
  skipped: { skillId: string; agentId: string; reason: string }[]
  errors: { skillId: string; agentId: string; reason: string }[]
}

/**
 * The folder name one skill occupies in an agent directory.
 *
 * Exported because the launcher has to predict the same name before anything is
 * written; two name functions for one slot is how the plan and the placement end
 * up disagreeing. The length cap keeps room for the owner-qualified variant
 * beside it inside a 255-byte filename limit.
 */
export function sanitizeName(name: string): string {
  return (
    name
      .replace(/[/\\:]+/g, '-')
      .replace(/[^A-Za-z0-9._@+-]+/g, '-')
      .replace(/^[.-]+/, '')
      .replace(/-+$/, '')
      .slice(0, 120) || 'skill'
  )
}

/** True when the path is a SkillHub-owned install (symlink into the library,
 *  or a copy carrying our marker file). Defined in `managed.ts` so the scan and
 *  the installer cannot answer it differently. */

/**
 * Which folder a skill should occupy in an agent directory.
 *
 * The base name comes from the skill alone, so two different skills can want the
 * same folder — measured on this machine: 12 skill names exist in more than one
 * library repository (`canvas-design`, `brand-guidelines`, …). Reusing the slot
 * on the strength of "it is one of ours" deleted the first skill's install to
 * make room for the second, while the first skill's record still pointed at the
 * shared path and reported it installed.
 *
 * So ownership decides, not existence: the base name is used only when nothing
 * is there or when the entry is this same skill; anything else gets the
 * owner-qualified name beside it, and if that is taken too the install is
 * reported as a conflict rather than overwriting someone else's files.
 */
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

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

export interface UninstallResult {
  ok: boolean
  /** display names of every agent whose install this removed (shared dirs) */
  agents: string[]
}

/**
 * Remove one agent's install, and every record that described the same entry.
 *
 * Several agents share one physical directory, so the deletion is per directory
 * while both the request and the records are per agent. Deleting one agent's
 * entry therefore removes the skill from every agent reading that directory, and
 * the sibling records were left behind claiming an install whose path no longer
 * existed — invisible in the UI (which filters on existence) and impossible to
 * clean up from it. The scope of what happened is returned so the caller can say
 * so instead of reporting a single-agent removal.
 */
export function uninstallFrom(skillId: string, agentId: string): UninstallResult {
  const rec = installs.get().records.find((r) => r.skillId === skillId && r.agentId === agentId)
  if (!rec) return { ok: false, agents: [] }
  const shared = installs.get().records.filter((r) => r.linkPath === rec.linkPath)
  try {
    if (existsSync(rec.linkPath) || isSymlink(rec.linkPath)) {
      if (isSymlink(rec.linkPath)) unlinkSync(rec.linkPath)
      else rmSync(rec.linkPath, { recursive: true, force: true })
    }
  } catch (err) {
    console.error('[installer] uninstall failed', err)
    return { ok: false, agents: [] }
  }
  const gone = new Set(shared.map((r) => r.id))
  installs.update((d) => {
    d.records = d.records.filter((r) => !gone.has(r.id))
  })
  const agents = [...new Set(shared.map((r) => r.agentName))]
  logActivity('uninstall', 'activity.uninstalled', { skill: rec.skillName, agent: agents.join(', ') })
  return { ok: true, agents }
}

export function uninstall(skillId: string, agentId: string): boolean {
  return uninstallFrom(skillId, agentId).ok
}

export function uninstallAll(skillId: string): number {
  const recs = installs.get().records.filter((r) => r.skillId === skillId)
  // One entry can back several agents; count the removals, not the records.
  const seen = new Set<string>()
  let n = 0
  for (const r of recs) {
    if (seen.has(r.linkPath)) continue
    seen.add(r.linkPath)
    const res = uninstallFrom(skillId, r.agentId)
    if (res.ok) n += res.agents.length
  }
  return n
}

/** Remove a raw path from an agent directory (for skills not installed by us). */
export function removeRawPath(p: string): boolean {
  if (!p || !existsSync(p)) return false
  const dir = dirname(p)
  if (!dir || dir === p) return false
  /*
    Only ever delete inside a known agent skills directory.

    The comment was there before the check was: the body computed the parent
    directory, returned false when the path had no parent, and threw the library
    root away with `void`. This IPC takes its path from the renderer, so the
    guard is the only thing standing between a bad caller and a recursive delete.
  */
  if (!isKnownAgentDir(dir)) {
    console.error('[installer] refused to remove a path outside an agent directory', p)
    return false
  }
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

function isKnownAgentDir(dir: string): boolean {
  const wanted = expandPath(dir)
  for (const agent of listAgents()) {
    const resolved = resolveAgentDir(agent.id)
    if (resolved && expandPath(resolved) === wanted) return true
  }
  return false
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
  const libRoot = libraryRoot()
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
      let fromMarker: { skillId?: string; repoFullName?: string; sourcePath?: string } | null = null
      try {
        if (lstatSync(link).isSymbolicLink()) {
          target = expandPath(readlinkSync(link))
        } else if (existsSync(join(link, MARKER))) {
          /*
            A copy, not a link.

            Agents that do not follow symlinks get a real directory, and the only
            thing distinguishing it from a folder the user made is the marker. This
            scan looked at symlinks alone, so a copied install whose record was
            lost could never be recovered — the recovery covered exactly the agents
            that needed it least. Measured: `browser-act` sat there with its marker
            and was not picked up.
          */
          fromMarker = JSON.parse(readFileSync(join(link, MARKER), 'utf8'))
        }
      } catch {
        continue
      }
      if (!target && !fromMarker) continue
      if (target && !isInside(target, libRoot)) continue
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
      // The marker carries the exact ids, which beats reconstructing them.
      const owner = target ? libraryOwnerOf(target) : null
      const relative = target ? target.slice(libRoot.length + 1) : ''
      const [repoPart] = relative.split('/')
      const repoFullName =
        owner?.fullName || fromMarker?.repoFullName || (repoPart ? repoPart.replace('__', '/') : '')
      found.push({
        id: `${owner?.skill.id || fromMarker?.skillId || `${repoFullName}::${name}`}@${agent.id}`,
        skillId: owner?.skill.id || fromMarker?.skillId || `${repoFullName}::${name}`,
        skillName: owner?.skill.name || name,
        repoFullName,
        agentId: agent.id,
        agentName: agent.name,
        targetDir: dir,
        linkPath: link,
        mode: target ? 'symlink' : 'copy',
        installedAt: Date.now(),
        sourcePath: target || fromMarker?.sourcePath || link
      })
    }
  }

  /*
    One record per (skill, agent) pair, which is what the record id means.

    This pass used to key its guard on the path alone and then append, so a pair
    whose entry had moved (an install under the owner-qualified name, then the
    conflicting folder removed, then a plain install) ended up with two records
    sharing one id. `uninstall` selects by pair and then removes by id, so it
    dropped both records while deleting only one entry — a removal that reported
    success and changed nothing. Recovered entries replace the pair's record
    instead of joining it.
  */
  if (found.length) {
    // One entry per pair: two folders in one agent directory can both look like
    // this skill, and the id can only describe one of them.
    const byPair = new Map<string, InstallRecord>()
    for (const f of found) if (!byPair.has(f.id)) byPair.set(f.id, f)
    const recovered = [...byPair.values()]
    installs.update((d) => {
      const claimed = new Set(recovered.map((f) => f.id))
      d.records = d.records.filter((r) => !claimed.has(r.id))
      d.records.push(...recovered)
    })
    logActivity('install', 'activity.reconciled', { count: recovered.length })
    return recovered.length
  }
  return 0
}

/* ---------------------------------------------------------------------------
   Installing straight from GitHub
   ---------------------------------------------------------------------------
   The store is an index, not a copy. Installing a skill means downloading that
   skill and putting it where the user asked for it — no local checkout of the
   repository, nothing to keep in step, and no second copy of somebody's project
   on disk. The previous flow cloned each repository into ~/.skillhub/library
   first, which cost 575 MB across nine repositories and existed only so a later
   install could copy from it.
--------------------------------------------------------------------------- */

/** Where a skill lives upstream, resolved from its id. */
export interface UpstreamSkill {
  skillId: string
  fullName: string
  /** folder inside the repository; '' when the skill is the whole repository */
  path: string
  name: string
  /**
   * Set when the source is a folder on this machine rather than a repository.
   *
   * A skill found on disk is installable into an agent just like a published
   * one; the only difference is where the bytes come from, so it travels in the
   * same request and lands through the same placement code.
   */
  localPath?: string
}

export interface InstallFromGithubInput {
  skills: UpstreamSkill[]
  /** the folder the user chose; each skill is placed as <destination>/<name> */
  destination: string
  onProgress?: (p: InstallProgress) => void
}

/**
 * The agent whose skills directory this is, if any.
 *
 * The user may pick any folder, so this is a match rather than an assumption —
 * and when nothing matches, the record still has to say where the files went.
 */
function agentForDestination(destination: string): { id: string; name: string } {
  const real = expandPath(destination)
  for (const agent of listAgents()) {
    const dir = resolveAgentDir(agent.id)
    if (dir && expandPath(dir) === real) return { id: agent.id, name: agent.name }
  }
  return { id: `path:${real}`, name: real }
}

export async function installFromGithub(input: InstallFromGithubInput): Promise<InstallOutcome> {
  const { skills, destination, onProgress } = input
  const outcome: InstallOutcome = { ok: [], skipped: [], errors: [] }
  const target = expandPath(destination)
  const agent = agentForDestination(target)
  const total = skills.length
  let current = 0

  const report = (p: Partial<InstallProgress>): void => {
    onProgress?.({ phase: 'link', message: '', current, total, ...p } as InstallProgress)
  }

  /**
   * Copy one skill's files into place and record it.
   *
   * `source` is read at the moment of installation — a freshly fetched checkout
   * for a published skill, the skill's own folder for one found on disk.
   */
  const take = (s: UpstreamSkill, source: string, origin: string): void => {
    current++
    const folder = join(target, sanitizeName(s.name) || s.name)
    try {
      /*
        Decide who owns the folder before writing into it.

        A bare `existsSync` was wrong in both directions: it refused to update
        our own entry, and it would happily have written next to the user's own
        folder. `entryOwner` answers the question that matters — free, ours,
        another skill's, or someone else's entirely.

        Without the marker this writes afterwards, the copy is invisible to
        `isManagedPath`, so re-installing reports "目标已存在且不是 SkillHub
        管理的技能" and reconcile can never recover the record.
      */
      const owner = entryOwner(folder, { skillId: s.skillId, sourcePath: origin })
      if (owner === 'other' || owner === 'foreign') {
        outcome.skipped.push({ skillId: s.skillId, agentId: agent.id, reason: m('install.conflict', { path: folder }) })
        report({})
        return
      }
      if (owner === 'ours') rmSync(folder, { recursive: true, force: true })
      const placed = placeFetched(source, folder)
      writeMarker(folder, { skillId: s.skillId, repoFullName: s.fullName }, origin)
      const record: InstallRecord = {
        id: `${s.skillId}@${agent.id}`,
        skillId: s.skillId,
        skillName: s.name,
        repoFullName: s.fullName,
        agentId: agent.id,
        agentName: agent.name,
        targetDir: target,
        linkPath: folder,
        mode: 'copy',
        installedAt: Date.now(),
        sourcePath: origin
      }
      installs.update((d) => {
        d.records = d.records.filter((r) => !(r.skillId === s.skillId && r.agentId === agent.id))
        d.records.push(record)
      })
      outcome.ok.push(record)
      report({ skillId: s.skillId, skillName: s.name, message: m('install.fetched', { files: placed.files }) })
    } catch (err: any) {
      outcome.errors.push({ skillId: s.skillId, agentId: agent.id, reason: err?.message || String(err) })
    }
  }

  // A skill that already lives on this machine needs no network at all.
  const local = skills.filter((s) => s.localPath)
  const remote = skills.filter((s) => !s.localPath)
  for (const s of local) take(s, expandPath(s.localPath as string), expandPath(s.localPath as string))

  // One fetch per repository, however many of its skills are being installed.
  const byRepo = new Map<string, UpstreamSkill[]>()
  for (const s of remote) {
    const list = byRepo.get(s.fullName)
    if (list) list.push(s)
    else byRepo.set(s.fullName, [s])
  }

  for (const [fullName, list] of byRepo) {
    let fetched: Awaited<ReturnType<typeof fetchPaths>> | null = null
    try {
      fetched = await fetchPaths({
        fullName,
        paths: list.map((s) => s.path),
        onProgress: (message) => report({ message })
      })
    } catch (err: any) {
      for (const s of list) {
        current++
        outcome.errors.push({ skillId: s.skillId, agentId: agent.id, reason: err?.message || String(err) })
      }
      report({ message: '' })
      continue
    }

    try {
      for (const s of list) take(s, fetched.dirFor(s.path), `https://github.com/${s.fullName}/tree/HEAD/${s.path}`)
    } finally {
      fetched?.release()
    }
  }

  if (outcome.ok.length) {
    logActivity('install', 'activity.installed', {
      count: outcome.ok.length,
      agents: agent.name
    })
  }
  report({ phase: 'done' } as Partial<InstallProgress>)
  return outcome
}
