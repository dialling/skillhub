import { execFile, execFileSync } from 'node:child_process'
import { cpSync, readdirSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { clipboard, shell } from 'electron'
import type { LaunchPlan, LaunchTarget } from '../../shared/types'
import { expandPath, sandboxDir, tildify, safeSegment } from './paths'
import { library, logActivity, settings } from './db'
import { loadRegistry, listAgents, resolveAgentDir } from './agents'
import { isWindows, which } from './platform'
import { m } from './msg'

const MARK_START = '<!-- skillhub:start -->'
const MARK_END = '<!-- skillhub:end -->'

interface LaunchMeta {
  kind: 'cli' | 'app' | 'web'
  command?: string
  promptArg?: boolean
  appName?: string
  url?: string
  instructionFile?: string
}

function launchMeta(agentId: string): LaunchMeta | null {
  const entry = loadRegistry().find((e) => e.id === agentId)
  return (entry?.launch as LaunchMeta) || null
}

/** Does this GUI application actually exist on this machine? */
function appInstalled(name: string | undefined, command: string | undefined): boolean {
  // The CLI shim an app installs (`cursor`, `code`, `zed`) is the most reliable
  // signal, and it is also what `open -a` will end up matching.
  if (command && which(isWindows ? `${command}.exe` : command)) return true
  if (!name) return false
  if (isWindows) {
    const local = process.env.LOCALAPPDATA || ''
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    return [join(local, 'Programs', name), join(pf, name)].some((p) => existsSync(p))
  }
  const candidates = [
    `/Applications/${name}.app`,
    `/System/Applications/${name}.app`,
    join(homedir(), 'Applications', `${name}.app`)
  ]
  if (candidates.some((p) => existsSync(p))) return true
  if (process.platform === 'darwin') {
    // Spotlight knows about apps installed outside /Applications
    try {
      const out = execFileSync('mdfind', [`kMDItemKind == 'Application' && kMDItemDisplayName == '${name}'`], {
        encoding: 'utf8',
        timeout: 4000
      })
      return out.trim().length > 0
    } catch {
      return false
    }
  }
  return false
}

/** Agents the user can actually start, best first. */
export function launchTargets(): LaunchTarget[] {
  const out: LaunchTarget[] = []
  for (const agent of listAgents()) {
    const meta = launchMeta(agent.id)
    if (!meta) continue
    // "ready" must mean "this will really start on this machine" — claiming
    // ready for an app that is not installed just produces a failed launch.
    const ready =
      meta.kind === 'web'
        ? true
        : meta.kind === 'app'
          ? appInstalled(meta.appName, meta.command)
          : !!meta.command && !!which(isWindows ? `${meta.command}.exe` : meta.command)
    out.push({
      agentId: agent.id,
      name: agent.name,
      vendor: agent.vendor,
      color: agent.color,
      kind: meta.kind,
      detail:
        meta.kind === 'cli'
          ? meta.promptArg
            ? m('launch.detailCliPrompt', { command: meta.command || '' })
            : m('launch.detailCli', { command: meta.command || '' })
          : meta.kind === 'app'
            ? m('launch.detailApp', { app: meta.appName || '' })
            : (meta.url ?? ''),
      ready,
      detected: agent.detected
    })
  }
  // Runnable and installed first, then runnable, then the rest.
  return out.sort(
    (a, b) =>
      Number(b.ready && b.detected) - Number(a.ready && a.detected) ||
      Number(b.ready) - Number(a.ready) ||
      a.name.localeCompare(b.name)
  )
}

/**
 * Lay out a workspace so the chosen agent will actually pick the skill up.
 *
 * Three things have to be true when the agent starts:
 *   1. the skill is visible to that agent *inside this workspace*
 *      (project-level install — the user's global copy may be for another tool)
 *   2. there is a working folder for the skill's inputs and outputs
 *   3. the agent has been told the skill is active, in a file it reads on
 *      startup, so it works even when the launch cannot pass a prompt
 */
export function prepareLaunch(input: {
  skillId?: string
  /** set instead of skillId to launch a skill discovered on disk */
  localPath?: string
  localName?: string
  localDescription?: string
  agentId: string
  workspace: string
}): LaunchPlan {
  // Two sources, one flow. A skill the user already has on disk is just as
  // launchable as one the library manages — making them import it first would
  // be busywork.
  let sourcePath: string
  let skillName: string
  let skillDescription: string | undefined
  let skillId: string
  let repoFullName: string
  let fromLocal = false

  if (input.localPath) {
    sourcePath = expandPath(input.localPath)
    if (!existsSync(join(sourcePath, 'SKILL.md'))) throw new Error(m('launch.skillFilesMissing'))
    skillName = input.localName || sourcePath.split(/[\\/]/).filter(Boolean).pop() || 'skill'
    skillDescription = input.localDescription
    skillId = `local:${sourcePath}`
    repoFullName = ''
    fromLocal = true
  } else {
    if (!input.skillId) throw new Error(m('launch.skillNotInLibrary'))
    const [repo] = input.skillId.split('::')
    const item = library.get().items.find((i) => i.id === repo)
    if (!item) throw new Error(m('launch.skillNotInLibrary'))
    const skill = item.skills.find((s) => s.id === input.skillId)
    if (!skill) throw new Error(m('launch.skillNotInLibrary'))
    if (!skill.localPath || !existsSync(skill.localPath)) throw new Error(m('launch.skillFilesMissing'))
    sourcePath = skill.localPath
    skillName = skill.name
    skillDescription = skill.descriptionEn
    skillId = skill.id
    repoFullName = item.fullName
  }

  const meta = launchMeta(input.agentId)
  if (!meta) throw new Error(m('launch.agentNotLaunchable'))

  const workspace = expandPath(input.workspace)
  mkdirSync(workspace, { recursive: true })

  const folderName = safeSegment(skillName)
  const workFolder = join(workspace, folderName)
  mkdirSync(workFolder, { recursive: true })

  // 1. project-level install, so the agent finds the skill with cwd=workspace
  const entry = loadRegistry().find((e) => e.id === input.agentId)
  const projectRel = entry?.projectSkillsDir || '.agents/skills'
  const projectDir = join(workspace, projectRel)
  mkdirSync(projectDir, { recursive: true })
  const projectSkillPath = join(projectDir, folderName)
  try {
    if (existsSync(projectSkillPath) || isSymlink(projectSkillPath)) {
      if (isSymlink(projectSkillPath)) rmSync(projectSkillPath)
      else rmSync(projectSkillPath, { recursive: true, force: true })
    }
    if (isWindows) {
      try {
        symlinkSync(sourcePath, projectSkillPath, 'junction')
      } catch {
        cpSync(sourcePath, projectSkillPath, { recursive: true, dereference: true })
      }
    } else {
      symlinkSync(sourcePath, projectSkillPath, 'dir')
    }
  } catch {
    cpSync(sourcePath, projectSkillPath, { recursive: true, dereference: true })
  }

  // 2. tell the agent, in a file it reads on startup
  const instructionFile = meta.instructionFile || 'AGENTS.md'
  const instructionPath = join(workspace, instructionFile)
  writeInstruction({
    path: instructionPath,
    skillName,
    description: skillDescription,
    folderName,
    repoFullName,
    sourcePath
  })

  // 3. the prompt handed to the agent when the launcher supports one
  const prompt = m('launch.prompt', { skill: skillName, folder: folderName })

  const plan: LaunchPlan = {
    skillId,
    skillName,
    repoFullName,
    fromLocal,
    agentId: input.agentId,
    agentName: entry?.name || input.agentId,
    launchKind: meta.kind,
    workspace,
    workFolder,
    projectSkillPath,
    instructionFile,
    instructionPath,
    prompt,
    command: meta.command,
    promptArg: !!meta.promptArg,
    appName: meta.appName,
    url: meta.url
  }

  // remember the workspace for next time
  settings.update((d) => {
    const list = (d.recentWorkspaces || []).filter((w) => w !== workspace)
    list.unshift(workspace)
    d.recentWorkspaces = list.slice(0, 8)
  })

  return plan
}

/**
 * SKILL.md descriptions are written as model triggers and routinely run past
 * 1000 characters. The instruction file only needs the gist, cut on a sentence
 * boundary so it never stops mid-word.
 */
function summarize(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  // Sentence terminators, ASCII and CJK. Written as escapes so the source file
  // contains no literal CJK — the bilingual audit treats such literals as
  // untranslated UI text, and this is punctuation, not copy.
  const cut = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('; '),
    slice.lastIndexOf('\u3002'),
    slice.lastIndexOf('\uff01')
  )
  return (cut > 60 ? slice.slice(0, cut + 1) : slice.trimEnd() + '\u2026').trim()
}

