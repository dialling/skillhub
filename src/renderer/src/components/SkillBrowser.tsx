import { useEffect, useMemo, useState } from 'react'
import { Search, Layers, Star, ExternalLink, Plus, Check, X } from 'lucide-react'
import type { SkillIndexEntry } from '@shared/types'
import { FN_LABELS, type FnCategory } from '@shared/types'
import { fmtStars } from '../api'
import { fnColor } from './Sidebar'
import { useStore } from '../store'
import { stagger } from '../ui'

/**
 * The skills themselves, not the repositories that hold them.
 *
 * A "collection" repository is only interesting for what is inside it — there
 * are 10,700-odd skills across the catalog, and until now the store could only
 * show you the 147 boxes they arrived in. This lists the contents: one row per
 * skill, with the description its author wrote, searchable across every
 * category.
 *
 * Shards load on demand. Each category is published separately by the
 * extraction pass, so opening a category fetches tens of kilobytes rather than
 * the whole index.
 */
export function SkillBrowser(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const info = useStore((s) => s.skillIndexInfo)
  const shards = useStore((s) => s.skillShards)
  const loading = useStore((s) => s.skillShardLoading)
  const loadIndex = useStore((s) => s.loadSkillIndex)
  const loadShard = useStore((s) => s.loadSkillShard)
  const query = useStore((s) => s.skillQuery)
  const setQuery = useStore((s) => s.setSkillQuery)
  const runSearch = useStore((s) => s.searchSkillIndex)
  const hits = useStore((s) => s.skillHits)
  const openDetail = useStore((s) => s.openDetail)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const library = useStore((s) => s.library)

  const [fn, setFn] = useState<FnCategory | 'all'>('all')

  useEffect(() => {
    void loadIndex()
  }, [loadIndex])

  // The first category is fetched as soon as the index is known, so the view
  // opens with content instead of an empty list and a second click.
  useEffect(() => {
    if (!info || fn !== 'all') return
    const richest = Object.entries(info.shards).sort((a, b) => b[1].count - a[1].count)[0]
    if (richest) void loadShard(richest[0])
  }, [info, fn, loadShard])

  useEffect(() => {
    if (fn !== 'all') void loadShard(fn)
  }, [fn, loadShard])

  // Debounced so typing does not fire a cross-shard scan on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => void runSearch(query), 300)
    return () => clearTimeout(handle)
  }, [query, runSearch])

  const rows: SkillIndexEntry[] = useMemo(() => {
    if (hits) return hits
    if (fn === 'all') {
      // No category chosen: show whatever has arrived, richest first.
      return Object.values(shards).flat().sort((a, b) => b.s - a.s)
    }
    return shards[fn] || []
  }, [hits, fn, shards])

  const inLibrary = (repo: string): boolean => library.some((i) => i.fullName === repo && i.status === 'ready')

  const categories = info ? Object.entries(info.shards).sort((a, b) => b[1].count - a[1].count) : []

  return (
    <>
      <div className="skill-toolbar">
        <div className="searchbox" style={{ flex: '1 1 260px', maxWidth: 420 }}>
          <Search size={13} className="dim" />
          <input
            value={query}
            spellCheck={false}
            placeholder={t('skills.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="btn ghost sm" onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <span className="dim mono" style={{ fontSize: 11 }}>
          {hits ? t('skills.hits', { n: rows.length }) : t('skills.total', { n: info?.total || 0 })}
        </span>
      </div>

      {!hits && (
        <div className="skill-filters">
          <button className={`chip clickable${fn === 'all' ? ' active' : ''}`} onClick={() => setFn('all')}>
            {t('common.all')}
          </button>
          {categories.map(([key, meta]) => {
            const label = FN_LABELS[key as FnCategory]
            return (
              <button
                key={key}
                className={`chip clickable${fn === key ? ' active' : ''}`}
                style={fn === key ? { borderColor: fnColor(key as FnCategory), color: fnColor(key as FnCategory) } : undefined}
                onClick={() => setFn(key as FnCategory)}
              >
                {label ? (lang === 'zh' ? label.zh : label.en) : key}
                <span className="dim mono">{meta.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {loading && !rows.length ? (
        <div className="flex" style={{ padding: 40, justifyContent: 'center', gap: 10, color: 'var(--text-2)' }}>
          <span className="spinner" />
          {t('skills.loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty" style={{ marginTop: 8 }}>
          <Layers size={26} className="icon" />
          <h3>{query ? t('skills.noMatch') : t('skills.empty')}</h3>
          {query && <p>{t('skills.noMatchHint')}</p>}
        </div>
      ) : (
        <div className="skill-grid">
          {rows.slice(0, 120).map((s, i) => (
            <div className="skill-card" key={`${s.r}::${s.p}`} style={stagger(i, 8)}>
              <div className="sk-head">
                <span className="sk-name">{s.n}</span>
                <span className="sk-stars mono">
                  <Star size={10} />
                  {fmtStars(s.s)}
                </span>
              </div>
              {s.d && <div className="sk-desc">{s.d}</div>}
              <div className="sk-foot">
                <button className="sk-repo mono" title={s.r} onClick={() => void openDetail(s.r)}>
                  {s.r}
                </button>
                {s.f && (
                  <span className="chip fn-chip" style={{ color: fnColor(s.f as FnCategory), borderColor: `${fnColor(s.f as FnCategory)}55` }}>
                    {FN_LABELS[s.f as FnCategory]
                      ? lang === 'zh'
                        ? FN_LABELS[s.f as FnCategory].zh
                        : FN_LABELS[s.f as FnCategory].en
                      : s.f}
                  </span>
                )}
                <div className="sk-actions">
                  <button
                    className="btn ghost sm"
                    title={t('card.viewRepo')}
                    onClick={() => void openDetail(s.r)}
                  >
                    <ExternalLink size={11} />
                  </button>
                  {inLibrary(s.r) ? (
                    <button className="btn sm" onClick={() => void openDetail(s.r)}>
                      <Check size={11} />
                      {t('card.inLibrary')}
                    </button>
                  ) : (
                    <button className="btn primary sm" onClick={() => void addToLibrary(s.r)}>
                      <Plus size={11} />
                      {t('card.add')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length > 120 && (
        <div className="dim" style={{ textAlign: 'center', fontSize: 11.5, padding: '14px 0' }}>
          {t('skills.truncated', { n: rows.length - 120, term: '' })}
        </div>
      )}
    </>
  )
}
