import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useStore } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span className="ti">
            {toast.kind === 'success' ? (
              <CheckCircle2 size={15} />
            ) : toast.kind === 'error' ? (
              <XCircle size={15} />
            ) : (
              <Info size={15} />
            )}
          </span>
          <div className="tb">
            <div className="tm">{toast.message}</div>
            {toast.detail && <div className="td">{toast.detail}</div>}
          </div>
          <button className="btn ghost sm" style={{ height: 18, padding: '0 3px' }} onClick={() => dismiss(toast.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function JobBar(): React.JSX.Element | null {
  const job = useStore((s) => s.job)
  const installProgress = useStore((s) => s.installProgress)
  const t = useStore((s) => s.t)

  if (installProgress) {
    const pct =
      installProgress.total > 0 ? Math.round((installProgress.current / installProgress.total) * 100) : 0
    return (
      <div className="jobbar">
        <span className="spinner" />
        <span className="txt">
          {t('job.installing')}
          {installProgress.message ? ` · ${installProgress.message}` : ''}
        </span>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="pct">{pct}%</span>
      </div>
    )
  }

  if (!job) return null
  const label =
    job.job === 'clone'
      ? t('job.cloning', { name: job.id || '' })
      : job.job === 'sync'
        ? t('job.syncing')
        : job.job === 'search'
          ? t('job.searching')
          : t('job.refreshing')
  return (
    <div className="jobbar">
      <span className="spinner" />
      <span className="txt">
        {label}
        {job.message ? ` · ${job.message}` : ''}
      </span>
      {typeof job.percent === 'number' ? (
        <>
          <div className="progress">
            <span style={{ width: `${job.percent}%` }} />
          </div>
          <span className="pct">{Math.round(job.percent)}%</span>
        </>
      ) : (
        <div className="progress indeterminate">
          <span />
        </div>
      )}
    </div>
  )
}
