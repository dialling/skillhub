import { useEffect, useRef, useState } from 'react'
import { Search, X, Languages, RefreshCw, User as UserIcon } from 'lucide-react'
import { useStore } from '../store'

export function TitleBar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const query = useStore((s) => s.query)
  const runSearch = useStore((s) => s.runSearch)
  const clearSearch = useStore((s) => s.clearSearch)
  const setView = useStore((s) => s.setView)
  const view = useStore((s) => s.view)
  const lang = useStore((s) => s.lang)
  const toggleLang = useStore((s) => s.toggleLang)
  const settings = useStore((s) => s.settings)
  const refreshRate = useStore((s) => s.refreshRate)
  const searching = useStore((s) => s.searching)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(query)

  useEffect(() => {
    setDraft(query)
  }, [query])

  // Debounced live search straight against GitHub.
  useEffect(() => {
    const term = draft.trim()
    if (!term) return
    const handle = setTimeout(() => {
      if (useStore.getState().view !== 'store') setView('store')
      void runSearch(term)
    }, 520)
    return () => clearTimeout(handle)
  }, [draft, runSearch, setView])

  return (
    <header className="titlebar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
            <path d="M12 12v9" />
            <path d="m3 7.5 9 4.5 9-4.5" />
          </svg>
        </div>
        <span>SkillHub</span>
        <span className="brand-sub">{t('app.tagline')}</span>
      </div>

      <div className="titlebar-search">
        <div className="searchbox">
          <Search size={14} className="dim" />
          <input
            ref={inputRef}
            value={draft}
            spellCheck={false}
            placeholder={t('common.searchPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setView('store')
                void runSearch(draft)
              } else if (e.key === 'Escape') {
                setDraft('')
                clearSearch()
                inputRef.current?.blur()
              }
            }}
          />
          {searching ? (
            <span className="spinner" />
          ) : draft ? (
            <button
              className="btn ghost sm"
              style={{ height: 18, padding: '0 4px' }}
              onClick={() => {
                setDraft('')
                clearSearch()
              }}
            >
              <X size={12} />
            </button>
          ) : (
            <span className="kbd">⌘K</span>
          )}
        </div>
      </div>

      <div className="titlebar-actions">
        <button className="btn ghost sm" title={t('common.language')} onClick={() => void toggleLang()}>
          <Languages size={13} />
          {lang === 'zh' ? '中' : 'EN'}
        </button>
        <button className="btn ghost sm" title={t('common.refresh')} onClick={() => void refreshRate(true)}>
          <RefreshCw size={13} />
        </button>
        <button
          className="avatar-btn"
          title={settings?.user ? `@${settings.user.login}` : t('profile.notLoggedIn')}
          onClick={() => setView(view === 'profile' ? 'store' : 'profile')}
        >
          {settings?.user?.avatarUrl ? (
            <img src={settings.user.avatarUrl} alt="" />
          ) : (
            <UserIcon size={14} className="dim" />
          )}
        </button>
      </div>
    </header>
  )
}
