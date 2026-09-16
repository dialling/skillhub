import { Download, Sparkles, X, Clock } from 'lucide-react'
import { useStore } from '../store'

/**
 * "Something newer exists" — a prompt, not an action.
 *
 * The check is what runs by itself; installing is the user's decision. Skipping
 * remembers the version, so the same update is not offered twice, while a later
 * one still is.
 */
export function UpdateModal(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const info = useStore((s) => s.updateInfo)
  const open = useStore((s) => s.updateOpen)
  const checkUpdates = useStore((s) => s.checkUpdates)
  const refreshAll = useStore((s) => s.refreshAll)
  const dismiss = useStore((s) => s.dismissUpdate)

  if (!open || !info?.available) return null

  const app = info.app
  const latest = app?.latest || String(info.catalog?.latest || info.data?.latest || '')

  return (
    <div className="overlay" onClick={() => void dismiss(false)}>
      <div className="modal" style={{ width: 'min(520px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Sparkles size={15} style={{ color: 'var(--accent-hi)' }} />
          <div className="modal-title">{t('update.title', { version: latest })}</div>
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => void dismiss(false)}>
            <X size={13} />
          </button>
        </div>

        <div className="modal-body">
          {app && (
            <>
              <div className="upd-line">
                <span className="dim">{t('update.current')}</span>
                <span className="mono">v{info.current}</span>
                <span className="dim">→</span>
                <span className="mono upd-new">v{app.latest}</span>
              </div>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
                {t('update.publishedAt', { date: app.publishedAt.slice(0, 10) })}
              </div>
              {app.notes && <pre className="upd-notes">{app.notes}</pre>}
            </>
          )}

          {/* Data and catalog updates do not need a download; saying which is
              which avoids sending someone to a release page for a star refresh. */}
          {!app && (info.catalog || info.data) && (
            <div className="upd-line">
              <span className="dim">{t('update.dataOnly')}</span>
              <span className="mono upd-new">{String(info.catalog?.latest || info.data?.latest)}</span>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {/* The only control that records a decision. */}
          <button className="btn" onClick={() => void dismiss(true)}>
            <Clock size={13} />
            {t('update.later')}
          </button>
          {app ? (
            <button
              className="btn primary"
              onClick={() => {
                void window.skillhub.system.openExternal(app.url)
                void dismiss(false)
              }}
            >
              <Download size={13} />
              {t('update.download')}
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                void dismiss(false)
                // Data-only update: this is the refresh button's job, so run it.
                void refreshAll()
              }}
            >
              <Download size={13} />
              {t('update.refreshData')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
