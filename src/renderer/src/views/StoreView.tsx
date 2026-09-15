import { useMemo } from 'react'
import { Store, Search, X, Sparkles, TrendingUp, Layers, RefreshCw, Filter, Star } from 'lucide-react'
import { CATEGORY_LABELS, type Category } from '@shared/types'
import { useStore } from '../store'
import { RepoCard, RepoRow } from '../components/RepoCard'
import { sourceKey } from '../components/DetailPanel'
import { stagger } from '../ui'
import { fmtStars } from '../api'

export function StoreView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const catalog = useStore((s) => s.catalogRepos)
  const search = useStore((s) => s.search)
  const searching = useStore((s) => s.searching)
  const query = useStore((s) => s.query)
  const clearSearch = useStore((s) => s.clearSearch)
  const category = useStore((s) => s.storeCategory)
  const setCategory = useStore((s) => s.setStoreCategory)
  const openDetail = useStore((s) => s.openDetail)
  const growth = useStore((s) => s.trending)
  const loadGrowth = useStore((s) => s.loadTrending)
  const library = useStore((s) => s.library)

  const searching0 = searching && !search

  const filteredCatalog = useMemo(() => {
    if (!category) return catalog
    return catalog.filter((r) => (r.category || 'collection') === category)
  }, [catalog, category])

  const featured = useMemo(
    () =>
      [...catalog]
        .filter((r) => (r.skillCount ?? r.skillDirs?.length ?? 0) > 0)
        .sort((a, b) => (b.skillCount || 0) - (a.skillCount || 0))
        .slice(0, 10),
    [catalog]
  )

  const totalSkills = useMemo(
    () => catalog.reduce((n, r) => n + (r.skillCount ?? r.skillDirs?.length ?? 0), 0),
    [catalog]
  )

  const hot = useMemo(() => (growth || []).slice(0, 6), [growth])

  // ---------------------------------------------------------------- searching
  if (query.trim()) {
    const results = search?.repos || []
    return (
      <div className="view">
        <div className="view-head">
          <div>
            <div className="view-title">
              <Search size={19} />
              {t('store.results')}
            </div>
            <div className="view-sub">
              {query}
              {search ? ` · ${t('store.resultCount', { n: results.length })}` : ''}
              {search?.incomplete ? ' · partial' : ''}
            </div>
          </div>
          <div className="view-head-actions">
            <span className="chip mono">
              <Sparkles size={10} />
              {t('store.liveSearch')}
            </span>
            <button className="btn" onClick={clearSearch}>
              <X size={13} />
              {t('common.close')}
            </button>
          </div>
        </div>

        {searching0 ? (
          <div className="grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="empty">
            <Search size={28} className="icon" />
            <h3>{t('store.noResults')}</h3>
            <p>{t('store.searchHint')}</p>
          </div>
        ) : (
          <div className="grid">
            {results.map((repo, i) => (
              <RepoCard key={repo.fullName} repo={repo} style={stagger(i)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ----------------------------------------------------------------- browsing
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">
            <Store size={19} />
            {t('store.title')}
          </div>
          <div className="view-sub">{t('store.subtitle')}</div>
        </div>
        <div className="view-head-actions">
          <span className="chip mono">
            <Layers size={10} />
            {catalog.length} repos · {totalSkills} skills
          </span>
          <span className="chip mono">
            <Sparkles size={10} />
            {t('store.curatedCatalog')}
          </span>
        </div>
      </div>

      {category && (
        <div className="section">
          <div className="section-head">
            <span className="section-title">
              <Filter size={13} />
              {lang === 'zh' ? CATEGORY_LABELS[category as Category].zh : CATEGORY_LABELS[category as Category].en}
            </span>
            <span className="section-meta">{filteredCatalog.length}</span>
            <div className="section-actions">
              <button className="btn sm" onClick={() => setCategory(null)}>
                <X size={11} />
                {t('common.all')}
              </button>
            </div>
          </div>
          <div className="grid">
            {filteredCatalog.map((repo, i) => (
              <RepoCard key={repo.fullName} repo={repo} style={stagger(i)} />
            ))}
          </div>
        </div>
      )}

      {!category && (
        <>
          <div className="section">
            <div className="section-head">
              <span className="section-title">
                <Sparkles size={13} />
                {t('store.featured')}
              </span>
              <span className="section-meta">
                {library.length > 0
                  ? t('library.installedCount', { n: library.reduce((n, i) => n + i.skills.length, 0), m: 0 }).split('到')[0]
                  : ''}
              </span>
            </div>
            <div className="rail">
              {featured.map((repo) => (
                <RepoCard key={repo.fullName} repo={repo} dense />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <span className="section-title">
                <TrendingUp size={13} />
                {t('store.trending')}
              </span>
              <div className="section-actions">
                <button className="btn sm" onClick={() => void loadGrowth(7)}>
                  <RefreshCw size={11} />
                  {t('charts.d7')}
                </button>
              </div>
            </div>
            {hot.length === 0 ? (
              <div className="flex" style={{ gap: 10, padding: 18, color: 'var(--text-2)' }}>
                <span className="spinner" />
                {t('charts.loading')}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {hot.map((row, i) => (
                  <div
                    key={row.fullName}
                    className="trend-row"
                    style={stagger(i, 30)}
                    onClick={() => void openDetail(row.fullName)}
                    role="button"
                  >
                    <div className="tile">
                      {row.avatarUrl ? <img src={row.avatarUrl} alt="" loading="lazy" /> : row.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="trend-text">
                      <div className="trend-name">{row.fullName}</div>
                      <div className="trend-sub">{lang === 'zh' ? row.descriptionZh : row.descriptionEn}</div>
                    </div>
                    <div className="trend-cell">
                      <span
                        className="trend-gain"
                        title={row.approx ? t('charts.approxHint') : t(sourceKey(row.source))}
                      >
                        {row.approx ? '≥' : '+'}
                        {row.gained}
                      </span>
                      <div className="board-bar">
                        <span
                          style={{ width: `${Math.max(4, (row.gained / Math.max(1, hot[0].gained)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="trend-stars">
                      <Star size={11} />
                      {fmtStars(row.stars)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-head">
              <span className="section-title">
                <Layers size={13} />
                {t('store.browseCategory')}
              </span>
              <span className="section-meta">{catalog.length}</span>
            </div>
            <div className="grid dense">
              {[...catalog]
                .sort((a, b) => b.stars - a.stars)
                .slice(0, 24)
                .map((repo) => (
                  <RepoRow key={repo.fullName} repo={repo} />
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
