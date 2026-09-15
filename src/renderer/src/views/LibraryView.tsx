import { useMemo, useState } from 'react'
import {
  Library,
  FolderPlus,
  RefreshCw,
  Check,
  Trash2,
  FolderOpen,
  Download,
  Star,
  Layers,
  TriangleAlert,
  Package,
  Search,
  Plus,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import type { LibraryItem } from '@shared/types'
import { fmtRelative, fmtStars, gradientFor } from '../api'
import { useStore } from '../store'
import { RepoArt } from '../components/RepoCard'
import { stagger } from '../ui'

export function LibraryView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const library = useStore((s) => s.library)
  const installMap = useStore((s) => s.installMap)
  const filter = useStore((s) => s.libraryFilter)
  const setFilter = useStore((s) => s.setLibraryFilter)
  const sort = useStore((s) => s.librarySort)
  const setSort = useStore((s) => s.setLibrarySort)
  const setAddLocal = useStore((s) => s.setAddLocal)
  const setView = useStore((s) => s.setView)
  const openDetail = useStore((s) => s.openDetail)
  const syncItem = useStore((s) => s.syncLibraryItem)
  const removeFromLibrary = useStore((s) => s.removeFromLibrary)
  const install = useStore((s) => s.install)
  const agents = useStore((s) => s.agents)
  const [bulkBusy, setBulkBusy] = useState(false)

  const items = useMemo(() => {
    const installedSkills = new Set(Object.keys(installMap))
    let list = [...library]
    if (filter === 'installed') list = list.filter((i) => i.skills.some((s) => installedSkills.has(s.id)))
    if (filter === 'pending') list = list.filter((i) => !i.skills.some((s) => installedSkills.has(s.id)))
    list.sort((a, b) => {
      if (sort === 'stars') return (b.meta.stars || 0) - (a.meta.stars || 0)
      if (sort === 'name') return a.fullName.localeCompare(b.fullName)
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
    return list
  }, [library, filter, sort, installMap])

  const installedTotal = Object.values(installMap).reduce((n, l) => n + l.length, 0)
  const activeAgents = agents.filter((a) => a.enabled)

  const installEverything = async (): Promise<void> => {
    if (!activeAgents.length) return
    setBulkBusy(true)
    try {
      const pending: string[] = []
      for (const item of library) {
        for (const s of item.skills) {
          if (!(installMap[s.id] || []).length) pending.push(s.id)
        }
      }
      if (!pending.length) return
      await install(pending, activeAgents.map((a) => a.id))
    } finally {
      setBulkBusy(false)
    }
  }

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
        <div className="view-head-actions">
          <span className="chip mono">
            <Package size={10} />
            {library.length}
          </span>
          <span className="chip green mono">
            <Check size={10} />
            {installedTotal}
          </span>
          <div className="seg">
            <button className={sort === 'recent' ? 'active' : ''} onClick={() => setSort('recent')}>
              {t('detail.updated')}
            </button>
            <button className={sort === 'stars' ? 'active' : ''} onClick={() => setSort('stars')}>
              <Star size={10} style={{ verticalAlign: -1 }} />
            </button>
            <button className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>
              A-Z
            </button>
          </div>
          <button className="btn" onClick={() => setAddLocal(true)}>
            <FolderPlus size={13} />
            {t('library.addLocal')}
          </button>
          <button
            className="btn primary"
            disabled={bulkBusy || !activeAgents.length || !library.length}
            onClick={() => void installEverything()}
            title={activeAgents.map((a) => a.name).join(', ')}
          >
            {bulkBusy ? <span className="spinner" /> : <Download size={13} />}
            {t('detail.doInstall')} · {activeAgents.length}
          </button>
        </div>
      </div>

      <DiscoveryPanel />

      {library.length === 0 ? (
        <div className="empty">
          <Library size={30} className="icon" />
          <h3>{t('library.empty')}</h3>
          <p>{t('library.emptyHint')}</p>
          <button className="btn primary" onClick={() => setView('store')}>
            {t('nav.store')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <Package size={26} className="icon" />
          <h3>{t('common.empty')}</h3>
          <button className="btn" onClick={() => setFilter('all')}>
            {t('common.all')}
          </button>
        </div>
      ) : (
        <div className="grid">
          {items.map((item, i) => (
            <LibraryCard
              key={item.id}
              style={stagger(i)}
              item={item}
              onOpen={() => void openDetail(item.fullName)}
              onSync={() => void syncItem(item.id)}
              onRemove={() => {
                if (confirm(`${t('library.removeConfirm')}\n${t('library.removeHint')}\n\n${t('library.deleteFiles')}?`)) {
                  void removeFromLibrary(item.id, true)
                }
              }}
              installedSkills={item.skills.filter((s) => (installMap[s.id] || []).length > 0).length}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Skills that already exist in the machine's agent directories, matched back to
 * catalog entries so the user can add the source instead of hunting for it.
 */
function DiscoveryPanel(): React.JSX.Element | null {
  const t = useStore((s) => s.t)
  const discovered = useStore((s) => s.discovered)
  const discovering = useStore((s) => s.discovering)
  const scanLocal = useStore((s) => s.scanLocal)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const library = useStore((s) => s.library)
  const [open, setOpen] = useState(true)

  const matched = discovered.filter((d) => d.matchedRepo)
  const inLibrary = new Set(library.map((i) => i.fullName))
  const adoptable = [...new Set(matched.map((d) => d.matchedRepo!))].filter((r) => !inLibrary.has(r))
  const agents = [...new Set(discovered.map((d) => d.agentName))]

  if (!discovered.length && !discovering) return null

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-head">
        <Search size={13} />
        {t('library.discover')}
        <div className="right">
          <span className="chip mono">{discovered.length}</span>
          <button className="btn ghost sm" onClick={() => void scanLocal()} disabled={discovering}>
            {discovering ? <span className="spinner" /> : <RefreshCw size={12} />}
            {t('library.discoverScan')}
          </button>
          <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="panel-body">
          {discovered.length === 0 ? (
            <div className="dim" style={{ fontSize: 12 }}>
              {t('library.discoverEmpty')}
            </div>
          ) : (
            <>
              <div className="dim" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
                {t('library.discoverHint', { n: matched.length })}
                {agents.length > 0 && ` · ${t('library.discoverAgents')} ${agents.slice(0, 3).join(', ')}`}
              </div>

              {adoptable.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {adoptable.slice(0, 12).map((repo) => (
                    <button key={repo} className="chip clickable" onClick={() => void addToLibrary(repo)}>
                      <Plus size={10} />
                      {repo}
                    </button>
                  ))}
                </div>
              )}

              <div className="discover-grid">
                {discovered.slice(0, 18).map((d) => (
                  <div className="discover-card" key={d.realPath}>
                    <span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: d.matchedRepo ? 'var(--ok)' : 'var(--text-3)' }} />
                    <div className="dc-main">
                      <div className="dc-name">{d.folder}</div>
                      <div className="dc-meta" title={d.path}>
                        {d.matchedRepo || t('library.discoverUnmatched')} · {d.agentName}
                        {d.managed ? ` · ${t('library.discoverManaged')}` : ''}
                      </div>
                    </div>
                    {d.matchedRepo && !inLibrary.has(d.matchedRepo) && (
                      <button className="btn sm" onClick={() => void addToLibrary(d.matchedRepo!)}>
                        {t('library.discoverAdopt')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function LibraryCard({
  item,
  onOpen,
  onSync,
  onRemove,
  installedSkills,
  lang,
  style
}: {
  item: LibraryItem
  onOpen: () => void
  onSync: () => void
  onRemove: () => void
  installedSkills: number
  lang: 'zh' | 'en'
  style?: React.CSSProperties
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const job = useStore((s) => s.job)
  const t2 = t
  const [c1] = gradientFor(item.fullName)
  const syncing = !!job && job.job === 'sync' && job.id === item.id
  const desc = lang === 'zh' ? item.meta.descriptionZh || item.meta.descriptionEn : item.meta.descriptionEn

  // Which agents received skills from this repo.
  const installMap = useStore((s) => s.installMap)
  const agents = useStore((s) => s.agents)
  const agentNames = new Set<string>()
  for (const s of item.skills) {
    for (const aid of installMap[s.id] || []) {
      const a = agents.find((x) => x.id === aid)
      if (a) agentNames.add(a.name)
    }
  }

  return (
    <div className={`card${item.status === 'error' ? ' error' : ''}`} style={style} onClick={onOpen}>
      <RepoArt repo={{ ...item.meta, avatarUrl: item.meta.avatarUrl }} />
      <div className="card-body">
        {item.status === 'error' && (
          <div className="flex" style={{ color: 'var(--err)', fontSize: 11.5, gap: 6 }}>
            <TriangleAlert size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.error}</span>
          </div>
        )}

        <div className={`card-desc ${lang === 'zh' ? 'zh' : ''}`}>{desc}</div>

        <div className="card-tags">
          <span className="chip mono" style={{ color: c1 }}>
            <Layers size={10} />
            {item.skills.length} {t2('common.skills')}
          </span>
          {installedSkills > 0 && (
            <span className="chip green mono">
              <Check size={10} />
              {installedSkills}
            </span>
          )}
          {[...agentNames].slice(0, 2).map((n) => (
            <span key={n} className="chip">
              {n}
            </span>
          ))}
          {item.local && <span className="chip violet mono">local</span>}
        </div>

        <div className="card-foot">
          <span className="stat" title={item.sourcePath}>
            {item.lastSyncAt ? fmtRelative(item.lastSyncAt, lang) : '—'}
          </span>
          <span className="stat strong">
            <Star size={11} />
            {fmtStars(item.meta.stars)}
          </span>

          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn ghost sm" title={t('common.openFolder')} onClick={() => void window.skillhub.system.openPath(item.sourcePath)}>
              <FolderOpen size={12} />
            </button>
            {!item.local && (
              <button className="btn ghost sm" title={t('library.sync')} disabled={syncing} onClick={onSync}>
                {syncing ? <span className="spinner" /> : <RefreshCw size={12} />}
              </button>
            )}
            <button className="btn ghost sm danger" title={t('common.remove')} onClick={onRemove}>
              <Trash2 size={12} />
            </button>
            <button className="btn primary sm" onClick={onOpen}>
              {t('card.install')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
