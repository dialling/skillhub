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
import type { InstallMode, InstallProgress, InstallRecord, SkillEntry } from '../../shared/types'
import { expandPath } from './paths'
import { installs, library, logActivity, settings } from './db'
import { agentDisplayName, listAgents, loadRegistry, resolveAgentDir, resolveAgentDirs } from './agents'
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

/** Identity of one installed artifact: this skill, at this path. */
function recordId(skillId: string, linkPath: string): string {
  return `${skillId}@${linkPath}`
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
    // Deduped: an agent with two skills directories gets two records for one
    // install, and the UI asks this question about agents, not about paths.
    const list = (map[r.skillId] ||= [])
    if (!list.includes(r.agentId)) list.push(r.agentId)
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
  /**
   * Why nothing was removed, when nothing was.
   *
   * `refused` is the one that matters: the folder is not ours any more, so
   * deleting it would destroy something the user made. It has to reach the
   * screen — reporting it as "nothing installed" would be a different and wrong
   * explanation for a deliberate refusal.
   */
  reason?: 'no-record' | 'refused' | 'failed'
  /** the path we would not delete, for the refusal message */
  path?: string
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
  const all = installs.get().records
  const own = all.filter((r) => r.skillId === skillId && r.agentId === agentId)
  if (!own.length) return { ok: false, agents: [], reason: 'no-record' }

  /*
    Every artifact belonging to this (skill, agent), not just the first.

    This used to `find` one record and delete its path, which was right while a
    record and an install were the same thing. An agent with two skills
    directories broke that: uninstalling removed one copy and left the other on
    disk, untracked and unreachable from the UI.
  */
  const paths = [...new Set(own.map((r) => r.linkPath))]
  for (const rec of own) {
    if (!deletableSkillFolder(rec)) {
      console.error('[installer] refusing to uninstall: the folder is not ours', rec.linkPath)
      return { ok: false, agents: [], reason: 'refused', path: rec.linkPath }
    }
  }
  for (const path of paths) {
    try {
      if (existsSync(path) || isSymlink(path)) {
        if (isSymlink(path)) unlinkSync(path)
        else rmSync(path, { recursive: true, force: true })
      }
    } catch (err) {
      console.error('[installer] uninstall failed', err)
      return { ok: false, agents: [], reason: 'failed' }
    }
  }

  // Sibling records are whatever shares a removed path: several agents can read
  // one directory, and their records have to go with the artifact.
  const affected = all.filter((r) => paths.includes(r.linkPath))
  const gone = new Set(affected.map((r) => r.id))
  installs.update((d) => {
    d.records = d.records.filter((r) => !gone.has(r.id))
  })
  const agents = [...new Set(affected.map((r) => r.agentName))]
  logActivity('uninstall', 'activity.uninstalled', { skill: own[0].skillName, agent: agents.join(', ') })
  return { ok: true, agents }
}

export function uninstall(skillId: string, agentId: string): boolean {
  return uninstallFrom(skillId, agentId).ok
}

export function uninstallAll(skillId: string): { removed: number; refused: string[] } {
  const agents = [...new Set(installs.get().records.filter((r) => r.skillId === skillId).map((r) => r.agentId))]
  // Count what was actually removed: an agent with two directories is one
  // removal of two artifacts, and reporting it as two agents would be a lie.
  let removed = 0
  const refused: string[] = []
  for (const agentId of agents) {
    const before = installs.get().records.filter((r) => r.skillId === skillId).length
    const res = uninstallFrom(skillId, agentId)
    if (res.ok) {
      removed += Math.max(1, before - installs.get().records.filter((r) => r.skillId === skillId).length)
    } else if (res.reason === 'refused' && res.path) {
      refused.push(res.path)
    }
  }
  return { removed, refused }
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
    // Every directory, not just the preferred one: an agent with two skills
    // directories has two places that are "a known agent dir".
    if (resolveAgentDirs(agent.id).some((d) => expandPath(d) === wanted)) return true
  }
  return false
}

/**
 * Refuse to delete something that is not a skill folder.
 *
 * The install path builds `join(destination, sanitizeName(name))`, so a record's
 * `linkPath` is always a direct child of a destination — today. That is a
 * property of `sanitizeName` never returning `.` or `..`, not of this function,
 * and deletion here is `rmSync(..., { recursive: true })`: a record pointing one
 * level up would take the whole skills directory with it, and two levels up
 * would take everything the agent reads.
 *
 * So the check is stated rather than inherited. A path that *is* an agent's
 * skills directory, or that contains one, is never a skill folder.
 */
