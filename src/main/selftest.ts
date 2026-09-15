/**
 * Headless smoke test for SkillHub's core pipeline.
 *
 * It exercises exactly the same modules the Electron main process uses, so it is
 * a real end-to-end check of: GitHub auth → search → repo detail → skill
 * discovery → star growth → git clone (入库) → symlink/copy install into an
 * agent skills directory → uninstall → cleanup.
 *
 * Run with:  node out/main/selftest.js          (Node mode is fine)
 *            npm run selftest
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flushAll, installs, library, settings } from './core/db'
import { JsonStore } from './core/store'
import {
  activeToken,
  listSkillDirs,
  rateLimit,
  searchSkills,
  starsGained,
  tokenSource,
  viewer
} from './core/github'
import { curatedCatalog } from './core/catalog'
import { CATEGORY_LABELS, FN_LABELS, REPO_KIND_LABELS } from '../shared/types'
import { addRepo, libraryItems, removeItem } from './core/library'
import { installSkills, installedSkills, uninstall } from './core/installer'
import { buildRemoteSkills } from './core/skills'
import { userDataDir } from './core/paths'
import { leaderboard } from './core/leaderboard'

const results: { name: string; ok: boolean; detail: string }[] = []

function check(name: string, ok: boolean, detail = ''): boolean {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function section(title: string): void {
  console.log(`\n▌ ${title}`)
}

async function main(): Promise<number> {
  console.log('SkillHub self-test\n==================')

  section('GitHub credentials')
  const rate = await rateLimit(true)
  check('API reachable', rate.ok, rate.ok ? `${rate.remaining}/${rate.limit} remaining` : rate.error)
  check('credential found', tokenSource() !== 'none', `source=${tokenSource()}, token=${activeToken() ? 'present' : 'absent'}`)
  // Network calls are occasionally flaky; one retry separates a real regression
  // from a transient socket error.
  let viewerOk = false
  let viewerDetail = ''
  for (let attempt = 0; attempt < 2 && !viewerOk; attempt++) {
    try {
      const me = await viewer()
      viewerOk = !!me.login
      viewerDetail = `@${me.login}`
    } catch (err: any) {
      viewerDetail = err?.message || String(err)
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200))
    }
  }
  check('authenticated viewer lookup', viewerOk, viewerDetail)

  /*
    The GUI and the CLI share ~/.skillhub/state on purpose, so two processes hold
    the same document. Without a read-before-write, whichever flushed last would
    silently erase the other's change. This reproduces that interleaving: write
    from "another process", then mutate through the store, and check the other
    process's change survived.
  */
  section('State store: two writers do not clobber each other')
  {
    const probe = new JsonStore<{ items: string[] }>('__selftest_concurrent', { items: [] })
    probe.update((d) => {
      d.items = ['from-app']
    })
    probe.flush()

    // Stand in for the CLI: a separate writer changes the file underneath us.
    const other = new JsonStore<{ items: string[] }>('__selftest_concurrent', { items: [] })
    other.update((d) => {
      d.items = [...d.items, 'from-cli']
    })
    other.flush()

    probe.update((d) => {
      d.items = [...d.items, 'from-app-again']
    })
    probe.flush()

    const final = JSON.parse(readFileSync(join(userDataDir(), '__selftest_concurrent.json'), 'utf8'))
    check('adopts another process\'s write instead of overwriting it', final.items.includes('from-cli'), final.items.join(' → '))
    check('keeps its own writes too', final.items.includes('from-app-again'), `${final.items.length} entries`)
    try {
      rmSync(join(userDataDir(), '__selftest_concurrent.json'), { force: true })
    } catch {
      /* best effort */
    }
  }

  section('Curated catalog (bundled)')
  const catalog = await curatedCatalog()
  check('catalog loaded', catalog.length > 0, `${catalog.length} repos`)
  // The store card leads with `taglineZh`; `descriptionZh` is the older long
  // field that only the original entries carry.
  const tagged = catalog.map((r) => ({ repo: r, tag: r.taglineZh ?? '' }))
  const withZh = tagged.filter((t) => t.tag).length
  const withEn = catalog.filter((r) => r.taglineEn).length
  const withUseWhen = catalog.filter((r) => r.useWhen && r.useWhenEn).length
  check('every repo has a Chinese tagline', withZh === catalog.length, `${withZh}/${catalog.length}`)
  check('every repo has an English tagline', withEn === catalog.length, `${withEn}/${catalog.length}`)
  check('every repo has a bilingual use-case', withUseWhen === catalog.length, `${withUseWhen}/${catalog.length}`)
  const lens = tagged.map((t) => [...t.tag].length).sort((a, b) => a - b)
  const median = lens[lens.length >> 1]
  check(
    'taglines obey the 13–32 character budget',
    lens[0] >= 13 && lens[lens.length - 1] <= 32,
    `min ${lens[0]} · median ${median} · max ${lens[lens.length - 1]}`
  )
  const badOpeners = tagged.filter((t) => /^(为|面向|一个|这是一个)/.test(t.tag))
  check('no tagline opens with 为/面向/一个', badOpeners.length === 0, `${badOpeners.length} offenders`)

  // The long-form blurb shown on the detail page. Both languages are required
  // at the moment a repo is added to the catalog — there is no runtime
  // translation fallback any more, so a gap here is a visible empty section.
  const about = catalog.map((r) => ({ repo: r, zh: r.aboutZh ?? '' }))
  const withAboutZh = about.filter((a) => a.zh.trim().length >= 25)
  const aboutZhMissing = about.filter((a) => a.zh.trim().length < 25).map((a) => a.repo.fullName)
  const withAboutEn = catalog.filter((r) => (r.descriptionEn ?? '').trim().length >= 25)
  // Name the offenders — "99/101" alone gives nobody anything to act on.
  const aboutEnMissing = catalog
    .filter((r) => (r.descriptionEn ?? '').trim().length < 25)
    .map((r) => `${r.fullName} (${(r.descriptionEn ?? '').length})`)
  check(
    'every repo has a Chinese long description',
    withAboutZh.length === catalog.length,
    `${withAboutZh.length}/${catalog.length}${aboutZhMissing.length ? ' — ' + aboutZhMissing.join(', ') : ''}`
  )
  check(
    'every repo has an English long description',
    withAboutEn.length === catalog.length,
    `${withAboutEn.length}/${catalog.length}${aboutEnMissing.length ? ' — ' + aboutEnMissing.join(', ') : ''}`
  )
  const shortAbout = about.filter((a) => a.zh && a.zh.trim().length < 25)
  check('no Chinese description is a stub', shortAbout.length === 0, `${shortAbout.length} too short`)
  // A description copied from the tagline means nobody actually wrote it.
  const lazyAbout = about.filter((a) => a.zh && a.zh.trim() === (a.repo.taglineZh ?? '').trim())
  check('no Chinese description just repeats the tagline', lazyAbout.length === 0, `${lazyAbout.length} offenders`)
  /*
    Every value the data uses must exist in the label tables.
    `CATEGORY_LABELS[x].zh` on an unknown category threw, and because the
    leaderboard renders it without a guard the whole window went blank — a data
    mistake in one catalog entry took down the entire UI. Checking the data here
    is what stops that class of failure, not another try/catch at the call site.
  */
  const badCategories = catalog.filter((r) => r.category && !(r.category in CATEGORY_LABELS))
  check(
    'every category in the catalog has a label',
    badCategories.length === 0,
    badCategories.length
      ? [...new Set(badCategories.map((r) => `${r.category} (${r.fullName})`))].join(', ')
      : `${new Set(catalog.map((r) => r.category)).size} distinct`
  )
  const badFn = catalog.filter((r) => r.fn && !(r.fn in FN_LABELS))
  check(
    'every functional category in the catalog has a label',
    badFn.length === 0,
    badFn.length ? [...new Set(badFn.map((r) => r.fn))].join(', ') : 'ok'
  )
  const badKind = catalog.filter((r) => r.repoKind && !(r.repoKind in REPO_KIND_LABELS))
  check(
    'every repo kind in the catalog has a label',
    badKind.length === 0,
    badKind.length ? [...new Set(badKind.map((r) => r.repoKind))].join(', ') : 'ok'
  )

  const withSkills = catalog.filter((r) => (r.skillDirs || []).length > 0)
  check('repos with SKILL.md dirs', withSkills.length > 0, `${withSkills.length}/${catalog.length}`)

  section('Live search')
  const sres = await searchSkills('claude skills', { perPage: 12 })
  check('search returned results', sres.repos.length > 0, `${sres.repos.length} repos, ${sres.elapsedMs}ms`)
  check('search results have stars', sres.repos.every((r) => typeof r.stars === 'number'))

  section('Repo detail + skill tree')
  const target = withSkills.find((r) => (r.skillDirs || []).length > 0 && r.stars > 0)!
  console.log(`      using ${target.fullName} (${target.stars}★)`)
  const tree = await listSkillDirs(target.fullName, target.defaultBranch)
  check('skill tree readable', tree.dirs.length > 0, `${tree.dirs.length} dirs, truncated=${tree.truncated}`)
  const remoteSkills = buildRemoteSkills(target.fullName, tree.dirs, { stars: target.stars })
  check('remote skill entries built', remoteSkills.length === tree.dirs.length)

  section('Star growth (multi-source)')
  const growth = await starsGained(target.fullName, target.stars, 7)
  check('growth resolved', growth.source !== 'unavailable', `+${growth.gained} via ${growth.source}${growth.approx ? ' (approx)' : ''}`)

  section('Leaderboard')
  const boardStart = Date.now()
  const board = await leaderboard({ days: 7, limit: 15, useApi: true, apiBudget: 40 })
  const boardMs = Date.now() - boardStart
  check('leaderboard computed', board.length > 0, `${board.length} rows in ${boardMs}ms`)
  const sources = board.reduce<Record<string, number>>((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1
    return acc
  }, {})
  check('every row carries a real source', !board.some((r) => r.source === 'unavailable'), JSON.stringify(sources))
  check('no rows silently reported as zero', board.every((r) => r.gained > 0), `${board.filter((r) => r.gained > 0).length}/${board.length} positive`)
  console.log(
    '      top 3: ' +
      board
        .slice(0, 3)
        .map((r) => `${r.name} +${r.gained}${r.approx ? '(≥)' : ''} [${r.source}]`)
        .join(', ')
  )

  section('入库 (git clone → skill discovery)')
  const item = await addRepo(target.fullName)
  check('library item ready', item.status === 'ready', item.status === 'ready' ? `${item.skills.length} skills at ${item.sourcePath}` : item.error || '')
  check('checkout on disk', existsSync(join(item.sourcePath, '.git')), item.sourcePath)
  const realSkills = item.skills.filter((s) => s.localPath && existsSync(join(s.localPath, 'SKILL.md')))
  check('SKILL.md files present locally', realSkills.length > 0, `${realSkills.length} skills`)

  section('Install into an agent directory (symlink)')
  const fakeAgentDir = mkdtempSync(join(tmpdir(), 'skillhub-agent-'))
  const customId = 'selftest'
  settings.update((d) => {
    d.customAgents = d.customAgents.filter((c) => c.id !== customId)
    d.customAgents.push({ id: customId, name: 'Self-test Agent', path: fakeAgentDir })
  })
  const agentId = `custom:${customId}`
  const pick = item.skills.slice(0, Math.min(3, item.skills.length))
  const outcome = installSkills(
    { skillIds: pick.map((s) => s.id), agentIds: [agentId], mode: 'symlink' },
    (p) => {
      if (p.message && p.phase === 'link') console.log(`      ${p.message}`)
    }
  )
  check('install succeeded', outcome.ok.length === pick.length, `${outcome.ok.length} ok, ${outcome.skipped.length} skipped, ${outcome.errors.length} errors`)
  if (outcome.errors.length) check('no install errors', false, JSON.stringify(outcome.errors[0]))

  const placed = readdirSync(fakeAgentDir)
  check('skills appear in agent dir', placed.length === pick.length, placed.join(', '))
  const first = placed[0]
  if (first) {
    const full = join(fakeAgentDir, first)
    check('installed entry is a symlink', lstatSync(full).isSymbolicLink(), full)
    check('installed entry has SKILL.md', existsSync(join(full, 'SKILL.md')))
    const body = readFileSync(join(full, 'SKILL.md'), 'utf8')
    check('SKILL.md is readable through the link', body.length > 0, `${body.length} bytes`)
  }
  check('install records tracked', installedSkills().length >= pick.length, `${installedSkills().length} records`)

  section('Copy mode')
  const outcome2 = installSkills(
    { skillIds: [pick[0].id], agentIds: [agentId], mode: 'copy' }
  )
  check('copy install succeeded', outcome2.ok.length === 1, outcome2.errors[0]?.reason || '')
  const copied = join(fakeAgentDir, outcome2.ok[0] ? outcome2.ok[0].linkPath.split('/').pop()! : '')
  check('copy is a real directory', existsSync(copied) && !lstatSync(copied).isSymbolicLink())
  check('copy carries marker file', existsSync(join(copied, '.skillhub-install.json')))

  section('Uninstall + cleanup')
  /*
    Remove only what this run created.

    This loop used to walk every install record and uninstall all of them, so
    running the suite with a populated library uninstalled the user's real
    skills — 201 of them, from three agents. The state is isolated now, but the
    loop still names its own records: a cleanup step should never be able to
    delete something it did not create.
  */
  let removed = 0
  const ownRecords = new Set([...outcome.ok, ...outcome2.ok].map((r) => `${r.skillId}@${r.agentId}`))
  for (const rec of installedSkills()) {
    if (!ownRecords.has(`${rec.skillId}@${rec.agentId}`)) continue
    if (uninstall(rec.skillId, rec.agentId)) removed++
  }
  check('uninstalls completed', removed > 0, `${removed} removed`)
  check('agent dir emptied', readdirSync(fakeAgentDir).filter((n) => !n.startsWith('.')).length === 0)
  removeItem(target.fullName, true)
  check('library item removed', !libraryItems().some((i) => i.id === target.fullName))
  check('checkout deleted', !existsSync(item.sourcePath))
  settings.update((d) => {
    d.customAgents = d.customAgents.filter((c) => c.id !== customId)
  })
  try {
    rmSync(fakeAgentDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  installs.flush()
  library.flush()
  settings.flush()
  flushAll()

  const failed = results.filter((r) => !r.ok)
  console.log('\n==================')
  console.log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILED:')
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`)
    return 1
  }
  console.log('ALL GREEN')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('\nself-test crashed:', err)
    process.exit(2)
  })
