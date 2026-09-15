/**
 * The SkillHub mark, drawn inline so it stays crisp at titlebar sizes.
 *
 * Same design as build/icon.svg — a hexagonal package (SKILL.md) with a central
 * hub feeding three satellite nodes (one skill, many agents) — but simplified:
 * no blur, no glow, heavier relative strokes so it survives 22px.
 */
export function AppMark({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ flex: 'none', display: 'block' }}
    >
      <defs>
        <linearGradient id="skillhub-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2540" />
          <stop offset="1" stopColor="#080c16" />
        </linearGradient>
        <linearGradient id="skillhub-iri" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#58a6ff" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id="skillhub-core" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#cfe9ff" />
          <stop offset="0.5" stopColor="#58a6ff" />
          <stop offset="1" stopColor="#7c4dff" />
        </radialGradient>
      </defs>

      <rect width="64" height="64" rx="15" fill="url(#skillhub-plate)" />

      <polygon
        points="32,13 48.5,22.5 48.5,41.5 32,51 15.5,41.5 15.5,22.5"
        fill="none"
        stroke="url(#skillhub-iri)"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <g stroke="url(#skillhub-iri)" strokeWidth="3" strokeLinecap="round">
        <path d="M32 32 L32 18" />
        <path d="M32 32 L45 39.5" />
        <path d="M32 32 L19 39.5" />
      </g>
      <g fill="#0b101c" stroke="url(#skillhub-iri)" strokeWidth="2.6">
        <circle cx="32" cy="17" r="4.6" />
        <circle cx="46" cy="40" r="4.6" />
        <circle cx="18" cy="40" r="4.6" />
      </g>
      <circle cx="32" cy="32" r="8.4" fill="url(#skillhub-core)" />
    </svg>
  )
}
