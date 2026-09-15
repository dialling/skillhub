import { cache } from './db'
import { activeToken, getRepo, ghFetch, GitHubError } from './github'

/**
 * Starring a repository on GitHub, from inside the store.
 *
 * The store already shows a star count, which is a one-way number. This makes
 * it two-way: if the user is signed in, the button in the store writes to their
 * real GitHub account rather than to a local list nobody else can see.
 *
 * Starring needs a token with `public_repo` (or `repo`). A `gh auth login`
 * session normally has it; a hand-made read-only PAT often does not, and GitHub
 * answers 403. That case is reported as a scope problem rather than as a
 * generic failure, because the fix is different.
 */

/** The signed-in user's starred repositories, as a set of full names. */
let starredSet: Set<string> | null = null
let starredAt = 0
const STARRED_TTL = 5 * 60_000

export interface StarState {
  signedIn: boolean
  starred: boolean
  stars: number
  /** set when the token lacks the scope star writes require */
  scopeProblem: boolean
}

/**
 * Whether a usable credential exists.
 *
 * `settings.token` is only one of three sources — most installs rely on the
 * `gh` CLI session, and `env` covers CI. Checking the setting directly reported
 * "not signed in" to a user who was signed in and could see their own name in
 * the status bar.
 */
function tokenAvailable(): boolean {
  try {
    return !!activeToken()
  } catch {
    return false
  }
}

/**
 * Page through `/user/starred` once and keep the result.
 *
 * Starring status could be asked per repository, but that is one request per
 * card on screen. Reading the whole list once costs a handful of requests for a
 * few hundred stars and then answers instantly for every card — and it is the
 * only way the state can be right everywhere at the same time.
 */
export async function listStarred(force = false): Promise<Set<string>> {
  if (!force && starredSet && Date.now() - starredAt < STARRED_TTL) return starredSet
  if (!tokenAvailable()) return new Set()
  const set = new Set<string>()
  try {
    for (let page = 1; page <= 20; page++) {
      const batch = await ghFetch<{ full_name: string }[]>(
        `/user/starred?per_page=100&page=${page}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      )
      if (!Array.isArray(batch) || !batch.length) break
      for (const r of batch) if (r?.full_name) set.add(r.full_name)
      if (batch.length < 100) break
    }
    starredSet = set
    starredAt = Date.now()
  } catch (err) {
    // A 401/403 here means the token cannot read the list; leave the cache
    // alone rather than claiming the user has starred nothing.
    if (!starredSet) starredSet = new Set()
  }
  return starredSet
}

/** Whether the signed-in user has starred this repository, and its count. */
export async function starState(fullName: string): Promise<StarState> {
  const signedIn = tokenAvailable()
  if (!signedIn) return { signedIn: false, starred: false, stars: 0, scopeProblem: false }
  await listStarred()
  let stars = 0
  try {
    stars = (await getRepo(fullName)).stars || 0
  } catch {
    /* the count is cosmetic here */
  }
  return {
    signedIn: true,
    starred: !!starredSet?.has(fullName),
    stars,
    scopeProblem: false
  }
}

/**
 * Star or unstar on GitHub, and keep the local picture consistent.
 *
 * The local star count is adjusted by one only after GitHub accepts the write,
 * so the number on screen never claims something the account did not do.
 */
export async function setStar(fullName: string, on: boolean): Promise<StarState> {
  if (!tokenAvailable()) {
    throw new Error('not signed in')
  }
  try {
    await ghFetch(`/user/starred/${fullName}`, {
      method: on ? 'PUT' : 'DELETE',
      headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' }
    })
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 403 || err.status === 401)) {
      return { signedIn: true, starred: !!starredSet?.has(fullName), stars: 0, scopeProblem: true }
    }
    throw err
  }

  if (starredSet) {
    if (on) starredSet.add(fullName)
    else starredSet.delete(fullName)
  }
  starredAt = Date.now()

  // Adjust the cached count in the same direction, so the store reflects the
  // action immediately instead of waiting for the next star refresh.
  let stars = 0
  cache.update((d) => {
    const entry = d.repos[fullName]
    if (!entry?.meta) return
    const next = Math.max(0, (entry.meta.stars || 0) + (on ? 1 : -1))
    entry.meta = { ...entry.meta, stars: next }
    stars = next
  })

  return { signedIn: true, starred: on, stars, scopeProblem: false }
}
