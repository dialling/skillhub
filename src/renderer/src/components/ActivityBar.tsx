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
  const installMap = useStore((s) => s.installMap)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const sidebarOpen = useStore((s) => s.sidebarOpen)

  const installedCount = Object.values(installMap).reduce((n, list) => n + list.length, 0)
  const activeAgents = agents.filter((a) => a.enabled).length
  const badges: Partial<Record<ViewKey, number>> = {
    library: library.length,
    agents: activeAgents,
    store: 0
  }
  void installedCount

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
      <button className="act-item" title="Sidebar" onClick={toggleSidebar}>
        <PanelLeft size={18} />
      </button>
    </nav>
  )
}
