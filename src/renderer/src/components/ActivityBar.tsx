import { Store, Library, Trophy, Bot, User as UserIcon, Settings, PanelLeft } from 'lucide-react'
import { useStore, type ViewKey } from '../store'

const ITEMS: { id: ViewKey; icon: React.ComponentType<{ size?: number }>; key: string }[] = [
  { id: 'store', icon: Store, key: 'nav.store' },
  { id: 'library', icon: Library, key: 'nav.library' },
  { id: 'charts', icon: Trophy, key: 'nav.charts' },
  { id: 'agents', icon: Bot, key: 'nav.agents' },
  { id: 'profile', icon: UserIcon, key: 'nav.profile' }
]

export function ActivityBar(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const t = useStore((s) => s.t)
  const library = useStore((s) => s.library)
  const agents = useStore((s) => s.agents)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const sidebarOpen = useStore((s) => s.sidebarOpen)

  const settings = useStore((s) => s.settings)
  const markSeen = useStore((s) => s.markSeen)

  /*
    These badges are unread markers, not counters. A permanent "5" next to
    Library says nothing useful — the number is only interesting when it means
    "something arrived since you last looked". So: repositories added after the
    library was last opened, and agents detected that were not there last time.
    Both stay empty until the first boot records what it found.
  */
  const newLibrary =
    settings?.seenLibraryAt === undefined
      ? 0
      : library.filter((i) => i.addedAt > settings.seenLibraryAt!).length
  const detectedIds = agents.filter((a) => a.detected).map((a) => a.id)
  const newAgents =
    settings?.seenAgents === undefined
      ? 0
      : detectedIds.filter((id) => !settings.seenAgents!.includes(id)).length
  const badges: Partial<Record<ViewKey, number>> = {
    library: newLibrary,
    agents: newAgents
  }

  return (
    <nav className="activitybar">
      {ITEMS.map(({ id, icon: Icon, key }) => (
        <button
          key={id}
          className={`act-item ${view === id ? 'active' : ''}`}
          title={t(key)}
          onClick={() => {
            setView(id)
            if (!sidebarOpen) toggleSidebar()
            // Opening the view is the acknowledgement.
            if (id === 'library' || id === 'agents') void markSeen(id)
          }}
        >
          <Icon size={19} />
          {!!badges[id] && <span className="act-badge">{badges[id]! > 99 ? '99+' : badges[id]}</span>}
        </button>
      ))}
      <div className="act-spacer" />
      <button
        className="act-item"
        title={t('nav.settings')}
        onClick={() => setView(view === 'settings' ? 'store' : 'settings')}
        style={view === 'settings' ? { color: 'var(--accent-hi)', background: 'var(--accent-dim)' } : undefined}
      >
        <Settings size={19} />
      </button>
      <button
        className="act-item"
        title={sidebarOpen ? t('common.collapseSidebar') : t('common.expandSidebar')}
        onClick={toggleSidebar}
      >
        <PanelLeft size={18} />
      </button>
    </nav>
  )
}
