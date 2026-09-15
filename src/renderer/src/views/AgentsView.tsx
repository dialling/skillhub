import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  Link2,
  Copy,
  FolderPlus,
  X,
  Info,
  Search,
  Sparkles
} from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'
import type { AgentTarget } from '@shared/types'

type Scope = 'all' | 'detected' | 'enabled'

export function AgentsView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const agents = useStore((s) => s.agents)
  const refreshAgents = useStore((s) => s.refreshAgents)
  const toggleAgent = useStore((s) => s.toggleAgent)
  const toast = useStore((s) => s.toast)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')

  const active = agents.filter((a) => a.enabled).length
  const detected = agents.filter((a) => a.detected).length
  // Newly installed agents are deliberately NOT auto-enabled (that would
  // silently change what an install touches), but they should not be missed.
  const newArrivals = agents.filter((a) => a.detected && !a.enabled)

  // The registry covers 40+ agents, so keep the useful ones on screen: enabled
  // first, then detected, then everything else in registry order.
  const UNKNOWN_VENDOR = t('agents.unknownVendor')

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    const rank = (a: AgentTarget): number => (a.enabled ? 0 : a.detected ? 1 : 2)
    return agents
      .filter((a) => {
        if (scope === 'detected' && !a.detected) return false
        if (scope === 'enabled' && !a.enabled) return false
        if (!term) return true
        return (
          a.name.toLowerCase().includes(term) ||
          (a.vendor || '').toLowerCase().includes(term) ||
          a.path.toLowerCase().includes(term) ||
          a.id.toLowerCase().includes(term)
        )
      })
      .map((a, i) => ({ a, i }))
      .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
      .map((x) => x.a)
  }, [agents, query, scope])

  /**
   * Group by the company that makes the agent — "all the Kimi ones together",
   * which is how people actually think about agents. Groups holding something
   * the user already has come first, then groups by size, then alphabetically.
   */
  const groups = useMemo(() => {
    const map = new Map<string, AgentTarget[]>()
    for (const a of visible) {
      const vendor = (a.vendor || '').trim() || UNKNOWN_VENDOR
      ;(map.get(vendor) || map.set(vendor, []).get(vendor)!).push(a)
    }
    return [...map.entries()]
      .map(([vendor, list]) => ({
        vendor,
        agents: list,
        detected: list.filter((a) => a.detected).length,
        enabled: list.filter((a) => a.enabled).length
      }))
      .sort(
        (a, b) =>
          b.detected - a.detected ||
          b.enabled - a.enabled ||
          b.agents.length - a.agents.length ||
          a.vendor.localeCompare(b.vendor)
      )
  }, [visible, UNKNOWN_VENDOR])

  useEffect(() => {
    void refreshAgents()
  }, [refreshAgents])

  const onAdd = async (): Promise<void> => {
    if (!name.trim() || !path.trim()) return
    try {
      await api.agents.addCustom(name.trim(), path.trim())
      await refreshAgents()
      setName('')
      setPath('')
      setAdding(false)
      toast('success', t('common.save'))
    } catch (err: any) {
      toast('error', t('toast.failed', { msg: err?.message || err }))
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">
            <Bot size={19} />
            {t('agents.title')}
          </div>
          <div className="view-sub">{t('agents.subtitle')}</div>
        </div>
        <div className="view-head-actions">
          <span className="chip green mono" title={t('agents.enabled')}>
            <Check size={10} />
            {active}
          </span>
          <span className="chip mono" title={t('agents.detected')}>
            <Search size={10} />
            {detected}/{agents.length}
          </span>
          <button className="btn" onClick={() => void refreshAgents()}>
            <RefreshCw size={13} />
            {t('agents.autodetect')}
          </button>
          <button className="btn primary" onClick={() => setAdding((v) => !v)}>
            <Plus size={13} />
            {t('agents.addCustom')}
          </button>
        </div>
      </div>

      {newArrivals.length > 0 && (
        <div className="notice">
          <Sparkles size={14} />
          <span>
            {t('agents.newArrivals', { n: newArrivals.length })}
            <span className="dim">
              {' · '}
              {newArrivals.map((a) => a.name).slice(0, 6).join(t('common.listSeparator'))}
            </span>
          </span>
          <button
            className="btn sm primary"
            onClick={async () => {
              await api.agents.setEnabled([...new Set([...agents.filter((a) => a.enabled).map((a) => a.id), ...newArrivals.map((a) => a.id)])])
              await refreshAgents()
              toast('success', t('common.save'))
            }}
          >
            <Check size={11} />
            {t('agents.enableAll')}
          </button>
        </div>
      )}

      <div className="filter-bar">
        <div className="searchbox" style={{ maxWidth: 320 }}>
          <Search size={13} className="dim" />
          <input
            value={query}
            spellCheck={false}
            placeholder={t('agents.filterPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="btn ghost sm" style={{ height: 18, padding: '0 4px' }} onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="seg">
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
            {t('common.all')} {agents.length}
          </button>
          <button className={scope === 'detected' ? 'active' : ''} onClick={() => setScope('detected')}>
            {t('agents.detected')} {detected}
          </button>
          <button className={scope === 'enabled' ? 'active' : ''} onClick={() => setScope('enabled')}>
            {t('agents.enabled')} {active}
          </button>
        </div>
        <span className="dim mono" style={{ marginLeft: 'auto', fontSize: 11 }}>
          {visible.length} / {agents.length}
        </span>
      </div>

      {adding && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <FolderPlus size={13} />
            {t('agents.addCustom')}
            <button className="btn ghost sm right" style={{ marginLeft: 'auto' }} onClick={() => setAdding(false)}>
              <X size={12} />
            </button>
          </div>
          <div className="panel-body">
            <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
              <div className="field" style={{ flex: '0 0 200px', marginBottom: 0 }}>
                <label>{t('agents.customName')}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>{t('agents.customPath')}</label>
                <input
                  className="input"
                  value={path}
                  spellCheck={false}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="~/.myagent/skills"
                  onKeyDown={(e) => e.key === 'Enter' && void onAdd()}
                />
              </div>
              <button
                className="btn"
                onClick={async () => {
                  const picked = await api.system.pickDirectory()
                  if (picked) setPath(picked)
                }}
              >
                <FolderOpen size={13} />
                {t('agents.pickDir')}
              </button>
              <button className="btn primary" onClick={() => void onAdd()} disabled={!name.trim() || !path.trim()}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          <Search size={26} className="icon" />
          <h3>{t('palette.noMatch')}</h3>
          <button className="btn" onClick={() => { setQuery(''); setScope('all') }}>
            {t('common.all')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {groups.map((group) => (
            <div key={group.vendor}>
              <div className="vendor-head">
                <span className="vendor-name">{group.vendor}</span>
                <span className="vendor-count">
                  {group.detected > 0
                    ? t('agents.vendorDetected', { n: group.detected, total: group.agents.length })
                    : t('agents.vendorTotal', { n: group.agents.length })}
                </span>
                <div className="vendor-line" />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {group.agents.map((agent, i) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    style={{ ['--i' as never]: Math.min(i, 10) }}
                    expanded={expanded === agent.id}
                    onToggleExpand={() => setExpanded(expanded === agent.id ? null : agent.id)}
                    onToggleEnabled={(v) => void toggleAgent(agent.id, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCard({
  agent,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  style
}: {
  agent: AgentTarget
  expanded: boolean
  onToggleExpand: () => void
  onToggleEnabled: (v: boolean) => void
  style?: React.CSSProperties
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const toast = useStore((s) => s.toast)
  const refreshAgents = useStore((s) => s.refreshAgents)
  const refreshInstalls = useStore((s) => s.refreshInstalls)
  const installMap = useStore((s) => s.installMap)
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof api.agents.scan>> | null>(null)
  const [loading, setLoading] = useState(false)

  const managed = Object.values(installMap).filter((l) => l.includes(agent.id)).length

  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    api.agents
      .scan(agent.id)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [expanded, agent.id])

  return (
    <div className={`agent-card ${agent.enabled ? 'on' : ''}`} style={style}>
      <div className="agent-head" onClick={onToggleExpand}>
        <span className="dim">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <div
          className="agent-glyph"
          style={{ background: `linear-gradient(135deg, ${agent.color || '#334155'}, rgba(0,0,0,.5))` }}
        >
          {agent.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="agent-info">
          <div className="agent-name">
            {agent.name}
            {agent.vendor && <span className="dim" style={{ fontSize: 11, fontWeight: 400 }}>{agent.vendor}</span>}
            {agent.detected ? (
              <span className="chip green mono">
                <Check size={9} />
                {t('agents.detected')}
              </span>
            ) : (
              <span className="chip mono" style={{ color: 'var(--warn)', borderColor: 'rgba(210,153,34,.3)' }}>
                <AlertCircle size={9} />
                {t('agents.notDetected')}
              </span>
            )}
            {agent.kind === 'custom' && <span className="chip violet mono">custom</span>}
            {agent.confidence && agent.confidence !== 'high' && (
              <span className="chip mono" style={{ color: 'var(--warn)', borderColor: 'rgba(210,153,34,.3)' }}>
                {agent.confidence}
              </span>
            )}
          </div>
          <div className="agent-path">{agent.path}</div>
        </div>

        <div className="agent-meta" onClick={(e) => e.stopPropagation()}>
          <span className="chip mono" title={t('agents.found', { n: agent.found || 0 })}>
            {agent.found || 0}
          </span>
          {managed > 0 && (
            <span className="chip green mono" title={t('agents.managed', { n: managed })}>
              <Check size={9} />
              {managed}
            </span>
          )}
          {agent.sourceUrl && (
            <button
              className="btn ghost sm"
              title={agent.sourceUrl}
              onClick={() => void api.system.openExternal(agent.sourceUrl as string)}
            >
              <Info size={12} />
            </button>
          )}
          <button className="btn ghost sm" title={t('common.openFolder')} onClick={() => void api.agents.reveal(agent.path)}>
            <FolderOpen size={12} />
          </button>
          {agent.kind === 'custom' && (
            <button
              className="btn ghost sm danger"
              onClick={async () => {
                await api.agents.removeCustom(agent.id.replace('custom:', ''))
                await refreshAgents()
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            className={`switch ${agent.enabled ? 'on' : ''}`}
            title={agent.enabled ? t('agents.enabled') : t('agents.disabled')}
            onClick={() => onToggleEnabled(!agent.enabled)}
          />
        </div>
      </div>

      {expanded && (
        <div className="agent-skills">
          {loading ? (
            <div className="flex" style={{ padding: 14, gap: 8 }}>
              <span className="spinner" />
              <span className="dim">{t('agents.scanning')}</span>
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="dim" style={{ padding: 14, fontSize: 12 }}>
              {t('agents.noSkills')}
            </div>
          ) : (
            entries.map((entry) => (
              <div className="agent-skill-item" key={entry.path}>
                {entry.isSymlink ? (
                  <Link2 size={12} style={{ color: entry.managed ? 'var(--ok)' : 'var(--text-3)', flex: 'none' }} />
                ) : (
                  <Copy size={12} style={{ color: entry.managed ? 'var(--ok)' : 'var(--text-3)', flex: 'none' }} />
                )}
                <span className="nm">{entry.name}</span>
                {entry.managed && (
                  <span className="chip green mono" style={{ height: 17 }}>
                    SkillHub
                  </span>
                )}
                {!entry.hasSkillFile && (
                  <span className="chip mono" style={{ height: 17, color: 'var(--warn)' }}>
                    no SKILL.md
                  </span>
                )}
                <span className="p" title={entry.linkTarget || entry.path}>
                  {entry.linkTarget ? `→ ${entry.linkTarget}` : entry.path}
                </span>
                <button
                  className="btn ghost sm danger"
                  title={t('agents.removeEntry')}
                  onClick={async () => {
                    await api.agents.removeRaw(entry.path)
                    await Promise.all([refreshAgents(), refreshInstalls()])
                    const next = await api.agents.scan(agent.id)
                    setEntries(next)
                    toast('success', t('toast.uninstalled'))
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
