import { useEffect, useState } from 'react'
import { Rocket, FolderOpen, Terminal, AppWindow, Globe, Check, X, Info } from 'lucide-react'
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
  const skillId = useStore((s) => s.launchSkillId)
  const plan = useStore((s) => s.launchPlan)
  const launching = useStore((s) => s.launching)
  const close = useStore((s) => s.closeLaunch)
  const buildPlan = useStore((s) => s.buildLaunchPlan)
  const runLaunch = useStore((s) => s.runLaunch)
  const library = useStore((s) => s.library)
  const settings = useStore((s) => s.settings)

  const [workspace, setWorkspace] = useState('')
  const [agentId, setAgentId] = useState('')

  const skill = library.flatMap((i) => i.skills).find((s) => s.id === skillId)

  useEffect(() => {
    if (!open) return
    setWorkspace(settings?.recentWorkspaces?.[0] || settings?.projectDir || '')
    const firstReady = targets.find((x) => x.ready && x.detected) || targets.find((x) => x.ready)
    setAgentId(firstReady?.agentId || '')
  }, [open, settings, targets])

  // Rebuild the preview whenever either choice changes.
  useEffect(() => {
    if (!open || !agentId || !workspace.trim()) return
    const handle = setTimeout(() => void buildPlan(agentId, workspace), 250)
    return () => clearTimeout(handle)
  }, [open, agentId, workspace, buildPlan])

  if (!open) return null

  const recent = settings?.recentWorkspaces || []

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" style={{ width: 'min(680px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Rocket size={15} />
          {t('launch.title', { skill: skill?.name || '' })}
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={close}>
            <X size={13} />
          </button>
        </div>

        <div className="modal-body">
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.65 }}>
            {t('launch.intro')}
          </p>

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
          </div>
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
          </div>
          <div className="launch-agents">
            {targets.map((a) => (
              <AgentRow key={a.agentId} agent={a} selected={a.agentId === agentId} onSelect={setAgentId} />
            ))}
            {targets.length === 0 && <div className="dim" style={{ fontSize: 12 }}>{t('launch.noAgents')}</div>}
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
