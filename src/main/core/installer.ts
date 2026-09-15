import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { InstallMode, InstallProgress, InstallRecord, InstallRequest, SkillEntry } from '../../shared/types'
import { expandPath } from './paths'
import { installs, library, logActivity, settings } from './db'
import { agentDisplayName, resolveAgentDir } from './agents'

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
      return target.startsWith(libraryRoot)
    }
    if (st.isDirectory() && existsSync(join(p, MARKER))) return true
  } catch {
    return false
  }
  return false
}

function findSkill(skillId: string): { skill: SkillEntry; repoFullName: string } | null {
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
  const mode: InstallMode = req.mode || settings.get().installMode || 'symlink'
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
        outcome.errors.push({ skillId, agentId, reason: '技能不在库中，请先入库' })
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
        outcome.errors.push({ skillId, agentId, reason: '本地文件缺失，请重新同步' })
      }
      current += req.agentIds.length
      continue
    }
    if (!existsSync(join(source, 'SKILL.md'))) {
      for (const agentId of req.agentIds) {
        outcome.errors.push({ skillId, agentId, reason: '该目录下没有 SKILL.md' })
      }
      current += req.agentIds.length
      continue
    }

    for (const agentId of req.agentIds) {
      current++
      const agentDir = resolveAgentDir(agentId)
      const agentName = agentDisplayName(agentId)
      if (!agentDir) {
        outcome.errors.push({ skillId, agentId, reason: '无法解析该 agent 的技能目录' })
        report({ message: `跳过 ${agentName}` })
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
        report({ skillId, skillName: skill.name, agentId, agentName, message: `共享目录 ${agentDir}` })
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
            outcome.skipped.push({
              skillId,
              agentId,
              reason: `目标已存在且不是 SkillHub 管理的技能：${target}`
            })
            report({ message: `冲突：${target}` })
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
          symlinkSync(source, target, 'dir')
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
          message: `已安装 ${skill.name} → ${agentName}`
        })
      } catch (err: any) {
        outcome.errors.push({ skillId, agentId, reason: err?.message || String(err) })
        report({ message: `安装失败 ${skill.name} → ${agentName}: ${err?.message || err}` })
      }
    }
  }

  onProgress?.({
    phase: 'done',
    message: `完成：成功 ${outcome.ok.length}，跳过 ${outcome.skipped.length}，失败 ${outcome.errors.length}`,
    current: total,
    total,
    ok: outcome.errors.length === 0
  })
  if (outcome.ok.length) {
    logActivity(
      'install',
      `安装 ${outcome.ok.length} 项技能`,
      [...new Set(outcome.ok.map((r) => r.agentName))].join('、')
    )
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
  logActivity('uninstall', `卸载 ${rec.skillName}`, rec.agentName)
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
  const dir = p.slice(0, p.lastIndexOf('/'))
  if (!dir) return false
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

export function totalSkillsOnDisk(): number {
  const dirs = new Set<string>()
  for (const item of library.get().items) {
    for (const s of item.skills) if (s.localPath) dirs.add(s.localPath)
  }
  let n = 0
  for (const d of dirs) {
    try {
      if (existsSync(d) && readdirSync(d).length) n++
    } catch {
      /* ignore */
    }
  }
  return n
}

export function readMarker(p: string): any | null {
  try {
    return JSON.parse(readFileSync(join(p, MARKER), 'utf8'))
  } catch {
    return null
  }
}
