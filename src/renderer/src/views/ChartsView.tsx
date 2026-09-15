import { useEffect, useMemo, useState } from 'react'
import { Trophy, TrendingUp, Star, RefreshCw, Info, Database } from 'lucide-react'
import type { RepoMeta } from '@shared/types'
import { CATEGORY_LABELS } from '@shared/types'
import { api, fmtStars } from '../api'
import { useStore } from '../store'
import { sourceKey } from '../components/DetailPanel'
import type { GrowthRow } from '@shared/types'

/** Group rows by where their growth number came from, so the UI can be honest. */
function sourceSummary(rows: GrowthRow[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.source, (counts.get(r.source) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function ChartsView(): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const growth = useStore((s) => s.growth)
  const growthWindow = useStore((s) => s.growthWindow)
  const growthLoading = useStore((s) => s.growthLoading)
  const loadGrowth = useStore((s) => s.loadGrowth)
  const openDetail = useStore((s) => s.openDetail)
  const catalog = useStore((s) => s.catalogRepos)
  const mode = useStore((s) => s.chartMode)
  const setMode = useStore((s) => s.setChartMode)
  const [top, setTop] = useState<RepoMeta[] | null>(null)
  const [coverage, setCoverage] = useState<{ repos: number; days: number } | null>(null)

  useEffect(() => {
    void loadGrowth(growthWindow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mode !== 'stars') return
    const sorted = [...catalog].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 40)
    if (sorted.length) setTop(sorted)
    else void api.board.top(40).then(setTop).catch(() => setTop([]))
  }, [mode, catalog])

  useEffect(() => {
    void api.board
      .coverage()
      .then(setCoverage)
      .catch(() => {})
  }, [growth])

  const maxGain = useMemo(() => (growth && growth.length ? Math.max(...growth.map((g) => g.gained), 1) : 1), [growth])
  const maxStars = useMemo(() => (top && top.length ? Math.max(...top.map((r) => r.stars || 1), 1) : 1), [top])

  const windows: { d: 1 | 7 | 30; key: string }[] = [
    { d: 1, key: 'charts.d1' },
    { d: 7, key: 'charts.d7' },
    { d: 30, key: 'charts.d30' }
  ]

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="view-title">
            <Trophy size={19} />
            {t('charts.title')}
          </div>
          <div className="view-sub">{t('charts.subtitle')}</div>
        </div>
        <div className="view-head-actions">
          {coverage && (
            <span className="chip mono">
              <Database size={10} />
              {t('charts.coverage', { repos: coverage.repos, days: coverage.days })}
            </span>
          )}
          <div className="seg">
            <button className={mode === 'growth' ? 'active' : ''} onClick={() => setMode('growth')}>
              <TrendingUp size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              {t('charts.gained')}
            </button>
            <button className={mode === 'stars' ? 'active' : ''} onClick={() => setMode('stars')}>
              <Star size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              {t('charts.top')}
            </button>
          </div>
          {mode === 'growth' && (
            <div className="seg">
              {windows.map((w) => (
                <button
                  key={w.d}
                  className={growthWindow === w.d ? 'active' : ''}
                  onClick={() => void loadGrowth(w.d)}
                >
                  {t(w.key)}
                </button>
              ))}
            </div>
          )}
          <button className="btn" onClick={() => void loadGrowth(growthWindow, false)}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">
            {mode === 'growth' ? (
              <>
                <TrendingUp size={13} />
                {t(`charts.d${growthWindow}` as string)}
              </>
            ) : (
              <>
                <Star size={13} />
                {t('charts.top')}
              </>
            )}
          </span>
          <span className="section-meta">
            {mode === 'growth' ? (growth?.length || 0) : top?.length || 0}
          </span>
          {mode === 'growth' && (
            <div className="section-actions">
              {sourceSummary(growth || []).map(([source, n]) => (
                <span key={source} className="chip mono" title={t('charts.hint')}>
                  <Info size={10} />
                  {t(sourceKey(source))} {n}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="board-head">
            <span>#</span>
            <span />
            <span>{t('charts.project')}</span>
            <span>{mode === 'growth' ? t('charts.gained') : t('common.stars')}</span>
            <span className="r">{mode === 'growth' ? t('common.stars') : t('charts.perDay')}</span>
            <span className="r">{t('charts.rank')}</span>
          </div>

          {growthLoading && mode === 'growth' && !growth ? (
            <div className="flex" style={{ padding: 40, justifyContent: 'center', gap: 10, color: 'var(--text-2)' }}>
              <span className="spinner" />
              {t('charts.loading')}
            </div>
          ) : mode === 'growth' ? (
            (growth || []).map((row, i) => (
              <div className="board-row" key={row.fullName} onClick={() => void openDetail(row.fullName)}>
                <span className={`board-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}`}>
                  {i + 1}
                </span>
                {row.avatarUrl ? (
                  <img className="board-tile" src={row.avatarUrl} alt="" loading="lazy" />
                ) : (
                  <div className="board-tile" />
                )}
                <div className="board-name">
                  <div className="n">{row.name}</div>
                  <div className="o">
                    {row.owner}
                    {row.category ? ` · ${lang === 'zh' ? CATEGORY_LABELS[row.category].zh : CATEGORY_LABELS[row.category].en}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div className="board-bar">
                    <span style={{ width: `${Math.max(3, (row.gained / maxGain) * 100)}%` }} />
                  </div>
                </div>
                <div className="board-gain" title={row.approx ? t('charts.approxHint') : t(sourceKey(row.source))}>
                  {row.approx ? '≥' : '+'}
                  {row.gained}
                </div>
                <div className="board-total">★ {fmtStars(row.stars)}</div>
              </div>
            ))
          ) : (
            (top || []).map((repo, i) => (
              <div className="board-row" key={repo.fullName} onClick={() => void openDetail(repo.fullName)}>
                <span className={`board-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}`}>
                  {i + 1}
                </span>
                {repo.avatarUrl ? (
                  <img className="board-tile" src={repo.avatarUrl} alt="" loading="lazy" />
                ) : (
                  <div className="board-tile" />
                )}
                <div className="board-name">
                  <div className="n">{repo.name}</div>
                  <div className="o">
                    {repo.owner}
                    {repo.category ? ` · ${lang === 'zh' ? CATEGORY_LABELS[repo.category].zh : CATEGORY_LABELS[repo.category].en}` : ''}
                  </div>
                </div>
                <div className="board-bar">
                  <span
                    style={{
                      width: `${Math.max(3, ((repo.stars || 0) / maxStars) * 100)}%`,
                      background: 'linear-gradient(90deg, var(--violet), var(--accent))'
                    }}
                  />
                </div>
                <div className="board-gain" style={{ color: 'var(--text-0)' }}>
                  ★ {fmtStars(repo.stars)}
                </div>
                <div className="board-total">{repo.skillCount ?? repo.skillDirs?.length ?? 0} skills</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