function writeInstruction(input: {
  path: string
  skillName: string
  description?: string
  folderName: string
  repoFullName: string
  sourcePath: string
}): void {
  const { path, skillName, description, folderName, repoFullName, sourcePath } = input
  // Written into the workspace, so it follows the UI language like any other
  // user-facing text.
  const block = [
    MARK_START,
    m('launch.noteTitle', { skill: skillName }),
    '',
    // A discovered skill has no repository; naming its real path is more
    // useful than an empty "Source:" line.
    repoFullName ? m('launch.noteSource', { repo: repoFullName }) : m('launch.noteLocalSource', { path: sourcePath }),
    m('launch.noteFolder', { folder: folderName }),
    description ? m('launch.notePurpose', { text: summarize(description) }) : '',
    '',
    m('launch.noteInstruction', { skill: skillName }),
    MARK_END
  ]
    .filter(Boolean)
    .join('\n')

  let existing = ''
  try {
    existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  } catch {
    existing = ''
  }
  const start = existing.indexOf(MARK_START)
  const end = existing.indexOf(MARK_END)
  const next =
    start >= 0 && end > start
      ? existing.slice(0, start) + block + existing.slice(end + MARK_END.length)
      : existing.trim()
        ? `${existing.trimEnd()}\n\n${block}\n`
        : `${block}\n`
  writeFileSync(path, next, 'utf8')
}

