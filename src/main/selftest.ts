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
import { homedir } from 'node:os'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
import { applyFetchedCatalog, curatedCatalog, localCatalogVersion } from './core/catalog'
import { CATEGORY_LABELS, FN_LABELS, REPO_KIND_LABELS } from '../shared/types'
import { addRepo, libraryItems, removeItem } from './core/library'
import { entryOwner, installFromGithub, installedSkills, uninstall, uninstallFrom } from './core/installer'
import { loadRegistry, resolveAgentDirs } from './core/agents'
import { curatedCatalogPath, fetchedCatalogPath } from './core/paths'
import { agentsWithoutDestination, installDestinations, recommendInstallTarget } from './core/discover'
import { compareVersions, dateToVersion } from './core/update'
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

  /*
    The destination picker's pre-selection depends on this shape.

    `AgentTarget.path` is a display path that may start with `~`, while the
    configured location is absolute. The dialog compares what it is given
    against the agent rows, so a candidate with no absolute path — or one that
    does not name its agent — silently matches nothing: the dialog opens with the
    right folder in the footer and no row ticked.
  */
  section('Install target advice (what the picker matches on)')
  const advice = await recommendInstallTarget()
  check('a target is recommended', !!advice.absPath, `${advice.path} (${advice.reason})`)
  check('the recommended path is absolute', advice.absPath.startsWith('/'), advice.absPath)
  check('every candidate is absolute', advice.candidates.length > 0 && advice.candidates.every((c) => c.absPath.startsWith('/')), `${advice.candidates.length} candidates`)
  check(
    'every candidate names the agent it belongs to',
    advice.candidates.every((c) => !!c.agentId),
    advice.candidates.filter((c) => !c.agentId).map((c) => c.path).join(', ')
  )
  check(
    'the recommendation is one of the candidates',
    advice.candidates.some((c) => c.absPath === advice.absPath),
    // Only on failure, and only the fact: 68 absolute paths is not a detail.
    advice.candidates.some((c) => c.absPath === advice.absPath)
      ? ''
      : `${advice.absPath} not among ${advice.candidates.length} candidates`
  )

  /*
    Where a one-click install writes, and the two ways that used to go wrong.

    Writing into every enabled agent is wrong in the common case — people use one
    agent — so the choice is explicit and remembered. And an agent whose skills
    directory cannot be resolved used to vanish from the list while the install
    still reported success, which is the "找不到目标文件夹" report: the user is
    told it worked and one agent received nothing.
  */
  section('Install destinations follow the chosen agent')
  const customDir = mkdtempSync(join(tmpdir(), 'skillhub-dest-'))
  // Its own source, so this section does not depend on one defined further
  // down the file — a test that only passes in one ordering is a trap.
  const destSrc = mkdtempSync(join(tmpdir(), 'skillhub-destsrc-'))
  writeFileSync(join(destSrc, 'SKILL.md'), '---\nname: mkdir-probe\ndescription: probe\n---\n\n# Body\n')
  settings.update((d) => {
    d.customAgents = [
      { id: 'selftest-a', name: 'Dest Agent A', path: join(customDir, 'a') },
      { id: 'selftest-b', name: 'Dest Agent B', path: join(customDir, 'b') }
    ]
    d.enabledAgents = ['custom:selftest-a', 'custom:selftest-b']
    d.installAgents = undefined
  })
  check('unanswered: every enabled agent is offered, so the question can be asked', installDestinations().length === 2, `${installDestinations().length}`)

  settings.update((d) => {
    d.installAgents = ['custom:selftest-b']
  })
  const narrowed = installDestinations()
  check('answered: only the chosen agent', narrowed.length === 1 && narrowed[0].agentId === 'custom:selftest-b', JSON.stringify(narrowed.map((d) => d.agentId)))
  check('and it is the agent the user named', narrowed[0].agentName === 'Dest Agent B', narrowed[0].agentName)

  // A directory that does not exist yet is created, not refused.
  check('the directory does not exist yet', !existsSync(join(customDir, 'b')))
  const into = await installFromGithub({
    skills: [{ skillId: 'a/b::mkdir-probe', fullName: 'a/b', path: '', name: 'mkdir-probe', localPath: destSrc }],
    destinations: narrowed.map((d) => d.path)
  })
  check('a missing skills directory is created rather than refused', into.ok.length === 1 && existsSync(join(customDir, 'b', 'mkdir-probe', 'SKILL.md')), JSON.stringify(into.errors.map((e) => e.reason)))
  check('and the agent that was not chosen stays empty', !existsSync(join(customDir, 'a')))

  // An agent with no resolvable directory must be reported, not silently dropped.
  settings.update((d) => {
    d.customAgents = [{ id: 'selftest-nowhere', name: 'Nowhere Agent', path: '' }]
    d.enabledAgents = ['custom:selftest-nowhere']
    d.installAgents = ['custom:selftest-nowhere']
  })
  /*
    An agent with more than one user-level directory.

    DeepSeek Harness is the case: the CLI keeps `~/.dsh/skills` while the desktop
    app sets its own `DSH_HOME` and reads `.../dsh-desktop/harness/skills`. They
    do not read each other. Recording only the CLI's path meant an install
    reported success into a directory the client never opens — the skill was
    invisible, with no error anywhere to explain it.
  */
  check(
    'an agent with nowhere to install is reported instead of vanishing',
    installDestinations().length === 0 && agentsWithoutDestination().some((a) => a.agentName === 'Nowhere Agent'),
    JSON.stringify({ unmet: agentsWithoutDestination(), dests: installDestinations() })
  )

  section('An agent can read more than one directory')
  const dshDirs = resolveAgentDirs('dsh')
  check('dsh lists every directory it reads', dshDirs.length >= 2, dshDirs.map((d) => d.replace(homedir(), '~')).join(', '))
  check(
    'and the desktop harness root is among them',
    dshDirs.some((d) => d.includes('dsh-desktop/harness/skills')),
    dshDirs.map((d) => d.replace(homedir(), '~')).join(', ')
  )
  check(
    'picking dsh reaches all of its directories, not just the first',
    (() => {
      settings.update((d) => {
        d.enabledAgents = ['dsh']
        d.installAgents = ['dsh']
      })
      const got = installDestinations().filter((d) => d.agentId === 'dsh')
      return got.length >= 2 && got.every((g) => g.agentName === 'DeepSeek Harness')
    })(),
    'one agent id, every directory'
  )

  settings.update((d) => {
    d.customAgents = []
    d.enabledAgents = []
    d.installAgents = undefined
  })
  rmSync(customDir, { recursive: true, force: true })
  rmSync(destSrc, { recursive: true, force: true })

  /*
    The published catalog, and the rule that keeps it from going backwards.

    `version.json` reports the repository's catalog version. Before this, the
    app could see that a newer catalog existed and had no way to apply it — every
    installed copy reported "目录有更新" and the only button on offer refreshed
    star counts, so the notice could never be satisfied. The two sides are one
    file now, and these are the properties that make the comparison meaningful.
  */
  section('Published catalog (never goes backwards)')
  const bundledRaw = JSON.parse(readFileSync(curatedCatalogPath(), 'utf8'))
  const bundledVersion = Number(bundledRaw.version || 0)
  check('the bundled catalog carries a version', bundledVersion > 0, String(bundledVersion))
  check('version reports the catalog in use', localCatalogVersion() === bundledVersion, String(localCatalogVersion()))

  const newer = JSON.stringify({ ...bundledRaw, version: bundledVersion + 1 })
  const applied = applyFetchedCatalog(newer)
  check('a newer published catalog is adopted', applied.ok && !applied.stale && applied.version === bundledVersion + 1, JSON.stringify(applied))
  check('and version now reports it', localCatalogVersion() === bundledVersion + 1, String(localCatalogVersion()))

  /*
    The stale direction is the one that matters. jsDelivr caches a branch ref for
    up to twelve hours, so a mirror can serve yesterday's file after the mirror
    beside it has today's; adopting it would walk the user's catalog backwards.
  */
  const older = JSON.stringify({ ...bundledRaw, version: bundledVersion - 1 })
  const rejected = applyFetchedCatalog(older)
  check('an older published catalog is refused', rejected.ok && rejected.stale, JSON.stringify(rejected))
  check('and the newer one stays in place', localCatalogVersion() === bundledVersion + 1, String(localCatalogVersion()))

  const same = applyFetchedCatalog(newer)
  check('an equal catalog is a no-op, not a rewrite', same.stale, JSON.stringify(same))

  // Shape validation: a truncated or partial download must not empty the store.
  for (const [label, body] of [
    ['not JSON', '{ "repos": ['],
    ['no repos key', JSON.stringify({ version: bundledVersion + 99 })],
    ['empty repo list', JSON.stringify({ version: bundledVersion + 99, repos: [] })],
    ['no version', JSON.stringify({ ...bundledRaw, version: undefined })]
  ] as const) {
    const bad = applyFetchedCatalog(body)
    check(`a malformed catalog is refused (${label})`, !bad.ok && localCatalogVersion() === bundledVersion + 1, JSON.stringify(bad))
  }

  // Put the machine back on the bundled catalog: the rest of the suite should
  // not run against a file this section invented.
  rmSync(fetchedCatalogPath(), { force: true })
  check('falls back to the bundled catalog when the fetched copy is gone', localCatalogVersion() === bundledVersion, String(localCatalogVersion()))

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

  section('入库 (index the repository, no clone)')
  const item = await addRepo(target.fullName)
  check('library item ready', item.status === 'ready', item.status === 'ready' ? `${item.skills.length} skills` : item.error || '')
  /*
    The point of the refactor: indexing a repository must not put anything on
    disk. A clone here was 575MB across nine repositories and the app never
    needed any of it — every install reads from GitHub anyway.
  */
  check('nothing was cloned', !item.sourcePath, item.sourcePath || '(no checkout)')
  check('skills were listed', item.skills.length > 0, `${item.skills.length} skills`)
  check(
    'listed skills come from the repository, not from disk',
    item.skills.every((s) => !s.localPath),
    item.skills[0]?.id
  )

  section('Install from a source folder into an agent directory')
  const fakeAgentDir = mkdtempSync(join(tmpdir(), 'skillhub-agent-'))
  const customId = 'selftest'
  settings.update((d) => {
    d.customAgents = d.customAgents.filter((c) => c.id !== customId)
    d.customAgents.push({ id: customId, name: 'Self-test Agent', path: fakeAgentDir })
  })
  const agentId = `custom:${customId}`

  // A local source stands in for a freshly fetched skill: the placement code
  // downstream is the same either way.
  const srcRoot = mkdtempSync(join(tmpdir(), 'skillhub-src-'))
  const srcA = join(srcRoot, 'alpha')
  const srcB = join(srcRoot, 'beta')
  mkdirSync(srcA, { recursive: true })
  mkdirSync(srcB, { recursive: true })
  writeFileSync(join(srcA, 'SKILL.md'), '# alpha\n')
  writeFileSync(join(srcB, 'SKILL.md'), '# beta\n')

  const upstream = (name: string, dir: string, fullName = 'owner/repo') => ({
    skillId: `${fullName}::${name}`,
    fullName,
    path: name,
    name,
    localPath: dir
  })

  const outcome = await installFromGithub({
    skills: [upstream('alpha', srcA), upstream('beta', srcB)],
    destinations: [fakeAgentDir],
    onProgress: (p) => {
      if (p.message && p.phase === 'link') console.log(`      ${p.message}`)
    }
  })
  check('install succeeded', outcome.ok.length === 2, `${outcome.ok.length} ok, ${outcome.skipped.length} skipped, ${outcome.errors.length} errors`)
  if (outcome.errors.length) check('no install errors', false, JSON.stringify(outcome.errors[0]))

  const placed = readdirSync(fakeAgentDir).filter((n) => !n.startsWith('.'))
  check('skills appear in agent dir', placed.length === 2, placed.join(', '))
  check(
    'installed entries are real directories',
    placed.every((n) => !lstatSync(join(fakeAgentDir, n)).isSymbolicLink())
  )
  check('installed entry has SKILL.md', existsSync(join(fakeAgentDir, 'alpha', 'SKILL.md')))
  check('copy carries marker file', existsSync(join(fakeAgentDir, 'alpha', '.skillhub-install.json')))
  check('install records tracked', installedSkills().length >= 2, `${installedSkills().length} records`)

  /*
    Two different skills can want the same folder name.

    Measured on the real index: 12 skill names exist in more than one repository
    (`canvas-design`, `brand-guidelines`, …). The second install must never take
    over the first one's folder — the first skill's files would disappear while
    its record still claimed to be installed.
  */
  section('Two skills, one folder name')
  const collide = await installFromGithub({
    skills: [upstream('alpha', srcB, 'ownerB/two')],
    destinations: [fakeAgentDir]
  })
  check(
    'the second skill is installed beside the first, not over it',
    collide.ok.length === 1 && collide.ok[0].linkPath.endsWith('alpha-ownerB'),
    collide.ok[0]?.linkPath.split('/').pop() || collide.skipped[0]?.reason || ''
  )
  /*
    Both entries exist and each holds its own skill.

    Compared on the body, not the whole file: these sources are bare `# alpha`
    with no frontmatter, and the installer now adds one so the skill is actually
    discoverable. Byte equality would be asserting the absence of that repair.
  */
  const alphaBody = readFileSync(join(fakeAgentDir, 'alpha', 'SKILL.md'), 'utf8')
  const betaBody = readFileSync(join(fakeAgentDir, 'alpha-ownerB', 'SKILL.md'), 'utf8')
  check(
    'and both are readable at once',
    alphaBody.includes('# alpha') && !alphaBody.includes('# beta') &&
      betaBody.includes('# beta') && !betaBody.includes('# alpha'),
    `${alphaBody.trim().split('\n').pop()} | ${betaBody.trim().split('\n').pop()}`
  )
  check(
    'each carries its own record, so uninstalling one leaves the other',
    installedSkills().filter((r) => r.agentId === agentId).length === 3,
    `${installedSkills().filter((r) => r.agentId === agentId).length} records`
  )
  /*
    The user's own folder is the other half of the same rule: land beside it,
    never in it. Refusing outright would make a skill whose name the user has
    already used impossible to install anywhere in that directory.
  */
  const mineDir = join(fakeAgentDir, 'mine')
  mkdirSync(mineDir, { recursive: true })
  writeFileSync(join(mineDir, 'SKILL.md'), '# mine, not yours\n')
  const onTop = await installFromGithub({
    skills: [upstream('mine', srcA, 'ownerC/three')],
    destinations: [fakeAgentDir]
  })
  check(
    "a skill never lands in the user's own folder",
    readFileSync(join(mineDir, 'SKILL.md'), 'utf8') === '# mine, not yours\n',
    readFileSync(join(mineDir, 'SKILL.md'), 'utf8').trim()
  )
  check(
    'it lands beside it instead',
    onTop.ok.length === 1 && onTop.ok[0].linkPath.endsWith('mine-ownerC'),
    onTop.ok[0]?.linkPath.split('/').pop() || onTop.skipped[0]?.reason || ''
  )
  check(
    "another skill's entry is not claimable as ours",
    entryOwner(join(fakeAgentDir, 'alpha'), { skillId: 'ownerB/two::alpha', sourcePath: srcB }) === 'other'
  )
  check(
    'the same skill is recognised as ours',
    entryOwner(join(fakeAgentDir, 'alpha'), { skillId: 'owner/repo::alpha', sourcePath: srcA }) === 'ours'
  )

  /*
    Discovery, which is not the same thing as installation.

    An agent finds a skill by scanning a skills directory for `<name>/SKILL.md`
    with frontmatter carrying `name` and `description`. A file that fails that is
    dropped **silently**: the folder sits there looking installed while the agent
    never sees it. Measured on this machine, `~/.dsh/skills/browser-act/SKILL.md`
    is CRLF and never appears in the harness catalog, while the LF
    `code-review` beside it does.
  */
  section('Installed skills are discoverable, not just present')

  const crlfDir = mkdtempSync(join(tmpdir(), 'skillhub-crlf-'))
  writeFileSync(
    join(crlfDir, 'SKILL.md'),
    '---\r\nname: crlf-skill\r\ndescription: written on Windows\r\n---\r\n\r\n# Body\r\n'
  )
  const bareDir = mkdtempSync(join(tmpdir(), 'skillhub-bare-'))
  writeFileSync(join(bareDir, 'SKILL.md'), '# No frontmatter at all\n\nInstructions.\n')
  const nodescDir = mkdtempSync(join(tmpdir(), 'skillhub-nodesc-'))
  writeFileSync(join(nodescDir, 'SKILL.md'), '---\nname: nodesc\n---\n\n# Body\n')

  const discoverOne = join(tmpdir(), `skillhub-discover-${Date.now()}`)
  const second = join(tmpdir(), `skillhub-discover2-${Date.now()}`)
  const repaired = await installFromGithub({
    skills: [
      { skillId: 'a/b::crlf-skill', fullName: 'a/b', path: '', name: 'crlf-skill', localPath: crlfDir },
      {
        skillId: 'a/b::bare-skill',
        fullName: 'a/b',
        path: '',
        name: 'bare-skill',
        localPath: bareDir,
        description: 'Index description'
      },
      { skillId: 'a/b::nodesc', fullName: 'a/b', path: '', name: 'nodesc', localPath: nodescDir, description: 'Fallback' }
    ],
    // Two destinations, one of which is the same directory written differently:
    // deduping by resolved path is what stops a double placement.
    destinations: [discoverOne, second]
  })
  check('installed into both destinations', repaired.ok.length === 6, `${repaired.ok.length} placements`)
  check(
    'a shared destination is placed once, not once per alias',
    (await installFromGithub({
      skills: [{ skillId: 'a/b::crlf-skill', fullName: 'a/b', path: '', name: 'crlf-skill', localPath: crlfDir }],
      destinations: [join(tmpdir(), 'skillhub-alias'), join(tmpdir(), 'skillhub-alias')]
    })).ok.length === 1,
    'alias dedupe'
  )

  const read = (dir: string, name: string): string => readFileSync(join(dir, name, 'SKILL.md'), 'utf8')

  const crlfOut = read(discoverOne, 'crlf-skill')
  check('CRLF line endings are converted', !crlfOut.includes('\r'), JSON.stringify(crlfOut.slice(0, 24)))
  check('the converted file keeps its frontmatter', /^---\nname: crlf-skill\ndescription: written on Windows\n---\n/.test(crlfOut), crlfOut.slice(0, 60))

  const bareOut = read(discoverOne, 'bare-skill')
  check(
    'a file with no frontmatter gets one, with the name and description we know',
    /^---\nname: "bare-skill"\ndescription: "Index description"\n---\n/.test(bareOut),
    bareOut.slice(0, 70)
  )
  check('and keeps the body intact', bareOut.includes('# No frontmatter at all') && bareOut.includes('Instructions.'))

  const nodescOut = read(discoverOne, 'nodesc')
  check(
    'a missing description is added without disturbing the existing name',
    /name: nodesc\ndescription: "Fallback"/.test(nodescOut),
    nodescOut.slice(0, 60)
  )
  check('every repaired file has both keys', [crlfOut, bareOut, nodescOut].every((t) => /^---\n[\s\S]*?\bname:/.test(t) && /\bdescription:/.test(t)))

  for (const d of [crlfDir, bareDir, nodescDir, discoverOne, second]) rmSync(d, { recursive: true, force: true })

  /*
    Agents that share one physical directory.

    Eight registry entries read ~/.agents/skills, so one install can back several
    agents. Removing it for one agent removes it for all of them — that is
    entailed by the shared directory — but the sibling records used to be left
    behind claiming an install whose path no longer existed, and the caller was
    told that one agent had been affected.
  */
  section('One directory, several agents')
  const sharingId = 'selftest-sharing'
  settings.update((d) => {
    d.customAgents = d.customAgents.filter((c) => c.id !== sharingId)
    d.customAgents.push({ id: sharingId, name: 'Self-test Sharing Agent', path: fakeAgentDir })
  })
  const sharingAgentId = `custom:${sharingId}`
  const shared = outcome.ok.find((r) => r.skillName === 'alpha')!
  // The sibling record a second agent reading the same directory would have.
  installs.update((d) => {
    d.records.push({ ...shared, id: `${shared.skillId}@${sharingAgentId}`, agentId: sharingAgentId, agentName: 'Self-test Sharing Agent' })
  })
  const sharedRemoval = uninstallFrom(shared.skillId, sharingAgentId)
  check(
    'the removal reports every agent it affected',
    sharedRemoval.ok && sharedRemoval.agents.length === 2,
    sharedRemoval.agents.join(', ')
  )
  const orphaned = installs.get().records.filter((r) => r.linkPath === shared.linkPath)
  check('no record is left pointing at a removed entry', orphaned.length === 0, `${orphaned.length} left`)
  settings.update((d) => {
    d.customAgents = d.customAgents.filter((c) => c.id !== sharingId)
    d.enabledAgents = d.enabledAgents.filter((a) => a !== sharingAgentId)
  })

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
  const ownRecords = new Set(
    [...outcome.ok, ...collide.ok, ...onTop.ok].map((r) => `${r.skillId}@${r.agentId}`)
  )
  for (const rec of installedSkills()) {
    if (!ownRecords.has(`${rec.skillId}@${rec.agentId}`)) continue
    if (uninstall(rec.skillId, rec.agentId)) removed++
  }
  check('uninstalls completed', removed > 0, `${removed} removed`)
  // Every entry this run created is gone; the folder the test invented for the
  // user stays, because nothing we do should remove it.
  const leftBehind = readdirSync(fakeAgentDir).filter((n) => !n.startsWith('.') && n !== 'mine')
  check('agent dir emptied', leftBehind.length === 0, leftBehind.join(', '))
  check('the user’s own folder is still there', existsSync(join(fakeAgentDir, 'mine', 'SKILL.md')))
  removeItem(target.fullName, true)
  check('library item removed', !libraryItems().some((i) => i.id === target.fullName))
  check('nothing was ever written under the library', !existsSync(join(userDataDir(), 'library')))
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
