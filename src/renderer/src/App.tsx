import { useEffect } from 'react'
import { useStore, wireEvents } from './store'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Toasts, JobBar } from './components/Toasts'
import { CommandPalette } from './components/CommandPalette'
import { AddLocalModal } from './components/AddLocalModal'
import { DetailPanel } from './components/DetailPanel'
import { StoreView } from './views/StoreView'
import { LibraryView } from './views/LibraryView'
import { ChartsView } from './views/ChartsView'
import { AgentsView } from './views/AgentsView'
import { ProfileView } from './views/ProfileView'
import { SettingsView } from './views/SettingsView'

export default function App(): React.JSX.Element {
  const boot = useStore((s) => s.boot)
  const booted = useStore((s) => s.booted)
  const view = useStore((s) => s.view)
  const detail = useStore((s) => s.detail)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const setPalette = useStore((s) => s.setPalette)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const loadGrowth = useStore((s) => s.loadTrending)

  useEffect(() => {
    wireEvents()
    void boot()
  }, [boot])

  // Kick off the growth leaderboard once, in the background, so the Store's
  // "trending" rail has data without blocking first paint.
  useEffect(() => {
    if (booted) void loadGrowth(7)
  }, [booted, loadGrowth])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!paletteOpen)
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPalette(true)
      } else if (e.key === 'Escape' && paletteOpen) {
        setPalette(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, setPalette])

  return (
    <div className="app">
      <TitleBar />
      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'}`}>
        <ActivityBar />
        <Sidebar />
        <main className="content">
          {view === 'store' && <StoreView />}
          {view === 'library' && <LibraryView />}
          {view === 'charts' && <ChartsView />}
          {view === 'agents' && <AgentsView />}
          {view === 'profile' && <ProfileView />}
          {view === 'settings' && <SettingsView />}
          {detail && <DetailPanel />}
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <AddLocalModal />
      <Toasts />
      <JobBar />
    </div>
  )
}
