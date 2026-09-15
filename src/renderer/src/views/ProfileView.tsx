import { useEffect, useState } from 'react'
import {
  User as UserIcon,
  LogOut,
  RefreshCw,
  Star,
  Package,
  Download,
  Bot,
  HardDrive,
  Activity,
  ExternalLink,
  KeyRound,
  Check
} from 'lucide-react'
import { api, fmtBytes, fmtRelative, fmtStars } from '../api'
import { GithubIcon } from '../components/icons'
import { useStore } from '../store'
import type { ActivityEvent, DiskStats, GitHubUser } from '@shared/types'

export function ProfileView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const settings = useStore((s) => s.settings)
  const setView = useStore((s) => s.setView)
  const toast = useStore((s) => s.toast)
  const refreshRate = useStore((s) => s.refreshRate)
  const rate = useStore((s) => s.rate)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<DiskStats | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [starred, setStarred] = useState<{ fullName: string; stars: number; avatarUrl?: string }[]>([])

  const user = settings?.user || null

  useEffect(() => {
    void api.profile.stats().then(setStats).catch(() => {})
    void api.profile.activity().then(setEvents).catch(() => {})
    if (user) void api.profile.starred().then(setStarred).catch(() => {})
  }, [user])

  const login = async (): Promise<void> => {
    if (!token.trim()) return
    setBusy(true)
    try {
      const me = await api.github.login(token.trim())
      useStore.setState({ settings: { ...(useStore.getState().settings as any), user: me } })
      await refreshRate(true)
      toast('success', t('toast.loginOk', { login: me.login }))
      setToken('')
    } catch (err: any) {
      toast('error', t('toast.failed', { msg: err?.message || err }))
    } finally {
      setBusy(false)
    }
  }

  const loginCli = async (): Promise<void> => {
    setBusy(true)
    try {
      const me = await api.github.loginWithCli()
      useStore.setState({ settings: { ...(useStore.getState().settings as any), user: me } })
      await refreshRate(true)
      toast('success', t('toast.loginOk', { login: me.login }))
    } catch (err: any) {
      toast('error', t('toast.failed', { msg: err?.message || err }))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    await api.github.logout()
    useStore.setState({ settings: { ...(useStore.getState().settings as any), user: null, token: '' } })
    await refreshRate(true)
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">
            <UserIcon size={19} />
            {t('profile.title')}
          </div>
          <div className="view-sub">{user ? `@${user.login}` : t('profile.loginHint')}</div>
        </div>
        <div className="view-head-actions">
          {user && (
            <>
              <button
                className="btn"
                onClick={async () => {
                  const fresh = await api.profile.refresh()
                  if (fresh) {
                    useStore.setState({ settings: { ...(useStore.getState().settings as any), user: fresh } })
                    toast('success', t('common.refresh'))
                  }
                }}
              >
                <RefreshCw size={13} />
              </button>
              <button className="btn danger" onClick={() => void logout()}>
                <LogOut size={13} />
                {t('profile.logout')}
              </button>
            </>
          )}
        </div>
      </div>

      {!user ? (
        <div className="panel">
          <div className="panel-head">
            <GithubIcon size={13} />
            {t('profile.login')}
          </div>
          <div className="panel-body">
            <p className="dim" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.65 }}>
              {t('profile.loginHint')}
            </p>
            <div className="field">
              <label>{t('profile.tokenPlaceholder')}</label>
              <div className="row">
                <input
                  className="input"
                  type="password"
                  value={token}
                  spellCheck={false}
                  placeholder="ghp_… / github_pat_…"
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void login()}
                />
                <button className="btn primary" disabled={busy || !token.trim()} onClick={() => void login()}>
                  {busy ? <span className="spinner" /> : <KeyRound size={13} />}
                  {t('profile.login')}
                </button>
              </div>
              <div className="hint">{t('settings.tokenHint')}</div>
            </div>

            <div className="row" style={{ marginTop: 4 }}>
              <button className="btn" disabled={busy} onClick={() => void loginCli()}>
                <GithubIcon size={13} />
                {t('profile.loginCli')}
              </button>
              <button className="btn ghost" onClick={() => window.open('https://github.com/settings/tokens/new?scopes=repo,read:user&description=SkillHub')}>
                <ExternalLink size={13} />
                github.com/settings/tokens
              </button>
            </div>

            {rate && (
              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <span className={`chip mono ${rate.ok ? 'green' : ''}`}>
                  {t('profile.tokenSource')}: {t(`profile.src.${rate.ok ? 'gh-cli' : 'none'}`)}
                </span>
                {rate.ok && (
                  <span className="chip mono">
                    {rate.remaining}/{rate.limit}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="profile-hero">
            <img src={user.avatarUrl} alt="" />
            <div className="who">
              <div className="login">{user.name || user.login}</div>
              <div className="dim mono" style={{ fontSize: 12 }}>
                @{user.login}
              </div>
              {user.bio && <div className="bio selectable">{user.bio}</div>}
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 10 }}>
                {!!user.publicRepos && (
                  <span className="chip mono">
                    <Package size={10} />
                    {user.publicRepos} repos
                  </span>
                )}
                {!!user.followers && (
                  <span className="chip mono">
                    <Star size={10} />
                    {fmtStars(user.followers)} followers
                  </span>
                )}
                {user.company && <span className="chip">{user.company}</span>}
                {user.location && <span className="chip">{user.location}</span>}
                {rate?.ok && (
                  <span className="chip green mono">
                    <Check size={10} />
                    {rate.remaining}/{rate.limit}
                  </span>
                )}
              </div>
            </div>
            <button className="btn" onClick={() => void window.skillhub.system.openExternal(user.htmlUrl)}>
              <ExternalLink size={13} />
              GitHub
            </button>
          </div>

          <div className="stat-grid">
            <StatTile icon={<Package size={13} />} k={t('profile.libraryItems')} v={stats?.libraryItems ?? 0} />
            <StatTile icon={<Download size={13} />} k={t('profile.installedSkills')} v={stats?.installedSkills ?? 0} />
            <StatTile icon={<Bot size={13} />} k={t('profile.agents')} v={stats?.agents ?? 0} />
            <StatTile icon={<HardDrive size={13} />} k={t('profile.disk')} v={fmtBytes(stats?.libraryBytes || 0)} />
            <StatTile icon={<Star size={13} />} k={t('profile.starred')} v={starred.length} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <Activity size={13} />
                {t('profile.activity')}
              </div>
              <div className="timeline" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {events.length === 0 ? (
                  <div className="dim" style={{ padding: 16, fontSize: 12 }}>
                    {t('profile.noActivity')}
                  </div>
                ) : (
                  events.map((e) => (
                    <div className="tl-item" key={e.id}>
                      <span className={`tl-dot ${e.kind}`} />
                      <div className="tl-body">
                        <div className="tl-title">{t(e.code, e.params)}</div>
                        {e.params?.agents && <div className="tl-detail">{e.params.agents}</div>}
                      </div>
                      <span className="tl-time">{fmtRelative(e.at, lang)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <Star size={13} />
                {t('profile.starred')}
                <span className="chip mono right" style={{ marginLeft: 'auto' }}>
                  {starred.length}
                </span>
              </div>
              <div style={{ maxHeight: 420, overflowY: 'auto', padding: 8 }}>
                {starred.length === 0 ? (
                  <div className="dim" style={{ padding: 12, fontSize: 12 }}>
                    {t('common.empty')}
                  </div>
                ) : (
                  starred.slice(0, 60).map((s) => (
                    <div
                      className="agent-skill-item"
                      key={s.fullName}
                      onClick={() => {
                        void useStore.getState().openDetail(s.fullName)
                        setView('store')
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {s.avatarUrl && (
                        <img src={s.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: 5 }} />
                      )}
                      <span className="nm">{s.fullName}</span>
                      <span className="p" />
                      <span className="stat strong">★ {fmtStars(s.stars)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatTile({ icon, k, v }: { icon: React.ReactNode; k: string; v: number | string }): React.JSX.Element {
  return (
    <div className="stat-tile">
      <div className="k flex" style={{ gap: 5 }}>
        {icon}
        {k}
      </div>
      <div className="v">{v}</div>
    </div>
  )
}

export type { GitHubUser }
