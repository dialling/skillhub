import { useEffect, useMemo, useState } from 'react'
import { Download, Check, TriangleAlert, Search } from 'lucide-react'
import type { AgentTarget } from '@shared/types'
import { useStore } from '../store'

/**
 * Choose where a bulk install goes.
 *
 * Bulk install used to write into every enabled agent without asking, which is
 * why the button carried a bare "· 3" — the number of agents it was about to
 * touch, presented as if it were a count of skills. Installing one skill into
 * three agents is three directory writes and three records; that is a decision
 * the user should get to make, especially since some of those directories are
 * shared between agents and some belong to tools they never open.
 */
export function BulkInstallModal({
  open,
  pendingIds,
  onClose
}: {
  open: boolean
  /** ids of the skills that are not installed anywhere yet */
  pendingIds: string[]
  onClose: () => void
}): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const agents = useStore((s) => s.agents)
  const install = useStore((s) => s.install)
  const installMap = useStore((s) => s.installMap)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  /*
    Default to the agents this machine actually has.

    Starting from `enabled` alone left out half of them: three of the six agents
    installed here were not switched on, so the skills would have gone to three
    directories while three other real agents sat unticked and unexplained. Being
    detected is the stronger signal of "I use this" — `enabled` is a preference
    someone may simply never have visited.
  */
  const suggested = useMemo(
    () => agents.filter((a) => a.detected || a.enabled).map((a) => a.id),
    [agents]
  )

  useEffect(() => {
    if (!open) return
    setChosen(new Set(suggested))
    setFilter('')
  }, [open, suggested])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents
    // Enabled and detected first: the ones that will actually be written to.
    // Installed first: those are the ones a person is choosing between.
    return [...list].sort(
      (a, b) =>
        Number(b.detected) - Number(a.detected) ||
        Number(b.enabled) - Number(a.enabled) ||
        a.name.localeCompare(b.name)
    )
  }, [agents, filter])

  const pending = pendingIds.length

  if (!open) return null

  const toggle = (id: string): void => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChosen(next)
  }

  const run = async (): Promise<void> => {
    if (!chosen.size || pending === 0) return
    setBusy(true)
    try {
      await install(pendingIds, [...chosen])
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal bulk-install" style={{ width: 'min(560px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Download size={16} />
          <div className="modal-title">{t('bulk.title')}</div>
          <button className="btn ghost sm" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="modal-body">
          <div className="dim" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
            {t('bulk.explain', { n: pending })}
          </div>

          <div className="searchbox" style={{ marginBottom: 10 }}>
            <Search size={13} className="dim" />
            <input
              value={filter}
              spellCheck={false}
              placeholder={t('bulk.filterAgents')}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="bulk-actions">
            <button className="btn ghost sm" onClick={() => setChosen(new Set(suggested))}>
              {t('bulk.pickDetected')}
            </button>
            <button className="btn ghost sm" onClick={() => setChosen(new Set(agents.map((a) => a.id)))}>
              {t('bulk.pickAll')}
            </button>
            <button className="btn ghost sm" onClick={() => setChosen(new Set())}>
              {t('bulk.pickNone')}
            </button>
          </div>

          <div className="bulk-agents">
            {shown.map((a) => {
              // installMap is keyed by skill, valued by the agents holding it, so
              // counting for one agent means scanning the values — indexing it by
              // agent id silently produced zero for every row.
              const managedHere = Object.values(installMap).filter((ids) => ids.includes(a.id)).length
              return (
              <label key={a.id} className={`bulk-agent${chosen.has(a.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={chosen.has(a.id)} onChange={() => toggle(a.id)} />
                <span className="ba-check">{chosen.has(a.id) && <Check size={11} />}</span>
                <span className="ba-main">
                  <span className="ba-name">{a.name}</span>
                  <span className="ba-path mono" title={a.path}>
                    {a.path}
                  </span>
                </span>
                <span className="ba-tags">
                  {/* How many skills this agent's folder already holds is the
                      number that decides whether it belongs in the selection. */}
                  {managedHere > 0 && (
                    <span className="chip tiny ok">{t('bulk.alreadyThere', { n: managedHere })}</span>
                  )}
                  {a.detected ? (
                    <span className="chip tiny ok">{t('bulk.detected')}</span>
                  ) : (
                    <span className="chip tiny warn" title={t('bulk.notDetectedHint')}>
                      <TriangleAlert size={9} />
                      {t('bulk.notDetected')}
                    </span>
                  )}
                  {a.enabled && <span className="chip tiny">{t('agents.enabled')}</span>}
                </span>
              </label>
              )
            })}
          </div>

          {/* Writing into a directory that does not exist yet is the one case
              worth flagging: the install will create it, which is usually right
              but is worth knowing about. */}
          {[...chosen].some((id) => !agents.find((a) => a.id === id)?.detected) && (
            <div className="notice" style={{ marginTop: 10 }}>
              <TriangleAlert size={13} />
              <span>{t('bulk.willCreate')}</span>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="dim" style={{ fontSize: 12 }}>
            {t('bulk.summary', { skills: pending, agents: chosen.size })}
          </span>
          <button className="btn primary" disabled={busy || !chosen.size || pending === 0} onClick={() => void run()}>
            {busy ? <span className="spinner" /> : <Download size={13} />}
            {t('bulk.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
