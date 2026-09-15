import { Star, Loader2 } from 'lucide-react'
import { useStore } from '../store'

/**
 * Stars the repository on GitHub, not in a local list.
 *
 * Eligibility comes from one shared list read at sign-in, so every button on
 * screen agrees at the same moment rather than each card fetching its own
 * answer. When the user is not signed in the button explains that instead of
 * silently doing nothing — pressing it and getting no reaction is worse than
 * being told what it needs.
 */
export function StarButton({
  fullName,
  size = 'sm',
  showLabel = false
}: {
  fullName: string
  size?: 'sm' | 'md'
  showLabel?: boolean
}): React.JSX.Element {
  const t = useStore((s) => s.t)
  const starred = useStore((s) => s.starred.includes(fullName))
  const busy = useStore((s) => s.starring === fullName)
  const toggleStar = useStore((s) => s.toggleStar)
  const signedIn = !!useStore((s) => s.settings?.user)

  return (
    <button
      className={`btn ghost ${size === 'sm' ? 'sm' : ''} star-btn${starred ? ' on' : ''}`}
      title={starred ? t('star.hintUnstar') : t('star.hintStar')}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        void toggleStar(fullName)
      }}
    >
      {busy ? <Loader2 size={12} className="spin" /> : <Star size={12} fill={starred ? 'currentColor' : 'none'} />}
      {showLabel && <span>{starred ? t('star.starred') : t('star.star')}</span>}
      {!signedIn && !showLabel && <span className="dim" style={{ fontSize: 10 }}>·</span>}
    </button>
  )
}