function deletableSkillFolder(rec: InstallRecord): boolean {
  const real = expandPath(rec.linkPath)
  if (isKnownAgentDir(real)) return false
  for (const agent of listAgents()) {
    for (const dir of resolveAgentDirs(agent.id)) {
      if (isInside(expandPath(dir), real)) return false
    }
  }

  /*
    And the folder has to still be **ours**.

    The checks above only recognise directories the registry knows about, so a
    destination the user chose themselves was governed by nothing. A first
    attempt asked "does it look like a skill" — a top-level SKILL.md — which is
    the wrong question: it passes for a folder the user has since replaced with
    their own work, and that is precisely when deleting it does real damage.

    The question that can actually be answered is ownership, and the app already
    has one answer to it. `entryOwner` reads the marker we wrote at install time:
    `ours` means this very skill is in there, `other` means a different SkillHub
    skill, `foreign` means no marker at all — a folder somebody else made. Only
    the first is ours to remove.

    A legacy symlink install has no marker; `entryOwner` recognises it by its
    target and still says `ours`, so those remain removable.
  */
  return entryOwner(real, { skillId: rec.skillId, sourcePath: rec.sourcePath }) === 'ours'
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

  /*
    Drop records whose artifact is gone.

    Reconciliation used to only ever add. A folder deleted by hand — in Finder,
    by another tool, or by the user cleaning up after a test — left a record
    behind that every reader then had to filter out individually, and `uninstall`
    would happily report removing something that was not there. Reading the
    filesystem and believing it is the whole point of this pass.
  */
  const live = installs.get().records.filter((r) => existsSync(r.linkPath) || isSymlink(r.linkPath))
  if (live.length !== installs.get().records.length) {
    installs.update((d) => {
      d.records = d.records.filter((r) => existsSync(r.linkPath) || isSymlink(r.linkPath))
    })
  }

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
        id: recordId(owner?.skill.id || fromMarker?.skillId || `${repoFullName}::${name}`, link),
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
    One record per artifact — this skill, at this path.

    This pass used to key its guard on `(skill, agent)` and then append, so a
    pair whose entry had moved ended up with two records sharing one id, and a
    pair with two directories could only ever be described by one record. Both
    ended the same way: a removal that reported success and left files behind.
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
  /**
   * One-line description, used only to repair a SKILL.md whose frontmatter has
   * none. Callers that have it (the skill index does) pass it; callers that do
   * not lose nothing.
   */
  description?: string
}

export interface InstallFromGithubInput {
  skills: UpstreamSkill[]
  /**
   * Every folder to install into; each skill is placed as <destination>/<name>.
   *
   * A list rather than one path because "install where it will actually be
   * picked up" means every enabled agent's own directory — and fetching the
   * same repository once per destination would be absurd when the files are
   * already in hand. One fetch, N placements.
   */
  destinations: string[]
  onProgress?: (p: InstallProgress) => void
}

/**
 * Make a freshly placed skill readable by the agents that scan for it.
 *
 * Two defects stop a skill being discovered, and both are silent:
 *
 *   1. **CRLF line endings.** The frontmatter delimiter becomes `---\r`, which
 *      a YAML reader does not recognise as the terminator, so the whole block
 *      fails to parse. Measured: `~/.dsh/skills/browser-act/SKILL.md` is CRLF
 *      and never appears in the harness catalog, while the LF `code-review`
 *      beside it does.
 *
 *   2. **Missing `name` or `description`.** Published skills are not always
 *      self-describing — some carry only prose, some put the name in the
 *      heading. A scanner that requires the keys drops the skill.
 *
 * Only the frontmatter is touched, and only to add what is missing. The body is
 * never rewritten: a skill's instructions are its author's, and mangling them
 * would be a far worse failure than the one this fixes.
 */
