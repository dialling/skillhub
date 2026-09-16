import { useEffect, useMemo, useState } from 'react'
import { Search, Layers, Star, ExternalLink, Download, Check, X } from 'lucide-react'
import type { SkillIndexEntry } from '@shared/types'
import { AGENT_SKILL_LABELS, FN_LABELS, type FnCategory } from '@shared/types'
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
/**
 * Interleave skills by repository.
 *
 * Sorting by stars alone put one repository's entire catalogue at the top: a
 * collection with 864 auto-generated skills all share its star count, so the
 * first screen was eighty near-identical rows from a single source and nothing
 * else was reachable. Taking one from each repository in turn keeps the list
 * varied while preserving the star ordering between repositories.
 */
function roundRobin(list: SkillIndexEntry[]): SkillIndexEntry[] {
  const byRepo = new Map<string, SkillIndexEntry[]>()
  for (const s of list) {
    const bucket = byRepo.get(s.r)
    if (bucket) bucket.push(s)
    else byRepo.set(s.r, [s])
  }
  const queues = [...byRepo.entries()]
    .sort((a, b) => (b[1][0]?.s || 0) - (a[1][0]?.s || 0))
    .map(([, items]) => items)
  const out: SkillIndexEntry[] = []
  for (let i = 0; out.length < list.length; i++) {
    let progressed = false
    for (const q of queues) {
      if (i < q.length) {
        out.push(q[i])
        progressed = true
      }
    }
    if (!progressed) break
  }
  return out
}

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
  const installQuick = useStore((s) => s.installQuick)
  const installing = useStore((s) => s.installing)
  const installMap = useStore((s) => s.installMap)
  const library = useStore((s) => s.library)

  const [fn, setFn] = useState<FnCategory | 'all'>('all')
  const [agent, setAgent] = useState<string | 'all'>('all')

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
    if (fn === 'all') return roundRobin(Object.values(shards).flat())
    return (shards[fn] || []).slice()
  }, [hits, fn, shards])

  /** Agents actually present in what we have loaded, for the filter row. */
  const agents = useMemo(() => {
    const seen = new Map<string, number>()
    for (const s of Object.values(shards).flat()) if (s.a) seen.set(s.a, (seen.get(s.a) || 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [shards])

  const inLibrary = (repo: string): boolean => library.some((i) => i.fullName === repo && i.status === 'ready')

  const categories = info ? Object.entries(info.shards).sort((a, b) => b[1].count - a[1].count) : []
  const shown = agent === 'all' ? rows : rows.filter((s) => s.a === agent)

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
          {hits ? t('skills.hits', { n: shown.length }) : t('skills.total', { n: info?.total || 0 })}
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

      {!hits && agents.length > 0 && (
        <div className="skill-filters" style={{ marginTop: -6 }}>
          <span className="dim" style={{ fontSize: 11, alignSelf: 'center', marginRight: 2 }}>
            {t('skills.agentFilter')}
          </span>
          <button className={`chip clickable${agent === 'all' ? ' active' : ''}`} onClick={() => setAgent('all')}>
            {t('common.all')}
          </button>
          {agents.map(([id, n]) => (
            <button
              key={id}
              className={`chip clickable${agent === id ? ' active' : ''}`}
              onClick={() => setAgent(id)}
            >
              {AGENT_SKILL_LABELS[id] ? (lang === 'zh' ? AGENT_SKILL_LABELS[id].zh : AGENT_SKILL_LABELS[id].en) : id}
              <span className="dim mono">{n}</span>
            </button>
          ))}
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
          {shown.slice(0, 120).map((s, i) => (
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
                {s.a && (
                  <span className="chip agent-chip" title={t('skills.agentHint')}>
                    {AGENT_SKILL_LABELS[s.a] ? (lang === 'zh' ? AGENT_SKILL_LABELS[s.a].zh : AGENT_SKILL_LABELS[s.a].en) : s.a}
                  </span>
                )}
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
                  {/*
                    Install, not file away.

                    This button used to add the *repository* to the library, which
                    is a filing action: the skill did not become usable, and the
                    library grew a repository the user had not asked to collect.
                    The whole promise of the app is "pick a skill, and you can use
                    it" — so the primary action installs this one skill into every
                    enabled agent's own directory, where the agent will read it.

                    "Add the repository to my library" still exists, on the detail
                    page, for someone who wants to collect rather than use.
                  */}
                  {(() => {
                    const id = `${s.r}::${s.p}`
                    const installed = (installMap[id] || []).length > 0
                    if (installed) {
                      return (
                        <button className="btn sm" onClick={() => void openDetail(s.r)}>
                          <Check size={11} />
                          {t('skills.installed')}
                        </button>
                      )
                    }
                    return (
                      <button
                        className="btn primary sm"
                        disabled={installing}
                        title={t('skills.installOneHint')}
                        onClick={() =>
                          void installQuick([
                            {
                              id,
                              repoFullName: s.r,
                              path: s.p,
                              name: s.n,
                              title: s.n,
                              descriptionEn: s.d,
                              tags: [],
                              source: 'github'
                            }
                          ])
                        }
                      >
                        <Download size={11} />
                        {t('skills.installOne')}
                      </button>
                    )
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {shown.length > 120 && (
        <div className="dim" style={{ textAlign: 'center', fontSize: 11.5, padding: '14px 0' }}>
          {t('skills.truncated', { n: shown.length - 120, term: '' })}
        </div>
      )}
    </>
  )
}
