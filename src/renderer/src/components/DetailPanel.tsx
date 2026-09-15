import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  Plus,
  Check,
  Download,
  Layers,
  Trash2,
  Link2,
  Copy,
  RefreshCw,
  FolderOpen,
  FileText,
  TrendingUp,
  Sparkles,
  Search,
  CircleAlert,
  Languages,
  X,
  Info
} from 'lucide-react'
import { categoryLabel, type AgentTarget } from '@shared/types'
import { api, fmtStars, fmtRelative, gradientFor } from '../api'
import { useStore } from '../store'
import { Markdown } from './Markdown'

export function DetailPanel(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const detail = useStore((s) => s.detail)
  const closeDetail = useStore((s) => s.closeDetail)
  const setDetailTab = useStore((s) => s.setDetailTab)
  const agents = useStore((s) => s.agents)
  const library = useStore((s) => s.library)
  const installMap = useStore((s) => s.installMap)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const removeFromLibrary = useStore((s) => s.removeFromLibrary)
  const syncItem = useStore((s) => s.syncLibraryItem)
  const install = useStore((s) => s.install)
  const uninstall = useStore((s) => s.uninstall)
  const toast = useStore((s) => s.toast)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'symlink' | 'copy'>('symlink')
  const [busy, setBusy] = useState(false)
  const [skillPreview, setSkillPreview] = useState<{ name: string; body: string } | null>(null)
  const [closing, setClosing] = useState(false)
  const [showAllAgents, setShowAllAgents] = useState(false)
  const [showSecondary, setShowSecondary] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const repoFullName = detail?.fullName
  const item = library.find((i) => i.fullName === repoFullName)
  const inLibrary = !!item && item.status === 'ready'
  const skills = useMemo(() => {
    if (!detail) return []
    const local = library.find((i) => i.fullName === detail.fullName)
    return local && local.skills.length ? local.skills : detail.skills
  }, [detail, library])

  /**
   * Play the exit animation before unmounting. Without this the panel would
   * vanish instantly and the motion would feel one-sided.
   */
  const closingRef = useRef(false)
  const requestClose = useCallback((): void => {
    // A ref, not the state updater: React may invoke an updater more than once,
    // which would schedule several close timers from a single click.
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(() => closeDetail(), 190)
  }, [closeDetail])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (skillPreview) setSkillPreview(null)
      else requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose, skillPreview])

  // A different repository should start reading from the top.
  useEffect(() => {
    closingRef.current = false
    setClosing(false)
    bodyRef.current?.scrollTo({ top: 0 })
  }, [repoFullName])

  // Reset per-repo UI state.
  useEffect(() => {
    setSelected(new Set())
    setSkillPreview(null)
    setMode(useStore.getState().settings?.installMode || 'symlink')
    setTargets(new Set(useStore.getState().agents.filter((a) => a.enabled).map((a) => a.id)))
    setShowAllAgents(false)
    setAgentQuery('')
    setShowSecondary(false)
  }, [repoFullName])

  useEffect(() => {
    if (skills.length && selected.size === 0) {
      setSelected(new Set(skills.map((s) => s.id)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills.length])

  if (!detail) return null
  const meta = detail.meta
  const [c1, c2] = gradientFor(detail.fullName)
  const descriptionZh = meta?.aboutZh || meta?.descriptionZh
  const descriptionEn = meta?.descriptionEn
  const shownZh = descriptionZh
  const tagline = lang === 'zh' ? meta?.taglineZh : meta?.taglineEn

  const isCJK = (s?: string): boolean => !!s && /[\u4e00-\u9fa5]/.test(s)

  const doAdd = async (): Promise<boolean> => {
    setBusy(true)
    try {
      const created = await addToLibrary(detail.fullName)
      return !!created && created.status === 'ready'
    } finally {
      setBusy(false)
    }
  }

  const doInstall = async (): Promise<void> => {
    if (!selected.size) {
      toast('info', t('detail.noneSelected'))
      return
    }
    if (!targets.size) {
      toast('info', t('detail.chooseAgents'))
      return
    }
    setBusy(true)
    try {
      let ok = inLibrary
      if (!ok) ok = await doAdd()
      if (!ok) return
      await install([...selected], [...targets], mode)
    } finally {
      setBusy(false)
    }
  }

  const openSkillPreview = async (path: string, name: string): Promise<void> => {
    try {
      const text = await api.github.skillFile(detail.fullName, meta?.defaultBranch || 'main', path)
      const parsed = await api.system.parseSkill(text)
      setSkillPreview({ name, body: text || parsed?.body || '' })
    } catch {
      setSkillPreview({ name, body: '' })
    }
  }

  const installedAgentsFor = (skillId: string): string[] => installMap[skillId] || []
  const installedTotal = skills.reduce((n, s) => n + installedAgentsFor(s.id).length, 0)

  return (
    <div className={`detail${closing ? ' closing' : ''}`}>
      <div
        className="detail-hero"
        style={{ background: `linear-gradient(120deg, ${c1} 0%, ${c2} 55%, rgba(6,8,13,0.9) 100%)` }}
      >
        <div className="hero-inner">
          <button className="btn ghost sm" onClick={requestClose} style={{ marginRight: -4 }} title="Esc">
            <ArrowLeft size={15} />
          </button>
          {meta?.avatarUrl && <img className="hero-avatar" src={meta.avatarUrl} alt="" />}
          <div className="hero-main">
            <div className="hero-owner">{meta?.owner || detail.fullName.split('/')[0]}</div>
            <div className="hero-title">
              {meta?.name || detail.fullName.split('/')[1]}
              {meta?.category && (
                <span className="chip">
                  {categoryLabel(meta.category, lang)}
                </span>
              )}
              {inLibrary && (
                <span className="chip green">
                  <Check size={10} />
                  {t('card.inLibrary')}
                </span>
              )}
              {meta?.archived && <span className="chip">archived</span>}
            </div>
            {tagline && <div className="hero-tagline">{tagline}</div>}
            {meta?.useWhen && (
              <div className="hero-usewhen">
                {t('store.useWhen')}
                {t('common.labelSeparator')}
                {lang === 'zh' ? meta.useWhen : meta.useWhenEn || meta.useWhen}
              </div>
            )}
            <div className="hero-tags">
              {(meta?.topics || []).slice(0, 8).map((tag) => (
                <span key={tag} className="chip mono">
                  {tag}
                </span>
              ))}
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="k">{t('common.stars')}</span>
                <span className="v">{fmtStars(meta?.stars)}</span>
              </div>
              <div className="hero-stat">
                <span className="k">{t('detail.repoSkillCount')}</span>
                <span className="v">{skills.length}</span>
              </div>
              <div className="hero-stat">
                <span className="k">{t('detail.installedTo')}</span>
                <span className="v">{installedTotal}</span>
              </div>
              {!!meta?.forks && (
                <div className="hero-stat">
                  <span className="k">Forks</span>
                  <span className="v">{fmtStars(meta.forks)}</span>
                </div>
              )}
              {meta?.license && (
                <div className="hero-stat">
                  <span className="k">{t('detail.license')}</span>
                  <span className="v" style={{ fontSize: 13 }}>
                    {meta.license}
                  </span>
                </div>
              )}
              {meta?.pushedAt && (
                <div className="hero-stat">
                  <span className="k">{t('detail.updated')}</span>
                  <span className="v" style={{ fontSize: 12 }}>
                    {fmtRelative(Date.parse(meta.pushedAt), lang)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="hero-actions">
            <button
              className="btn"
              onClick={() => void window.skillhub.system.openExternal(meta?.htmlUrl || `https://github.com/${detail.fullName}`)}
            >
              <ExternalLink size={13} />
              GitHub
            </button>
            {inLibrary ? (
              <>
                <button className="btn" disabled={busy} onClick={() => void syncItem(detail.fullName)}>
                  <RefreshCw size={13} />
                  {t('library.sync')}
                </button>
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(t('library.removeConfirm') + '\n' + t('library.removeHint'))) {
                      void removeFromLibrary(detail.fullName, true)
                    }
                  }}
                >
                  <Trash2 size={13} />
                  {t('detail.removeFromLibrary')}
                </button>
              </>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => void doAdd()}>
                {busy ? <span className="spinner" /> : <Plus size={13} />}
                {t('card.add')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="detail-tabs">
        <button className={`detail-tab ${detail.tab === 'overview' ? 'active' : ''}`} onClick={() => setDetailTab('overview')}>
          <FileText size={13} />
          {t('detail.overview')}
        </button>
        <button className={`detail-tab ${detail.tab === 'skills' ? 'active' : ''}`} onClick={() => setDetailTab('skills')}>
          <Layers size={13} />
          {t('detail.skills')}
          <span className="chip mono">{skills.length}</span>
        </button>
        <button className={`detail-tab ${detail.tab === 'readme' ? 'active' : ''}`} onClick={() => setDetailTab('readme')}>
          <FileText size={13} />
          {t('detail.readme')}
        </button>
      </div>

      <div className="detail-body" ref={bodyRef}>
        {detail.loading && !meta ? (
          <div className="flex" style={{ justifyContent: 'center', padding: 60 }}>
            <span className="spinner lg" />
          </div>
        ) : detail.error ? (
          <div className="empty">
            <CircleAlert size={26} className="icon" />
            <h3>{detail.error}</h3>
            <button className="btn" onClick={() => void useStore.getState().openDetail(detail.fullName)}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="detail-cols">
            <div
              key={detail.tab}
              className="tab-panel"
              style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {detail.tab === 'overview' && (
                <>
                  {meta?.repoKind === 'reference' && (
                    <div className="notice notice-plain">
                      <Info size={14} />
                      <span>{t('detail.kindReference')}</span>
                    </div>
                  )}
                  {meta?.repoKind === 'software' && (
                    <div className="notice notice-plain">
                      <Info size={14} />
                      <span>{t('detail.kindSoftware')}</span>
                    </div>
                  )}
                  {/* The secondary-language description is collapsed when it is
                      not the UI language, so English mode never shows Chinese
                      unprompted (and vice versa) while still keeping the
                      bilingual text one click away. */}
                  {(lang === 'zh' || showSecondary) && (
                    <div className="panel">
                      <div className="panel-head">
                        <Sparkles size={13} />
                        {lang === 'zh' ? t('detail.zhIntro') : t('detail.secondaryIntro')}
                        <div className="right">
                          {lang !== 'zh' && (
                            <button className="btn ghost sm" onClick={() => setShowSecondary(false)}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="panel-body">
                        <div className="about-text zh">
                          {isCJK(shownZh) ? (
                            shownZh
                          ) : shownZh ? (
                            <em className="dim">{shownZh}</em>
                          ) : (
                            <span className="dim">{t('detail.noZhIntro')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="panel">
                    <div className="panel-head">
                      <FileText size={13} />
                      {t('detail.enIntro')}
                      {lang !== 'zh' && descriptionZh && !showSecondary && (
                        <div className="right">
                          <button className="btn ghost sm" onClick={() => setShowSecondary(true)}>
                            <Languages size={12} />
                            {t('detail.showSecondary')}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="panel-body">
                      <div className="about-text">{descriptionEn || <span className="dim">—</span>}</div>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head">
                      <Layers size={13} />
                      {t('detail.skills')}
                      <div className="right">
                        <button className="btn ghost sm" onClick={() => setDetailTab('skills')}>
                          {t('detail.selectSkills')}
                        </button>
                      </div>
                    </div>
                    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                      {skills.length === 0 ? (
                        <div className="panel-body dim">{t('detail.noSkills')}</div>
                      ) : (
                        skills.slice(0, 40).map((s) => (
                          <div className="skill-row" key={s.id}>
                            <div className="skill-main">
                              <div className="skill-name">
                                {s.name}
                                {installedAgentsFor(s.id).length > 0 && (
                                  <span className="chip green">
                                    <Check size={9} />
                                    {installedAgentsFor(s.id).length}
                                  </span>
                                )}
                              </div>
                              {s.path && <div className="skill-path">{s.path}</div>}
                              <div className="skill-desc">
                                {lang === 'zh' ? s.descriptionZh || s.descriptionEn : s.descriptionEn}
                              </div>
                            </div>
                            <div className="skill-side">
                              <button className="btn ghost sm" onClick={() => void openSkillPreview(s.path, s.name)}>
                                SKILL.md
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {detail.tab === 'skills' && (
                <div className="panel">
                  <div className="panel-head">
                    <Layers size={13} />
                    {t('detail.selectSkills')}
                    <div className="right">
                      <span className="chip mono">
                        {selected.size}/{skills.length}
                      </span>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setSelected(selected.size === skills.length ? new Set() : new Set(skills.map((s) => s.id)))
                        }
                      >
                        {t('detail.selectAll')}
                      </button>
                    </div>
                  </div>
                  {skills.length === 0 ? (
                    <div className="panel-body dim">{t('detail.noSkills')}</div>
                  ) : (
                    <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
                      {skills.map((s) => {
                        const on = selected.has(s.id)
                        const agentsForSkill = installedAgentsFor(s.id)
                        return (
                          <div className="skill-row" key={s.id}>
                            <button
                              className={`skill-check ${on ? 'on' : ''}`}
                              onClick={() => {
                                const next = new Set(selected)
                                if (on) next.delete(s.id)
                                else next.add(s.id)
                                setSelected(next)
                              }}
                            >
                              <Check size={10} />
                            </button>
                            <div className="skill-main">
                              <div className="skill-name">
                                {s.name}
                                {s.tags.slice(0, 3).map((tag) => (
                                  <span className="chip mono" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              {s.path && <div className="skill-path">{s.path}</div>}
                              <div className="skill-desc">
                                {lang === 'zh' ? s.descriptionZh || s.descriptionEn : s.descriptionEn}
                              </div>
                              {agentsForSkill.length > 0 && (
                                <div className="flex" style={{ gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                                  {agentsForSkill.map((aid) => {
                                    const agent = agents.find((a) => a.id === aid)
                                    return (
                                      <span
                                        key={aid}
                                        className="chip green clickable"
                                        title={t('detail.uninstall')}
                                        onClick={() => void uninstall(s.id, aid)}
                                      >
                                        <Check size={9} />
                                        {agent?.name || aid}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="skill-side">
                              <button className="btn ghost sm" onClick={() => void openSkillPreview(s.path, s.name)}>
                                <FileText size={11} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {detail.tab === 'readme' && (
                <div className="panel">
                  <div className="panel-head">
                    <FileText size={13} />
                    README
                  </div>
                  <div className="panel-body">
                    {detail.readme ? (
                      <Markdown
                        text={detail.readme}
                        dropFirstHeading
                        rawBase={`https://raw.githubusercontent.com/${detail.fullName}/${meta?.defaultBranch || 'main'}/`}
                      />
                    ) : (
                      <div className="dim">{t('common.empty')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Install column ------------------------------------------------- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
              <div className="panel">
                <div className="panel-head">
                  <Download size={13} />
                  {t('detail.install')}
                </div>
                <div className="panel-body">
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600 }}>
                    {t('detail.chooseAgents')}
                  </div>
                  <AgentPicker
                    agents={agents}
                    targets={targets}
                    setTargets={setTargets}
                    expanded={showAllAgents}
                    onToggleExpanded={() => setShowAllAgents((v) => !v)}
                    query={agentQuery}
                    setQuery={setAgentQuery}
                  />

                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600 }}>
                    {t('detail.installMode')}
                  </div>
                  <div className="seg" style={{ width: '100%', marginBottom: 14 }}>
                    <button
                      className={mode === 'symlink' ? 'active' : ''}
                      style={{ flex: 1 }}
                      onClick={() => setMode('symlink')}
                    >
                      <Link2 size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      {t('detail.symlink')}
                    </button>
                    <button className={mode === 'copy' ? 'active' : ''} style={{ flex: 1 }} onClick={() => setMode('copy')}>
                      <Copy size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      {t('detail.copy')}
                    </button>
                  </div>

                  <button
                    className="btn primary lg block"
                    disabled={busy || !skills.length}
                    onClick={() => void doInstall()}
                  >
                    {busy ? <span className="spinner" /> : <Download size={14} />}
                    {inLibrary ? t('detail.doInstall') : t('detail.addAndInstall')}
                  </button>
                  {(meta?.repoKind === 'reference' || !skills.length) && (
                    <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
                      {t('detail.nothingToInstall')}
                    </div>
                  )}
                  <div className="dim" style={{ fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                    {selected.size} {t('common.skills')} → {targets.size} {t('status.agents')}
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <FolderOpen size={13} />
                  {t('detail.libraryPath')}
                </div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>{t('detail.source')}</dt>
                    <dd className="mono">{inLibrary ? item!.sourcePath : inLibrary ? '' : '—'}</dd>
                    <dt>{t('detail.lastSync')}</dt>
                    <dd>{item?.lastSyncAt ? fmtRelative(item.lastSyncAt, lang) : '—'}</dd>
                    <dt>{t('detail.license')}</dt>
                    <dd>{meta?.license || '—'}</dd>
                    <dt>{t('detail.growth')}</dt>
                    <dd>
                      <GrowthInline fullName={detail.fullName} />
                    </dd>
                  </dl>
                  {inLibrary && (
                    <button
                      className="btn block sm"
                      style={{ marginTop: 12 }}
                      onClick={() => void api.system.openPath(item!.sourcePath)}
                    >
                      <FolderOpen size={12} />
                      {t('common.openFolder')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {skillPreview && (
        <div className="overlay" onClick={() => setSkillPreview(null)}>
          <div className="modal" style={{ width: 'min(760px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <FileText size={14} />
              {skillPreview.name} · SKILL.md
            </div>
            <div className="modal-body" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
              {skillPreview.body ? (
                <Markdown text={skillPreview.body} />
              ) : (
                <div className="dim">
                  {inLibrary ? t('common.empty') : t('detail.addAndInstall')}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setSkillPreview(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The registry covers 80 agents. Dumping 80 checkboxes into a 330px column is
 * useless, so show the enabled ones (which are pre-checked) plus anything the
 * user has already selected, and put the rest behind a searchable disclosure.
 */
function AgentPicker({
  agents,
  targets,
  setTargets,
  expanded,
  onToggleExpanded,
  query,
  setQuery
}: {
  agents: AgentTarget[]
  targets: Set<string>
  setTargets: (next: Set<string>) => void
  expanded: boolean
  onToggleExpanded: () => void
  query: string
  setQuery: (q: string) => void
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const term = query.trim().toLowerCase()
  const matches = (a: AgentTarget): boolean =>
    !term ||
    a.name.toLowerCase().includes(term) ||
    (a.vendor || '').toLowerCase().includes(term) ||
    a.path.toLowerCase().includes(term)

  const primary = agents.filter((a) => a.enabled || targets.has(a.id))
  const rest = agents.filter((a) => !primary.includes(a))
  const shown = expanded ? agents.filter(matches) : primary
  const toggle = (id: string): void => {
    const next = new Set(targets)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setTargets(next)
  }

  const confTitle = (a: AgentTarget): string =>
    a.confidence === 'medium' || a.confidence === 'low'
      ? t('agents.confMedium')
      : t('agents.confHigh')

  return (
    <div style={{ marginBottom: 14 }}>
      {expanded && (
        <div className="searchbox" style={{ marginBottom: 8, height: 26 }}>
          <Search size={12} className="dim" />
          <input
            value={query}
            spellCheck={false}
            placeholder={t('detail.agentSearch')}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>
      )}

      <div className="agent-picker">
        {agents.length === 0 && (
          <div className="dim" style={{ fontSize: 11.5 }}>
            {t('detail.noAgents')}
          </div>
        )}
        {shown.map((a) => {
          const on = targets.has(a.id)
          return (
            <label key={a.id} className="agent-pick-row" title={`${a.path}\n${confTitle(a)}`}>
              <button
                className={`skill-check ${on ? 'on' : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  toggle(a.id)
                }}
              >
                <Check size={10} />
              </button>
              <span className="dot" style={{ background: a.color || 'var(--text-3)' }} />
              <span className="nm">{a.name}</span>
              {a.projectOnly && <span className="chip mono violet">{t('detail.projectOnly')}</span>}
              {a.kind === 'custom' && <span className="chip mono">custom</span>}
              {!a.detected && !a.projectOnly && <span className="chip mono dim">?</span>}
              {a.confidence && a.confidence !== 'high' && (
                <span
                  className="chip mono"
                  style={{ color: 'var(--warn)', borderColor: 'rgba(210,153,34,.3)' }}
                  title={confTitle(a)}
                >
                  {a.confidence}
                </span>
              )}
              <span className="mono dim cnt">{a.found || 0}</span>
            </label>
          )
        })}
        {shown.length === 0 && <div className="dim" style={{ fontSize: 11.5, padding: 6 }}>{t('palette.noMatch')}</div>}
      </div>

      {(rest.length > 0 || expanded) && (
        <button className="btn block sm" style={{ marginTop: 8 }} onClick={onToggleExpanded}>
          {expanded ? t('detail.hideAllAgents') : t('detail.showAllAgents', { n: agents.length })}
        </button>
      )}
    </div>
  )
}

function GrowthInline({ fullName }: { fullName: string }): React.JSX.Element {
  const t = useStore((s) => s.t)
  const [value, setValue] = useState<Awaited<ReturnType<typeof api.board.growthOne>> | null>(null)
  useEffect(() => {
    let alive = true
    api.board
      .growthOne(fullName, 7)
      .then((v) => {
        if (alive) setValue(v)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [fullName])
  if (!value) return <span className="dim">…</span>
  if (value.source === 'unavailable') return <span className="dim">n/a</span>
  return (
    <span className="mono flex" style={{ gap: 4 }} title={t(sourceKey(value.source))}>
      <TrendingUp size={11} style={{ color: 'var(--ok)' }} />
      <span style={{ color: 'var(--ok)' }}>
        {value.approx ? '≥' : '+'}
        {value.gained}
      </span>
      <span className="dim">/7d</span>
    </span>
  )
}

export function sourceKey(source: string): string {
  if (source === 'snapshot') return 'charts.sourceSnapshot'
  if (source === 'events-api') return 'charts.sourceEvents'
  if (source === 'stargazers-api') return 'charts.sourceApi'
  return 'charts.sourceNone'
}
