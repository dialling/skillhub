/**
 * SkillHub CLI — the same core as the desktop app, without the window.
 *
 *   node out/main/cli.js search "pdf"
 *   node out/main/cli.js add obra/superpowers
 *   node out/main/cli.js list
 *   node out/main/cli.js agents
 *   node out/main/cli.js install --all --agents dsh,cursor
 *   node out/main/cli.js install "obra/superpowers::skills/brainstorming" --agents dsh
 *   node out/main/cli.js uninstall "obra/superpowers::skills/brainstorming"
 *   node out/main/cli.js growth 7
 *   node out/main/cli.js doctor
 */
import { existsSync } from 'node:fs'
import { flushAll, installs, library, settings, stars } from './core/db'
import { listAgents, resolveAgentDir, scanAgentDir } from './core/agents'
import { gitAvailable } from './core/platform'
import { addRepo, libraryItems, removeItem, syncItem } from './core/library'
import { installFromGithub, installedSkills, uninstall } from './core/installer'
import { searchSkills, rateLimit, tokenSource, getRepo, starsGained } from './core/github'
import { leaderboard } from './core/leaderboard'
import { curatedCatalog } from './core/catalog'
import { expandPath, tildify } from './core/paths'
import { m } from './core/msg'

const argv = process.argv.slice(2)
const cmd = argv[0]

/**
 * `skillhub list | head -1` closes the pipe early, and the next write raises
 * EPIPE — which by default kills the process before the final flush runs, so
 * the work is silently lost. Swallow it and let the normal exit path persist.
 */
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})
process.on('SIGPIPE', () => {})

function flag(name: string): string | null {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  const idx = argv.indexOf(`--${name}`)
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1]
  return null
}
function has(name: string): boolean {
  // Must also recognise the `--flag=value` form. Checking only `--flag` meant
  // `--agents=x` was silently ignored and the command fell back to installing
  // into every enabled agent.
  return argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`))
}
/**
 * Positional arguments only.
 *
 * Skipping every `--flag` was not enough: the *value* of `--agents x,y` is a
 * bare word, so it was being collected as an extra positional — which made
 * `install <skill> --agents foo` try to install a skill literally named "foo".
 */
function positional(): string[] {
  const out: string[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      if (!a.includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) i++
      continue
    }
    out.push(a)
  }
  return out
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`
}

function helpText(): string {
  return `
${C.bold('SkillHub')} — ${m('cli.title')}

  ${C.cyan('search')} ${m('cli.arg.term')}              ${m('cli.help.search')}
  ${C.cyan('add')} <owner/repo>             ${m('cli.help.add')}
  ${C.cyan('list')} [--json]                ${m('cli.help.list')}
  ${C.cyan('sync')} <owner/repo>            ${m('cli.help.sync')}
  ${C.cyan('remove')} <owner/repo>          ${m('cli.help.remove')}
  ${C.cyan('agents')} [--json]              ${m('cli.help.agents')}
  ${C.cyan('install')} <skillId|--all>      ${m('cli.help.install')}
        --to <dir>            ${m('cli.help.toFlag')}
        --agents dsh,cursor   ${m('cli.help.agentsFlag')}
  ${C.cyan('uninstall')} <skillId>          ${m('cli.help.uninstall')}
  ${C.cyan('installed')}                    ${m('cli.help.installed')}
  ${C.cyan('growth')} [1|7|30]              ${m('cli.help.growth')}
  ${C.cyan('doctor')}                       ${m('cli.help.doctor')}

  ${C.dim(m('cli.help.example'))}
`
}

