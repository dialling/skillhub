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
  Upload,
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
import { fmtRelative, fmtStars, gradientFor, gradientTint } from '../api'
import { useStore } from '../store'
import { stagger } from '../ui'
import { BulkInstallModal } from '../components/BulkInstallModal'

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
  /*
    Two different numbers, and the UI used to show the wrong one.

    One skill installed into three agents produces three install records; showing
    that total as "installed 201" tells the user they have 201 skills when they
    have 67. The count people mean is distinct skills; the record count is a
    detail for the tooltip.
  */
  const installedSkills = Object.values(installMap).filter((l) => l.length).length
  const installedRecords = Object.values(installMap).reduce((n, l) => n + l.length, 0)
  /** Skills not installed anywhere yet — what a bulk install would act on. */
  const pendingIds = library.flatMap((item) =>
    item.skills.filter((s) => !(installMap[s.id] || []).length).map((s) => s.id)
  )
  const pendingSkills = pendingIds.length

  // Bulk install now asks where to put things rather than writing into every
  // enabled agent; the modal owns the choice.
  const [bulkOpen, setBulkOpen] = useState(false)
  // Installing one skill reuses the same picker as the bulk action: the question
  // ("which agents?") is identical, only the list of skills differs.
  const [singleId, setSingleId] = useState<string | null>(null)
  const installOne = (skillId: string): void => {
    setSingleId(skillId)
    setBulkOpen(true)
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
        <MySkillsPanel onInstallOne={installOne} />
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
      <MySkillsPanel onInstallOne={installOne} />


      <BulkInstallModal
        open={bulkOpen}
        pendingIds={singleId ? [singleId] : pendingIds}
        onClose={() => {
          setBulkOpen(false)
          setSingleId(null)
        }}
      />

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
          <span title={t('library.installedBreakdown', { skills: installedSkills, records: installedRecords, agents: activeAgents.length })}>
            {t('library.installedTotal', { n: installedSkills })}
          </span>
        </span>

        <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
          <button className="btn" onClick={() => setAddLocal(true)}>
            <FolderPlus size={13} />
            {t('library.addLocal')}
          </button>
          <button
            className="btn primary"
            disabled={!agents.length || pendingSkills === 0}
            onClick={() => setBulkOpen(true)}
            title={
              pendingSkills === 0
                ? t('library.allInstalled')
                : t('library.installPendingHint', {
                    n: pendingSkills,
                    agents: activeAgents.map((a) => a.name).join(', ')
                  })
            }
          >
            {pendingSkills === 0 ? <Check size={13} /> : <Download size={13} />}
            {pendingSkills === 0 ? (
              t('library.allInstalledShort')
            ) : (
              <>
                {t('library.installPendingShort')}
                {/*
                  The count in small type, not spelled into the label. With a
                  library of a few large repositories the number runs into the
                  hundreds, and set at button size it read as a warning rather
                  than as a count of what is left to do.
                */}
                <span className="btn-count mono">{pendingSkills}</span>
              </>
            )}
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
  const [t1, t2] = gradientTint(item.fullName, 0.32)
  const tagline = lang === 'zh' ? item.meta.taglineZh || item.meta.descriptionZh : item.meta.taglineEn
  const ready = installedSkills > 0

  return (
    <div
      className="lib-hero"
      style={{
        // The repository's colour as a tint over the normal surface, not a
        // saturated wash. At full strength the banner was a colour clash with
        // everything placed on it, which is what pushed the launch button to
        // white. Subduing the banner lets the accent button stand.
        background: `linear-gradient(100deg, ${t1} 0%, ${t2} 46%, transparent 82%), linear-gradient(180deg, var(--bg-3), var(--bg-2))`
      }}
    >
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
  const tagline = lang === 'zh' ? item.meta.taglineZh || item.meta.descriptionZh : item.meta.taglineEn

  return (
    <div className={`capsule${active ? ' active' : ''}`} style={style} onClick={onSelect} onDoubleClick={onOpen}>
      {/* The repository's colour as a soft wash over the normal surface —
          identity without a photo fighting the text. */}
      <span className="capsule-tint" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />

      <div className="capsule-top">
        {item.meta.avatarUrl ? (
          <img className="capsule-avatar" src={item.meta.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="capsule-avatar fallback" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            {item.meta.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="capsule-owner mono">{item.meta.owner}</span>
        {installedSkills > 0 && (
          <span className="capsule-badge" title={t('status.installed')}>
            <Check size={10} />
            {installedSkills}
          </span>
        )}
      </div>

      <div className="capsule-body">
        <div className="capsule-name">{item.meta.name}</div>
        {tagline && <div className="capsule-tagline">{tagline}</div>}
      </div>

      <div className="capsule-foot">
        <span className="cf-stat">
          <Layers size={10} />
          {item.skills.length}
        </span>
        <span className="cf-stat">
          <Star size={10} />
          {fmtStars(item.meta.stars)}
        </span>
        <span className="cf-open">{t('library.open')}</span>
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
function MySkillsPanel({ onInstallOne }: { onInstallOne: (skillId: string) => void }): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const discovered = useStore((s) => s.discovered)
  const discovering = useStore((s) => s.discovering)
  const scanLocal = useStore((s) => s.scanLocal)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const uninstall = useStore((s) => s.uninstall)
  const openLaunch = useStore((s) => s.openLaunch)
  const submitSkill = useStore((s) => s.submitSkill)
  const submitting = useStore((s) => s.submitting)
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
                  {/*
                    Install just this one. Until now the only way to install was
                    the library-wide button, so wanting a single skill meant
                    either wiring up everything or nothing.
                  */}
                  {libId && (
                    <button
                      className="btn sm"
                      title={t('library.installOne')}
                      onClick={() => onInstallOne(libId)}
                    >
                      <Download size={12} />
                      {t('library.installOneShort')}
                    </button>
                  )}
                  {/*
                    No submit button here on purpose.

                    Uploading a local skill to the repository's `submissions/`
                    folder is how *this* project adds entries to its catalog — a
                    development step, not something a user of the app needs. The
                    backend stays (core/submit.ts, `submissions/` in the repo);
                    only the button is gone.
                  */}
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
