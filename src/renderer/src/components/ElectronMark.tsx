/**
 * The Electron-style atom mark, redrawn as vector so it can take the theme's
 * colours.
 *
 * The original is a bitmap app icon (light rounded plate, dark disc, light
 * orbital atom) and cannot be recoloured, so it is rebuilt here with the same
 * geometry and driven by CSS custom properties:
 *
 *   plate    var(--text-0)    light on dark schemes, dark on light schemes
 *   disc     var(--bg-0)      the inverse, so the disc always reads as "inside"
 *   atom     var(--accent-hi) follows the theme accent
 *   nucleus  var(--accent-hi)
 *
 * The result keeps the recognisable silhouette while changing colour with the
 * interface palette, and it inverts sensibly on the two light themes.
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
      {/* rounded plate */}
      <rect width="64" height="64" rx="16" fill="var(--text-0)" />
      {/* inner disc */}
      <circle cx="32" cy="32" r="21.5" fill="var(--bg-0)" />
      {/* three orbits */}
      <g
        fill="none"
        stroke="var(--accent-hi)"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.95"
      >
        <ellipse cx="32" cy="32" rx="14" ry="5.7" />
        <ellipse cx="32" cy="32" rx="14" ry="5.7" transform="rotate(60 32 32)" />
        <ellipse cx="32" cy="32" rx="14" ry="5.7" transform="rotate(120 32 32)" />
      </g>
      {/* electrons sitting on the orbits */}
      <g fill="var(--bg-0)" stroke="var(--accent-hi)" strokeWidth="1.9">
        <circle cx="19.4" cy="24.6" r="2.5" />
        <circle cx="44.4" cy="33.6" r="2.5" />
        <circle cx="25.6" cy="42.2" r="2.5" />
      </g>
      {/* nucleus */}
      <circle cx="32" cy="32" r="3" fill="var(--accent-hi)" />
    </svg>
  )
}
