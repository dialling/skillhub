import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  KeyRound,
  FolderOpen,
  Link2,
  Copy,
  Languages,
  Sparkles,
  RefreshCw,
  Database,
  Info,
  Check,
  FlaskConical,
  HardDriveDownload,
  Terminal,
  LogOut,
  Palette
} from 'lucide-react'
import type { TranslationConfig } from '@shared/types'
import { THEMES, THEME_ORDER, type ThemeId } from '../theme'
import { api, fmtBytes } from '../api'
import { useStore } from '../store'

export function SettingsView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const rate = useStore((s) => s.rate)
  const tokenSource = useStore((s) => s.tokenSource)
  const loadCatalog = useStore((s) => s.loadCatalog)
  const toast = useStore((s) => s.toast)

  const [token, setToken] = useState(settings?.token || '')
  const [libraryDir, setLibraryDir] = useState(settings?.libraryDir || '')
  const [baseUrl, setBaseUrl] = useState(settings?.translation.baseUrl || '')
  const [apiKey, setApiKey] = useState(settings?.translation.apiKey || '')
  const [model, setModel] = useState(settings?.translation.model || '')
  const [sys, setSys] = useState<Record<string, any> | null>(null)
  const [testing, setTesting] = useState(false)
  const [showToken, setShowToken] = useState(false)

  /** Language changes also have to rebuild the native application menu. */
  const changeLang = async (next: 'zh' | 'en'): Promise<void> => {
    await updateSettings({ lang: next })
    await api.system.rebuildMenu().catch(() => {})
  }
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void api.system.stats().then(setSys)
  }, [])

  useEffect(() => {
    setToken(settings?.token || '')
    setLibraryDir(settings?.libraryDir || '')
    setBaseUrl(settings?.translation.baseUrl || '')
    setApiKey(settings?.translation.apiKey || '')
    setModel(settings?.translation.model || '')
  }, [settings])

  const saveTranslation = async (patch: Partial<TranslationConfig>): Promise<void> => {
    await updateSettings({
      translation: {
        ...(settings?.translation as any),
        baseUrl,
        apiKey,
        model,
        ...patch
      }
    })
  }

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
                {rate?.ok && (
                  <span className="chip mono">
                    {t('settings.rateLeft')} {rate.remaining}/{rate.limit}
                  </span>
                )}
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
          <div className="field">
            <label>{t('settings.library')}</label>
            <div className="row">
              <input className="input" value={libraryDir} spellCheck={false} onChange={(e) => setLibraryDir(e.target.value)} />
              <button
                className="btn"
                onClick={async () => {
                  const picked = await api.system.pickDirectory()
                  if (picked) setLibraryDir(picked)
                }}
              >
                {t('agents.pickDir')}
              </button>
              <button className="btn primary" onClick={() => void updateSettings({ libraryDir })}>
                {t('common.save')}
              </button>
            </div>
            <div className="hint">{t('settings.libraryHint')}</div>
          </div>

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

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('settings.installMode')}</label>
            <div className="seg">
              <button
                className={settings?.installMode === 'symlink' ? 'active' : ''}
                onClick={() => void updateSettings({ installMode: 'symlink' })}
              >
                <Link2 size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
                {t('detail.symlink')}
              </button>
              <button
                className={settings?.installMode === 'copy' ? 'active' : ''}
                onClick={() => void updateSettings({ installMode: 'copy' })}
              >
                <Copy size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
                {t('detail.copy')}
              </button>
            </div>
            <div className="hint">{t('settings.installModeHint')}</div>
          </div>
        </div>
      </div>

      {/* Translation ------------------------------------------------------ */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <Languages size={13} />
          {t('settings.translation')}
          <div className="right">
            <button
              className={`switch ${settings?.translation.enabled ? 'on' : ''}`}
              onClick={() => void saveTranslation({ enabled: !settings?.translation.enabled })}
            />
          </div>
        </div>
        <div className="panel-body">
          <div className="hint" style={{ marginBottom: 14 }}>
            {t('settings.translationHint')}
          </div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>{t('settings.baseUrl')}</label>
              <input className="input" value={baseUrl} spellCheck={false} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>{t('settings.model')}</label>
              <input className="input" value={model} spellCheck={false} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>{t('settings.apiKey')}</label>
            <div className="row">
              <input
                className="input"
                type="password"
                value={apiKey}
                spellCheck={false}
                placeholder="sk-…"
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                className="btn"
                disabled={testing}
                onClick={async () => {
                  setTesting(true)
                  try {
                    await saveTranslation({})
                    const res = await api.system.testTranslation()
                    toast(res.ok ? 'success' : 'error', res.message)
                  } finally {
                    setTesting(false)
                  }
                }}
              >
                {testing ? <span className="spinner" /> : <FlaskConical size={13} />}
                {t('settings.test')}
              </button>
              <button className="btn primary" onClick={() => void saveTranslation({})}>
                {t('common.save')}
              </button>
            </div>
          </div>
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
          <div className="theme-grid">
            {THEME_ORDER.map((id) => {
              const theme = THEMES[id]
              const active = (settings?.theme || 'azure') === id
              return (
                <button
                  key={id}
                  className={`theme-tile${active ? ' active' : ''}`}
                  onClick={() => void updateSettings({ theme: id })}
                  title={lang === 'zh' ? theme.zh : theme.en}
                >
                  <span className="theme-swatches">
                    <span style={{ background: theme.accent }} />
                    <span style={{ background: theme.second }} />
                    <span style={{ background: theme.third }} />
                  </span>
                  <span className="theme-name">{lang === 'zh' ? theme.zh : theme.en}</span>
                  {active && <Check size={12} className="theme-check" />}
                </button>
              )
            })}
          </div>
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
            <button className="btn" onClick={() => void api.system.openPath(settings?.libraryDir || '')}>
              <FolderOpen size={13} />
              {t('settings.library')}
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
