import { useEffect, useMemo, useState } from 'react'
import { Download, Check, FolderOpen, HardDrive, Search } from 'lucide-react'
import { useStore } from '../store'

/**
 * Where should this skill go?
 *
 * The user picks the folder, and the skill lands in `<folder>/<skill name>/`.
 * Suggesting each agent's own skills directory makes the common case one click —
 * that is where an agent looks, and a skill placed there needs no further setup —
 * while "choose another folder" keeps it open for anyone who wants a project
 * directory or somewhere of their own.
 *
 * The full destination path is shown for the selected row, because "install to
 * Cursor" and "install to ~/.cursor/skills" are not the same amount of
 * information and only one of them can be checked at a glance.
 */
export function InstallModal(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const open = useStore((s) => s.installOpen)
  const pending = useStore((s) => s.installPendingSkills)
  const agents = useStore((s) => s.agents)
  const installTarget = useStore((s) => s.installTarget)
  const close = useStore((s) => s.closeInstall)
  const run = useStore((s) => s.installFromGithub)
  const [chosen, setChosen] = useState('')
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

  /*
    What gets pre-selected, in order of how much the user meant it.

    A location they went into Settings and picked outranks a guess, and a guess
    made from their own machine outranks nothing. This is the only thing the
    stored preference does — it steers the default — because a folder an agent
    never reads is worse than no default at all: the skill installs "successfully"
    and then cannot be found.
  */
  const suggested = useMemo(() => {
    if (installTarget?.reason === 'configured' && installTarget.absPath) return installTarget.absPath
    return detected[0] ? absByAgent.get(detected[0].id) || detected[0].path : ''
  }, [installTarget, detected, absByAgent])

  useEffect(() => {
    if (!open) return
    setCustom('')
    setFilter('')
    setChosen(suggested)
  }, [open, suggested])

  /*
    Keep the choice in step with the suggestion while the dialog is open.

    The advice arrives from an async call, so it can land after the dialog has
    already opened on the fallback; without this the user sees their configured
    folder listed as an option while the footer says something else is selected.
  */
  useEffect(() => {
    if (!open || custom) return
    if (!suggested) return
    setChosen((current) => (detected.some((a) => absOf(a) === current) ? current : suggested))
  }, [open, custom, suggested, detected, absByAgent])

  if (!open) return null

  const shown = filter.trim()
    ? detected.filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : detected
  const destination = custom || chosen
  const skillCount = pending.length

  const confirm = async (): Promise<void> => {
    if (!destination || !skillCount) return
    setBusy(true)
    try {
      await run(destination)
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
            {skillCount === 1 ? t('install.titleOne', { name: pending[0]?.name || '' }) : t('install.title', { n: skillCount })}
          </div>
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => close()}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="modal-body">
          <div className="dim" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
            {t('install.explain')}
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
              <label key={a.id} className={`bulk-agent${!custom && chosen === absOf(a) ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="install-destination"
                  checked={!custom && chosen === absOf(a)}
                  onChange={() => {
                    setCustom('')
                    setChosen(absOf(a))
                  }}
                />
                <span className="ba-check">{!custom && chosen === absOf(a) && <Check size={11} />}</span>
                <span className="ba-main">
                  <span className="ba-name">{a.name}</span>
                  <span className="ba-path mono" title={a.path}>
                    {a.path}
                  </span>
                </span>
                <span className="ba-tags">
                  {/*
                    Say when a row is the configured location rather than just
                    "enabled": the two are different reasons to be first, and the
                    user should be able to see which one is winning.
                  */}
                  {installTarget?.reason === 'configured' && installTarget.absPath === absOf(a) ? (
                    <span className="chip tiny violet">{t('install.suggested')}</span>
                  ) : (
                    a.enabled && <span className="chip tiny">{t('agents.enabled')}</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          <div className="install-custom">
            <button
              className={`bulk-agent${custom ? ' on' : ''}`}
              style={{ width: '100%', textAlign: 'left' }}
              onClick={async () => {
                const picked = await window.skillhub.system.pickDirectory()
                if (picked) setCustom(picked)
              }}
            >
              <span className="ba-check">{custom ? <Check size={11} /> : <FolderOpen size={11} />}</span>
              <span className="ba-main">
                <span className="ba-name">{t('install.otherFolder')}</span>
                <span className="ba-path mono">{custom || t('install.otherFolderHint')}</span>
              </span>
            </button>
          </div>
        </div>

        <div className="modal-foot">
          {/* The full path, not just the agent's name: it is the one thing worth
              checking before anything is written. */}
          <span className="dim mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <HardDrive size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            {destination ? `${destination}/${pending[0]?.name || ''}` : t('install.pickFirst')}
          </span>
          <button className="btn primary" disabled={busy || !destination || !skillCount} onClick={() => void confirm()}>
            {busy ? <span className="spinner" /> : <Download size={13} />}
            {t('install.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
