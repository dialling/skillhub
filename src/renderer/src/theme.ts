/**
 * Interface colour schemes.
 *
 * A theme is a complete palette, not an accent swap: surfaces, borders, text
 * ramp, overlay tints and the ambient background glows all move together, so
 * "Midnight" and "Daylight" genuinely look like different products.
 *
 * Everything is written onto :root as CSS custom properties. No component knows
 * that themes exist.
 */

export type ThemeId =
  | 'azure'
  | 'obsidian'
  | 'graphite'
  | 'forest'
  | 'midnight'
  | 'sepia'
  | 'daylight'
  | 'paper'

export interface Theme {
  id: ThemeId
  zh: string
  en: string
  /** 'light' schemes need darker overlay tints and softer shadows */
  scheme: 'dark' | 'light'
  swatch: [string, string, string]
  vars: Record<string, string>
}

/** Surfaces, text ramp and tint direction. Shared shape for every theme. */
interface SurfaceSpec {
  bg: [string, string, string, string, string, string]
  text: [string, string, string, string]
  /** rgb triplet used for translucent borders */
  borderRgb: string
  /** rgb triplet of the "lift" colour painted over surfaces (white or near-black) */
  tintRgb: string
  shadowRgb: string
  /** opaque-ish background for floating panels (toast, palette, job bar) */
  glass: string
  /** inset fields: search boxes, code blocks */
  field: string
  /** bottom fade over card artwork */
  artFade: string
  scrim: string
}

function surfaceVars(s: SurfaceSpec): Record<string, string> {
  return {
    '--bg-0': s.bg[0],
    '--bg-1': s.bg[1],
    '--bg-2': s.bg[2],
    '--bg-3': s.bg[3],
    '--bg-4': s.bg[4],
    '--bg-5': s.bg[5],
    '--text-0': s.text[0],
    '--text-1': s.text[1],
    '--text-2': s.text[2],
    '--text-3': s.text[3],
    '--border-rgb': s.borderRgb,
    '--border': `rgba(${s.borderRgb}, 0.1)`,
    '--border-2': `rgba(${s.borderRgb}, 0.18)`,
    '--border-3': `rgba(${s.borderRgb}, 0.3)`,
    '--tint-rgb': s.tintRgb,
    '--shadow-rgb': s.shadowRgb,
    '--glass-rgb': s.glass,
    // Derived from the surface ramp so panels can fade toward "darker surface"
    // without hardcoding a dark colour that breaks light schemes.
    '--bg0-rgb': hexToRgb(s.bg[0]),
    '--bg2-rgb': hexToRgb(s.bg[2]),
    '--field-rgb': s.field,
    '--art-fade-rgb': s.artFade,
    '--scrim-rgb': s.scrim,
    '--shadow-1': `0 1px 2px rgba(${s.shadowRgb}, 0.4)`,
    '--shadow-2': `0 8px 24px -6px rgba(${s.shadowRgb}, 0.6)`,
    '--shadow-3': `0 24px 64px -12px rgba(${s.shadowRgb}, 0.75)`,
    '--ok-deep': '#238636',
    '--rank-1': '#ffd666',
    '--rank-2': '#d6dce5',
    '--rank-3': '#e0a370'
  }
}

interface AccentSpec {
  accent: string
  accentHi: string
  accentDeep: string
  accentRgb: string
  second: string
  third: string
  ambient1: string
  ambient2: string
}

