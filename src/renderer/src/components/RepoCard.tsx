import { Star, Download, Check, Plus, ExternalLink, GitFork, Layers } from 'lucide-react'
import type { RepoMeta } from '@shared/types'
import { fmtRelative, fmtStars, gradientFor } from '../api'
import { useStore } from '../store'
import { CATEGORY_LABELS, FN_LABELS, type FnCategory } from '@shared/types'
import { fnColor } from './Sidebar'

export function RepoArt({
  repo,
  height
}: {
  repo: RepoMeta
  height?: number
}): React.JSX.Element {
  const [c1, c2] = gradientFor(repo.fullName)
  return (
    <div
      className="card-art"
      style={{
        height,
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
      }}
    >
      {repo.avatarUrl ? (
        <img className="owner" src={repo.avatarUrl} alt="" loading="lazy" />
      ) : (
        <div className="owner" style={{ background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center' }}>
          <Layers size={18} />
        </div>
      )}
      <div className="art-label">
        <div className="art-owner">{repo.owner}</div>
        <div className="art-name">{repo.name}</div>
      </div>
    </div>
  )
}

export function RepoCard({
  repo,
  dense,
  style
}: {
  repo: RepoMeta
  dense?: boolean
  style?: React.CSSProperties
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const openDetail = useStore((s) => s.openDetail)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const library = useStore((s) => s.library)
  const installMap = useStore((s) => s.installMap)
  const job = useStore((s) => s.job)

  const item = library.find((i) => i.fullName === repo.fullName)
  const inLibrary = !!item && item.status === 'ready'
  const adding = !!job && job.job === 'clone' && job.id === repo.fullName
  const installedCount = item
    ? item.skills.reduce((n, sk) => n + (installMap[sk.id]?.length || 0), 0)
    : 0

  // The store card leads with the rewritten "one glance" line; the long
  // repo-centric blurb is only shown in the detail page.
  const tagline =
    lang === 'zh' ? repo.taglineZh || repo.descriptionZh || repo.descriptionEn : repo.taglineEn || repo.descriptionEn || ''
  const fn = repo.fn as FnCategory | undefined
  const category = repo.category ? CATEGORY_LABELS[repo.category] : null
  const skillCount = repo.skillCount ?? repo.skillDirs?.length ?? 0
  const freshness = repo.pushedAt ? fmtRelative(Date.parse(repo.pushedAt), lang) : ''

  return (
    <div className="card" style={style} onClick={() => void openDetail(repo.fullName)} role="button" tabIndex={0}>
      <RepoArt repo={repo} height={dense ? 72 : 84} />
      <div className="card-body">
        <div className={`card-desc card-tagline ${lang === 'zh' ? 'zh' : ''}`}>
          {tagline || t('common.unknown')}
        </div>

        <div className="card-tags">
          {fn && (
            <span className="chip fn-chip" style={{ color: fnColor(fn), borderColor: `${fnColor(fn)}55` }}>
              {lang === 'zh' ? FN_LABELS[fn].zh : FN_LABELS[fn].en}
            </span>
          )}
          {/* Only the provenance label that carries real signal. "官方出品" is a
              trust marker (skills.sh has a whole Official nav for it); labels
              like 垂直领域 / 技能合集 just restate what the card already shows. */}
          {repo.category === 'official' && (
            <span className="chip green">{lang === 'zh' ? category!.zh : category!.en}</span>
          )}
          {skillCount > 0 && (
            <span className="chip mono">
              <Layers size={10} />
              {skillCount}
            </span>
          )}
          {(repo.topics || []).slice(0, dense ? 1 : 2).map((tag) => (
            <span key={tag} className="chip mono">
              {tag}
            </span>
          ))}
        </div>

        <div className="card-foot">
          <span className="stat strong" title={`${repo.stars} stars`}>
            <Star size={11} />
            {fmtStars(repo.stars)}
          </span>
          {freshness && (
            <span className="stat" title={repo.pushedAt}>
              {freshness}
            </span>
          )}
          {installedCount > 0 && (
            <span className="stat" style={{ color: 'var(--ok)' }} title={t('card.installed')}>
              <Check size={11} />
              {installedCount}
            </span>
          )}

          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn ghost sm"
              title={t('card.viewRepo')}
              onClick={() => void window.skillhub.system.openExternal(repo.htmlUrl)}
            >
              <ExternalLink size={12} />
            </button>
            {inLibrary ? (
              <button className="btn sm" onClick={() => void openDetail(repo.fullName)}>
                <Check size={12} />
                {t('card.inLibrary')}
              </button>
            ) : (
              <button
                className="btn primary sm"
                disabled={adding}
                onClick={() => void addToLibrary(repo.fullName)}
              >
                {adding ? <span className="spinner" /> : <Plus size={12} />}
                {t('card.add')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RepoRow({ repo }: { repo: RepoMeta }): React.JSX.Element {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const openDetail = useStore((s) => s.openDetail)
  const addToLibrary = useStore((s) => s.addToLibrary)
  const library = useStore((s) => s.library)
  const inLibrary = library.some((i) => i.fullName === repo.fullName && i.status === 'ready')
  const [c1] = gradientFor(repo.fullName)

  return (
    <div className="card-compact" onClick={() => void openDetail(repo.fullName)}>
      <div className="tile" style={{ background: `linear-gradient(135deg, ${c1}, #0b0f17)` }}>
        {repo.avatarUrl ? <img src={repo.avatarUrl} alt="" loading="lazy" /> : repo.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="meta">
        <div className="name">{repo.fullName}</div>
        <div className="sub">
          {lang === 'zh'
            ? repo.taglineZh || repo.descriptionZh || repo.descriptionEn
            : repo.taglineEn || repo.descriptionEn}
        </div>
      </div>
      <span className="stat strong">
        <Star size={11} />
        {fmtStars(repo.stars)}
      </span>
      {inLibrary ? (
        <span className="chip green">
          <Check size={10} />
          {t('card.inLibrary')}
        </span>
      ) : (
        <button
          className="btn sm"
          onClick={(e) => {
            e.stopPropagation()
            void addToLibrary(repo.fullName)
          }}
        >
          <Plus size={11} />
          {t('card.add')}
        </button>
      )}
    </div>
  )
}
