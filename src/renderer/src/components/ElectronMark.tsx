/**
 * The atom mark used at the top of the window.
 *
 * Recognisable as the Electron-style orbit glyph, but drawn in the app's own
 * visual language rather than as a pasted-on app icon: the plate is a
 * translucent accent wash (the same treatment as an active nav item), there is
 * no hard white square and no opaque dark disc, and every stroke comes from the
 * accent ramp. That way it sits in the titlebar instead of on top of it, and it
 * follows the palette for free.
 */
export function ElectronMark({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ flex: 'none', display: 'block' }}
    >
      {/* translucent accent plate — matches .act-item.active / .chip language */}
      <rect
        width="64"
        height="64"
        rx="17"
        fill="var(--accent-dim)"
        stroke="var(--accent)"
        strokeOpacity="0.35"
        strokeWidth="1.6"
      />
      {/* a suggestion of the inner disc, not an opaque one */}
      <circle cx="32" cy="32" r="20.5" fill="var(--accent-soft)" />
      {/* three orbits */}
      <g
        fill="none"
        stroke="var(--accent-hi)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.95"
      >
        <ellipse cx="32" cy="32" rx="13.6" ry="5.5" />
        <ellipse cx="32" cy="32" rx="13.6" ry="5.5" transform="rotate(60 32 32)" />
        <ellipse cx="32" cy="32" rx="13.6" ry="5.5" transform="rotate(120 32 32)" />
      </g>
      {/* electrons */}
      <g fill="var(--bg-2)" stroke="var(--accent-hi)" strokeWidth="2">
        <circle cx="19.8" cy="25" r="2.4" />
        <circle cx="44" cy="33.4" r="2.4" />
        <circle cx="26" cy="41.8" r="2.4" />
      </g>
      {/* nucleus */}
      <circle cx="32" cy="32" r="3" fill="var(--accent-hi)" />
    </svg>
  )
}
