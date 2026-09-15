import { create } from 'zustand'
import { api } from './api'
import type {
  AgentTarget,
  InstallTargetAdvice,
  LaunchPlan,
  LaunchSource,
  LaunchTarget,
  LocalSkill,
  Scenario,
  GrowthRow,
  InstallProgress,
  JobProgress,
  LibraryItem,
  RateLimit,
  RepoMeta,
  SearchResult,
  Settings,
  SkillEntry,
  SkillIndexEntry,
  SubmissionRecord
} from '@shared/types'
import { makeT, type Lang } from './i18n'
import { applyTheme } from './theme'

export type ViewKey = 'store' | 'library' | 'charts' | 'agents' | 'profile' | 'settings'

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error'
  message: string
  detail?: string
}

export interface DetailState {
  fullName: string
  loading: boolean
  meta: RepoMeta | null
  skills: SkillEntry[]
  readme: string
  error?: string
  tab: 'overview' | 'skills' | 'readme'
}

interface State {
  booted: boolean
  settings: Settings | null
  rate: RateLimit | null
  tokenSource: string
  refreshing: boolean
  platform: string
  library: LibraryItem[]
  agents: AgentTarget[]
  installMap: Record<string, string[]>
  view: ViewKey
  detail: DetailState | null
  query: string
  search: SearchResult | null
  searching: boolean
  catalogRepos: RepoMeta[]
  catalogAt: string | null
  growth: GrowthRow[] | null
  trending: GrowthRow[] | null
  trendingLoading: boolean
  growthWindow: 1 | 7 | 30
  growthLoading: boolean
  toasts: Toast[]
  job: JobProgress | null
  installProgress: InstallProgress | null
  paletteOpen: boolean
  showAddLocal: boolean
  sidebarOpen: boolean
  lang: Lang
  storeCategory: string | null
  /** the store browses repositories or the individual skills inside them */
  storeMode: 'repos' | 'skills'
  skillIndexInfo: { updatedAt: string; total: number; shards: Record<string, { count: number; bytes: number }> } | null
  skillShards: Record<string, SkillIndexEntry[]>
  skillShardLoading: string | null
  skillQuery: string
  skillHits: SkillIndexEntry[] | null
  /** full names the signed-in user has starred on GitHub */
  starred: string[]
  starredLoaded: boolean
  starring: string | null
  submissions: SubmissionRecord[]
  submitting: string | null
  scenarios: Scenario[]
  activeScenario: string | null
  scenarioRepos: RepoMeta[]
  libraryFilter: 'all' | 'pending' | 'installed'
  libraryView: 'grid' | 'list'
  selectedLibraryId: string | null
  librarySort: 'recent' | 'stars' | 'name'
  chartMode: 'stars' | 'growth'
  discovered: LocalSkill[]
  discovering: boolean
  installTarget: InstallTargetAdvice | null
  showTargetModal: boolean
  launchTargets: LaunchTarget[]
  launchSource: LaunchSource | null
  launchPlan: LaunchPlan | null
  showLaunchModal: boolean
  launching: boolean

