import { useEffect, useState } from 'react'
import { FolderOpen, HardDriveDownload, Check, AlertTriangle, X } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'

/**
 * Shown the first time a repository is added, and reachable later from Settings.
 *
 * The point is to answer "where will these skills actually go?" before anything
 * is installed, and to let the user redirect it. The recommendation is derived
 * from what is already on the machine, and the reason is spelled out rather than
 * presented as a bare path.
 */
export function InstallTargetModal(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const open = useStore((s) => s.showTargetModal)
  const setOpen = useStore((s) => s.setShowTargetModal)
  const target = useStore((s) => s.installTarget)
  const apply = useStore((s) => s.applyInstallTarget)
  const toast = useStore((s) => s.toast)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    if (open) setCustom('')
  }, [open])

  if (!open) return null

  const reasonText = (): string => {
    if (!target) return ''
    switch (target.reason) {
      case 'configured':
        return t('target.reasonConfigured')
      case 'universal':
        return t('target.reasonUniversal')
      case 'detected':
        return t('target.reasonDetected')
      default:
        return t('target.reasonDefault')
    }
  }

  const pick = async (path: string): Promise<void> => {
    try {
      await apply(path)
    } catch (err: any) {
      toast('error', t('toast.failed', { msg: err?.message || err }))
    }
  }

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal" style={{ width: 'min(620px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <HardDriveDownload size={15} />
          {t('target.title')}
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>
            <X size={13} />
          </button>
        </div>

        <div className="modal-body">
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.65 }}>
            {t('target.intro')}
          </p>

          {target && (
            <>
              <div className="target-advice">
                <div className="ta-head">
                  <Check size={14} />
                  <span className="mono">{target.path}</span>
                </div>
                <div className="ta-reason">{reasonText()}</div>
                {!target.exists && (
                  <div className="ta-warn">
                    <AlertTriangle size={12} />
                    {t('target.willCreate')}
                  </div>
                )}
              </div>

              {target.candidates.length > 0 && (
                <>
                  <div className="side-section-title" style={{ padding: '16px 0 7px' }}>
                    {t('target.candidates')}
                  </div>
                  <div className="target-list">
                    {target.candidates.slice(0, 10).map((c) => (
                      <button
                        key={c.absPath}
                        className={`target-row${c.absPath === target.absPath ? ' active' : ''}`}
                        onClick={() => void pick(c.absPath)}
                      >
                        <span className="tr-label">
                          {c.absPath.endsWith('/.agents/skills') ? t('target.universalLabel') : c.label}
                        </span>
                        <span className="tr-path mono">{c.path}</span>
                        <span className="tr-count">
                          {c.exists ? t('target.skillCount', { n: c.count }) : t('agents.notDetected')}
                        </span>
                        {c.absPath === target.absPath && <Check size={12} className="tr-check" />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="side-section-title" style={{ padding: '16px 0 7px' }}>
                {t('target.custom')}
              </div>
              <div className="row">
                <input
                  className="input"
                  value={custom}
                  spellCheck={false}
                  placeholder="~/.agents/skills"
                  onChange={(e) => setCustom(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={async () => {
                    const picked = await api.system.pickDirectory()
                    if (picked) setCustom(picked)
                  }}
                >
                  <FolderOpen size={13} />
                  {t('agents.pickDir')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => setOpen(false)}>
            {t('target.later')}
          </button>
          <button
            className="btn primary"
            disabled={!target}
            onClick={() => void pick(custom.trim() || target!.absPath)}
          >
            <Check size={13} />
            {custom.trim() ? t('target.useCustom') : t('target.useRecommended')}
          </button>
        </div>
      </div>
    </div>
  )
}
