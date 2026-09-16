/**
 * Shared type contracts between the Electron main process and the renderer.
 */

/** Provenance label: who made it / what kind of repo it is (secondary axis). */
export type Category = 'spec' | 'official' | 'collection' | 'tooling' | 'framework' | 'domain' | 'community' | 'vendor'

export const CATEGORY_LABELS: Record<Category, { zh: string; en: string }> = {
  spec: { zh: '规范标准', en: 'Spec' },
  community: { zh: '社区', en: 'Community' },
  vendor: { zh: '厂商出品', en: 'Vendor' },
  official: { zh: '官方出品', en: 'Official' },
  collection: { zh: '技能合集', en: 'Collection' },
  tooling: { zh: '管理工具', en: 'Tooling' },
  framework: { zh: '方法论框架', en: 'Framework' },
  domain: { zh: '垂直领域', en: 'Domain' }
}

/**
 * Primary browse axis: what the user wants to DO, not what kind of repo it is.
 * Borrowed from how the strongest directories file their entries
 * ("Every tool is filed by primary function" — agentskillshub.top).
 */
export type FnCategory =
  | 'docs'
  | 'design'
  | 'coding'
  | 'research'
  | 'security'
  | 'cloud'
  | 'content'
  | 'tooling'
  | 'collections'
  | 'spec'

export const FN_LABELS: Record<FnCategory, { zh: string; en: string }> = {
  docs: { zh: '文档与办公', en: 'Documents & Office' },
  design: { zh: '设计与前端', en: 'Design & Frontend' },
  coding: { zh: '编程与开发', en: 'Coding' },
  research: { zh: '科研与数据', en: 'Research & Data' },
  security: { zh: '安全与合规', en: 'Security' },
  cloud: { zh: '云与自动化', en: 'Cloud & Automation' },
  content: { zh: '内容与创意', en: 'Content & Media' },
  tooling: { zh: '技能管理', en: 'Skill Tooling' },
  collections: { zh: '技能合集', en: 'Collections' },
  spec: { zh: '规范与标准', en: 'Specs' }
}

/**
 * A cross-cutting "what are you trying to do?" entry, the equivalent of the
 * scenario pages that answer "what's the best tool for X?".
 */
export interface Scenario {
  id: string
  titleZh: string
  titleEn: string
  descZh: string
  descEn: string
  /** repos pinned into this scenario */
  repos: string[]
  /** extra repos matched by these lowercase keywords in name/tagline/topics */
  keywords: string[]
}

/**
 * What a catalog entry actually is. Having a SKILL.md somewhere is not enough
 * to call a repository a skill source — applications ship one describing
 * themselves, and link lists ship none at all.
 */
export type RepoKind = 'skills' | 'software' | 'reference'

export const REPO_KIND_LABELS: Record<RepoKind, { zh: string; en: string }> = {
  skills: { zh: '技能包', en: 'Skills pack' },
  software: { zh: '软件项目', en: 'Software project' },
  reference: { zh: '不含技能', en: 'No skills' }
}

/** A GitHub repository that can act as a skill source (or a tooling repo). */
/**
 * Category labels, without the assumption that the value is known.
 *
 * A catalog is data, and data arrives from outside this build: a category added
 * to a published catalog but not to this enum used to make `CATEGORY_LABELS[x].zh`
 * throw, which took the entire window down to a blank page. An unrecognised
 * value is a missing label, not a crash.
 */
export function categoryLabel(cat: string | undefined, lang: 'zh' | 'en'): string | null {
  if (!cat) return null
  const entry = (CATEGORY_LABELS as Record<string, { zh: string; en: string }>)[cat]
  return entry ? entry[lang] : cat
}

/**
 * What is newer than this install.
 *
 * A key is present only when the remote copy is **strictly newer**. Absent means
 * "you are current", never "unknown, update anyway" — acting on an unknown or an
 * older version is the failure this shape is designed to make impossible.
 */
export interface UpdateInfo {
  current: string
  checkedAt: number
  available?: boolean
  app?: {
    latest: string
    url: string
    notes: string
    publishedAt: string
  }
  /** the bundled catalog needs a new build to change */
  catalog?: { current: number; latest: number }
  /** stars, growth and the skill index, published twice a day */
  data?: { current: number; latest: number }
}

