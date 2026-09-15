import { useMemo, useState } from 'react'
import {
  Library,
  FolderPlus,
  RefreshCw,
  Check,
  Trash2,
  FolderOpen,
  Download,
  Layers,
  Rocket,
  Bot,
  Plus,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Star,
  Play
} from 'lucide-react'
import type { LibraryItem } from '@shared/types'
import { fmtRelative, fmtStars, gradientFor } from '../api'
import { useStore } from '../store'
import { stagger } from '../ui'

/**
 * The library, laid out the way Steam lays out a game library: a big banner for
 * whichever item is selected, with the full collection as large art tiles
 * underneath. The previous version was a flat grid of small cards where every
 * item competed for attention equally and nothing told you what to do next.
 */
export function LibraryView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const library = useStore((s) => s.library)
  const installMap = useStore((s) => s.installMap)
  const filter = useStore((s) => s.libraryFilter)
  const sort = useStore((s) => s.librarySort)
  const setSort = useStore((s) => s.setLibrarySort)
  const view = useStore((s) => s.libraryView)
  const setView = useStore((s) => s.setLibraryView)
  const selectedId = useStore((s) => s.selectedLibraryId)
  const setSelected = useStore((s) => s.setSelectedLibrary)
  const setAddLocal = useStore((s) => s.setAddLocal)
  const setStoreView = useStore((s) => s.setView)
  const openDetail = useStore((s) => s.openDetail)
  const syncItem = useStore((s) => s.syncLibraryItem)
  const removeFromLibrary = useStore((s) => s.removeFromLibrary)
  const install = useStore((s) => s.install)
  const agents = useStore((s) => s.agents)
  const [bulkBusy, setBulkBusy] = useState(false)

  const installedSkillsOf = (item: LibraryItem): number =>
    item.skills.filter((s) => (installMap[s.id] || []).length > 0).length

  const items = useMemo(() => {
    const installed = new Set(Object.keys(installMap))
    let list = [...library]
    if (filter === 'installed') list = list.filter((i) => i.skills.some((s) => installed.has(s.id)))
    if (filter === 'pending') list = list.filter((i) => !i.skills.some((s) => installed.has(s.id)))
    list.sort((a, b) => {
      if (sort === 'stars') return (b.meta.stars || 0) - (a.meta.stars || 0)
      if (sort === 'name') return a.fullName.localeCompare(b.fullName)
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
    return list
  }, [library, filter, sort, installMap])

  const selected = items.find((i) => i.id === selectedId) || items[0] || null
  const activeAgents = agents.filter((a) => a.enabled)
  const installedTotal = Object.values(installMap).reduce((n, l) => n + l.length, 0)

  const installEverything = async (): Promise<void> => {
    if (!activeAgents.length) return
    setBulkBusy(true)
    try {
      const pending: string[] = []
      for (const item of library) {
        for (const s of item.skills) if (!(installMap[s.id] || []).length) pending.push(s.id)
      }
      if (pending.length) await install(pending, activeAgents.map((a) => a.id))
    } finally {
      setBulkBusy(false)
    }
  }

  if (library.length === 0) {
    return (
      <div className="view">
        <div className="view-head">
          <div>
            <div className="view-title">
              <Library size={19} />
              {t('library.title')}
            </div>
            <div className="view-sub">{t('library.subtitle')}</div>
          </div>
        </div>
        <MySkillsPanel />
        <div className="empty" style={{ marginTop: 18 }}>
          <Library size={30} className="icon" />
          <h3>{t('library.empty')}</h3>
          <p>{t('library.emptyHint')}</p>
          <div className="row">
            <button className="btn primary" onClick={() => setStoreView('store')}>
              {t('nav.store')}
            </button>
            <button className="btn" onClick={() => setAddLocal(true)}>
              <FolderPlus size={13} />
              {t('library.addLocal')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="view view-flush">
      <MySkillsPanel />

      {selected && (
        <LibraryHero
          item={selected}
          installedSkills={installedSkillsOf(selected)}
          agentCount={activeAgents.length}
          onLaunch={() => void openLaunchForItem(selected)}
          onDetail={() => void openDetail(selected.fullName)}
          onSync={() => void syncItem(selected.id)}
          onReveal={() => void window.skillhub.system.openPath(selected.sourcePath)}
          onRemove={() => {
            if (confirm(`${t('library.removeConfirm')}\n${t('library.removeHint')}\n\n${t('library.deleteFiles')}?`)) {
              void removeFromLibrary(selected.id, true)
            }
          }}
        />
      )}

      <div className="lib-toolbar">
        <div className="seg">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => useStore.getState().setLibraryFilter('all')}>
            {t('library.filterAll')} {library.length}
          </button>
          <button className={filter === 'installed' ? 'active' : ''} onClick={() => useStore.getState().setLibraryFilter('installed')}>
            {t('library.filterInstalled')}
          </button>
          <button className={filter === 'pending' ? 'active' : ''} onClick={() => useStore.getState().setLibraryFilter('pending')}>
            {t('library.filterPending')}
          </button>
        </div>

        <div className="seg">
          <button className={sort === 'recent' ? 'active' : ''} onClick={() => setSort('recent')}>
            {t('sort.recent')}
          </button>
          <button className={sort === 'stars' ? 'active' : ''} onClick={() => setSort('stars')}>
            <Star size={10} style={{ verticalAlign: -1 }} />
          </button>
          <button className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>
            A-Z
          </button>
        </div>

        <div className="seg">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title={t('library.viewGrid')}>
            <LayoutGrid size={12} />
          </button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} title={t('library.viewList')}>
            <ListIcon size={12} />
          </button>
        </div>

        <span className="dim mono" style={{ fontSize: 11 }}>
          {t('library.installedTotal', { n: installedTotal })}
        </span>

        <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
          <button className="btn" onClick={() => setAddLocal(true)}>
            <FolderPlus size={13} />
            {t('library.addLocal')}
          </button>
          <button
            className="btn primary"
            disabled={bulkBusy || !activeAgents.length}
            onClick={() => void installEverything()}
            title={activeAgents.map((a) => a.name).join(', ')}
          >
            {bulkBusy ? <span className="spinner" /> : <Download size={13} />}
            {t('detail.doInstall')} · {activeAgents.length}
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="capsule-grid">
          {items.map((item, i) => (
            <Capsule
              key={item.id}
              item={item}
              style={stagger(i, 24)}
              active={item.id === selected?.id}
              installedSkills={installedSkillsOf(item)}
              lang={lang}
              onSelect={() => setSelected(item.id)}
              onOpen={() => {
                setSelected(item.id)
                void openDetail(item.fullName)
              }}
            />
          ))}
        </div>
      ) : (
        <div className="lib-list">
          {items.map((item) => (
            <div
              key={item.id}
              className={`lib-row${item.id === selected?.id ? ' active' : ''}`}
              onClick={() => setSelected(item.id)}
              onDoubleClick={() => void openDetail(item.fullName)}
            >
              <CapsuleArt item={item} compact />
              <div className="lr-main">
                <div className="lr-name">{item.meta.name}</div>
                <div className="lr-owner mono">{item.meta.owner}</div>
              </div>
              <div className="lr-stats">
                <span className="stat strong">
                  <Layers size={11} />
                  {item.skills.length}
                </span>
                {installedSkillsOf(item) > 0 && (
                  <span className="stat" style={{ color: 'var(--ok)' }}>
                    <Check size={11} />
                    {installedSkillsOf(item)}
                  </span>
                )}
                <span className="stat">{fmtStars(item.meta.stars)}</span>
                <span className="stat">{item.lastSyncAt ? fmtRelative(item.lastSyncAt, lang) : '—'}</span>
              </div>
              <button className="btn primary sm" onClick={() => void openLaunchForItem(item)}>
                <Play size={11} />
                {t('launch.action')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Launch the first installed skill of an item, or its detail page if none. */
async function openLaunchForItem(item: LibraryItem): Promise<void> {
  const s = useStore.getState()
  const installed = item.skills.find((sk) => (s.installMap[sk.id] || []).length > 0)
  const target = installed || item.skills[0]
  if (target) await s.openLaunch({ from: 'library', skillId: target.id })
  else await s.openDetail(item.fullName)
}

/* -------------------------------------------------------------- hero --- */

function LibraryHero({
  item,
  installedSkills,
  agentCount,
  onLaunch,
  onDetail,
  onSync,
  onReveal,
  onRemove
}: {
  item: LibraryItem
  installedSkills: number
  agentCount: number
  onLaunch: () => void
  onDetail: () => void
  onSync: () => void
  onReveal: () => void
  onRemove: () => void
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const [c1, c2] = gradientFor(item.fullName)
  const tagline = lang === 'zh' ? item.meta.taglineZh || item.meta.descriptionZh : item.meta.taglineEn
  const ready = installedSkills > 0

  return (
    <div className="lib-hero" style={{ background: `linear-gradient(120deg, ${c1} 0%, ${c2} 60%, var(--bg-0) 100%)` }}>
      <div className="lib-hero-inner">
        {item.meta.avatarUrl && <img className="lh-avatar" src={item.meta.avatarUrl} alt="" />}
        <div className="lh-main">
          <div className="lh-owner mono">{item.meta.owner}</div>
          <div className="lh-title">{item.meta.name}</div>
          {tagline && <div className="lh-tagline">{tagline}</div>}
          <div className="lh-stats">
            <span className="lh-stat">
              <Layers size={11} />
              {item.skills.length} {t('common.skills')}
            </span>
            <span className="lh-stat">
              <Check size={11} />
              {installedSkills} {t('status.installed')}
            </span>
            <span className="lh-stat">
              <Star size={11} />
              {fmtStars(item.meta.stars)}
            </span>
            <span className="lh-stat dim">
              {item.lastSyncAt ? fmtRelative(item.lastSyncAt, lang) : '—'}
            </span>
          </div>
        </div>

        <div className="lh-actions">
          <button className="btn-play" onClick={onLaunch} title={t('launch.action')}>
            <Play size={17} />
            {t('launch.action')}
          </button>
          <div className="lh-sub">
            <button className="btn ghost sm" onClick={onDetail}>
              {t('card.details')}
            </button>
            {!item.local && (
              <button className="btn ghost sm" onClick={onSync} title={t('library.sync')}>
                <RefreshCw size={12} />
              </button>
            )}
            <button className="btn ghost sm" onClick={onReveal} title={t('common.openFolder')}>
              <FolderOpen size={12} />
            </button>
            <button className="btn ghost sm danger" onClick={onRemove} title={t('common.remove')}>
              <Trash2 size={12} />
            </button>
          </div>
          {!ready && agentCount > 0 && (
            <div className="lh-hint dim">{t('library.heroNotInstalled')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- capsule --- */

function CapsuleArt({ item, compact }: { item: LibraryItem; compact?: boolean }): React.JSX.Element {
  const [c1, c2] = gradientFor(item.fullName)
  return (
    <div
      className={`capsule-art${compact ? ' compact' : ''}`}
      style={{ background: `linear-gradient(150deg, ${c1} 0%, ${c2} 100%)` }}
    >
      {item.meta.avatarUrl && <img src={item.meta.avatarUrl} alt="" loading="lazy" />}
    </div>
  )
}

function Capsule({
  item,
  style,
  active,
  installedSkills,
  lang,
  onSelect,
  onOpen
}: {
  item: LibraryItem
  style?: React.CSSProperties
  active: boolean
  installedSkills: number
  lang: 'zh' | 'en'
  onSelect: () => void
  onOpen: () => void
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const [c1, c2] = gradientFor(item.fullName)

  return (
    <div className={`capsule${active ? ' active' : ''}`} style={style} onClick={onSelect} onDoubleClick={onOpen}>
      <div className="capsule-art" style={{ background: `linear-gradient(150deg, ${c1} 0%, ${c2} 100%)` }}>
        {item.meta.avatarUrl ? (
          <img src={item.meta.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="capsule-letter">{item.meta.name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="capsule-scrim" />
        <div className="capsule-label">
          <div className="capsule-name">{item.meta.name}</div>
          <div className="capsule-owner mono">{item.meta.owner}</div>
        </div>
        {installedSkills > 0 && (
          <span className="capsule-badge" title={t('status.installed')}>
            <Check size={11} />
            {installedSkills}
          </span>
        )}
        <div className="capsule-hover">
          <span>{t('library.capsuleHint', { n: item.skills.length })}</span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------- my skills --- */

/**
 * Every skill on this machine. Kept as its own block above the collection
 * because it answers a different question: "what can I run right now" versus
 * "what have I collected".
 */
function MySkillsPanel(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const discovered = useStore((s) => s.discovered)
  const discovering = useStore((s) => s.discovering)
  const scanLocal = useStore((s) => s.scanLocal)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const uninstall = useStore((s) => s.uninstall)
  const openLaunch = useStore((s) => s.openLaunch)
  const library = useStore((s) => s.library)
  const installMap = useStore((s) => s.installMap)
  const [open, setOpen] = useState(false)

  const rows = useMemo(() => {
    const byName = new Map<
      string,
      {
        name: string
        realPath: string
        agents: string[]
        managed: boolean
        matchedRepo: string | null
        description?: string
      }
    >()
    for (const d of discovered) {
      const key = d.folder.toLowerCase()
      const prev = byName.get(key)
      if (prev) {
        if (!prev.agents.includes(d.agentName)) prev.agents.push(d.agentName)
        prev.managed = prev.managed || d.managed
        prev.matchedRepo = prev.matchedRepo || d.matchedRepo
        if (!prev.description) prev.description = d.description
      } else {
        byName.set(key, {
          name: d.folder,
          realPath: d.realPath,
          agents: [d.agentName],
          managed: d.managed,
          matchedRepo: d.matchedRepo,
          description: d.description
        })
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [discovered])

  const libraryByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of library) for (const sk of item.skills) map.set(sk.name.toLowerCase(), sk.id)
    return map
  }, [library])

  const inLibraryRepos = new Set(library.map((i) => i.fullName))
  const adoptable = [...new Set(rows.map((r) => r.matchedRepo).filter(Boolean) as string[])].filter(
    (r) => !inLibraryRepos.has(r)
  )

  if (!discovered.length && !discovering) return null

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Bot size={13} />
        {t('mySkills.title')}
        <div className="right">
          <span className="chip mono">{rows.length}</span>
          <button
            className="btn ghost sm"
            onClick={(e) => {
              e.stopPropagation()
              void scanLocal()
            }}
            disabled={discovering}
          >
            {discovering ? <span className="spinner" /> : <RefreshCw size={12} />}
            {t('library.discoverScan')}
          </button>
        </div>
      </div>

      {open && (
        <div className="panel-body">
          <div className="dim" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
            {t('mySkills.hint', { n: rows.filter((r) => r.matchedRepo).length })}
          </div>

          {adoptable.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {adoptable.slice(0, 10).map((repo) => (
                <button key={repo} className="chip clickable" onClick={() => void addToLibrary(repo)}>
                  <Plus size={10} />
                  {repo}
                </button>
              ))}
            </div>
          )}

          <div className="myskills">
            {rows.map((r) => {
              const libId = libraryByName.get(r.name.toLowerCase())
              const agentIds = libId ? installMap[libId] || [] : []
              return (
                <div className="myskill-row" key={r.name}>
                  <span
                    className="ms-state"
                    style={{ background: r.matchedRepo ? 'var(--ok)' : 'var(--text-3)' }}
                    title={r.matchedRepo || t('library.discoverUnmatched')}
                  />
                  <div className="ms-main">
                    <div className="ms-name">
                      {r.name}
                      {r.managed && <span className="chip green mono">{t('library.discoverManaged')}</span>}
                    </div>
                    <div className="ms-meta" title={r.realPath}>
                      {r.agents.join(t('common.listSeparator'))}
                      {r.matchedRepo ? ` · ${r.matchedRepo}` : ` · ${t('library.discoverUnmatched')}`}
                    </div>
                  </div>
                  {r.matchedRepo && !inLibraryRepos.has(r.matchedRepo) && (
                    <button
                      className="btn ghost sm"
                      title={t('library.discoverAdopt')}
                      onClick={() => void addToLibrary(r.matchedRepo!)}
                    >
                      <Plus size={12} />
                    </button>
                  )}
                  {agentIds.length > 0 && (
                    <button
                      className="btn ghost sm danger"
                      title={t('detail.uninstall')}
                      onClick={() => void uninstall(libId!, agentIds[0])}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <button
                    className="btn primary sm"
                    onClick={() =>
                      void openLaunch(
                        libId
                          ? { from: 'library', skillId: libId }
                          : { from: 'local', path: r.realPath, name: r.name, description: r.description }
                      )
                    }
                  >
                    <Rocket size={12} />
                    {t('launch.action')}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