async function main(): Promise<number> {
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
      console.log(helpText())
      return 0

    case 'doctor': {
      const rate = await rateLimit(true)
      console.log(`${C.bold(m('cli.doctor.credentials'))}     ${tokenSource()} ${rate.ok ? C.green('✓') : C.red('✗')} ${rate.ok ? `${rate.remaining}/${rate.limit}` : rate.error}`)
      /*
        git is checked here because installing needs it and nothing else does.

        The library directory line it replaces named a folder the app no longer
        writes to — the library is an index — so `doctor` was reporting on
        something that could not be wrong.
      */
      console.log(
        `${C.bold(m('cli.doctor.git'))}            ${gitAvailable() ? C.green('✓') : C.red('✗')} ${gitAvailable() ? '' : m('cli.doctor.gitMissing')}`
      )
      const catalog = await curatedCatalog()
      console.log(`${C.bold(m('cli.doctor.catalog'))} ${catalog.length} ${catalog.length ? C.green('✓') : C.yellow(m('cli.doctor.catalogMissing'))}`)
      const agents = listAgents()
      console.log(`${C.bold(m('cli.doctor.agents'))}   ${m('cli.doctor.detected', { n: agents.filter((a) => a.detected).length, total: agents.length })}`)
      for (const a of agents.filter((x) => x.detected)) console.log(`           ${a.name} → ${tildify(expandPath(a.path))}`)
      console.log(`${C.bold(m('cli.doctor.library'))}       ${m('cli.doctor.libraryLine', { repos: libraryItems().length, installs: installedSkills().length })}`)
      return 0
    }

    case 'search': {
      const term = positional().join(' ')
      if (!term) return fail(m('cli.usage.search'))
      const res = await searchSkills(term, { perPage: 20 })
      console.log(`${C.dim(m('cli.searchResults', { n: res.repos.length, ms: res.elapsedMs }))}\n`)
      for (const r of res.repos) {
        console.log(`${C.bold(r.fullName.padEnd(48))} ${C.yellow(String(r.stars).padStart(7))}★  ${C.dim(r.descriptionZh || r.descriptionEn || '')}`)
      }
      return 0
    }

    case 'add': {
      const target = positional()[0]
      if (!target) return fail(m('cli.usage.add'))
      console.log(m('cli.adding', { target }))
      const item = await addRepo(target)
      if (item.status !== 'ready') return fail(item.error || m('cli.addFailed'))
      console.log(`${C.green('✓')} ${item.fullName} → ${tildify(item.sourcePath)}`)
      for (const s of item.skills) console.log(`   ${C.cyan(s.id)}  ${C.dim(s.descriptionEn?.slice(0, 70) || '')}`)
      return 0
    }

    case 'list': {
      const items = libraryItems()
      if (has('json')) {
        console.log(JSON.stringify(items, null, 2))
        return 0
      }
      if (!items.length) {
        console.log(C.dim(m('cli.libraryEmpty')))
        return 0
      }
      const map: Record<string, string[]> = {}
      // The same existence test the renderer's installMap applies: a record
      // whose entry is gone is not an install — `skillhub installed` already
      // prints that one as ✗.
      for (const r of installs.get().records) {
        if (!existsSync(r.linkPath)) continue
        ;(map[r.skillId] ||= []).push(r.agentName)
      }
      for (const item of items) {
        console.log(`${C.bold(item.fullName)} ${C.dim(m('cli.itemLine', { n: item.skills.length, status: item.status }))}`)
        for (const s of item.skills) {
          const where = map[s.id]
          console.log(`   ${where ? C.green('●') : C.dim('○')} ${s.name.padEnd(34)} ${C.dim(s.path)} ${where ? C.green(`→ ${where.join(', ')}`) : ''}`)
        }
      }
      return 0
    }

    case 'sync': {
      const target = positional()[0]
      if (!target) return fail(m('cli.usage.sync'))
      const item = await syncItem(target)
      console.log(`${C.green('✓')} ${m('cli.synced', { name: item.fullName, n: item.skills.length })}`)
      return 0
    }

    case 'remove': {
      const target = positional()[0]
      if (!target) return fail(m('cli.usage.remove'))
      const res = removeItem(target, true)
      console.log(`${C.green('✓')} ${m('cli.removed', { n: res.removedInstalls })}`)
      return 0
    }

    case 'agents': {
      const agents = listAgents()
      if (has('json')) {
        console.log(JSON.stringify(agents, null, 2))
        return 0
      }
      for (const a of agents) {
        const mark = a.detected ? C.green('✓') : C.dim('·')
        const on = a.enabled ? C.green('enabled ') : C.dim('disabled')
        console.log(`${mark} ${on} ${C.bold(a.name.padEnd(28))} ${C.dim(tildify(expandPath(a.path)))} ${a.found ? C.cyan(`(${a.found})`) : ''}`)
      }
      return 0
    }

    case 'install': {
      /*
        Installing is a fetch, not a copy from a local checkout.

        The library only holds an index now, so this has to name a destination
        and pull the files. `--to` is the explicit form; without it we use the
        first enabled agent's own skills directory, which is the same default
        the app's picker offers first.
      */
      let skillIds: string[] = []
      if (has('all')) {
        skillIds = libraryItems().flatMap((i) => i.skills.map((s) => s.id))
      } else {
        skillIds = positional()
      }
      if (!skillIds.length) return fail(m('cli.usage.install'))

      let destination = flag('to') || ''
      if (!destination) {
        const wanted = has('agents') ? flag('agents')!.split(',').map((s) => s.trim()) : null
        const all = listAgents()
        const target = wanted
          ? all.find((a) => wanted.includes(a.id) || wanted.includes(a.name))
          : all.find((a) => a.enabled)
        if (!target) return fail(m('cli.noTargets'))
        destination = resolveAgentDir(target.id) || ''
        if (!destination) return fail(m('agent.dirUnresolved', { name: target.name }))
        console.log(m('cli.target', { name: C.bold(target.name), path: tildify(expandPath(destination)) }))
      }

      const byId = new Map(libraryItems().flatMap((i) => i.skills.map((s) => [s.id, s] as const)))
      const wanted = skillIds
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ skillId: s.id, fullName: s.repoFullName, path: s.path, name: s.name }))
      for (const id of skillIds) if (!byId.has(id)) console.log(`   ${C.red('✗')} ${id}: ${m('install.notInLibrary')}`)

      const res = await installFromGithub({
        skills: wanted,
        destinations: [destination],
        onProgress: (p) => {
          if (p.message && p.phase === 'link') console.log(`   ${p.message}`)
        }
      })
      console.log(`\n${C.green('✓')} ${m('cli.installSummary', { ok: res.ok.length, skipped: res.skipped.length, failed: res.errors.length })}`)
      for (const e of res.errors) console.log(`   ${C.red('✗')} ${e.skillId} → ${e.agentId}: ${e.reason}`)
      for (const s of res.skipped) console.log(`   ${C.yellow('!')} ${s.skillId} → ${s.agentId}: ${s.reason}`)
      return res.errors.length ? 1 : 0
    }

    case 'uninstall': {
      const skillId = positional()[0]
      if (!skillId) return fail(m('cli.usage.uninstall'))
      let n = 0
      for (const rec of installedSkills().filter((r) => r.skillId === skillId || r.skillName === skillId)) {
        if (uninstall(rec.skillId, rec.agentId)) n++
      }
      console.log(n ? `${C.green('✓')} ${m('cli.uninstalled', { n })}` : C.dim(m('cli.noInstallRecords')))
      return n ? 0 : 1
    }

    case 'installed': {
      const rows = installedSkills()
      if (!rows.length) {
        console.log(C.dim(m('cli.noneInstalled')))
        return 0
      }
      for (const r of rows) {
        console.log(`${r.exists ? C.green('●') : C.red('✗')} ${r.skillName.padEnd(34)} → ${C.bold(r.agentName.padEnd(20))} ${C.dim(tildify(r.path))}`)
      }
      return 0
    }

    case 'growth': {
      const days = (Number(positional()[0]) || 7) as 1 | 7 | 30
      console.log(m('cli.computingGrowth', { days }))
      const rows = await leaderboard({ days, limit: 20, useApi: true, apiBudget: 40 })
      for (const [i, r] of rows.entries()) {
        const mark = r.approx ? '≥' : '+'
        console.log(`${String(i + 1).padStart(3)}. ${C.bold(r.fullName.padEnd(46))} ${C.green(`${mark}${r.gained}`.padStart(7))} ${C.dim(`${r.stars}★  [${r.source}]`)}`)
      }
      return 0
    }

    case 'stars': {
      const repo = positional()[0]
      if (!repo) return fail(m('cli.usage.stars'))
      const meta = await getRepo(repo, { force: true })
      const g = await starsGained(repo, meta.stars, 7)
      console.log(`${meta.fullName}: ${meta.stars}★, +${g.gained} in 7d via ${g.source}${g.approx ? ' (lower bound)' : ''}`)
      const hist = stars.get().history[repo]
      if (hist) console.log(m('cli.localSnapshots', { list: hist.map((h) => `${h.date}=${h.stars}`).join(' ') }))
      return 0
    }

    case 'paths': {
      for (const a of listAgents()) {
        const dir = resolveAgentDir(a.id)
        if (!dir) continue
        const entries = scanAgentDir(a.id)
        console.log(`${C.bold(a.name)} ${C.dim(tildify(dir))} ${existsSync(dir) ? '' : C.dim(m('cli.notExist'))}`)
        for (const e of entries) console.log(`   ${e.managed ? C.green('◆') : C.dim('·')} ${e.name} ${C.dim(e.linkTarget || '')}`)
      }
      return 0
    }

    default:
      console.log(helpText())
      return 1
  }
}

function fail(msg: string): number {
  console.error(`${C.red(m('cli.error'))} ${msg}`)
  return 1
}

main()
  .then((code) => {
    library.flush()
    installs.flush()
    settings.flush()
    stars.flush()
    flushAll()
    return code
  })
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(C.red(m('cli.crashed')), err?.message || err)
    process.exit(2)
  })