/** A skill waiting in the repository's submissions area, not yet in the store. */
export interface SubmissionRecord {
  /** folder name under submissions/ */
  slug: string
  name: string
  /** the author's own one-line description, truncated for the manifest */
  description: string
  files: number
  bytes: number
  /** media or oversized files that were left out */
  skipped?: number
  /** where on the submitting machine it came from */
  origin: string
  at: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface SubmissionResult {
  ok: boolean
  uploaded: number
  slug?: string
  message: string
  /** suspicious patterns found in the uploaded text, e.g. "SKILL.md:12 pipeToShell" */
  flags?: string[]
}

/** One skill inside a catalog repository, as published by the extraction pass. */
export interface SkillIndexEntry {
  /** skill name, from the SKILL.md frontmatter */
  n: string
  /** the repository it lives in */
  r: string
  /** path within that repository */
  p: string
  /** one-line description from the frontmatter */
  d: string
  /** functional category, inherited from the repository */
  f: string
  /** repository stars, so the list can rank */
  s: number
  /**
   * The agent this skill is written for, when that is known.
   *
   * Absent means the skill is not specific to one agent — which is the honest
   * answer for most of them, and the reason this is optional rather than a
   * "universal" label nobody needs to read.
   */
  a?: string
}

/** Display names for the agents a skill can be tied to. */
export const AGENT_SKILL_LABELS: Record<string, { zh: string; en: string }> = {
  'claude-code': { zh: 'Claude Code 专用', en: 'Claude Code' },
  dsh: { zh: 'DeepSeek Harness 专用', en: 'DeepSeek Harness' },
  codex: { zh: 'Codex 专用', en: 'Codex' },
  cursor: { zh: 'Cursor 专用', en: 'Cursor' },
  copilot: { zh: 'Copilot 专用', en: 'Copilot' },
  'gemini-cli': { zh: 'Gemini CLI 专用', en: 'Gemini CLI' },
  windsurf: { zh: 'Windsurf 专用', en: 'Windsurf' },
  opencode: { zh: 'opencode 专用', en: 'opencode' },
  'roo-code': { zh: 'Roo Code 专用', en: 'Roo Code' },
  kiro: { zh: 'Kiro 专用', en: 'Kiro' },
  antigravity: { zh: 'Antigravity 专用', en: 'Antigravity' }
}

export interface SkillShardInfo {
  count: number
  bytes: number
}

export interface RepoMeta {
  fullName: string
  owner: string
  name: string
  descriptionEn: string
  descriptionZh?: string
  /** the store's primary browse axis: what you want to do */
  fn?: FnCategory
  /** whether this is a skill pack, an application, or reference material */
  repoKind?: RepoKind
  /**
   * Set when the repository states it targets exactly one agent — "My Codex
   * Skills", "marketing skills for Claude Code". Absent means it is not tied to
   * one, which is the common case.
   */
  agent?: string
  /**
   * Set on an application repository that calls itself a plugin for one agent —
   * "Best DeepSeek Harness Design Plugin". Its skills only work inside that
   * agent, so the store says so rather than leaving it to be discovered.
   */
  appAgent?: string
  /**
   * The application a `software` repository is, when it is not a plugin for one
   * agent. Its skills need that application installed and running.
   */
  appNeeds?: string
  /** evidence behind repoKind, kept so the classification is auditable */
  repoFacts?: {
    language: string | null
    markdown: number
    codeFiles: number
    srcFiles: number
    manifests: string[]
  }
  /** ≤30-char "one glance" line shown on the card */
  taglineZh?: string
  taglineEn?: string
  /** the situation that should make you reach for this */
  useWhen?: string
  useWhenEn?: string
  /** the older, longer repo-centric blurb, kept for the detail page */
  aboutZh?: string
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
  /** raw crawl count before de-duplication and scaffold removal, kept for audit */
  skillDirsAll?: number
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
  /** 'shared' = precomputed by the project's GitHub Action and published to data/live */
  source: 'stargazers-api' | 'snapshot' | 'events-api' | 'shared' | 'unavailable'
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

export interface Settings {
  lang: 'zh' | 'en'
  libraryDir: string
  token: string
  user: GitHubUser | null
  enabledAgents: string[]
  customAgents: { id: string; name: string; path: string }[]
  projectDir: string | null
  /** whether the contextual sidebar is expanded */
  sidebarOpen?: boolean
  /** interface colour scheme id (see src/renderer/src/theme.ts) */
  theme?: string
  /** the suggested destination shown in the picker; never decides an install */
  installRoot?: string
  curatedUpdatedAt?: number
  firstRunDone?: boolean
  /**
   * Unread markers for the left nav. `seenLibraryAt` is the moment the library
   * was last opened; a repository added after it counts as new. `seenAgents`
   * lists the agents already shown, so a newly installed tool is the only thing
   * that badges. Both are unset until the first boot records the state it
   * found, which stops an upgrade from badging everything at once.
   */
  seenLibraryAt?: number
  seenAgents?: string[]
  /**
   * When the shared star data was last pulled from this project's repository,
   * and when that data was published upstream. The app reports the age rather
   * than pretending a refresh happened.
   */
  liveUpdatedAt?: number
  liveDate?: string | null
  /** the update version the user chose to skip, so it stops being offered */
  dismissedUpdate?: string | null
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
  job: 'clone' | 'sync' | 'search' | 'growth'
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

/**
 * Activity entries store an i18n CODE plus parameters rather than a finished
 * sentence: they are persisted, so a translated string would freeze in whatever
 * language happened to be active when it was written.
 */
/** A skill folder already present on this machine, matched back to the catalog. */
export interface LocalSkill {
  name: string
  /** the folder name on disk, which is what the catalog index matches on */
  folder: string
  /** the path inside the agent directory (may be a symlink) */
  path: string
  /** what the symlink resolves to, or the same as `path` */
  realPath: string
  agentId: string
  agentName: string
  /** installed by SkillHub (symlink into the library, or carries our marker) */
  managed: boolean
  hasSkillFile: boolean
  description?: string
  /** the repo is already in the local library */
  inLibrary: boolean
  /** catalog repo this skill appears to come from */
  matchedRepo: string | null
  matchedSkillPath: string | null
}

export interface InstallTargetCandidate {
  path: string
  absPath: string
  label: string
  count: number
  exists: boolean
  agentId: string
}

export interface InstallTargetAdvice {
  path: string
  absPath: string
  /** why this location was chosen */
  reason: 'configured' | 'universal' | 'detected' | 'default'
  exists: boolean
  candidates: InstallTargetCandidate[]
}

export interface ActivityEvent {
  id: string
  at: number
  kind: 'add' | 'install' | 'uninstall' | 'remove' | 'sync' | 'settings'
  code: string
  params?: Record<string, string | number | undefined>
}

export interface CuratedCatalog {
  generatedAt: string
  source: string
  repos: RepoMeta[]
}