  t: (key: string, vars?: Record<string, string | number | undefined>) => string
  setChartMode: (m: 'stars' | 'growth') => void
  scanLocal: () => Promise<void>
  loadInstallTarget: () => Promise<void>
  applyInstallTarget: (path: string) => Promise<void>
  setShowTargetModal: (open: boolean) => void
  markSeen: (view: 'library' | 'agents') => Promise<void>
  openLaunch: (source: LaunchSource) => Promise<void>
  closeLaunch: () => void
  buildLaunchPlan: (agentId: string, workspace: string) => Promise<LaunchPlan | null>
  runLaunch: (plan: LaunchPlan) => Promise<void>
  loadScenarios: () => Promise<void>
  openScenario: (id: string | null) => Promise<void>
  goToScenarios: () => void
  setStoreCategory: (c: string | null) => void
  setStoreMode: (m: 'repos' | 'skills') => void
  loadSkillIndex: () => Promise<void>
  loadSkillShard: (fn: string) => Promise<void>
  searchSkillIndex: (term: string) => Promise<void>
  setSkillQuery: (q: string) => void
  loadStarred: (force?: boolean) => Promise<void>
  toggleStar: (fullName: string) => Promise<void>
  loadSubmissions: () => Promise<void>
  submitSkill: (input: { localPath: string; name: string; origin?: string }) => Promise<void>
  setLibraryFilter: (f: 'all' | 'pending' | 'installed') => void
  setLibraryView: (v: 'grid' | 'list') => void
  setSelectedLibrary: (id: string) => void
  setLibrarySort: (s: 'recent' | 'stars' | 'name') => void
  boot: () => Promise<void>
  setView: (v: ViewKey) => void
  setLang: (l: Lang) => void
  toggleLang: () => Promise<void>
  toast: (kind: Toast['kind'], message: string, detail?: string) => void
  dismissToast: (id: string) => void
  runSearch: (q: string) => Promise<void>
  clearSearch: () => void
  openDetail: (fullName: string) => Promise<void>
  closeDetail: () => void
  setDetailTab: (tab: DetailState['tab']) => void
  refreshLibrary: () => Promise<void>
  refreshAgents: () => Promise<void>
  refreshInstalls: () => Promise<void>
  refreshRate: (force?: boolean) => Promise<void>
  refreshAll: () => Promise<void>
  loadCatalog: () => Promise<void>
  loadGrowth: (days?: 1 | 7 | 30, useApi?: boolean) => Promise<void>
  loadTrending: (days?: 1 | 7 | 30) => Promise<void>
  addToLibrary: (fullName: string, silent?: boolean) => Promise<LibraryItem | null>
  removeFromLibrary: (id: string, deleteFiles: boolean) => Promise<void>
  syncLibraryItem: (id: string) => Promise<void>
  install: (skillIds: string[], agentIds: string[], mode?: 'symlink' | 'copy') => Promise<boolean>
  uninstall: (skillId: string, agentId: string) => Promise<void>
  uninstallAll: (skillId: string) => Promise<void>
  toggleAgent: (id: string, enabled: boolean) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  setPalette: (open: boolean) => void
  setAddLocal: (open: boolean) => void
  toggleSidebar: () => void
}

