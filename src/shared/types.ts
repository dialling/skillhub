/**
 * Shared type contracts between the Electron main process and the renderer.
 */

export type Category = 'spec' | 'official' | 'collection' | 'tooling' | 'framework' | 'domain'

export const CATEGORY_LABELS: Record<Category, { zh: string; en: string }> = {
  spec: { zh: '规范标准', en: 'Spec' },
  official: { zh: '官方出品', en: 'Official' },
  collection: { zh: '技能合集', en: 'Collection' },
  tooling: { zh: '管理工具', en: 'Tooling' },
  framework: { zh: '方法论框架', en: 'Framework' },
  domain: { zh: '垂直领域', en: 'Domain' }
}

/** A GitHub repository that can act as a skill source (or a tooling repo). */
export interface RepoMeta {
  fullName: string
  owner: string
  name: string
  descriptionEn: string
  descriptionZh?: string
  stars: number
  forks?: number
  openIssues?: number
  topics: string[]
  category?: Category
  license?: string | null
  homepage?: string | null
  avatarUrl?: string
  defaultBranch?: string
  pushedAt?: string
  archived?: boolean
  htmlUrl: string
  skillDirs?: string[]
  skillCount?: number
  truncatedTree?: boolean
  installHint?: string
}

/** A single installable skill = one directory containing SKILL.md. */
export interface SkillEntry {
  /** stable id: owner/repo::path */
  id: string
  repoFullName: string
  /** '' for repo root, otherwise 'skills/pdf' */
  path: string
  /** folder basename, i.e. the skill name */
  name: string
  title: string
  descriptionEn?: string
  descriptionZh?: string
  tags: string[]
  license?: string | null
  source: 'github' | 'local'
  repoStars?: number
  repoAvatarUrl?: string
  /** absolute path inside the local library checkout, when materialized */
  localPath?: string
  /** whether the skill folder currently exists on disk */
  available?: boolean
}

export type LibraryStatus = 'pending' | 'downloading' | 'ready' | 'error'

/** An item the user has "入库" (added to their local library). */
export interface LibraryItem {
  id: string
  fullName: string
  addedAt: number
  updatedAt: number
  lastSyncAt?: number
  status: LibraryStatus
  error?: string
  /** absolute path of the git checkout (or the local source dir) */
  sourcePath: string
  local?: boolean
  branch?: string
  meta: RepoMeta
  skills: SkillEntry[]
}

export type AgentKind = 'global' | 'project' | 'custom'

export interface AgentTarget {
  id: string
  name: string
  vendor?: string
  kind: AgentKind
  /** skills directory; may contain a leading ~ */
  path: string
  detected: boolean
  detectedBy?: 'dir' | 'config' | 'binary' | 'manual'
  enabled: boolean
  /** how many skills were found in this directory */
  found?: number
  /** how many of them were installed by SkillHub */
  managed?: number
  color?: string
  /** how confident we are that the documented path is correct */
  confidence?: 'high' | 'medium' | 'low'
  /** vendor documentation the path was read from */
  sourceUrl?: string
  readsUniversalDir?: boolean
  supportsSymlink?: boolean
  /** the agent documents only a project-level skills directory */
  projectOnly?: boolean
}

export type InstallMode = 'symlink' | 'copy'

export interface InstallRecord {
  id: string
  skillId: string
  skillName: string
  repoFullName: string
  agentId: string
  agentName: string
  /** the agent skills directory */
  targetDir: string
  /** the exact path created (targetDir/skillName) */
  linkPath: string
  mode: InstallMode
  installedAt: number
  /** the SkillHub-owned source directory that was linked/copied */
  sourcePath: string
}

export interface StarSnapshot {
  /** YYYY-MM-DD */
  date: string
  stars: number
}

export interface GrowthRow {
  fullName: string
  name: string
  owner: string
  avatarUrl?: string
  stars: number
  gained: number
  days: number
  /** gained / days */
  perDay: number
  source: 'stargazers-api' | 'snapshot' | 'events-api' | 'unavailable'
  /** true when the underlying window was shorter than requested (hot repo) */
  approx?: boolean
  /** how much of the requested window the measurement actually covers */
  coveredHours?: number
  descriptionZh?: string
  descriptionEn?: string
  category?: Category
}

export interface GitHubUser {
  login: string
  name?: string | null
  avatarUrl: string
  htmlUrl: string
  bio?: string | null
  company?: string | null
  location?: string | null
  publicRepos?: number
  followers?: number
  following?: number
}

export interface RateLimit {
  limit: number
  remaining: number
  used: number
  reset: number
  searchLimit: number
  searchRemaining: number
  searchReset: number
  ok: boolean
  login?: string | null
  checkedAt: number
  error?: string
}

export interface TranslationConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  lang: 'zh' | 'en'
  libraryDir: string
  installMode: InstallMode
  token: string
  user: GitHubUser | null
  translation: TranslationConfig
  enabledAgents: string[]
  customAgents: { id: string; name: string; path: string }[]
  projectDir: string | null
  curatedUpdatedAt?: number
  firstRunDone?: boolean
}

export interface SearchResult {
  repos: RepoMeta[]
  total: number
  incomplete: boolean
  query: string
  source: 'github' | 'curated'
  elapsedMs: number
}

export interface SkillSearchHit {
  skill: SkillEntry
  repo: RepoMeta
}

export interface InstallRequest {
  skillIds: string[]
  agentIds: string[]
  mode?: InstallMode
}

export interface InstallProgress {
  phase: 'start' | 'link' | 'done' | 'error'
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  message: string
  current: number
  total: number
  ok?: boolean
}

export interface JobProgress {
  job: 'clone' | 'sync' | 'search' | 'translate' | 'growth'
  id?: string
  phase: 'start' | 'progress' | 'done' | 'error'
  message: string
  percent?: number
}

export interface DiskStats {
  libraryDir: string
  libraryBytes: number
  libraryItems: number
  installedSkills: number
  agents: number
  skillsOnDisk: number
}

export interface ActivityEvent {
  id: string
  at: number
  kind: 'add' | 'install' | 'uninstall' | 'remove' | 'sync' | 'settings'
  title: string
  detail?: string
}

export interface CuratedCatalog {
  generatedAt: string
  source: string
  repos: RepoMeta[]
}
