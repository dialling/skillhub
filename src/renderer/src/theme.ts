/**
 * Interface colour schemes.
 *
 * The palette is driven entirely by CSS custom properties, so a theme is just a
 * set of values written onto :root — no component knows about themes, and the
 * whole app (including the ambient background gradients) shifts at once.
 */

export type ThemeId = 'azure' | 'graphite' | 'emerald' | 'harbor' | 'violet' | 'amber' | 'rose'

export interface Theme {
  id: ThemeId
  zh: string
  en: string
  /** primary interactive colour */
  accent: string
  /** lighter accent for hover/active text */
  accentHi: string
  /** translucent accent for fills */
  accentDim: string
  /** secondary hue, used in gradients and the growth bars */
  second: string
  /** tertiary hue, used in gradients and rank colours */
  third: string
  /** the two ambient glows behind the whole window */
  ambient1: string
  ambient2: string
}

export const THEMES: Record<ThemeId, Theme> = {
  azure: {
    id: 'azure',
    zh: '深空蓝',
    en: 'Azure',
    accent: '#2f81f7',
    accentHi: '#58a6ff',
    accentDim: 'rgba(47, 129, 247, 0.16)',
    second: '#22d3ee',
    third: '#8b5cf6',
    ambient1: 'rgba(47, 129, 247, 0.11)',
    ambient2: 'rgba(139, 92, 246, 0.09)'
  },
  graphite: {
    id: 'graphite',
    zh: '石墨灰',
    en: 'Graphite',
    accent: '#8b949e',
    accentHi: '#c9d1d9',
    accentDim: 'rgba(139, 148, 158, 0.16)',
    second: '#58a6ff',
    third: '#6e7681',
    ambient1: 'rgba(139, 148, 158, 0.10)',
    ambient2: 'rgba(88, 166, 255, 0.07)'
  },
  emerald: {
    id: 'emerald',
    zh: '翡翠绿',
    en: 'Emerald',
    accent: '#2ea043',
    accentHi: '#56d364',
    accentDim: 'rgba(46, 160, 67, 0.18)',
    second: '#3fb950',
    third: '#1f9e8f',
    ambient1: 'rgba(46, 160, 67, 0.12)',
    ambient2: 'rgba(34, 211, 238, 0.07)'
  },
  harbor: {
    id: 'harbor',
    zh: '灰蓝绿',
    en: 'Harbor',
    accent: '#58a6ff',
    accentHi: '#8cc8ff',
    accentDim: 'rgba(88, 166, 255, 0.16)',
    second: '#3fb950',
    third: '#8b949e',
    ambient1: 'rgba(88, 166, 255, 0.12)',
    ambient2: 'rgba(63, 185, 80, 0.08)'
  },
  violet: {
    id: 'violet',
    zh: '紫罗兰',
    en: 'Violet',
    accent: '#8b5cf6',
    accentHi: '#a78bfa',
    accentDim: 'rgba(139, 92, 246, 0.18)',
    second: '#6366f1',
    third: '#d946ef',
    ambient1: 'rgba(139, 92, 246, 0.13)',
    ambient2: 'rgba(217, 70, 239, 0.07)'
  },
  amber: {
    id: 'amber',
    zh: '琥珀橙',
    en: 'Amber',
    accent: '#d29922',
    accentHi: '#e3b341',
    accentDim: 'rgba(210, 153, 34, 0.18)',
    second: '#f0883e',
    third: '#db6d28',
    ambient1: 'rgba(210, 153, 34, 0.11)',
    ambient2: 'rgba(240, 136, 62, 0.07)'
  },
  rose: {
    id: 'rose',
    zh: '玫红',
    en: 'Rose',
    accent: '#ec4899',
    accentHi: '#f472b6',
    accentDim: 'rgba(236, 72, 153, 0.16)',
    second: '#f43f5e',
    third: '#a855f7',
    ambient1: 'rgba(236, 72, 153, 0.11)',
    ambient2: 'rgba(168, 85, 247, 0.08)'
  }
}

export const THEME_ORDER: ThemeId[] = [
  'azure',
  'harbor',
  'graphite',
  'emerald',
  'violet',
  'amber',
  'rose'
]

/** Write a theme onto :root so every CSS variable consumer picks it up. */
export function applyTheme(id: string | undefined): void {
  const theme = THEMES[(id as ThemeId) in THEMES ? (id as ThemeId) : 'azure']
  const root = document.documentElement
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--accent-hi', theme.accentHi)
  root.style.setProperty('--accent-dim', theme.accentDim)
  root.style.setProperty('--cyan', theme.second)
  root.style.setProperty('--violet', theme.third)
  root.style.setProperty('--ambient-1', theme.ambient1)
  root.style.setProperty('--ambient-2', theme.ambient2)
}
