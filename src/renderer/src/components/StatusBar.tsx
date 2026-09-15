import { useEffect, useState } from 'react'
import { Zap, Folder, Bot, Package, Languages, CircleAlert } from 'lucide-react'
import { GithubIcon } from './icons'
import { useStore } from '../store'
import { api } from '../api'

export function StatusBar(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const rate = useStore((s) => s.rate)
  const refreshRate = useStore((s) => s.refreshRate)
  const library = useStore((s) => s.library)
  const agents = useStore((s) => s.agents)
  const installMap = useStore((s) => s.installMap)
  const settings = useStore((s) => s.settings)
  const toggleLang = useStore((s) => s.toggleLang)
  const [version, setVersion] = useState('')

  useEffect(() => {
    api.system
      .stats()
      .then((s) => setVersion(s.appVersion || ''))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handle = setInterval(() => void refreshRate(), 120_000)
    return () => clearInterval(handle)
  }, [refreshRate])

  const installedCount = Object.values(installMap).reduce((n, l) => n + l.length, 0)
  const activeAgents = agents.filter((a) => a.enabled)
  const totalSkills = library.reduce((n, i) => n + i.skills.length, 0)
  const pct = rate && rate.limit ? Math.round((rate.remaining / rate.limit) * 100) : 100
  const lowQuota = !!rate?.ok && pct < 15
  const quotaClass = !rate?.ok ? 'err' : lowQuota ? 'warn' : ''

  return (
    <footer className="statusbar">
      {/* Connection state lives here, but the raw quota number does not: it sits
          at 5000/5000 essentially always, so it was noise. It only earns screen
          space when it is about to become a problem. */}
      <button
        className="status-item"
        onClick={() => void refreshRate(true)}
        title={rate?.error || (rate?.ok ? t('status.rateTooltip', { remaining: rate.remaining, limit: rate.limit }) : '')}
      >
        <span className={`pulse ${quotaClass}`} />
        <GithubIcon size={11} />
        {rate?.ok ? (
          <>
            {t('status.connected')}
            {rate.login ? ` · @${rate.login}` : ''}
            {lowQuota && (
              <span className="quota-warn">
                <CircleAlert size={11} />
                {t('status.quotaLow', { n: rate.remaining })}
              </span>
            )}
          </>
        ) : (
          <>{t('status.offline')}</>
        )}
      </button>

      <span className="status-item" title={settings?.libraryDir}>
        <Folder size={11} />
        <Package size={11} />
        {library.length} {t('common.items')} · {totalSkills} {t('common.skills')}
      </span>

      <span className="status-item">
        <Bot size={11} />
        {t('status.agents')} {activeAgents.length}
        {activeAgents.length ? ` · ${activeAgents.map((a) => a.name).slice(0, 3).join(', ')}` : ''}
      </span>

      <span className="status-item">
        <Zap size={11} className={installedCount ? 'up' : ''} />
        {t('status.installed')} {installedCount}
      </span>

      <span className="status-spacer" />

      <button className="status-item" onClick={() => void toggleLang()} title={t('common.language')}>
        <Languages size={11} />
        {t('lang.current')}
      </button>
      <span className="status-item">v{version || '0.1.0'}</span>
    </footer>
  )
}