function accentVars(a: AccentSpec): Record<string, string> {
  return {
    '--accent': a.accent,
    '--accent-hi': a.accentHi,
    '--accent-deep': a.accentDeep,
    '--accent-rgb': a.accentRgb,
    '--accent-dim': `rgba(${a.accentRgb}, 0.16)`,
    '--accent-soft': `rgba(${a.accentRgb}, 0.09)`,
    '--cyan': a.second,
    '--violet': a.third,
    '--second-rgb': hexToRgb(a.second),
    '--third-rgb': hexToRgb(a.third),
    '--ambient-1': a.ambient1,
    '--ambient-2': a.ambient2
  }
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

const DARK_NEUTRAL: SurfaceSpec = {
  bg: ['#06080d', '#0a0e16', '#0e1320', '#131a29', '#1a2334', '#212c41'],
  text: ['#e8eefb', '#a2b2cc', '#6b7d99', '#4a586e'],
  borderRgb: '140, 170, 220',
  tintRgb: '255, 255, 255',
  shadowRgb: '0, 0, 0',
  glass: '19, 26, 41',
  field: '6, 8, 13',
  artFade: '10, 14, 22',
  scrim: '3, 5, 9'
}

export const THEMES: Record<ThemeId, Theme> = {
  azure: {
    id: 'azure',
    zh: '深空蓝',
    en: 'Azure',
    scheme: 'dark',
    swatch: ['#3d5fd9', '#22d3ee', '#8b5cf6'],
    vars: {
      ...surfaceVars(DARK_NEUTRAL),
      ...accentVars({
        // Deeper, less saturated, and leaning indigo rather than the GitHub
        // blue this started as (215° 93% 58% → 227° 67% 55%). The vivid version
        // read as neon against the dark surfaces, and white text on it only
        // reached 3.75:1 — below AA. This reaches 5.47:1.
        // `--accent` is never used for text (that is always `--accent-hi`), so
        // the depth costs nothing in legibility.
        accent: '#3d5fd9',
        accentHi: '#7793f7',
        accentDeep: '#27409a',
        accentRgb: '61, 95, 217',
        second: '#22d3ee',
        third: '#8b5cf6',
        ambient1: 'rgba(61, 95, 217, 0.13)',
        ambient2: 'rgba(139, 92, 246, 0.09)'
      })
    }
  },

  obsidian: {
    id: 'obsidian',
    zh: '纯黑 OLED',
    en: 'Obsidian',
    scheme: 'dark',
    swatch: ['#4c9aff', '#00d4c8', '#7c5cff'],
    vars: {
      ...surfaceVars({
        bg: ['#000000', '#030304', '#08080a', '#101013', '#18181c', '#222227'],
        text: ['#f4f6fa', '#aab2bf', '#727a86', '#4c525b'],
        borderRgb: '165, 175, 190',
        tintRgb: '255, 255, 255',
        shadowRgb: '0, 0, 0',
        glass: '10, 10, 12',
        field: '0, 0, 0',
        artFade: '6, 6, 8',
        scrim: '0, 0, 0'
      }),
      ...accentVars({
        accent: '#4c9aff',
        accentHi: '#7ab8ff',
        accentDeep: '#2b7ae0',
        accentRgb: '76, 154, 255',
        second: '#00d4c8',
        third: '#7c5cff',
        ambient1: 'rgba(76, 154, 255, 0.10)',
        ambient2: 'rgba(124, 92, 255, 0.08)'
      })
    }
  },

  graphite: {
    id: 'graphite',
    zh: '石墨灰',
    en: 'Graphite',
    scheme: 'dark',
    swatch: ['#9aa4b2', '#7d8896', '#5c6470'],
    vars: {
      ...surfaceVars({
        bg: ['#0a0b0d', '#101113', '#15171a', '#1c1f23', '#24282d', '#2e3339'],
        text: ['#e9ebee', '#a9aeb7', '#767c86', '#575d66'],
        borderRgb: '175, 180, 190',
        tintRgb: '255, 255, 255',
        shadowRgb: '0, 0, 0',
        glass: '28, 31, 35',
        field: '12, 13, 15',
        artFade: '18, 20, 23',
        scrim: '8, 9, 10'
      }),
      ...accentVars({
        accent: '#9aa4b2',
        accentHi: '#cfd6df',
        accentDeep: '#6b7482',
        accentRgb: '154, 164, 178',
        second: '#8b949e',
        third: '#6e7681',
        ambient1: 'rgba(154, 164, 178, 0.09)',
        ambient2: 'rgba(110, 118, 129, 0.06)'
      })
    }
  },

  forest: {
    id: 'forest',
    zh: '深林绿',
    en: 'Forest',
    scheme: 'dark',
    swatch: ['#2ea043', '#7ee787', '#1f9e8f'],
    vars: {
      ...surfaceVars({
        bg: ['#050a08', '#091210', '#0d1a16', '#12241d', '#182f26', '#1f3d31'],
        text: ['#e4f2ea', '#a2bcac', '#6e8a7c', '#4d6459'],
        borderRgb: '130, 180, 152',
        tintRgb: '255, 255, 255',
        shadowRgb: '0, 0, 0',
        glass: '18, 36, 29',
        field: '5, 10, 8',
        artFade: '13, 26, 22',
        scrim: '3, 7, 5'
      }),
      ...accentVars({
        accent: '#2ea043',
        accentHi: '#56d364',
        accentDeep: '#1f7a33',
        accentRgb: '46, 160, 67',
        second: '#7ee787',
        third: '#1f9e8f',
        ambient1: 'rgba(46, 160, 67, 0.13)',
        ambient2: 'rgba(31, 158, 143, 0.07)'
      })
    }
  },

  midnight: {
    id: 'midnight',
    zh: '午夜紫',
    en: 'Midnight',
    scheme: 'dark',
    swatch: ['#8b5cf6', '#d946ef', '#6366f1'],
    vars: {
      ...surfaceVars({
        bg: ['#07060e', '#0c0a17', '#110e1f', '#181328', '#201a34', '#2a2242'],
        text: ['#ece8fb', '#b1a6cf', '#7b6f9c', '#574d70'],
        borderRgb: '165, 145, 215',
        tintRgb: '255, 255, 255',
        shadowRgb: '0, 0, 0',
        glass: '24, 19, 40',
        field: '7, 6, 14',
        artFade: '17, 14, 31',
        scrim: '4, 3, 9'
      }),
      ...accentVars({
        accent: '#8b5cf6',
        accentHi: '#a78bfa',
        accentDeep: '#6d3fe0',
        accentRgb: '139, 92, 246',
        second: '#d946ef',
        third: '#6366f1',
        ambient1: 'rgba(139, 92, 246, 0.14)',
        ambient2: 'rgba(217, 70, 239, 0.08)'
      })
    }
  },

  sepia: {
    id: 'sepia',
    zh: '暖褐',
    en: 'Sepia',
    scheme: 'dark',
    swatch: ['#d29922', '#e08c4a', '#a3714b'],
    vars: {
      ...surfaceVars({
        bg: ['#0c0906', '#130f0b', '#1a1510', '#231c15', '#2d241b', '#3a2f23'],
        text: ['#f6ece0', '#c8b6a2', '#93816d', '#6b5d4d'],
        borderRgb: '195, 165, 130',
        tintRgb: '255, 255, 255',
        shadowRgb: '0, 0, 0',
        glass: '35, 28, 21',
        field: '12, 9, 6',
        artFade: '26, 21, 16',
        scrim: '6, 4, 3'
      }),
      ...accentVars({
        accent: '#d29922',
        accentHi: '#e8b845',
        accentDeep: '#a8781a',
        accentRgb: '210, 153, 34',
        second: '#e08c4a',
        third: '#a3714b',
        ambient1: 'rgba(210, 153, 34, 0.12)',
        ambient2: 'rgba(224, 140, 74, 0.07)'
      })
    }
  },

  daylight: {
    id: 'daylight',
    zh: '亮色·日光',
    en: 'Daylight',
    scheme: 'light',
    swatch: ['#1f6feb', '#0891b2', '#7c3aed'],
    vars: {
      ...surfaceVars({
        bg: ['#eaeef5', '#f5f7fb', '#ffffff', '#ffffff', '#f3f6fa', '#e6ebf3'],
        text: ['#0d1420', '#39424f', '#646d7c', '#8d96a4'],
        borderRgb: '18, 32, 58',
        tintRgb: '18, 32, 58',
        shadowRgb: '24, 38, 62',
        glass: '255, 255, 255',
        field: '255, 255, 255',
        artFade: '255, 255, 255',
        scrim: '30, 42, 62'
      }),
      ...accentVars({
        accent: '#1f6feb',
        accentHi: '#3b82f6',
        accentDeep: '#1858bd',
        accentRgb: '31, 111, 235',
        second: '#0891b2',
        third: '#7c3aed',
        ambient1: 'rgba(31, 111, 235, 0.10)',
        ambient2: 'rgba(124, 58, 237, 0.07)'
      }),
      // Light surfaces need darker separators and softer shadows than the
      // shared dark defaults.
      '--border': 'rgba(18, 32, 58, 0.12)',
      '--border-2': 'rgba(18, 32, 58, 0.2)',
      '--border-3': 'rgba(18, 32, 58, 0.34)',
      '--shadow-1': '0 1px 2px rgba(24, 38, 62, 0.08)',
      '--shadow-2': '0 8px 24px -8px rgba(24, 38, 62, 0.18)',
      '--shadow-3': '0 24px 64px -16px rgba(24, 38, 62, 0.26)',
      '--glass-rgb': '255, 255, 255',
      '--ok': '#1a7f37',
      '--err': '#cf222e',
      '--warn': '#9a6700',
      '--ok-deep': '#116329',
      '--rank-1': '#b45309',
      '--rank-2': '#64748b',
      '--rank-3': '#a16207'
    }
  },

  paper: {
    id: 'paper',
    zh: '亮色·纸张',
    en: 'Paper',
    scheme: 'light',
    swatch: ['#0f766e', '#b45309', '#7c2d12'],
    vars: {
      ...surfaceVars({
        bg: ['#efe9dd', '#f8f4ec', '#fffdf8', '#fffdf8', '#f6f1e7', '#eae3d5'],
        text: ['#1b1710', '#4b4337', '#776c5b', '#9b8f7d'],
        borderRgb: '92, 74, 48',
        tintRgb: '92, 74, 48',
        shadowRgb: '72, 58, 38',
        glass: '255, 253, 248',
        field: '255, 253, 248',
        artFade: '255, 253, 248',
        scrim: '60, 48, 30'
      }),
      ...accentVars({
        accent: '#0f766e',
        accentHi: '#14958a',
        accentDeep: '#0b5d57',
        accentRgb: '15, 118, 110',
        second: '#b45309',
        third: '#7c2d12',
        ambient1: 'rgba(15, 118, 110, 0.09)',
        ambient2: 'rgba(180, 83, 9, 0.06)'
      }),
      '--border': 'rgba(92, 74, 48, 0.16)',
      '--border-2': 'rgba(92, 74, 48, 0.24)',
      '--border-3': 'rgba(92, 74, 48, 0.38)',
      '--shadow-1': '0 1px 2px rgba(72, 58, 38, 0.1)',
      '--shadow-2': '0 8px 24px -8px rgba(72, 58, 38, 0.2)',
      '--shadow-3': '0 24px 64px -16px rgba(72, 58, 38, 0.28)',
      '--ok': '#15803d',
      '--err': '#b91c1c',
      '--warn': '#a16207',
      '--ok-deep': '#14532d',
      '--rank-1': '#92400e',
      '--rank-2': '#57534e',
      '--rank-3': '#a16207'
    }
  }
}

export const THEME_ORDER: ThemeId[] = [
  'azure',
  'obsidian',
  'graphite',
  'forest',
  'midnight',
  'sepia',
  'daylight',
  'paper'
]

/** Every property any theme may set, so switching themes never leaves a stale value. */
const ALL_KEYS = new Set<string>()
for (const theme of Object.values(THEMES)) for (const k of Object.keys(theme.vars)) ALL_KEYS.add(k)

/** Write a theme onto :root. */
export function applyTheme(id: string | undefined): void {
  const theme = THEMES[(id as ThemeId) in THEMES ? (id as ThemeId) : 'azure']
  const root = document.documentElement
  for (const key of ALL_KEYS) root.style.removeProperty(key)
  for (const [key, value] of Object.entries(theme.vars)) root.style.setProperty(key, value)
  root.dataset.scheme = theme.scheme
  root.style.colorScheme = theme.scheme
}