export const useStore = create<State>((set, get) => ({
  booted: false,
  settings: null,
  rate: null,
  tokenSource: 'none',
  refreshing: false,
  platform: 'darwin',
  library: [],
  agents: [],
  installMap: {},
  view: 'store',
  detail: null,
  query: '',
  search: null,
  searching: false,
  catalogRepos: [],
  catalogAt: null,
  growth: null,
  trending: null,
  trendingLoading: false,
  growthWindow: 7,
  growthLoading: false,
  toasts: [],
  job: null,
  installProgress: null,
  paletteOpen: false,
  showAddLocal: false,
  sidebarOpen: true,
  lang: 'zh',
  storeCategory: null,
  storeMode: 'repos',
  skillIndexInfo: null,
  skillShards: {},
  skillShardLoading: null,
  skillQuery: '',
  skillHits: null,
  starred: [],
  starredLoaded: false,
  starring: null,
  submissions: [],
  submitting: null,
  scenarios: [],
  activeScenario: null,
  scenarioRepos: [],
  libraryFilter: 'all',
  libraryView: 'grid',
  selectedLibraryId: null,
  librarySort: 'recent',
  chartMode: 'growth',
  discovered: [],
  discovering: false,
  installTarget: null,
  showTargetModal: false,
  launchTargets: [],
  launchSource: null,
  launchPlan: null,
  showLaunchModal: false,
  launching: false,

  t: makeT('zh'),

  setChartMode(m) {
    set({ chartMode: m })
  },

  /** Find skills that are already on this machine and match them to the store. */
  async scanLocal() {
    set({ discovering: true })
    try {
      const discovered = await api.discover.localSkills()
      set({ discovered })
    } catch {
      /* scanning is advisory */
    } finally {
      set({ discovering: false })
    }
  },

  async loadInstallTarget() {
    try {
      const installTarget = await api.discover.installTarget()
      set({ installTarget })
    } catch {
      /* ignore */
    }
  },

  async applyInstallTarget(path) {
    const installTarget = await api.discover.setInstallTarget(path)
    const settings = await api.settings.get()
    set({ installTarget, settings, showTargetModal: false })
    get().toast('success', get().t('target.saved', { path: installTarget.path }))
  },

  setShowTargetModal(open) {
    set({ showTargetModal: open })
  },

  /**
   * Clear the unread badge for a nav item. The markers live in settings rather
   * than in component state so they survive a restart.
   */
  async markSeen(view) {
    const patch =
      view === 'library'
        ? { seenLibraryAt: Date.now() }
        : { seenAgents: get().agents.filter((a) => a.detected).map((a) => a.id) }
    try {
      await api.settings.update(patch)
      const settings = await api.settings.get()
      set({ settings })
    } catch {
      /* the badge is cosmetic; a failed write must not break navigation */
    }
  },

  /** Open the launch dialog for a skill — library-managed or found on disk. */
  async openLaunch(source) {
    try {
      const launchTargets = await api.launch.targets()
      set({ launchTargets, launchSource: source, launchPlan: null, showLaunchModal: true })
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    }
  },

  closeLaunch() {
    set({ showLaunchModal: false, launchSource: null, launchPlan: null })
  },

  /**
   * Lay the workspace out before anything is started, so the dialog can show
   * exactly what will be created instead of surprising the user afterwards.
   */
  async buildLaunchPlan(agentId, workspace) {
    const source = get().launchSource
    if (!source || !workspace.trim()) return null
    try {
      const launchPlan = await api.launch.prepare({
        ...(source.from === 'library'
          ? { skillId: source.skillId }
          : { localPath: source.path, localName: source.name, localDescription: source.description }),
        agentId,
        workspace: workspace.trim()
      })
      set({ launchPlan })
      return launchPlan
    } catch (err: any) {
      set({ launchPlan: null })
      get().toast('error', err?.message || String(err))
      return null
    }
  },

  async runLaunch(plan) {
    set({ launching: true })
    try {
      const res = await api.launch.run(plan)
      if (res.ok) {
        get().toast('success', res.message, plan.workspace)
        set({ showLaunchModal: false, launchPlan: null, launchSource: null })
      } else {
        get().toast('error', res.message)
      }
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      set({ launching: false })
    }
  },

  async loadScenarios() {
    try {
      const scenarios = await api.catalog.scenarios()
      set({ scenarios })
    } catch {
      /* scenarios are optional chrome */
    }
  },

  async openScenario(id) {
    if (!id) {
      set({ activeScenario: null, scenarioRepos: [], storeCategory: null })
      return
    }
    set({ activeScenario: id, storeCategory: null, view: 'store' })
    try {
      const scenarioRepos = await api.catalog.scenarioRepos(id)
      if (get().activeScenario === id) set({ scenarioRepos })
    } catch {
      set({ scenarioRepos: [] })
    }
  },

  setStoreMode(m) {
    set({ storeMode: m })
    if (m === 'skills' && !get().skillIndexInfo) void get().loadSkillIndex()
  },

  async loadSkillIndex() {
    try {
      const info = await api.skillsIndex.index()
      set({ skillIndexInfo: info })
    } catch {
      /* the skill index is additive; the repo store still works without it */
    }
  },

  /** One category of skills, fetched once and kept. */
  async loadSkillShard(fn) {
    if (get().skillShards[fn]?.length) return
    set({ skillShardLoading: fn })
    try {
      const list = await api.skillsIndex.shard(fn)
      set({ skillShards: { ...get().skillShards, [fn]: list } })
    } catch {
      set({ skillShards: { ...get().skillShards, [fn]: [] } })
    } finally {
      set({ skillShardLoading: null })
    }
  },

  /**
   * The user's starred repositories, read once.
   *
   * Starring status could be asked per card, but that is one request for every
   * repository on screen. The whole list is a handful of requests and then
   * answers instantly everywhere, which is also the only way the state can be
   * consistent across cards at the same moment.
   */
  async loadStarred(force = false) {
    const s = get()
    if (!s.settings?.user) {
      set({ starred: [], starredLoaded: true })
      return
    }
    if (!force && s.starredLoaded && s.starred.length) return
    try {
      const starred = await api.star.list(force)
      set({ starred, starredLoaded: true })
    } catch {
      set({ starredLoaded: true })
    }
  },

  async loadSubmissions() {
    try {
      set({ submissions: await api.submit.list() })
    } catch {
      /* the submissions list is informational */
    }
  },

  /**
   * Send a local skill to the repository for review.
   *
   * It deliberately does not go into the store: an entry needs a hand-written
   * bilingual tagline, use-case and long description, and this skill has none of
   * those yet. Uploading puts it somewhere the copy can be written later.
   */
  async submitSkill(input) {
    set({ submitting: input.name })
    try {
      const res = await api.submit.skill(input)
      get().toast(res.ok ? 'success' : 'error', res.message)
      if (res.ok) await get().loadSubmissions()
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      set({ submitting: null })
    }
  },

  async toggleStar(fullName) {
    if (!get().settings?.user) {
      get().toast('info', get().t('star.signInFirst'))
      return
    }
    const on = !get().starred.includes(fullName)
    set({ starring: fullName })
    try {
      const res = await api.star.set(fullName, on)
      if (res.scopeProblem) {
        get().toast('error', get().t('star.scopeProblem'))
        return
      }
      set({
        starred: on ? [...get().starred, fullName] : get().starred.filter((n) => n !== fullName)
      })
      // The count moved on GitHub; move it here too so the card agrees with the
      // account instead of waiting for the next scheduled refresh.
      set({
        catalogRepos: get().catalogRepos.map((r) =>
          r.fullName === fullName ? { ...r, stars: Math.max(0, (r.stars || 0) + (on ? 1 : -1)) } : r
        )
      })
      get().toast('success', on ? get().t('star.starred') : get().t('star.unstarred'))
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      set({ starring: null })
    }
  },

  setSkillQuery(q) {
    set({ skillQuery: q })
    if (!q.trim()) set({ skillHits: null })
  },

  async searchSkillIndex(term) {
    if (!term.trim()) {
      set({ skillHits: null })
      return
    }
    try {
      const hits = await api.skillsIndex.search(term, 80)
      set({ skillHits: hits })
    } catch {
      set({ skillHits: [] })
    }
  },

  setStoreCategory(c) {
    set({ storeCategory: c, activeScenario: null, scenarioRepos: [] })
  },
  setLibraryFilter(f) {
    set({ libraryFilter: f })
  },
  setLibraryView(v) {
    set({ libraryView: v })
  },
  setSelectedLibrary(id) {
    set({ selectedLibraryId: id })
  },
  setLibrarySort(s) {
    set({ librarySort: s })
  },

  async boot() {
    const settings = await api.settings.get()
    const lang = settings.lang || 'zh'
    set({ settings, lang, t: makeT(lang), sidebarOpen: settings.sidebarOpen !== false })
    applyTheme(settings.theme)
    await Promise.all([
      get().refreshLibrary(),
      get().refreshAgents(),
      get().refreshInstalls(),
      get().refreshRate(),
      get().loadCatalog(),
      get().loadScenarios(),
      get().loadInstallTarget()
    ])
    void get().scanLocal()
    void get().loadStarred()
    void get().loadSubmissions()
    // Record what already exists so nothing pre-existing badges as "new" —
    // only what shows up after this point does.
    const seen = await api.settings.get()
    if (seen.seenLibraryAt === undefined || seen.seenAgents === undefined) {
      const patch: Record<string, unknown> = {}
      if (seen.seenLibraryAt === undefined) patch.seenLibraryAt = Date.now()
      if (seen.seenAgents === undefined) {
        patch.seenAgents = get().agents.filter((a) => a.detected).map((a) => a.id)
      }
      try {
        await api.settings.update(patch)
        set({ settings: await api.settings.get() })
      } catch {
        /* cosmetic */
      }
    }
    // Deep links: `skillhub --view=charts --repo=owner/name --q="term"`
    try {
      const boot = await api.system.boot()
      set({ platform: boot.platform })
      document.documentElement.dataset.platform = boot.platform
      const views: ViewKey[] = ['store', 'library', 'charts', 'agents', 'profile', 'settings']
      if (boot.initialView && views.includes(boot.initialView as ViewKey)) {
        set({ view: boot.initialView as ViewKey })
      }
      if (boot.initialQuery) await get().runSearch(boot.initialQuery)
      if (boot.initialRepo) {
        set({ view: 'store' })
        await get().openDetail(boot.initialRepo)
      }
    } catch {
      /* deep links are optional */
    }
    set({ booted: true })
  },

  setView(v) {
    set({ view: v, detail: v === 'store' ? get().detail : null })
  },

  setLang(l) {
    set({ lang: l, t: makeT(l) })
  },

  async toggleLang() {
    const next: Lang = get().lang === 'zh' ? 'en' : 'zh'
    set({ lang: next, t: makeT(next) })
    await api.settings.update({ lang: next })
    // The native application menu is built in the main process.
    await api.system.rebuildMenu().catch(() => {})
  },

  toast(kind, message, detail) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set({ toasts: [...get().toasts, { id, kind, message, detail }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3600)
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  async runSearch(q) {
    const term = q.trim()
    set({ query: q })
    if (!term) {
      set({ search: null, searching: false })
      return
    }
    set({ searching: true })
    try {
      const res = await api.github.search(term, { perPage: 40 })
      if (get().query.trim() === term) set({ search: res })
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      set({ searching: false })
    }
  },

  clearSearch() {
    set({ query: '', search: null })
  },

  async openDetail(fullName) {
    // Paint from the bundled catalog immediately — it already has the tagline,
    // use-case, category and skill paths — then replace it with live data when
    // the network round-trip lands. Otherwise a 124-skill repo shows a spinner
    // for seconds before anything appears.
    const seeded = get().catalogRepos.find((r) => r.fullName === fullName)
    const localItem = get().library.find((i) => i.fullName === fullName)
    set({
      detail: {
        fullName,
        loading: !seeded,
        meta: seeded || null,
        skills: localItem?.skills?.length ? localItem.skills : [],
        readme: '',
        tab: 'overview'
      }
    })
    // The fetch outlives the panel whenever the user closes it (or opens a
    // different repo) before the network answers. Writing the result back
    // unconditionally would resurrect a closed panel — the "it pops back in
    // after I hit back" bug — or paint the wrong repository. So the response is
    // only applied to the detail it was requested for.
    const stillCurrent = (): boolean => get().detail?.fullName === fullName
    try {
      const res = await api.github.repoDetail(fullName, { withSkills: true, withReadme: true })
      if (!stillCurrent()) return
      const libItem = get().library.find((i) => i.fullName === fullName)
      const skills = libItem && libItem.skills.length ? libItem.skills : res.skills
      set({
        detail: {
          fullName,
          loading: false,
          meta: res.meta,
          skills,
          readme: res.readme || '',
          // keep whichever tab the user has since switched to
          tab: get().detail?.tab ?? 'overview'
        }
      })
    } catch (err: any) {
      if (!stillCurrent()) return
      set({
        detail: {
          fullName,
          loading: false,
          meta: get().detail?.meta ?? null,
          skills: get().detail?.skills ?? [],
          readme: '',
          error: err?.message || String(err),
          tab: get().detail?.tab ?? 'overview'
        }
      })
    }
  },

  closeDetail() {
    set({ detail: null })
  },

  setDetailTab(tab) {
    const d = get().detail
    if (d) set({ detail: { ...d, tab } })
  },

  async refreshLibrary() {
    const library = await api.library.list()
    const selected = get().selectedLibraryId
    const stillThere = selected && library.some((i) => i.id === selected)
    set({ library, selectedLibraryId: stillThere ? selected : (library[0]?.id ?? null) })
  },

  async refreshAgents() {
    const agents = await api.agents.list()
    set({ agents })
  },

  async refreshInstalls() {
    const installMap = await api.install.map()
    set({ installMap })
  },

  /**
   * The refresh button. Pulls the shared star data and growth leaderboard from
   * this project's repository first — one request, no GitHub API budget — then
   * tops up the local rate-limit reading.
   */
  async refreshAll() {
    set({ refreshing: true })
    try {
      const live = await api.live.refresh()
      if (live.ok) {
        const rows = Object.values(live.growthRows).reduce((n, v) => n + v, 0)
        const settings = await api.settings.get()
        set({ settings })
        get().toast(
          'success',
          rows > 0
            ? get().t('toast.liveUpdated', { n: live.changed, rows })
            : get().t('toast.liveNoGrowth', { n: live.changed })
        )
        // star counts and the leaderboard both come from the published file
        void get().loadCatalog()
        if (get().view === 'charts') void get().loadGrowth(get().growthWindow, false)
      } else {
        get().toast('error', get().t('toast.liveFailed', { msg: live.error || live.source }))
      }
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      await get().refreshRate(true)
      set({ refreshing: false })
    }
  },

  async refreshRate(force = false) {
    try {
      const rate = await api.github.rate(force)
      set({ rate })
      // "settings" (a saved PAT) vs "gh-cli" (reused from the GitHub CLI) is
      // shown in Settings so the user knows where their credentials live.
      const status = await api.github.status().catch(() => null)
      if (status) set({ tokenSource: status.tokenSource })
      if (rate.ok && rate.login && get().settings && !get().settings!.user) {
        try {
          const user = await api.github.user(rate.login)
          set({ settings: { ...get().settings!, user } })
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  },

  async loadCatalog() {
    try {
      const { repos, generatedAt } = await api.catalog.curated()
      set({ catalogRepos: repos, catalogAt: generatedAt })
    } catch (err) {
      console.error(err)
    }
  },

  async loadGrowth(days, useApi = true) {
    const d = days ?? get().growthWindow
    set({ growthWindow: d, growthLoading: true })
    try {
      if (useApi) {
        // Two-phase: a shallow pass paints the table quickly (its results are
        // cached), then the deep pass fills in the long tail.
        const quick = await api.board.growth(d, 40, true, 10)
        if (get().growthWindow !== d) return
        set({ growth: quick, growthLoading: false })
      }
      const full = await api.board.growth(d, 40, useApi, useApi ? 90 : 0)
      if (get().growthWindow !== d) return
      set({ growth: full })
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      set({ growthLoading: false })
    }
  },

  /** A small, fast window for the Store's trending rail. */
  async loadTrending(days = 7) {
    set({ trendingLoading: true })
    try {
      const trending = await api.board.growth(days, 12, true, 12)
      set({ trending })
    } catch {
      /* the rail is decorative; failures are not worth a toast */
    } finally {
      set({ trendingLoading: false })
    }
  },

  async addToLibrary(fullName, silent) {
    const existing = get().library.find((i) => i.fullName === fullName)
    if (existing && existing.status === 'ready') {
      if (!silent) get().toast('info', get().t('card.inLibrary'))
      return existing
    }
    try {
      const item = await api.library.add(fullName)
      await get().refreshLibrary()
      if (item.status === 'error') {
        get().toast('error', item.error || 'error')
        return null
      }
      if (!silent) get().toast('success', get().t('toast.added', { name: fullName }))
      // First time round, show where new skills will actually land and let the
      // user redirect it before they install anything.
      if (!get().settings?.installRoot) {
        await get().loadInstallTarget()
        set({ showTargetModal: true })
      }
      return item
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
      return null
    } finally {
      set({ job: null })
    }
  },

  async removeFromLibrary(id, deleteFiles) {
    try {
      await api.library.remove(id, deleteFiles)
      await Promise.all([get().refreshLibrary(), get().refreshInstalls()])
      get().toast('success', get().t('toast.removed'))
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    }
  },

  async syncLibraryItem(id) {
    try {
      await api.library.sync(id)
      await get().refreshLibrary()
      get().toast('success', get().t('toast.synced'))
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
    } finally {
      set({ job: null })
    }
  },

  async install(skillIds, agentIds, mode) {
    if (!skillIds.length || !agentIds.length) {
      get().toast('info', get().t('detail.noneSelected'))
      return false
    }
    set({ installProgress: { phase: 'start', message: '', current: 0, total: skillIds.length * agentIds.length } })
    try {
      const res = await api.install.run({ skillIds, agentIds, mode })
      await Promise.all([get().refreshInstalls(), get().refreshAgents()])
      if (res.ok.length) {
        get().toast('success', get().t('toast.installed', { n: res.ok.length }))
      }
      if (res.errors.length) {
        get().toast('error', res.errors[0].reason, get().t('toast.nFailed', { n: res.errors.length }))
      }
      if (res.skipped.length && !res.errors.length) {
        get().toast('info', res.skipped[0].reason)
      }
      return res.ok.length > 0
    } catch (err: any) {
      get().toast('error', get().t('toast.failed', { msg: err?.message || err }))
      return false
    } finally {
      set({ installProgress: null })
    }
  },

  async uninstall(skillId, agentId) {
    await api.install.uninstall(skillId, agentId)
    await Promise.all([get().refreshInstalls(), get().refreshAgents()])
    get().toast('success', get().t('toast.uninstalled'))
  },

  async uninstallAll(skillId) {
    const n = await api.install.uninstallAll(skillId)
    await Promise.all([get().refreshInstalls(), get().refreshAgents()])
    get().toast('success', get().t('toast.uninstalled'), `${n}`)
  },

  async toggleAgent(id, enabled) {
    const agents = await api.agents.toggle(id, enabled)
    set({ agents })
  },

  async updateSettings(patch) {
    const settings = await api.settings.update(patch)
    set({ settings })
    if (patch.theme) applyTheme(patch.theme)
    if (patch.lang) {
      set({ lang: patch.lang, t: makeT(patch.lang) })
      await api.system.rebuildMenu().catch(() => {})
    }
    get().toast('success', get().t('toast.settingsSaved'))
  },

  setPalette(open) {
    set({ paletteOpen: open })
  },
  setAddLocal(open) {
    set({ showAddLocal: open })
  },
  toggleSidebar() {
    const sidebarOpen = !get().sidebarOpen
    set({ sidebarOpen })
    // Remember the choice so the app opens the way the user left it.
    void api.settings.update({ sidebarOpen })
  },

  /** The sidebar keeps a single "what do you want to do?" entry rather than
   *  listing all 13 scenarios, so it needs to land the user on the grid. */
  goToScenarios() {
    set({ view: 'store', activeScenario: null, scenarioRepos: [], storeCategory: null })
    window.setTimeout(() => {
      document.getElementById('store-scenarios')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  },
}))

// Wire main-process progress events into the store.
export function wireEvents(): void {
  api.on('job:progress', (p: JobProgress) => {
    useStore.setState({ job: p.phase === 'done' || p.phase === 'error' ? null : p })
  })
  api.on('install:progress', (p: InstallProgress) => {
    useStore.setState({ installProgress: p })
  })
}
