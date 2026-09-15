import { useEffect, useMemo, useState } from 'react'
import {
  FolderPlus,
  RefreshCw,
  Star,
  Package,
  CheckCircle2,
  Circle,
  Bot,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Target,
  TrendingUp,
  Info,
  Compass
} from 'lucide-react'
import { FN_LABELS, type FnCategory } from '@shared/types'
import { useStore } from '../store'
import { api } from '../api'

/** Every sidebar variant gets the same head, so the collapse control is always
 *  in the same place instead of being hidden at the bottom of the activity bar. */
function SideHead({ title }: { title: string }): React.JSX.Element {
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const t = useStore((s) => s.t)
  return (
    <div className="sidebar-head">
      <span className="sidebar-head-title">{title}</span>
      <button className="sidebar-collapse" title={t('common.collapseSidebar')} onClick={toggleSidebar}>
        <PanelLeftClose size={15} />
      </button>
    </div>
  )
}

/** Shown in place of the sidebar when it is collapsed, so it can be reopened
 *  without hunting for the activity-bar toggle. */
export function SidebarRail(): React.JSX.Element {
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const t = useStore((s) => s.t)
  return (
    <div className="sidebar-rail">
      <button title={t('common.expandSidebar')} onClick={toggleSidebar}>
        <PanelLeftOpen size={16} />
      </button>
    </div>
  )
}

