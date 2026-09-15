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
import { addRepo, libraryItems, removeItem, syncItem } from './core/library'
import { installSkills, installedSkills, uninstall } from './core/installer'
import { searchSkills, rateLimit, tokenSource, getRepo, starsGained } from './core/github'
import { leaderboard } from './core/leaderboard'
import { curatedCatalog } from './core/catalog'
import { expandPath, tildify } from './core/paths'

const argv = process.argv.slice(2)
const cmd = argv[0]

function flag(name: string): string | null {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  const idx = argv.indexOf(`--${name}`)
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1]
  return null
}
function has(name: string): boolean {
  return argv.includes(`--${name}`)
}
function positional(): string[] {
  return argv.slice(1).filter((a) => !a.startsWith('--'))
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`
}

const HELP = `
${C.bold('SkillHub')} — 智能体技能管理器 (CLI)

  ${C.cyan('search')} <关键词>              在 GitHub 上搜索技能仓库
  ${C.cyan('add')} <owner/repo>             入库（git clone + 解析 SKILL.md）
  ${C.cyan('list')} [--json]                列出库中内容
  ${C.cyan('sync')} <owner/repo>            更新库中仓库
  ${C.cyan('remove')} <owner/repo>          移出库（并卸载关联技能）
  ${C.cyan('agents')} [--json]              列出智能体与技能目录
  ${C.cyan('install')} <skillId|--all>      安装技能到智能体目录
        --agents dsh,cursor   指定目标（默认：所有已启用且已检测到的）
        --copy                使用复制而非软链接
  ${C.cyan('uninstall')} <skillId>          从所有智能体卸载
  ${C.cyan('installed')}                    列出已安装技能
  ${C.cyan('growth')} [1|7|30]              星标增长排行榜
  ${C.cyan('doctor')}                       环境自检

  ${C.dim('示例：node out/main/cli.js install --all --agents dsh')}
`

async function main(): Promise<number> {
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP)
      return 0

    case 'doctor': {
      const rate = await rateLimit(true)
      console.log(`${C.bold('凭据')}     ${tokenSource()} ${rate.ok ? C.green('✓') : C.red('✗')} ${rate.ok ? `${rate.remaining}/${rate.limit}` : rate.error}`)
      console.log(`${C.bold('库目录')}   ${tildify(expandPath(settings.get().libraryDir))}`)
      const catalog = await curatedCatalog()
      console.log(`${C.bold('精选目录')} ${catalog.length} 个仓库 ${catalog.length ? C.green('✓') : C.yellow('（未找到 data/curated-catalog.json）')}`)
      const agents = listAgents()
      console.log(`${C.bold('智能体')}   ${agents.filter((a) => a.detected).length}/${agents.length} 已检测`)
      for (const a of agents.filter((x) => x.detected)) console.log(`           ${a.name} → ${tildify(expandPath(a.path))}`)
      console.log(`${C.bold('库')}       ${libraryItems().length} 个仓库 · ${installedSkills().length} 条安装记录`)
      return 0
    }

    case 'search': {
      const term = positional().join(' ')
      if (!term) return fail('用法：search <关键词>')
      const res = await searchSkills(term, { perPage: 20 })
      console.log(`${C.dim(`${res.repos.length} 个结果 / ${res.elapsedMs}ms`)}\n`)
      for (const r of res.repos) {
        console.log(`${C.bold(r.fullName.padEnd(48))} ${C.yellow(String(r.stars).padStart(7))}★  ${C.dim(r.descriptionZh || r.descriptionEn || '')}`)
      }
      return 0
    }

    case 'add': {
      const target = positional()[0]
      if (!target) return fail('用法：add <owner/repo>')
      console.log(`入库 ${target} …`)
      const item = await addRepo(target)
      if (item.status !== 'ready') return fail(item.error || '入库失败')
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
        console.log(C.dim('库是空的。用 `add <owner/repo>` 入库。'))
        return 0
      }
      const map: Record<string, string[]> = {}
      for (const r of installs.get().records) (map[r.skillId] ||= []).push(r.agentName)
      for (const item of items) {
        console.log(`${C.bold(item.fullName)} ${C.dim(`· ${item.skills.length} 个技能 · ${item.status}`)}`)
        for (const s of item.skills) {
          const where = map[s.id]
          console.log(`   ${where ? C.green('●') : C.dim('○')} ${s.name.padEnd(34)} ${C.dim(s.path)} ${where ? C.green(`→ ${where.join(', ')}`) : ''}`)
        }
      }
      return 0
    }

    case 'sync': {
      const target = positional()[0]
      if (!target) return fail('用法：sync <owner/repo>')
      const item = await syncItem(target)
      console.log(`${C.green('✓')} ${item.fullName} 已更新（${item.skills.length} 个技能）`)
      return 0
    }

    case 'remove': {
      const target = positional()[0]
      if (!target) return fail('用法：remove <owner/repo>')
      const res = removeItem(target, true)
      console.log(`${C.green('✓')} 已移出库，卸载 ${res.removedInstalls} 条安装记录`)
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
      const copy = has('copy')
      let skillIds: string[] = []
      if (has('all')) {
        skillIds = libraryItems().flatMap((i) => i.skills.map((s) => s.id))
      } else {
        skillIds = positional()
      }
      if (!skillIds.length) return fail('用法：install <skillId> | --all')

      const wanted = has('agents') ? flag('agents')!.split(',').map((s) => s.trim()) : null
      const all = listAgents()
      const targets = wanted
        ? all.filter((a) => wanted.includes(a.id) || wanted.includes(a.name))
        : all.filter((a) => a.enabled)
      if (!targets.length) return fail('没有匹配的目标智能体。用 `agents` 查看。')
      for (const a of targets) {
        if (!resolveAgentDir(a.id)) return fail(`无法解析 ${a.name} 的目录`)
        console.log(`目标 ${C.bold(a.name)} → ${tildify(expandPath(a.path))}`)
      }
      const res = installSkills(
        { skillIds, agentIds: targets.map((a) => a.id), mode: copy ? 'copy' : 'symlink' },
        (p) => p.message && p.phase === 'link' && console.log(`   ${p.message}`)
      )
      console.log(`\n${C.green('✓')} 成功 ${res.ok.length} · 跳过 ${res.skipped.length} · 失败 ${res.errors.length}`)
      for (const e of res.errors) console.log(`   ${C.red('✗')} ${e.skillId} → ${e.agentId}: ${e.reason}`)
      for (const s of res.skipped) console.log(`   ${C.yellow('!')} ${s.skillId} → ${s.agentId}: ${s.reason}`)
      return res.errors.length ? 1 : 0
    }

    case 'uninstall': {
      const skillId = positional()[0]
      if (!skillId) return fail('用法：uninstall <skillId>')
      let n = 0
      for (const rec of installedSkills().filter((r) => r.skillId === skillId || r.skillName === skillId)) {
        if (uninstall(rec.skillId, rec.agentId)) n++
      }
      console.log(n ? `${C.green('✓')} 已卸载 ${n} 处` : C.dim('没有找到对应的安装记录'))
      return n ? 0 : 1
    }

    case 'installed': {
      const rows = installedSkills()
      if (!rows.length) {
        console.log(C.dim('还没有安装任何技能。'))
        return 0
      }
      for (const r of rows) {
        console.log(`${r.exists ? C.green('●') : C.red('✗')} ${r.skillName.padEnd(34)} → ${C.bold(r.agentName.padEnd(20))} ${C.dim(tildify(r.path))}`)
      }
      return 0
    }

    case 'growth': {
      const days = (Number(positional()[0]) || 7) as 1 | 7 | 30
      console.log(`计算最近 ${days} 天的星标增长 …`)
      const rows = await leaderboard({ days, limit: 20, useApi: true, apiBudget: 40 })
      for (const [i, r] of rows.entries()) {
        const mark = r.approx ? '≥' : '+'
        console.log(`${String(i + 1).padStart(3)}. ${C.bold(r.fullName.padEnd(46))} ${C.green(`${mark}${r.gained}`.padStart(7))} ${C.dim(`${r.stars}★  [${r.source}]`)}`)
      }
      return 0
    }

    case 'stars': {
      const repo = positional()[0]
      if (!repo) return fail('用法：stars <owner/repo>')
      const meta = await getRepo(repo, { force: true })
      const g = await starsGained(repo, meta.stars, 7)
      console.log(`${meta.fullName}: ${meta.stars}★, +${g.gained} in 7d via ${g.source}${g.approx ? ' (lower bound)' : ''}`)
      const hist = stars.get().history[repo]
      if (hist) console.log(`本地快照: ${hist.map((h) => `${h.date}=${h.stars}`).join(' ')}`)
      return 0
    }

    case 'paths': {
      for (const a of listAgents()) {
        const dir = resolveAgentDir(a.id)
        if (!dir) continue
        const entries = scanAgentDir(a.id)
        console.log(`${C.bold(a.name)} ${C.dim(tildify(dir))} ${existsSync(dir) ? '' : C.dim('(不存在)')}`)
        for (const e of entries) console.log(`   ${e.managed ? C.green('◆') : C.dim('·')} ${e.name} ${C.dim(e.linkTarget || '')}`)
      }
      return 0
    }

    default:
      console.log(HELP)
      return 1
  }
}

function fail(msg: string): number {
  console.error(`${C.red('错误')} ${msg}`)
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
    console.error(C.red('崩溃:'), err?.message || err)
    process.exit(2)
  })
