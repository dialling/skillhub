import { translate } from './i18n'
import type {
  AgentTarget,
  ActivityEvent,
  CuratedCatalog,
  DiskStats,
  GrowthRow,
  InstallProgress,
  InstallRecord,
  JobProgress,
  InstallTargetAdvice,
  LaunchPlan,
  LaunchTarget,
  LibraryItem,
  LocalSkill,
  RateLimit,
  RepoMeta,
  Scenario,
  SearchResult,
  Settings,
  SkillEntry,
  GitHubUser
} from '@shared/types'

declare global {
  interface Window {
    skillhub: SkillHubApi
  }
}

export interface SkillHubApi {
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
    flush(): Promise<boolean>
  }
  github: {
    status(): Promise<{ tokenSource: string; hasToken: boolean; rate: RateLimit; user: GitHubUser | null }>
    rate(force?: boolean): Promise<RateLimit>
    login(token: string): Promise<GitHubUser>
    loginWithCli(): Promise<GitHubUser>
    logout(): Promise<boolean>
    user(login: string): Promise<GitHubUser>
    search(q: string, opts?: { page?: number; perPage?: number }): Promise<SearchResult>
    searchRaw(q: string, opts?: any): Promise<SearchResult>
    repoDetail(
      fullName: string,
      opts?: { withSkills?: boolean; withReadme?: boolean }
    ): Promise<{ meta: RepoMeta; skills: SkillEntry[]; readme: string | null }>
    skillFile(fullName: string, branch: string, path: string): Promise<string>
  }
  catalog: {
    curated(): Promise<{ repos: RepoMeta[]; generatedAt: string | null }>
    sections(): Promise<{ featured: RepoMeta[]; byCategory: Record<string, RepoMeta[]>; top: RepoMeta[] }>
    byFunction(): Promise<Record<string, RepoMeta[]>>
    scenarios(): Promise<Scenario[]>
    scenarioRepos(id: string): Promise<RepoMeta[]>
    refresh(limit?: number): Promise<{ updated: number; failed: number }>
  }
  library: {
    list(): Promise<LibraryItem[]>
    get(id: string): Promise<LibraryItem | null>
    add(fullName: string): Promise<LibraryItem>
    addLocal(dir: string): Promise<LibraryItem>
    sync(id: string): Promise<LibraryItem>
    remove(id: string, deleteFiles?: boolean): Promise<{ removedInstalls: number }>
    readme(id: string): Promise<string>
  }
  agents: {
    list(): Promise<AgentTarget[]>
    active(): Promise<AgentTarget[]>
    project(dir: string): Promise<AgentTarget[]>
    scan(agentId: string): Promise<
      { name: string; path: string; isSymlink: boolean; linkTarget?: string; managed: boolean; hasSkillFile: boolean; mtimeMs: number }[]
    >
    resolveDir(agentId: string): Promise<string | null>
    toggle(agentId: string, enabled: boolean): Promise<AgentTarget[]>
    setEnabled(ids: string[]): Promise<AgentTarget[]>
    addCustom(name: string, path: string): Promise<AgentTarget[]>
    removeCustom(id: string): Promise<AgentTarget[]>
    removeRaw(p: string): Promise<boolean>
    reveal(p: string): Promise<boolean>
  }
  install: {
    run(req: { skillIds: string[]; agentIds: string[]; mode?: 'symlink' | 'copy' }): Promise<{
      ok: InstallRecord[]
      skipped: { skillId: string; agentId: string; reason: string }[]
      errors: { skillId: string; agentId: string; reason: string }[]
    }>
    uninstall(skillId: string, agentId: string): Promise<boolean>
    uninstallAll(skillId: string): Promise<number>
    records(): Promise<InstallRecord[]>
    map(): Promise<Record<string, string[]>>
    list(): Promise<
      {
        skillId: string
        skillName: string
        repoFullName: string
        agentId: string
        agentName: string
        path: string
        mode: 'symlink' | 'copy'
        installedAt: number
        exists: boolean
      }[]
    >
    managedByAgent(): Promise<Record<string, number>>
  }
  board: {
    growth(days: 1 | 7 | 30, limit?: number, useApi?: boolean, apiBudget?: number): Promise<GrowthRow[]>
    top(limit?: number): Promise<RepoMeta[]>
    coverage(): Promise<{ repos: number; days: number }>
    growthOne(
      fullName: string,
      days: 1 | 7 | 30
    ): Promise<{ gained: number; source: string; approx: boolean; coveredHours: number }>
  }
  profile: {
    stats(): Promise<DiskStats>
    activity(): Promise<ActivityEvent[]>
    refresh(): Promise<GitHubUser | null>
    starred(): Promise<{ fullName: string; stars: number; avatarUrl?: string; descriptionEn?: string }[]>
  }
  launch: {
    targets(): Promise<LaunchTarget[]>
    prepare(req: {
      skillId?: string
      localPath?: string
      localName?: string
      localDescription?: string
      agentId: string
      workspace: string
    }): Promise<LaunchPlan>
    run(plan: LaunchPlan): Promise<{ ok: boolean; message: string }>
    locations(skillName: string): Promise<string[]>
  }
  discover: {
    localSkills(): Promise<LocalSkill[]>
    audit(): Promise<
      { agentId: string; agentName: string; path: string; exists: boolean; skills: number; managed: number; brokenLinks: number }[]
    >
    installTarget(): Promise<InstallTargetAdvice>
    setInstallTarget(path: string): Promise<InstallTargetAdvice>
    adopt(repoFullName: string): Promise<unknown>
  }
  system: {
    boot(): Promise<{
      platform: string
      initialView: string | null
      initialRepo: string | null
      initialQuery: string | null
      argv: string[]
    }>
    stats(): Promise<Record<string, any>>
    pickDirectory(): Promise<string | null>
    openPath(p: string): Promise<boolean>
    openExternal(url: string): Promise<boolean>
    checkPaths(paths: string[]): Promise<{ path: string; abs: string; exists: boolean; isDir: boolean }[]>
    parseSkill(text: string): Promise<any>
    agentName(id: string): Promise<string>
    rebuildMenu(): Promise<boolean>
  }
  on(channel: string, cb: (payload: any) => void): () => void
}

export const api: SkillHubApi = window.skillhub

export type { InstallProgress, JobProgress }

export function fmtStars(n: number | undefined | null): string {
  const v = n || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(v)
}

export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function fmtRelative(ts: number, lang: 'zh' | 'en' = 'zh'): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return translate(lang, 'time.justNow')
  if (min < 60) return translate(lang, 'time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return translate(lang, 'time.hoursAgo', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 30) return translate(lang, 'time.daysAgo', { n: day })
  return translate(lang, 'time.monthsAgo', { n: Math.floor(day / 30) })
}

/** Deterministic colour pair derived from a repo name, for capsule art. */
/** Stable hue for a repository name — the same seed always gets the same colour. */
export function hueFor(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

export function gradientFor(seed: string): [string, string] {
  const a = hueFor(seed)
  const b = (a + 58) % 360
  return [`hsl(${a} 72% 46%)`, `hsl(${b} 68% 32%)`]
}

/**
 * The same gradient at a given alpha, for tinting a surface instead of filling
 * it. Returned in the same `hsl(...)` form as gradientFor so callers never have
 * to parse one colour format into another — an earlier tint helper assumed hex
 * and silently produced black for every repository.
 */
export function gradientTint(seed: string, alpha: number): [string, string] {
  const a = hueFor(seed)
  const b = (a + 58) % 360
  return [`hsl(${a} 72% 46% / ${alpha})`, `hsl(${b} 68% 32% / ${alpha})`]
}
