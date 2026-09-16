import type { UpdateInfo } from '../../shared/types'
import { app } from 'electron'
import { settings } from './db'
import { activeToken } from './github'
import { localCatalogVersion } from './catalog'

/**
 * Update checks.
 *
 * Three things version independently, and they need different answers:
 *
 *   app      a release tag (`v0.1.1`); needs a new download
 *   catalog  the curated list, bundled at build time — a new release carries it
 *   data     stars, growth and the skill index, published twice a day
 *
 * Every comparison here answers one question — is the remote **newer** — and
 * never "is it different". Applying a different-but-older copy is the failure
 * this exists to prevent: a stale CDN edge, a cached response or a clock skew
 * would otherwise overwrite a newer local state with an older one, silently.
 */
const OWNER = 'dialling'
const REPO = 'skillhub'
const BRANCH = 'main'
const LIVE = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/data/live`
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/live`
const API = 'https://api.github.com'

/**
 * Compare two dotted versions.
 *
 * Returns >0 when `a` is newer, <0 when `b` is newer, 0 when equal. A version
 * with a pre-release suffix (`1.2.0-rc.1`) sorts *below* its release, which is
 * the semver rule and the reason "0.2.0-rc.1" must not be offered to someone on
 * "0.1.9" as though it were a finished upgrade.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string | null } => {
    const [core, pre = null] = String(v).replace(/^v/, '').split('-', 2)
    return { nums: core.split('.').map((n) => Number(n) || 0), pre }
  }
  const av = parse(a)
  const bv = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (av.nums[i] || 0) - (bv.nums[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  if (av.pre === bv.pre) return 0
  if (av.pre === null) return 1 // a release outranks its own pre-releases
  if (bv.pre === null) return -1
  return av.pre > bv.pre ? 1 : -1
}

/*
  The catalog version comes from `catalog.ts`, not from re-reading the bundled
  file here.

  This function used to open `curatedCatalogPath()` itself, which meant it
  reported the version of the copy inside the asar no matter which catalog the
  app was actually serving. Once a downloaded catalog could win, the check and
  the app would have disagreed: the check would say "you are behind, update
  available" while the store in front of the user was already the new one, and
  the banner would never clear.
*/

/**
 * The data version this machine last applied, e.g. 20260916.
 *
 * `liveDate` holds a full ISO timestamp, not a date — stripping the dashes from
 * "2026-09-15T11:41:42.691Z" yields "20260915T11:41:42.691Z", which Number()
 * turns into NaN, and every comparison against NaN is false. That is how the
 * check silently reported "no update" no matter what was published. Take the
 * date part first.
 */
export function dateToVersion(value: string | null | undefined): number {
  if (!value) return 0
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0
  return Number(date.replace(/-/g, ''))
}

function localDataVersion(): number {
  return dateToVersion(settings.get().liveDate)
}

async function fetchJson<T>(url: string, timeoutMs = 12000, auth = false): Promise<T | null> {
  try {
    const token = auth ? activeToken() : ''
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'skillhub',
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `token ${token}` } : {})
      },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface VersionManifest {
  dataVersion: number
  catalogVersion: number
  repos?: number
  skills?: number
  updatedAt?: string
  date?: string
}

/** The published manifest, preferring whichever mirror is current. */
async function remoteManifest(): Promise<VersionManifest | null> {
  for (const base of [LIVE, RAW]) {
    const json = await fetchJson<VersionManifest>(`${base}/version.json`, 10000)
    if (json && typeof json.dataVersion === 'number') return json
  }
  return null
}

interface Release {
  tag_name: string
  html_url: string
  body: string | null
  published_at: string
  prerelease: boolean
}

/**
 * What, if anything, is newer than this install.
 *
 * Absent keys mean "you are current" — never "unknown but update anyway".
 */
export async function checkUpdates(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const info: UpdateInfo = { current, checkedAt: Date.now() }

  const [release, manifest] = await Promise.all([
    fetchJson<Release>(`${API}/repos/${OWNER}/${REPO}/releases/latest`, 12000, true),
    remoteManifest()
  ])

  if (release?.tag_name && !release.prerelease) {
    // Strictly newer only. An older tag — a cached response, a rollback, a
    // mis-tagged release — must never be presented as an upgrade.
    if (compareVersions(release.tag_name, current) > 0) {
      info.app = {
        latest: release.tag_name.replace(/^v/, ''),
        url: release.html_url,
        notes: (release.body || '').slice(0, 2000),
        publishedAt: release.published_at
      }
    }
  }

  if (manifest) {
    const localCatalog = localCatalogVersion()
    if (manifest.catalogVersion > localCatalog) {
      info.catalog = { current: localCatalog, latest: manifest.catalogVersion }
    }
    const localData = localDataVersion()
    if (manifest.dataVersion > localData) {
      info.data = { current: localData, latest: manifest.dataVersion }
    }
  }

  info.available = Boolean(info.app || info.catalog || info.data)
  return info
}

/** Whether the user has already waved this version away. */
export function isDismissed(latest: string): boolean {
  return settings.get().dismissedUpdate === latest
}

/** Remember a declined update so it stops being offered. */
export function dismissUpdate(latest: string | null): void {
  settings.update((d) => {
    d.dismissedUpdate = latest
  })
}
