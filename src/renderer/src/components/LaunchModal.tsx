import { useEffect, useState } from 'react'
import { Rocket, FolderOpen, Terminal, AppWindow, Globe, Check, X, Info, TriangleAlert } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'
import type { LaunchTarget } from '@shared/types'

const KIND_ICON = {
  cli: Terminal,
  app: AppWindow,
  web: Globe
} as const

/**
 * Two questions, then start: where should this run, and with which agent.
 *
 * The workspace is laid out *before* the dialog confirms anything (via
 * launch:prepare), so the preview can show the real folder, the real
 * project-level skill path and the instruction file instead of a promise.
 */
export function LaunchModal(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const open = useStore((s) => s.showLaunchModal)
  const targets = useStore((s) => s.launchTargets)
  const source = useStore((s) => s.launchSource)
  const plan = useStore((s) => s.launchPlan)
  const launching = useStore((s) => s.launching)
  const close = useStore((s) => s.closeLaunch)
  const buildPlan = useStore((s) => s.buildLaunchPlan)
  const runLaunch = useStore((s) => s.runLaunch)
  const library = useStore((s) => s.library)
  const settings = useStore((s) => s.settings)
  const installMap = useStore((s) => s.installMap)

  const [workspace, setWorkspace] = useState('')
  const [agentId, setAgentId] = useState('')

  const skillIdPrefix = source?.from === 'library' ? source.skillId : null
  const skill = source?.from === 'library' ? library.flatMap((i) => i.skills).find((s) => s.id === source.skillId) : undefined
  const skillLabel = source?.from === 'library' ? skill?.name || '' : source?.name || ''

  /*
    Default to the sandbox, not to wherever the user last launched from.

    Launching writes an AGENTS.md and a copy of the skill into the chosen folder.
    Reusing the previous workspace made that folder sticky — a test launch put
    those files into a real projects directory, because "last used" had become
    it. The sandbox belongs to SkillHub, so the default cannot land on anything
    that is not ours. Recent folders stay available as suggestions.
  */
  const [sandboxRoot, setSandboxRoot] = useState('')
  useEffect(() => {
    void api.sandbox.root().then(setSandboxRoot).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const firstReady = targets.find((x) => x.ready && x.detected) || targets.find((x) => x.ready)
    setAgentId(firstReady?.agentId || '')
    if (!skillLabel) return
    // One folder per skill: two skills in one folder would both want AGENTS.md.
    void api.sandbox
      .for(skillLabel)
      .then(setWorkspace)
      .catch(() => setWorkspace(settings?.recentWorkspaces?.[0] || settings?.projectDir || ''))
  }, [open, settings, targets, skillLabel])

  // Rebuild the preview whenever either choice changes.
  useEffect(() => {
    if (!open || !agentId || !workspace.trim()) return
    const handle = setTimeout(() => void buildPlan(agentId, workspace), 250)
    return () => clearTimeout(handle)
  }, [open, agentId, workspace, buildPlan])

  /*
    Whether the chosen agent already has this skill globally.

    Launching does not require it: the skill is installed into the workspace at
    project level either way, which is what makes an unimported skill launchable
    at all. But "not installed" is something the user wanted to be told, so it is
    stated rather than left to be discovered — as a fact, not as an error, since
    the launch works regardless.
  */
  const skillIdsForLaunch = library
    .flatMap((i) => i.skills)
    .filter((sk) => (skillIdPrefix ? sk.id.startsWith(skillIdPrefix) : false))
    .map((sk) => sk.id)
  const installedHere = skillIdsForLaunch.some((id) => (installMap[id] || []).includes(agentId))

  if (!open) return null

  const recent = settings?.recentWorkspaces || []

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" style={{ width: 'min(680px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Rocket size={15} />
          {t('launch.title', { skill: skillLabel })}
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={close}>
            <X size={13} />
          </button>
        </div>

        <div className="modal-body">
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.65 }}>
            {t('launch.intro')}
          </p>
          {agentId && (
            <div className={`notice ${installedHere ? 'notice-ok' : 'notice-plain'}`} style={{ marginBottom: 14 }}>
              <Info size={14} />
              <span>
                {installedHere
                  ? t('launch.installedHere', { agent: targets.find((x) => x.agentId === agentId)?.name || agentId })
                  : t('launch.notInstalledHere', {
                      agent: targets.find((x) => x.agentId === agentId)?.name || agentId
                    })}
              </span>
            </div>
          )}

          {source?.from === 'local' && (
            <div className="notice notice-plain" style={{ marginBottom: 16 }}>
              <Info size={14} />
              <span>{t('launch.fromLocal', { path: source.path })}</span>
            </div>
          )}

          {/* 1. workspace ------------------------------------------------- */}
          <div className="side-section-title" style={{ padding: '0 0 8px' }}>
            1 · {t('launch.workspace')}
          </div>
          <div className="row" style={{ marginBottom: 9 }}>
            <input
              className="input mono"
              value={workspace}
              spellCheck={false}
              placeholder={t('launch.workspacePlaceholder')}
              onChange={(e) => setWorkspace(e.target.value)}
            />
            <button
              className="btn"
              onClick={async () => {
                const picked = await api.system.pickDirectory()
                if (picked) setWorkspace(picked)
              }}
            >
              <FolderOpen size={13} />
              {t('agents.pickDir')}
            </button>
            {sandboxRoot && (
              <button className="btn" title={t('launch.openSandbox')} onClick={() => void api.system.openExternal(sandboxRoot)}>
                {t('launch.sandbox')}
              </button>
            )}
          </div>
          {/* Writing into a folder that is not the sandbox is the case worth
              flagging: that is the user's own directory, and a launch adds
              AGENTS.md plus a skill folder to it. */}
          {workspace.trim() && sandboxRoot && !workspace.trim().startsWith(sandboxRoot) && (
            <div className="notice" style={{ marginBottom: 14 }}>
              <TriangleAlert size={14} />
              <span>{t('launch.notSandbox', { path: workspace.trim() })}</span>
            </div>
          )}
          {recent.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {recent.slice(0, 4).map((w) => (
                <button
                  key={w}
                  className={`chip clickable ${w === workspace ? 'active' : ''}`}
                  onClick={() => setWorkspace(w)}
                  title={w}
                >
                  {w.split('/').filter(Boolean).pop() || w}
                </button>
              ))}
            </div>
          )}

          {/* 2. agent ----------------------------------------------------- */}
          <div className="side-section-title" style={{ padding: '0 0 8px' }}>
            2 · {t('launch.agent')}
            <span className="dim" style={{ marginLeft: 8, fontWeight: 400 }}>
              {t('launch.agentCount', { ready: targets.filter((x) => x.ready).length, total: targets.length })}
            </span>
          </div>
          <div className="launch-agents-wrap">
            <div className="launch-agents">
              {targets.map((a) => (
                <AgentRow key={a.agentId} agent={a} selected={a.agentId === agentId} onSelect={setAgentId} />
              ))}
              {targets.length === 0 && (
                <div className="dim" style={{ fontSize: 12 }}>
                  {t('launch.noAgents')}
                </div>
              )}
            </div>
          </div>

          {/* 3. what will happen ------------------------------------------ */}
          {plan && (
            <div className="target-advice" style={{ marginTop: 16 }}>
              <div className="ta-head">
                <Info size={14} />
                {t('launch.willDo')}
              </div>
              <ul className="launch-plan">
                <li>
                  {t('launch.stepFolder')} <code className="mono">{plan.workFolder}</code>
                </li>
                {plan.projectSkillPath && (
                  <li>
                    {t('launch.stepInstall')} <code className="mono">{plan.projectSkillPath}</code>
                  </li>
                )}
                <li>
                  {t('launch.stepNote')} <code className="mono">{plan.instructionPath}</code>
                </li>
                <li>
                  {t('launch.stepStart')} <code className="mono">{plan.agentName}</code>
                </li>
              </ul>
              <div className="launch-prompt">
                <span className="dim">{t('launch.promptLabel')}</span>
                <div>{plan.prompt}</div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={launching || !plan}
            onClick={() => plan && void runLaunch(plan)}
          >
            {launching ? <span className="spinner" /> : <Rocket size={13} />}
            {t('launch.start')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentRow({
  agent,
  selected,
  onSelect
}: {
  agent: LaunchTarget
  selected: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const Icon = KIND_ICON[agent.kind]
  return (
    <button
      className={`launch-agent${selected ? ' active' : ''}${agent.ready ? '' : ' disabled'}`}
      onClick={() => agent.ready && onSelect(agent.agentId)}
      disabled={!agent.ready}
      title={agent.ready ? agent.detail : t('launch.notInstalled')}
    >
      <span className="dot" style={{ background: agent.color || 'var(--text-3)' }} />
      <span className="la-name">{agent.name}</span>
      <span className="la-kind">
        <Icon size={11} />
        {t(`launch.kind.${agent.kind}`)}
      </span>
      <span className="la-detail mono">{agent.ready ? agent.detail : t('launch.notInstalled')}</span>
      {selected && <Check size={12} className="la-check" />}
    </button>
  )
}
