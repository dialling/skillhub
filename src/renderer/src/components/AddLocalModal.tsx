import { useState } from 'react'
import { FolderPlus, FolderOpen, X } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'

export function AddLocalModal(): React.JSX.Element | null {
  const open = useStore((s) => s.showAddLocal)
  const setOpen = useStore((s) => s.setAddLocal)
  const t = useStore((s) => s.t)
  const toast = useStore((s) => s.toast)
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [dir, setDir] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const submit = async (): Promise<void> => {
    if (!dir.trim()) return
    setBusy(true)
    try {
      const item = await api.library.addLocal(dir.trim())
      await refreshLibrary()
      toast('success', t('toast.added', { name: item.fullName }), `${item.skills.length} ${t('common.skills')}`)
      setOpen(false)
      setDir('')
    } catch (err: any) {
      toast('error', t('toast.failed', { msg: err?.message || err }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <FolderPlus size={15} />
          {t('library.addLocal')}
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>
            <X size={13} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{t('agents.customPath')}</label>
            <div className="row">
              <input
                className="input"
                value={dir}
                spellCheck={false}
                placeholder="/Users/you/skills"
                onChange={(e) => setDir(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
              />
              <button
                className="btn"
                onClick={async () => {
                  const picked = await api.system.pickDirectory()
                  if (picked) setDir(picked)
                }}
              >
                <FolderOpen size={13} />
                {t('agents.pickDir')}
              </button>
            </div>
            <div className="hint">
              SkillHub 会递归扫描该目录下所有包含 <code>SKILL.md</code> 的技能，加入你的库并可用于安装。
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={busy || !dir.trim()} onClick={() => void submit()}>
            {busy ? <span className="spinner" /> : <FolderPlus size={13} />}
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