function repairSkillFile(folder: string, s: UpstreamSkill): void {
  const file = join(folder, 'SKILL.md')
  try {
    if (!existsSync(file)) return
    const raw = readFileSync(file, 'utf8')
    const text = raw.includes('\r\n') ? raw.replace(/\r\n/g, '\n') : raw
    const repaired = ensureFrontmatter(text, s)
    if (repaired !== raw) writeFileSync(file, repaired, 'utf8')
  } catch (err) {
    // A skill that installs but cannot be discovered is worth a line in the
    // log, not a failed install: the files are in place and can be fixed by hand.
    console.error('[installer] could not repair SKILL.md', file, err)
  }
}

/** Add whichever of `name` / `description` the frontmatter is missing. */
function ensureFrontmatter(text: string, s: UpstreamSkill): string {
  const stripped = text.replace(/^\uFEFF/, '')
  const block = /^---\n([\s\S]*?)\n---\n?/.exec(stripped)
  if (!block) {
    /*
      No frontmatter at all. Synthesise a minimal one rather than refusing: the
      body is still the skill, and a header made of facts we already hold is
      strictly better than a folder no agent will read.
    */
    const description = (s.description || s.name).replace(/\s+/g, ' ').trim()
    return `---\nname: ${yamlScalar(s.name)}\ndescription: ${yamlScalar(description)}\n---\n\n${stripped}`
  }
  const body = block[1]
  const rest = stripped.slice(block[0].length)
  const lines = body.length ? body.split('\n') : []
  const has = (key: string): boolean => lines.some((l) => new RegExp(`^${key}\\s*:`).test(l))
  const added: string[] = []
  if (!has('name')) added.push(`name: ${yamlScalar(s.name)}`)
  if (!has('description')) {
    const description = (s.description || s.name).replace(/\s+/g, ' ').trim()
    added.push(`description: ${yamlScalar(description)}`)
  }
  if (!added.length) return text
  // Appended, not prepended: the author's own keys keep their order and the
  // repaired file reads like one somebody wrote, not like a patch.
  return `---\n${[...lines, ...added].join('\n')}\n---\n${rest}`
}

/** A YAML scalar that survives colons, quotes and newlines in the value. */
function yamlScalar(value: string): string {
  return JSON.stringify(String(value).replace(/\s+/g, ' ').trim())
}

/**
 * A skill's folder name when its own name is already taken.
 *
 * Owner-qualified because the owner is what actually distinguishes two skills
 * that share a name, and because it is stable: the same skill lands on the same
 * folder name on every machine, so uninstalling and reinstalling does not
 * accumulate `name-owner-2`, `name-owner-3`.
 */
function ownerQualified(base: string, fullName: string): string {
  const owner = sanitizeName((fullName || '').split('/')[0] || 'other')
  return `${base.slice(0, 100)}-${owner}`
}

/**
 * The agent whose skills directory this is, if any.
 *
 * The user may pick any folder, so this is a match rather than an assumption —
 * and when nothing matches, the record still has to say where the files went.
 */
function agentForDestination(destination: string): { id: string; name: string } {
  const real = expandPath(destination)
  /*
    Every directory of every agent, not just the one `resolveAgentDir` prefers.

    That function answers "where is this agent", singular, which is right for
    display and wrong here: DeepSeek Harness reads two directories, so an install
    into the second one matched nothing and was recorded under the pseudo-agent
    `path:<dir>`. The copy was then invisible to the agent's own uninstall — it
    removed the first directory and left the second on disk, tracked by nobody.
  */
  for (const agent of listAgents()) {
    if (resolveAgentDirs(agent.id).some((dir) => expandPath(dir) === real)) {
      return { id: agent.id, name: agent.name }
    }
  }
  return { id: `path:${real}`, name: real }
}