function SideSection({
  title,
  action,
  children
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="side-section-title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const view = useStore((s) => s.view)
  if (view === 'store') return <StoreSidebar />
  if (view === 'library') return <LibrarySidebar />
  if (view === 'charts') return <ChartsSidebar />
  if (view === 'agents') return <AgentsSidebar />
  if (view === 'profile') return <ProfileSidebar />
  return <SettingsSidebar />
}

function StoreSidebar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const catalog = useStore((s) => s.catalogRepos)
  const catalogAt = useStore((s) => s.catalogAt)
  const category = useStore((s) => s.storeCategory)
  const setCategory = useStore((s) => s.setStoreCategory)
  const loadGrowth = useStore((s) => s.loadGrowth)
  const toast = useStore((s) => s.toast)
  const setAddLocal = useStore((s) => s.setAddLocal)
  const scenarios = useStore((s) => s.scenarios)
  const activeScenario = useStore((s) => s.activeScenario)
  const goToScenarios = useStore((s) => s.goToScenarios)

  // Functional categories: what the user wants to do, not what kind of repo it is.
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of catalog) {
      const c = r.fn || 'coding'
      map[c] = (map[c] || 0) + 1
    }
    return map
  }, [catalog])

  const refresh = async (): Promise<void> => {
    toast('info', t('job.refreshing'))
    try {
      const res = await api.catalog.refresh(60)
      await useStore.getState().loadCatalog()
      await loadGrowth(undefined, false)
      toast('success', `${t('settings.catalog')}: ${res.updated} ✓ / ${res.failed} ✗`)
    } catch (err: any) {
      toast('error', t('toast.failed', { msg: err?.message || err }))
    }
  }

  const entries = (Object.keys(FN_LABELS) as FnCategory[]).filter((c) => counts[c])

  return (
    <aside className="sidebar">
      <SideHead title={t('nav.store')} />
      <SideSection title={t('store.entry')}>
        <button className={`side-item ${!activeScenario && !category ? 'active' : ''}`} onClick={goToScenarios}>
          <Compass size={14} />
          {t('common.all')}
          <span className="count">{catalog.length}</span>
        </button>
        {/* One entry, not thirteen: the scenarios are chosen from the store grid. */}
        <button className={`side-item ${activeScenario ? 'active' : ''}`} onClick={goToScenarios}>
          <Target size={14} />
          {t('store.scenarios')}
          <span className="count">{scenarios.length}</span>
        </button>
      </SideSection>

      <SideSection title={t('store.byFunction')}>
        {entries.map((c) => (
          <button
            key={c}
            className={`side-item ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(category === c ? null : c)}
          >
            <span className="dot" style={{ background: fnColor(c) }} />
            {lang === 'zh' ? FN_LABELS[c].zh : FN_LABELS[c].en}
            <span className="count">{counts[c] || 0}</span>
          </button>
        ))}
      </SideSection>

      <SideSection title={t('common.options')}>
        <button className="side-item" onClick={() => void refresh()}>
          <RefreshCw size={14} />
          {t('settings.refreshCatalog')}
        </button>
        <button className="side-item" onClick={() => setAddLocal(true)}>
          <FolderPlus size={14} />
          {t('library.addLocal')}
        </button>
      </SideSection>

      <div className="side-note">
        <div className="flex" style={{ gap: 6, marginBottom: 6 }}>
          <Info size={12} />
          <strong>{t('store.curatedCatalog')}</strong>
        </div>
        {t('charts.hint')}
        {catalogAt && (
          <div className="mono dim" style={{ marginTop: 8, fontSize: 10.5 }}>
            {new Date(catalogAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </aside>
  )
}

/** One colour per functional category, so the sidebar reads at a glance. */
export function fnColor(c: FnCategory): string {
  switch (c) {
    case 'docs':
      return '#2f81f7'
    case 'design':
      return '#f778ba'
    case 'coding':
      return '#3fb950'
    case 'research':
      return '#22d3ee'
    case 'security':
      return '#f85149'
    case 'cloud':
      return '#a371f7'
    case 'content':
      return '#d29922'
    case 'tooling':
      return '#58a6ff'
    case 'collections':
      return '#8b949e'
    default:
      return '#6b7d99'
  }
}

function LibrarySidebar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const filter = useStore((s) => s.libraryFilter)
  const setFilter = useStore((s) => s.setLibraryFilter)
  const library = useStore((s) => s.library)
  const installMap = useStore((s) => s.installMap)
  const setAddLocal = useStore((s) => s.setAddLocal)
  const setView = useStore((s) => s.setView)

  const installedSkills = new Set(Object.keys(installMap))
  const pending = library.filter((i) => !i.skills.some((s) => installedSkills.has(s.id))).length
  const installed = library.length - pending

  return (
    <aside className="sidebar">
      <SideHead title={t('nav.library')} />
<SideSection title={t('library.title')}>
        <button className={`side-item ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <Package size={14} />
          {t('library.filterAll')}
          <span className="count">{library.length}</span>
        </button>
        <button
          className={`side-item ${filter === 'installed' ? 'active' : ''}`}
          onClick={() => setFilter('installed')}
        >
          <CheckCircle2 size={14} />
          {t('library.filterInstalled')}
          <span className="count">{installed}</span>
        </button>
        <button className={`side-item ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
          <Circle size={14} />
          {t('library.filterPending')}
          <span className="count">{pending}</span>
        </button>
      </SideSection>

      <SideSection title={t('common.options')}>
        <button className="side-item" onClick={() => setAddLocal(true)}>
          <FolderPlus size={14} />
          {t('library.addLocal')}
        </button>
        <button className="side-item" onClick={() => setView('store')}>
          <Star size={14} />
          {t('nav.store')}
        </button>
      </SideSection>
    </aside>
  )
}

function ChartsSidebar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const windowDays = useStore((s) => s.growthWindow)
  const loadGrowth = useStore((s) => s.loadGrowth)
  const growthLoading = useStore((s) => s.growthLoading)
  const [coverage, setCoverage] = useState<{ repos: number; days: number } | null>(null)

  useEffect(() => {
    void api.board
      .coverage()
      .then(setCoverage)
      .catch(() => {})
  }, [windowDays])

  const windows: { d: 1 | 7 | 30; key: string }[] = [
    { d: 1, key: 'charts.d1' },
    { d: 7, key: 'charts.d7' },
    { d: 30, key: 'charts.d30' }
  ]

  return (
    <aside className="sidebar">
      <SideHead title={t('nav.charts')} />
<SideSection title={t('charts.title')}>
        {windows.map((w) => (
          <button
            key={w.d}
            className={`side-item ${windowDays === w.d ? 'active' : ''}`}
            onClick={() => void loadGrowth(w.d)}
          >
            <TrendingUp size={14} />
            {t(w.key)}
            {growthLoading && windowDays === w.d && <span className="spinner" style={{ marginLeft: 'auto' }} />}
          </button>
        ))}
      </SideSection>

      {coverage && (
        <SideSection title={t('charts.source')}>
          <div className="side-note">
            {t('charts.coverage', { repos: coverage.repos, days: coverage.days })}
          </div>
        </SideSection>
      )}

      <SideSection title={t('common.options')}>
        <div className="side-note">
          <div className="flex" style={{ gap: 6, marginBottom: 6 }}>
            <Info size={12} />
            <strong>{t('charts.sourceApi')}</strong>
          </div>
          {t('charts.hint')}
        </div>
      </SideSection>
    </aside>
  )
}

function AgentsSidebar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const agents = useStore((s) => s.agents)
  const toggleAgent = useStore((s) => s.toggleAgent)
  const installMap = useStore((s) => s.installMap)

  const managedCount = (agentId: string): number =>
    Object.values(installMap).filter((list) => list.includes(agentId)).length

  return (
    <aside className="sidebar">
      <SideHead title={t('nav.agents')} />
<SideSection title={`${t('agents.autodetect')} · ${agents.length}`}>
        {agents.map((a) => (
          <button
            key={a.id}
            className={`side-item ${a.enabled ? 'active' : ''}`}
            onClick={() => void toggleAgent(a.id, !a.enabled)}
            title={a.path}
          >
            <span className="dot" style={{ background: a.color || 'var(--text-3)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            <span className="count">{managedCount(a.id) || a.found || 0}</span>
          </button>
        ))}
      </SideSection>
      <div className="side-note">
        <div className="flex" style={{ gap: 6, marginBottom: 6 }}>
          <Bot size={12} />
          <strong>{t('agents.universalTitle')}</strong>
        </div>
        {t('agents.universalHint')}
      </div>
    </aside>
  )
}

function ProfileSidebar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const settings = useStore((s) => s.settings)
  const setView = useStore((s) => s.setView)
  const stats = useStore((s) => s.library)
  return (
    <aside className="sidebar">
      <SideHead title={t('nav.profile')} />
<SideSection title={t('profile.title')}>
        <div className="side-note">
          {settings?.user ? (
            <>
              <strong>@{settings.user.login}</strong>
              <div className="dim" style={{ marginTop: 4 }}>
                {settings.user.name || ''}
              </div>
            </>
          ) : (
            <>{t('profile.notLoggedIn')}</>
          )}
        </div>
      </SideSection>
      <SideSection title={t('library.title')}>
        <button className="side-item" onClick={() => setView('library')}>
          <Package size={14} />
          {t('profile.libraryItems')}
          <span className="count">{stats.length}</span>
        </button>
        <button className="side-item" onClick={() => setView('settings')}>
          <Star size={14} />
          {t('nav.settings')}
        </button>
      </SideSection>
    </aside>
  )
}

function SettingsSidebar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  return (
    <aside className="sidebar">
      <SideHead title={t('nav.settings')} />
<SideSection title={t('settings.title')}>
        <div className="side-note">{t('settings.subtitle')}</div>
      </SideSection>
    </aside>
  )
}
