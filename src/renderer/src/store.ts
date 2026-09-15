import { create } from 'zustand'
import { api } from './api'
import type {
  AgentTarget,
  Scenario,
  GrowthRow,
  InstallProgress,
  JobProgress,
  LibraryItem,
  RateLimit,
  RepoMeta,
  SearchResult,
  Settings,
  SkillEntry
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
  scenarios: Scenario[]
  activeScenario: string | null
  scenarioRepos: RepoMeta[]
  libraryFilter: 'all' | 'pending' | 'installed'
  librarySort: 'recent' | 'stars' | 'name'
  chartMode: 'stars' | 'growth'

  t: (key: string, vars?: Record<string, string | number | undefined>) => string
  setChartMode: (m: 'stars' | 'growth') => void
  loadScenarios: () => Promise<void>
  openScenario: (id: string | null) => Promise<void>
  goToScenarios: () => void
  setStoreCategory: (c: string | null) => void
  setLibraryFilter: (f: 'all' | 'pending' | 'installed') => void
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
  scenarios: [],
  activeScenario: null,
  scenarioRepos: [],
  libraryFilter: 'all',
  librarySort: 'recent',
  chartMode: 'growth',

  t: makeT('zh'),

  setChartMode(m) {
    set({ chartMode: m })
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

  setStoreCategory(c) {
    set({ storeCategory: c, activeScenario: null, scenarioRepos: [] })
  },
  setLibraryFilter(f) {
    set({ libraryFilter: f })
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
      get().loadScenarios()
    ])
    // Deep links: `skillhub --view=charts --repo=owner/name --q="term"`
    try {
      const boot = await api.system.boot()
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
    try {
      const res = await api.github.repoDetail(fullName, { withSkills: true, withReadme: true })
      const libItem = get().library.find((i) => i.fullName === fullName)
      const skills = libItem && libItem.skills.length ? libItem.skills : res.skills
      set({
        detail: {
          fullName,
          loading: false,
          meta: res.meta,
          skills,
          readme: res.readme || '',
          tab: 'overview'
        }
      })
    } catch (err: any) {
      set({
        detail: {
          fullName,
          loading: false,
          meta: null,
          skills: [],
          readme: '',
          error: err?.message || String(err),
          tab: 'overview'
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
    set({ library })
  },

  async refreshAgents() {
    const agents = await api.agents.list()
    set({ agents })
  },

  async refreshInstalls() {
    const installMap = await api.install.map()
    set({ installMap })
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
