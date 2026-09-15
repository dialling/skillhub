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
  AlertTriangle,
  Package
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
            <AlertTriangle size={12} />
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
