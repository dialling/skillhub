import { useEffect, useMemo, useState } from 'react'
import { Download, Check, FolderOpen, HardDrive, Search } from 'lucide-react'
import { useStore } from '../store'

/**
 * Which agent should get this skill?
 *
 * That is the question with a wrong answer: a skill is only usable by an agent
 * that reads the directory it was written into, and installing into every
 * enabled agent was the wrong default — people use one agent, and a skill in a
 * directory they never load is clutter they did not ask for.
 *
 * Multi-select rather than single, because using two agents is a real case and
 * the alternative is installing the same skill twice.
 *
 * The answer is remembered, so the common case stays one click: this dialog
 * appears when the question has not been answered yet, and when the user asks to
 * change the answer. "Choose another folder" remains for the other intent —
 * putting a skill somewhere of one's own rather than into an agent.
 */
export function InstallModal(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const open = useStore((s) => s.installOpen)
  const pending = useStore((s) => s.installPendingSkills)
  const agents = useStore((s) => s.agents)
  const settings = useStore((s) => s.settings)
  const installTarget = useStore((s) => s.installTarget)
  const close = useStore((s) => s.closeInstall)
  const run = useStore((s) => s.installToPaths)
  const saveAgents = useStore((s) => s.setInstallAgents)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const detected = useMemo(
    () =>
      agents
        .filter((a) => a.detected && a.path && !a.projectOnly)
        .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)),
    [agents]
  )

  /*
    Everything is compared as an absolute path, and the rows were the problem.

    `AgentTarget.path` is a *display* path and may start with `~`, while the
    configured location and the folder picker both hand back absolute paths. A
    suggestion of `/Users/me/.dsh/skills` therefore matched no row — the dialog
    opened with the right destination in the footer and nothing ticked, which
    reads as a broken selection rather than a comparison that never succeeded.

    `recommendInstallTarget` already resolved all of this: each candidate carries
    the absolute path next to the tildified one and names the agent it belongs to.
  */
  const absByAgent = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of installTarget?.candidates || []) {
      if (c.agentId && c.absPath) map.set(c.agentId, c.absPath)
    }
    return map
  }, [installTarget])

  const absOf = (a: (typeof detected)[number]): string => absByAgent.get(a.id) || a.path

  useEffect(() => {
    if (!open) return
    setCustom('')
    setFilter('')
    setBusy(false)
    /*
      Pre-check what the user last chose. Failing that, one agent rather than all
      of them: a single default is what the common case wants, and it keeps
      confirming a genuine one-click when the dialog does appear.
    */
    const remembered = settings?.installAgents
    const configured =
      installTarget?.reason === 'configured'
        ? installTarget.candidates.find((c) => c.absPath === installTarget.absPath)?.agentId
        : undefined
    const initial = remembered?.length ? remembered : [configured || detected[0]?.id].filter(Boolean)
    setPicked(new Set(initial as string[]))
  }, [open, detected, settings, installTarget])

  if (!open) return null

  const shown = filter.trim()
    ? detected.filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : detected
  const chosenAgents = detected.filter((a) => picked.has(a.id))
  const count = pending.length
  const targets = custom ? [custom] : chosenAgents.map(absOf)
  /*
    Two modes, one dialog.

    With skills pending it installs them; with none it is only recording the
    answer. Keeping them together means the chooser cannot drift from the thing
    it configures — and `count === 0` is exactly the signal, because an install
    of nothing is not a thing anyone asks for.
  */
  const chooseOnly = count === 0
  const canConfirm = targets.length > 0 && (chooseOnly || count > 0)

  const toggle = (id: string): void => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  const confirm = async (): Promise<void> => {
    if (!canConfirm) return
    setBusy(true)
    try {
      if (custom) {
        await run([custom])
      } else {
        // Remembered before installing, so a failed fetch still leaves the
        // answer recorded and the next attempt is one click.
        await saveAgents(chosenAgents.map((a) => a.id))
        if (!chooseOnly) await run(chosenAgents.map(absOf))
        else close()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={() => close()}>
      <div className="modal" style={{ width: 'min(560px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Download size={15} />
          <div className="modal-title">
            {chooseOnly
              ? t('install.chooseTarget')
              : count === 1
                ? t('install.titleOne', { name: pending[0]?.name || '' })
                : t('install.title', { n: count })}
          </div>
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => close()}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="modal-body">
          <div className="dim" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
            {t('install.chooseAgentsHint')}
          </div>

          <div className="searchbox" style={{ marginBottom: 10 }}>
            <Search size={13} className="dim" />
            <input
              value={filter}
              spellCheck={false}
              placeholder={t('install.filter')}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="bulk-agents">
            {shown.map((a) => (
              <label key={a.id} className={`bulk-agent${!custom && picked.has(a.id) ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={!custom && picked.has(a.id)}
                  onChange={() => {
                    setCustom('')
                    toggle(a.id)
                  }}
                />
                <span className="ba-check">{!custom && picked.has(a.id) && <Check size={11} />}</span>
                <span className="ba-main">
                  <span className="ba-name">{a.name}</span>
                  <span className="ba-path mono" title={absOf(a)}>
                    {a.path}
                  </span>
                </span>
                <span className="ba-tags">
                  {installTarget?.reason === 'configured' && installTarget.absPath === absOf(a) ? (
                    <span className="chip tiny violet">{t('install.suggested')}</span>
                  ) : (
                    a.enabled && <span className="chip tiny">{t('agents.enabled')}</span>
                  )}
                </span>
              </label>
            ))}
            {shown.length === 0 && (
              <div className="dim" style={{ fontSize: 11.5, padding: 6 }}>
                {t('palette.noMatch')}
              </div>
            )}
          </div>

          {/* A folder is a destination for skills, not an answer to "which
              agent" — with nothing pending there is nothing to put there. */}
          {!chooseOnly && (
          <div className="install-custom">
            <button
              className={`bulk-agent${custom ? ' on' : ''}`}
              style={{ width: '100%', textAlign: 'left' }}
              onClick={async () => {
                const dir = await window.skillhub.system.pickDirectory()
                if (dir) {
                  setCustom(dir)
                  setPicked(new Set())
                }
              }}
            >
              <span className="ba-check">{custom ? <Check size={11} /> : <FolderOpen size={11} />}</span>
              <span className="ba-main">
                <span className="ba-name">{t('install.otherFolder')}</span>
                <span className="ba-path mono">{custom || t('install.otherFolderHint')}</span>
              </span>
            </button>
          </div>
          )}
        </div>

        <div className="modal-foot">
          {/* The full path, not just the agent's name: it is the one thing worth
              checking before anything is written. */}
          <span className="dim mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <HardDrive size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            {targets.length === 0
              ? t('install.pickFirst')
              : chooseOnly
                ? targets.join(t('common.listSep'))
                : targets.length === 1
                  ? `${targets[0]}/${pending[0]?.name || ''}`
                  : t('install.intoN', { n: targets.length })}
          </span>
          <button className="btn primary" disabled={busy || !canConfirm} onClick={() => void confirm()}>
            {busy ? <span className="spinner" /> : <Download size={13} />}
            {t('install.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