export async function installFromGithub(input: InstallFromGithubInput): Promise<InstallOutcome> {
  const { skills, destinations, onProgress } = input
  const outcome: InstallOutcome = { ok: [], skipped: [], errors: [] }
  /*
    Deduped by resolved path: several registry entries read the same directory
    (`~/.agents/skills` backs about fifty of them), and installing into it once
    per alias would place the same skill repeatedly — the second attempt landing
    beside the first under an `-owner` name.
  */
  const targets = [...new Set(destinations.map((d) => expandPath(d)).filter(Boolean))]
  const total = skills.length * targets.length
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
  const place = (s: UpstreamSkill, source: string, origin: string, target: string): void => {
    const agent = agentForDestination(target)
    const base = sanitizeName(s.name) || s.name
    try {
      /*
        Decide where this skill goes before writing anything.

        The base name is only correct when the slot is free or already holds
        this very skill. Anything else — another published skill with the same
        name, or the user's own folder — must not be written into: replacing it
        would delete work that is not ours, and refusing would make a skill
        impossible to install at all. So the fallback is to land beside it under
        an owner-qualified name, which is what the length cap in `sanitizeName`
        keeps room for.

        12 skill names exist in more than one repository in the catalog
        (`canvas-design`, `brand-guidelines`, …), so this is the common case, not
        a corner case.
      */
      const owner = entryOwner(join(target, base), { skillId: s.skillId, sourcePath: origin })
      let folder = join(target, base)
      let beside = false

      if (owner === 'ours') {
        // Re-installing over our own entry is what an update is.
        rmSync(folder, { recursive: true, force: true })
      } else if (owner !== 'free') {
        folder = join(target, ownerQualified(base, s.fullName))
        const inner = entryOwner(folder, { skillId: s.skillId, sourcePath: origin })
        if (inner === 'ours') {
          rmSync(folder, { recursive: true, force: true })
        } else if (inner !== 'free') {
          // Both names are taken by something that is not this skill. Refusing
          // is the only remaining option, and it must be loud.
          outcome.skipped.push({
            skillId: s.skillId,
            agentId: agent.id,
            reason: m(owner === 'other' ? 'install.conflictOurs' : 'install.conflict', { path: folder })
          })
          report({})
          return
        }
        beside = true
      }

      const placed = placeFetched(source, folder)
      /*
        Make the copy discoverable, not merely present.

        A skill is picked up by scanning an agent's skills directory for
        `<name>/SKILL.md` with YAML frontmatter carrying `name` and
        `description`. Files that fail that are dropped **silently** — the folder
        sits there looking installed while the agent never sees it, which is the
        worst possible outcome for the one action whose whole purpose is "now I
        can use it".

        Measured on this machine: `browser-act` carries CRLF line endings and
        never appears in DeepSeek Harness's catalog, while the LF `code-review`
        beside it does. Repairing the two things that actually break discovery is
        cheap; guessing at the rest is not.
      */
      repairSkillFile(folder, s)
      if (beside) {
        // Say where it went: the folder name is not the skill's name any more.
        report({
          skillId: s.skillId,
          skillName: s.name,
          message: m(owner === 'foreign' ? 'install.placedBesideUser' : 'install.placedBeside', {
            name: folder.slice(target.length + 1)
          })
        })
      }
      writeMarker(folder, { skillId: s.skillId, repoFullName: s.fullName }, origin)
      /*
        The id names the artifact, not the agent.

        One agent can read several directories — DeepSeek Harness reads both the
        CLI's and the desktop app's — so `${skillId}@${agentId}` was not unique:
        the second placement silently replaced the first record, and the copy
        that lost was left on disk with nothing tracking it. Uninstalling then
        removed one of the two and the other stayed forever.
      */
      const record: InstallRecord = {
        id: recordId(s.skillId, folder),
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
        d.records = d.records.filter((r) => !(r.skillId === s.skillId && r.linkPath === folder))
        d.records.push(record)
      })
      outcome.ok.push(record)
      if (!beside) {
        report({ skillId: s.skillId, skillName: s.name, message: m('install.fetched', { files: placed.files }) })
      }
    } catch (err: any) {
      outcome.errors.push({ skillId: s.skillId, agentId: agent.id, reason: err?.message || String(err) })
    }
  }

  /** One skill, fetched once, placed into every destination that asked for it. */
  const take = (s: UpstreamSkill, source: string, origin: string): void => {
    for (const target of targets) {
      current++
      place(s, source, origin, target)
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
      // One failed fetch is one failure per destination, not per skill: the
      // progress total counts pairs, and a user told "3 errors" for one
      // unreachable repository across one agent would go looking for three.
      for (const s of list) {
        for (const target of targets) {
          current++
          outcome.errors.push({
            skillId: s.skillId,
            agentId: agentForDestination(target).id,
            reason: err?.message || String(err)
          })
        }
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
      // Distinct names: one install into three directories that two agents share
      // is two agents, and the log should read that way.
      agents: [...new Set(outcome.ok.map((r) => r.agentName))].join(', ')
    })
  }
  report({ phase: 'done' } as Partial<InstallProgress>)
  return outcome
}
