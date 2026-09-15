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
import { addRepo, libraryItems, removeItem } from './core/library'
import { installSkills, installedSkills, uninstall } from './core/installer'
import { buildRemoteSkills } from './core/skills'
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

  section('Curated catalog (bundled)')
  const catalog = await curatedCatalog()
  check('catalog loaded', catalog.length > 0, `${catalog.length} repos`)
  const withZh = catalog.filter((r) => r.descriptionZh).length
  check('bilingual descriptions', withZh === catalog.length, `${withZh}/${catalog.length} have 中文简介`)
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
  let removed = 0
  for (const rec of installedSkills()) {
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
