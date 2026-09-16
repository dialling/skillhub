import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  KeyRound,
  FolderOpen,
  Sparkles,
  RefreshCw,
  Database,
  Info,
  Check,
  HardDriveDownload,
  Terminal,
  LogOut,
  Palette,
  Trash2
} from 'lucide-react'
import { THEMES, THEME_ORDER } from '../theme'
import { api } from '../api'
import { useStore } from '../store'

export function SettingsView(): React.JSX.Element {
  useEffect(() => {
  }, [])

  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const tokenSource = useStore((s) => s.tokenSource)
  const installTarget = useStore((s) => s.installTarget)
  const setShowTargetModal = useStore((s) => s.setShowTargetModal)
  const loadCatalog = useStore((s) => s.loadCatalog)
  const toast = useStore((s) => s.toast)

  const [token, setToken] = useState(settings?.token || '')
  const [sys, setSys] = useState<Record<string, any> | null>(null)
  const [showToken, setShowToken] = useState(false)

  /** Language changes also have to rebuild the native application menu. */
  const changeLang = async (next: 'zh' | 'en'): Promise<void> => {
    await updateSettings({ lang: next })
    await api.system.rebuildMenu().catch(() => {})
  }
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    // The stats pane is informational; if the call fails it stays empty rather
    // than raising an unhandled rejection (preload rejects on ok:false).
    void api.system.stats().then(setSys).catch(() => setSys(null))
  }, [])

  useEffect(() => {
    setToken(settings?.token || '')
  }, [settings])

  return (
    <div className="view" style={{ maxWidth: 980 }}>
      <div className="view-head">
        <div>
          <div className="view-title">
            <SettingsIcon size={19} />
            {t('settings.title')}
          </div>
          <div className="view-sub">{t('settings.subtitle')}</div>
        </div>
      </div>

      {/* GitHub ---------------------------------------------------------- */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <KeyRound size={13} />
          {settings?.user ? t('settings.account') : t('settings.github')}
          {settings?.user && (
            <span className="chip green mono" style={{ marginLeft: 'auto' }}>
              <Check size={10} />
              {t('settings.connected')}
            </span>
          )}
        </div>

        {settings?.user ? (
          /* Signed in: show who we are and where the credential came from.
             Never ask for a token the user has already given. */
          <div className="panel-body">
            <div className="gh-account">
              <img src={settings.user.avatarUrl} alt="" />
              <div className="who">
                <div className="nm">{settings.user.name || settings.user.login}</div>
                <div className="lg mono">@{settings.user.login}</div>
              </div>
              <div className="meta">
                <span className="chip mono">
                  {t('settings.credentialSource')}:{' '}
                  {t(`profile.src.${tokenSource === 'settings' ? 'settings' : tokenSource === 'env' ? 'env' : tokenSource === 'gh-cli' ? 'gh-cli' : 'none'}`)}
                </span>

              </div>
            </div>

            <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={async () => {
                  await useStore.getState().refreshRate(true)
                  const fresh = await api.profile.refresh().catch(() => null)
                  if (fresh) {
                    useStore.setState({ settings: { ...(useStore.getState().settings as any), user: fresh } })
                  }
                  toast('success', t('settings.revalidate'))
                }}
              >
                <RefreshCw size={13} />
                {t('settings.revalidate')}
              </button>
              <button className="btn" onClick={() => setShowToken((v) => !v)}>
                <KeyRound size={13} />
                {t('settings.replaceToken')}
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  await api.github.logout()
                  useStore.setState({
                    settings: { ...(useStore.getState().settings as any), user: null, token: '' },
                    tokenSource: 'none'
                  })
                  setToken('')
                  await useStore.getState().refreshRate(true)
                  toast('success', t('profile.logout'))
                }}
              >
                <LogOut size={13} />
                {t('profile.logout')}
              </button>
            </div>

            {showToken && (
              <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
                <label>{t('settings.replaceToken')}</label>
                <div className="row">
                  <input
                    className="input"
                    type="password"
                    value={token}
                    spellCheck={false}
                    placeholder="ghp_… / github_pat_…"
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <button
                    className="btn primary"
                    onClick={async () => {
                      try {
                        const me = await api.github.login(token.trim())
                        useStore.setState({
                          settings: { ...(useStore.getState().settings as any), user: me, token: token.trim() },
                          tokenSource: 'settings'
                        })
                        setToken('')
                        setShowToken(false)
                        await useStore.getState().refreshRate(true)
                        toast('success', t('settings.tokenSaved'))
                      } catch (err: any) {
                        toast('error', t('toast.failed', { msg: err?.message || err }))
                      }
                    }}
                  >
                    {t('common.save')}
                  </button>
                </div>
                <div className="hint">{t('settings.tokenHint')}</div>
              </div>
            )}
          </div>
        ) : (
          /* Signed out: offer the two ways in. */
          <div className="panel-body">
            <p className="dim" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.65 }}>
              {t('settings.notConnectedHint')}
            </p>
            <div className="field">
              <label>{t('settings.token')}</label>
              <div className="row">
                <input
                  className="input"
                  type="password"
                  value={token}
                  spellCheck={false}
                  placeholder="ghp_… / github_pat_…"
                  onChange={(e) => setToken(e.target.value)}
                />
                <button
                  className="btn primary"
                  disabled={!token.trim()}
                  onClick={async () => {
                    try {
                      const me = await api.github.login(token.trim())
                      useStore.setState({
                        settings: { ...(useStore.getState().settings as any), user: me, token: token.trim() },
                        tokenSource: 'settings'
                      })
                      setToken('')
                      await useStore.getState().refreshRate(true)
                      toast('success', t('toast.loginOk', { login: me.login }))
                    } catch (err: any) {
                      toast('error', t('toast.failed', { msg: err?.message || err }))
                    }
                  }}
                >
                  {t('common.save')}
                </button>
              </div>
              <div className="hint">{t('settings.tokenHint')}</div>
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={async () => {
                  try {
                    const me = await api.github.loginWithCli()
                    useStore.setState({
                      settings: { ...(useStore.getState().settings as any), user: me },
                      tokenSource: 'gh-cli'
                    })
                    await useStore.getState().refreshRate(true)
                    toast('success', t('toast.loginOk', { login: me.login }))
                  } catch (err: any) {
                    toast('error', t('toast.failed', { msg: err?.message || err }))
                  }
                }}
              >
                <Terminal size={13} />
                {t('profile.loginCli')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Paths ----------------------------------------------------------- */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <FolderOpen size={13} />
          {t('settings.library')}
        </div>
        <div className="panel-body">
          {/*
            There is no library folder to configure any more.

            The library is an index — repositories and the skills they contain,
            with nothing on disk — so a path setting here would point at a
            directory that is never written to. What the user chooses is where
            each install goes, at the moment they install it.
          */}

          <div className="field">
            <label>{t('settings.projectDir')}</label>
            <div className="row">
              <input
                className="input"
                value={settings?.projectDir || ''}
                spellCheck={false}
                placeholder="/Users/you/Projects/my-project"
                onChange={(e) => void updateSettings({ projectDir: e.target.value || null })}
              />
              <button
                className="btn"
                onClick={async () => {
                  const picked = await api.system.pickDirectory()
                  if (picked) await updateSettings({ projectDir: picked })
                }}
              >
                {t('agents.pickDir')}
              </button>
            </div>
            <div className="hint">{t('settings.projectHint')}</div>
          </div>


          <div className="field">
            <label>{t('settings.installLocation')}</label>
            <div className="row">
              <input
                className="input mono"
                value={installTarget?.path || ''}
                readOnly
                placeholder={t('settings.installLocationHint')}
              />
              <button className="btn" onClick={() => setShowTargetModal(true)}>
                <FolderOpen size={13} />
                {t('settings.changeLocation')}
              </button>
            </div>
            <div className="hint">{t('settings.installLocationHint')}</div>
          </div>

          {/*
            No install mode either: a skill fetched from GitHub has no local
            original to link to, so every install is a real copy. The choice
            between symlink and copy only existed because of the old checkout.
          */}
        </div>
      </div>

      {/* Appearance ------------------------------------------------------- */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <Palette size={13} />
          {t('settings.appearance')}
        </div>
        <div className="panel-body">
          <div className="hint" style={{ marginBottom: 14 }}>{t('settings.appearanceHint')}</div>
          {(['dark', 'light'] as const).map((scheme) => (
            <div key={scheme} style={{ marginBottom: 14 }}>
              <div className="side-section-title" style={{ padding: '0 2px 7px' }}>
                {scheme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
              </div>
              <div className="theme-grid">
                {THEME_ORDER.filter((id) => THEMES[id].scheme === scheme).map((id) => {
                  const theme = THEMES[id]
                  const active = (settings?.theme || 'azure') === id
                  return (
                    <button
                      key={id}
                      className={`theme-tile${active ? ' active' : ''}`}
                      onClick={() => void updateSettings({ theme: id })}
                      title={lang === 'zh' ? theme.zh : theme.en}
                    >
                      {/* A miniature of the actual surface stack, so the tile
                          previews the theme instead of just naming it. */}
                      <span className="theme-preview" style={{ background: theme.vars['--bg-2'] }}>
                        <span className="tp-panel" style={{ background: theme.vars['--bg-4'] }}>
                          <span className="tp-dot" style={{ background: theme.swatch[0] }} />
                          <span
                            className="tp-line"
                            style={{ background: theme.vars['--text-2'] }}
                          />
                        </span>
                        <span
                          className="tp-line tp-line-wide"
                          style={{ background: theme.vars['--text-3'] }}
                        />
                      </span>
                      <span className="theme-text">
                        <span className="theme-name">{lang === 'zh' ? theme.zh : theme.en}</span>
                        <span className="theme-dots">
                          {theme.swatch.map((c) => (
                            <i key={c} style={{ background: c }} />
                          ))}
                        </span>
                      </span>
                      {active && <Check size={13} className="theme-check" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Catalog ---------------------------------------------------------- */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <Database size={13} />
          {t('settings.catalog')}
          <div className="right">
            <button
              className="btn sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true)
                try {
                  const res = await api.catalog.refresh(60)
                  await loadCatalog()
                  toast('success', `${res.updated} ✓ / ${res.failed} ✗`)
                } catch (err: any) {
                  toast('error', t('toast.failed', { msg: err?.message || err }))
                } finally {
                  setRefreshing(false)
                }
              }}
            >
              {refreshing ? <span className="spinner" /> : <RefreshCw size={12} />}
              {t('settings.refreshCatalog')}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="hint">{t('settings.catalogHint')}</div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <span className="chip mono">
              <Sparkles size={10} />
              {useStore.getState().catalogRepos.length} repos
            </span>
            {useStore.getState().catalogAt && (
              <span className="chip mono">
                {new Date(useStore.getState().catalogAt as string).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Data + about ----------------------------------------------------- */}
      <div className="panel">
        <div className="panel-head">
          <Info size={13} />
          {t('settings.about')}
        </div>
        <div className="panel-body">
          <dl className="kv">
            <dt>SkillHub</dt>
            <dd className="mono">v{sys?.appVersion || '0.1.0'}</dd>
            <dt>Electron</dt>
            <dd className="mono">
              {sys?.electron} · Node {sys?.node} · Chromium {sys?.chrome}
            </dd>
            <dt>{t('common.language')}</dt>
            <dd>
              <div className="seg">
                <button className={lang === 'zh' ? 'active' : ''} onClick={() => void changeLang('zh')}>
                  {t('lang.zh')}
                </button>
                <button className={lang === 'en' ? 'active' : ''} onClick={() => void changeLang('en')}>
                  {t('lang.en')}
                </button>
              </div>
            </dd>
            <dt>userData</dt>
            <dd className="mono">{sys?.userData}</dd>
          </dl>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => void api.system.openPath(sys?.userData || '')}>
              <HardDriveDownload size={13} />
              {t('settings.openUserData')}
            </button>
            {settings?.user && (
              <span className="chip green mono">
                <Check size={10} />
                @{settings.user.login}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
