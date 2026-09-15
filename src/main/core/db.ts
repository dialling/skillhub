import { JsonStore, registerStore } from './store'
export { flushAll } from './store'
import { defaultLibraryDir } from './paths'
import type {
  GrowthRow,
  ActivityEvent,
  InstallRecord,
  LibraryItem,
  RepoMeta,
  Settings,
  StarSnapshot
} from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  lang: 'zh',
  libraryDir: defaultLibraryDir(),
  installMode: 'symlink',
  token: '',
  user: null,
  enabledAgents: [],
  customAgents: [],
  projectDir: null,
  sidebarOpen: true,
  theme: 'azure',
  installRoot: undefined,
  recentWorkspaces: [],
  seenLibraryAt: undefined,
  seenAgents: undefined,
  liveUpdatedAt: undefined,
  liveDate: null,
  firstRunDone: false
}

export const settings = new JsonStore<Settings>('settings', DEFAULT_SETTINGS)
export const library = new JsonStore<{ items: LibraryItem[] }>('library', { items: [] })
export const installs = new JsonStore<{ records: InstallRecord[] }>('installs', { records: [] })
export const stars = new JsonStore<{
  history: Record<string, StarSnapshot[]>
  /** precomputed leaderboards published by the project's own GitHub Action */
  sharedGrowth: Record<string, GrowthRow[]>
  sharedAt: number | null
  growth: Record<
    string,
    {
      at: number
      days: number
      gained: number
      source?: string
      approx?: boolean
      coveredHours?: number
    }
  >
}>('stars', { history: {}, growth: {}, sharedGrowth: {}, sharedAt: null })
export const activity = new JsonStore<{ events: ActivityEvent[] }>('activity', { events: [] })
export const cache = new JsonStore<{
  readme: Record<string, { at: number; text: string }>
  /**
   * Repos we know about. `origin` matters: search hits must not leak into the
   * growth leaderboard, which should describe the skill ecosystem the user is
   * actually browsing, not every repo a query happened to return.
   */
  repos: Record<string, { at: number; meta: RepoMeta; origin?: 'search' | 'detail' }>
  skillmeta: Record<string, { at: number; descriptionEn?: string; descriptionZh?: string }>
}>('cache', { readme: {}, repos: {}, skillmeta: {} })

for (const s of [settings, library, installs, stars, activity, cache]) registerStore(s)

export function logActivity(
  kind: ActivityEvent['kind'],
  code: string,
  params?: Record<string, string | number | undefined>
): void {
  activity.update((d) => {
    d.events.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      kind,
      code,
      params
    })
    d.events = d.events.slice(0, 300)
  })
}

/** Record today's star count for a repo, keeping 180 days of history. */
export function snapshotStars(fullName: string, starCount: number): void {
  const today = new Date().toISOString().slice(0, 10)
  stars.update((d) => {
    const list = d.history[fullName] || []
    const last = list[list.length - 1]
    if (last && last.date === today) last.stars = starCount
    else list.push({ date: today, stars: starCount })
    d.history[fullName] = list.slice(-180)
  })
}

/** Stars gained over `days` using only locally recorded snapshots. */
export function growthFromSnapshots(fullName: string, days: number): number | null {
  const list = stars.get().history[fullName]
  if (!list || list.length < 2) return null
  const newest = list[list.length - 1]
  const cutoff = Date.now() - days * 86400_000
  // oldest snapshot that is still within the window, else the earliest we have
  let base = list[0]
  for (const s of list) {
    if (new Date(s.date + 'T23:59:59Z').getTime() >= cutoff) {
      base = s
      break
    }
  }
  if (base.date === newest.date) return null
  return Math.max(0, newest.stars - base.stars)
}
