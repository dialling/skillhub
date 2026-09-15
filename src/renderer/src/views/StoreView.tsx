import { useMemo } from 'react'
import {
  Store,
  Search,
  X,
  Sparkles,
  TrendingUp,
  Layers,
  RefreshCw,
  Funnel,
  Star,
  Target,
  ArrowRight
} from 'lucide-react'
import { FN_LABELS, type FnCategory } from '@shared/types'
import { useStore } from '../store'
import { RepoCard, RepoRow } from '../components/RepoCard'
import { sourceKey } from '../components/DetailPanel'
import { fnColor } from '../components/Sidebar'
import { fmtStars } from '../api'
import { stagger } from '../ui'

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
  const trending = useStore((s) => s.trending)
  const loadTrending = useStore((s) => s.loadTrending)
  const scenarios = useStore((s) => s.scenarios)
  const activeScenario = useStore((s) => s.activeScenario)
  const scenarioRepos = useStore((s) => s.scenarioRepos)
  const openScenario = useStore((s) => s.openScenario)

  const searching0 = searching && !search

  const byFn = useMemo(() => {
    const map: Record<string, typeof catalog> = {}
    for (const r of catalog) {
      const fn = r.fn || 'coding'
      ;(map[fn] ||= []).push(r)
    }
    return map
  }, [catalog])

  const filtered = useMemo(() => {
    if (!category) return catalog
    return catalog.filter((r) => (r.fn || 'coding') === category)
  }, [catalog, category])

  const featured = useMemo(
    () =>
      [...catalog]
        .filter((r) => (r.skillCount ?? r.skillDirs?.length ?? 0) > 0)
        .sort((a, b) => (b.skillCount || 0) - (a.skillCount || 0))
        .slice(0, 10),
    [catalog]
  )

  const hot = useMemo(() => (trending || []).slice(0, 6), [trending])
  const scenario = scenarios.find((s) => s.id === activeScenario) || null

  /* ------------------------------------------------------------------ search */
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

  /* ---------------------------------------------------------------- scenario */
  if (scenario) {
    return (
      <div className="view">
        <div className="view-head">
          <div>
            <div className="view-title">
              <Target size={19} />
              {lang === 'zh' ? scenario.titleZh : scenario.titleEn}
            </div>
            <div className="view-sub">{lang === 'zh' ? scenario.descZh : scenario.descEn}</div>
          </div>
          <div className="view-head-actions">
            <span className="chip mono">
              <Layers size={10} />
              {scenarioRepos.length}
            </span>
            <button className="btn" onClick={() => void openScenario(null)}>
              <X size={13} />
              {t('store.clearScenario')}
            </button>
          </div>
        </div>

        {scenarioRepos.length === 0 ? (
          <div className="grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
        ) : (
          <div className="grid">
            {scenarioRepos.map((repo, i) => (
              <RepoCard key={repo.fullName} repo={repo} style={stagger(i)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ------------------------------------------------------------- by function */
  if (category) {
    return (
      <div className="view">
        <div className="view-head">
          <div>
            <div className="view-title">
              <Funnel size={19} style={{ color: fnColor(category as FnCategory) }} />
              {lang === 'zh' ? FN_LABELS[category as FnCategory].zh : FN_LABELS[category as FnCategory].en}
            </div>
            <div className="view-sub">{t('store.subtitle')}</div>
          </div>
          <div className="view-head-actions">
            <span className="chip mono">{filtered.length}</span>
            <button className="btn" onClick={() => setCategory(null)}>
              <X size={13} />
              {t('common.all')}
            </button>
          </div>
        </div>
        <div className="grid">
          {filtered.map((repo, i) => (
            <RepoCard key={repo.fullName} repo={repo} style={stagger(i)} />
          ))}
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ browse */
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
      </div>

      {/* Scenarios: "what are you trying to do?" — the fastest way in. */}
      <div className="section" id="store-scenarios">
        <div className="section-head">
          <span className="section-title">
            <Target size={13} />
            {t('store.scenarios')}
          </span>
          <span className="section-meta">{t('store.scenariosHint')}</span>
        </div>
        <div className="scenario-grid">
          {scenarios.map((sc, i) => (
            <button
              key={sc.id}
              className="scenario-card"
              style={stagger(i, 26)}
              onClick={() => void openScenario(sc.id)}
            >
              <span className="sc-title">{lang === 'zh' ? sc.titleZh : sc.titleEn}</span>
              <span className="sc-desc">{lang === 'zh' ? sc.descZh : sc.descEn}</span>
              <span className="sc-go">
                <ArrowRight size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">
            <Sparkles size={13} />
            {t('store.featured')}
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
            <button className="btn sm" onClick={() => void loadTrending(7)}>
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
                    <span style={{ width: `${Math.max(4, (row.gained / Math.max(1, hot[0].gained)) * 100)}%` }} />
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
            <Funnel size={13} />
            {t('store.byFunction')}
          </span>
          <span className="section-meta">{catalog.length}</span>
        </div>
        <div className="fn-grid">
          {(Object.keys(FN_LABELS) as FnCategory[])
            .filter((fn) => (byFn[fn] || []).length)
            .map((fn) => (
              <button key={fn} className="fn-tile" onClick={() => setCategory(fn)}>
                <span className="fn-dot" style={{ background: fnColor(fn) }} />
                <span className="fn-name">{lang === 'zh' ? FN_LABELS[fn].zh : FN_LABELS[fn].en}</span>
                <span className="fn-count">{byFn[fn].length}</span>
              </button>
            ))}
        </div>

        <div className="grid dense" style={{ marginTop: 16 }}>
          {[...catalog]
            .sort((a, b) => b.stars - a.stars)
            .slice(0, 24)
            .map((repo) => (
              <RepoRow key={repo.fullName} repo={repo} />
            ))}
        </div>
      </div>
    </div>
  )
}
