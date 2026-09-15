/**
 * Small presentation helpers shared by the views.
 */

/**
 * Staggered entrance for items in a long list. Capped so that a 60-card grid
 * finishes appearing quickly instead of trailing off the bottom of the screen.
 */
export function stagger(index: number, stepMs = 22, max = 12): React.CSSProperties {
  return { ['--i' as never]: Math.min(index, max), ['--step' as never]: `${stepMs}ms` }
}