/**
 * Empty the sandbox.
 *
 * Nothing in here was authored by the user: every folder is a layout this app
 * wrote for a launch. Removing them is safe by construction, which is the point
 * of keeping launches out of the user's own directories. Returns how many skill
 * folders were removed.
 */
export function clearSandbox(): number {
  const root = sandboxDir()
  let removed = 0
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      rmSync(join(root, entry.name), { recursive: true, force: true })
      removed++
    }
  } catch {
    /* nothing to clear */
  }
  return removed
}

/**
 * Quote one value for POSIX `sh`, the way the shell itself would.
 *
 * Everything handed to Terminal is a shell command line, so a workspace path or
 * a skill name is not data — it is code. Wrapping in single quotes and escaping
 * embedded ones is the only form that survives every character: `$`, backticks,
 * `\`, `;` and quotes all stop being special. The previous version escaped only
 * double quotes, which left command substitution live — a workspace folder
 * literally named `a$(whoami)b` would have been executed.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function isSymlink(p: string): boolean {
  try {
    return require('node:fs').lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

/** macOS: drive Terminal.app. Windows/Linux: start a terminal emulator. */
function openTerminal(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Escape for AppleScript string literals
    const esc = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const script = `tell application "Terminal"
  activate
  do script "${esc}"
end tell`
    execFile('osascript', ['-e', script], { timeout: 15000 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function runLaunch(plan: LaunchPlan): Promise<{ ok: boolean; message: string }> {
  try {
    if (plan.launchKind === 'cli' && plan.command) {
      // Every interpolated value is quoted for the shell, not merely for
      // AppleScript: `do script` hands this line to `sh`.
      const prompt = plan.promptArg ? ` ${shellQuote(plan.prompt)}` : ''
      const command = plan.command.replace(/[^\w./-]/g, '')
      const line = `cd ${shellQuote(plan.workspace)} && ${command}${prompt}`
      if (process.platform === 'darwin') {
        await openTerminal(line)
      } else {
        // No scriptable terminal everywhere; put it on the clipboard so the
        // command is one paste away, and open the folder.
        clipboard.writeText(line)
        await shell.openPath(plan.workspace)
      }
      logActivity('launch', 'activity.launched', { skill: plan.skillName, agent: plan.agentName })
      return { ok: true, message: m('launch.startedCli', { agent: plan.agentName }) }
    }

    if (plan.launchKind === 'app' && plan.appName) {
      clipboard.writeText(plan.prompt)
      await new Promise<void>((resolve, reject) => {
        execFile('open', ['-a', plan.appName!, plan.workspace], { timeout: 15000 }, (err) =>
          err ? reject(err) : resolve()
        )
      })
      logActivity('launch', 'activity.launched', { skill: plan.skillName, agent: plan.agentName })
      return { ok: true, message: m('launch.startedApp', { agent: plan.agentName }) }
    }

    if (plan.launchKind === 'web' && plan.url) {
      clipboard.writeText(plan.prompt)
      await shell.openExternal(plan.url)
      logActivity('launch', 'activity.launched', { skill: plan.skillName, agent: plan.agentName })
      return { ok: true, message: m('launch.startedWeb') }
    }

    return { ok: false, message: m('launch.agentNotLaunchable') }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}

/** Where the skill is installed for the user's agents, for display. */
export function installLocations(skillName: string): string[] {
  const out: string[] = []
  for (const agent of listAgents()) {
    const dir = resolveAgentDir(agent.id)
    if (!dir) continue
    const p = join(expandPath(dir), skillName)
    if (existsSync(p)) out.push(tildify(p))
  }
  return out
}
