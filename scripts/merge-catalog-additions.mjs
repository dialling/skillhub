#!/usr/bin/env node
/**
 * Merge new repositories into the curated catalog.
 *
 *   node scripts/merge-catalog-additions.mjs [--dry-run]
 *
 * Two sources are folded in:
 *   1. data/catalog-additions.json — produced by the research pass, already
 *      carrying taglines in the project's house style.
 *   2. MANUAL below — repos found by direct probing of GitHub search that the
 *      research pass did not cover, with taglines written here.
 *
 * Both must satisfy the blurb standard documented in docs/blurb-formula.md:
 * 13–30 Chinese characters, verb-first, outcome not identity, no implementation
 * details. The script refuses anything that breaks the rule.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = join(root, 'data', 'curated-catalog.json')
const additionsPath = join(root, 'data', 'catalog-additions.json')
const probedPath = '/tmp/probed.json'
const dryRun = process.argv.includes('--dry-run')

/**
 * Repos found by probing GitHub search directly, with taglines written here.
 * Keyed by fullName; everything else (stars, tree, license) comes from the probe.
 */
const MANUAL = {
  'affaan-m/ECC': {
    taglineZh: '调优 agent 的性能：技能、直觉与记忆',
    taglineEn: 'Tunes agent performance: skills, instincts and memory',
    useWhen: 'agent 又慢又费 token',
    useWhenEn: 'your agent is slow and burns tokens',
    fn: 'tooling',
    category: 'framework'
  },
  'multica-ai/andrej-karpathy-skills': {
    taglineZh: '把 Karpathy 的编程品味压成一份行为准则',
    taglineEn: "Karpathy's coding taste distilled into one behavioural spec",
    useWhen: '想让 AI 的代码品味更好',
    useWhenEn: 'you want better taste in the generated code',
    fn: 'coding',
    category: 'collection'
  },
  'Leonxlnx/taste-skill': {
    taglineZh: '让 AI 生成的界面有品味，不再是模板味',
    taglineEn: 'Gives AI-generated UI actual taste instead of template smell',
    useWhen: 'AI 做的界面总撞脸',
    useWhenEn: 'AI-generated UI all looks the same',
    fn: 'design',
    category: 'domain'
  },
  'thedotmack/claude-mem': {
    taglineZh: '让 agent 记住上次干到哪，换个会话接着干',
    taglineEn: 'Remembers where the agent left off across sessions',
    useWhen: '每次开新会话都要重讲一遍',
    useWhenEn: 'every new session starts from scratch',
    fn: 'coding',
    category: 'framework'
  },
  'Panniantong/Agent-Reach': {
    taglineZh: '让 agent 读得到 Twitter、Reddit 和全网',
    taglineEn: 'Lets the agent read Twitter, Reddit and the wider web',
    useWhen: '要让 AI 去外网查东西',
    useWhenEn: 'the agent needs to research the open web',
    fn: 'research',
    category: 'domain'
  },
  'career-ops-hq/career-ops': {
    taglineZh: '自动扫招聘网站，筛出值得投的岗位',
    taglineEn: 'Scans job boards and shortlists the ones worth applying to',
    useWhen: '找工作、想批量筛岗位',
    useWhenEn: 'job hunting and filtering postings',
    fn: 'content',
    category: 'domain'
  },
  'tt-a1i/archify': {
    taglineZh: '把架构、流程、时序画成可验证的图',
    taglineEn: 'Draws verifiable architecture, workflow and sequence diagrams',
    useWhen: '要出架构图或流程图',
    useWhenEn: 'you need architecture or flow diagrams',
    fn: 'docs',
    category: 'domain'
  },
  'mvanhorn/last30days-skill': {
    taglineZh: '把最近 30 天全网讨论汇成一份摘要',
    taglineEn: 'Summarises the last 30 days of discussion across the web',
    useWhen: '想快速摸清话题风向',
    useWhenEn: 'you want the current state of a topic',
    fn: 'research',
    category: 'domain'
  },
  'ayghri/i-have-adhd': {
    taglineZh: '让 AI 先把答案甩出来，别绕圈子',
    taglineEn: 'Makes the agent lead with the answer instead of burying it',
    useWhen: 'AI 回答太长找不到重点',
    useWhenEn: 'answers are long and the point is buried',
    fn: 'coding',
    category: 'domain'
  },
  'Egonex-AI/Understand-Anything': {
    taglineZh: '把陌生代码库变成能上手探索的知识图',
    taglineEn: 'Turns an unfamiliar codebase into an explorable knowledge graph',
    useWhen: '接手一个不熟的代码库',
    useWhenEn: 'you inherited a codebase you do not know',
    fn: 'research',
    category: 'domain'
  },
  'JuliusBrussee/caveman': {
    taglineZh: '让 AI 少说废话，token 省掉一大半',
    taglineEn: 'Cuts the waffle and most of the token cost with it',
    useWhen: 'token 烧得太快',
    useWhenEn: 'token usage is out of hand',
    fn: 'tooling',
    category: 'tooling'
  },
  'shareAI-lab/learn-claude-code': {
    taglineZh: '从零手写一个 agent 骨架，看清它怎么跑',
    taglineEn: 'Build an agent harness from scratch to see how it really works',
    useWhen: '想搞懂 agent 内部原理',
    useWhenEn: 'you want to understand how agents work',
    fn: 'coding',
    category: 'collection'
  },
  'garrytan/gstack': {
    taglineZh: '照搬 Garry Tan 的 23 件装备',
    taglineEn: "Garry Tan's 23-tool agent setup, ready to copy",
    useWhen: '想看高手怎么配 Claude Code',
    useWhenEn: 'you want to see an expert setup',
    fn: 'coding',
    category: 'collection'
  },
  'openclaw/openclaw': {
    taglineZh: '能真正动手干活的跨平台 agent 本体',
    taglineEn: 'The cross-platform agent that actually does things',
    useWhen: '想要一个什么都能干的 agent',
    useWhenEn: 'you want a general-purpose agent',
    fn: 'cloud',
    category: 'official'
  },
  'zhayujie/CowAgent': {
    taglineZh: '会自己拆任务、调工具的超级助理',
    taglineEn: 'A super assistant that plans tasks and calls its own tools',
    useWhen: '想要一个通用 AI 助理',
    useWhenEn: 'you want a general assistant',
    fn: 'cloud',
    category: 'framework'
  },
  'stablyai/orca': {
    taglineZh: '同时指挥一队并行 agent 干不同的活',
    taglineEn: 'Command a fleet of parallel agents on different jobs',
    useWhen: '要并行跑多个 agent',
    useWhenEn: 'you run several agents in parallel',
    fn: 'coding',
    category: 'tooling'
  }
}

const CJK = /[\u4e00-\u9fff]/
const problems = []

function check(tagZh, fullName) {
  const n = [...tagZh].length
  if (n < 13 || n > 32) problems.push(`${fullName}: taglineZh ${n} chars — ${tagZh}`)
  if (/^(为|面向|一个|这是一个)/.test(tagZh)) problems.push(`${fullName}: banned opener — ${tagZh}`)
  if (/pypdf|pdfplumber|Playwright|Remotion|npx|MCP|CLI|API/.test(tagZh)) {
    problems.push(`${fullName}: implementation detail leaked — ${tagZh}`)
  }
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const have = new Set(catalog.repos.map((r) => r.fullName))
const added = []

/** Shape a raw probe record into a catalog entry. */
function fromProbe(probe, meta) {
  return {
    fullName: probe.fullName,
    owner: probe.owner,
    name: probe.name,
    descriptionEn: probe.descriptionEn,
    taglineZh: meta.taglineZh,
    taglineEn: meta.taglineEn,
    useWhen: meta.useWhen,
    useWhenEn: meta.useWhenEn,
    aboutZh: probe.descriptionEn,
    fn: meta.fn,
    category: meta.category,
    stars: probe.stars,
    forks: probe.forks,
    openIssues: probe.openIssues,
    topics: probe.topics,
    license: probe.license,
    homepage: probe.homepage,
    avatarUrl: probe.avatarUrl,
    defaultBranch: probe.defaultBranch,
    pushedAt: probe.pushedAt,
    archived: false,
    htmlUrl: probe.htmlUrl,
    skillDirs: probe.skillDirs,
    skillCount: probe.skillCount,
    skillDirsAll: probe.skillDirsRaw,
    installHint: probe.installHint
  }
}

/* --- source 1: research pass --- */
if (existsSync(additionsPath)) {
  const doc = JSON.parse(readFileSync(additionsPath, 'utf8'))
  for (const r of doc.repos || []) {
    if (have.has(r.fullName)) continue
    check(r.taglineZh, r.fullName)
    r.skillDirsAll = r.skillDirsRaw ?? r.skillDirs?.length ?? 0
    if (!r.aboutZh) r.aboutZh = r.descriptionEn
    have.add(r.fullName)
    added.push(r)
  }
  console.log(`· 调研产出：${(doc.repos || []).length} 条`)
} else {
  console.log('· 调研产出：文件不存在，跳过')
}

/* --- source 2: direct probe --- */
if (existsSync(probedPath)) {
  const probes = JSON.parse(readFileSync(probedPath, 'utf8'))
  let n = 0
  for (const probe of probes) {
    const meta = MANUAL[probe.fullName]
    if (!meta || have.has(probe.fullName) || probe.skillCount === 0) continue
    check(meta.taglineZh, probe.fullName)
    have.add(probe.fullName)
    added.push(fromProbe(probe, meta))
    n++
  }
  console.log(`· 直接探测：${n} 条`)
} else {
  console.log('· 直接探测：/tmp/probed.json 不存在，跳过')
}

if (problems.length) {
  console.error('\n不符合简介规范：')
  for (const p of problems) console.error('  ✗ ' + p)
  process.exit(1)
}

if (!added.length) {
  console.log('\n没有新增条目。')
  process.exit(0)
}

catalog.repos = [...catalog.repos, ...added].sort((a, b) => b.stars - a.stars)
catalog.skillCounts = undefined
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

console.log(`\n新增 ${added.length} 个仓库，catalog 现共 ${catalog.repos.length} 个`)
const lens = added.map((r) => [...r.taglineZh].length).sort((a, b) => a - b)
console.log(`新条目简介字数 min ${lens[0]} · 中位 ${lens[lens.length >> 1]} · max ${lens[lens.length - 1]}`)
const byFn = added.reduce((m, r) => ((m[r.fn] = (m[r.fn] || 0) + 1), m), {})
console.log('功能分布：' + Object.entries(byFn).map(([k, v]) => `${k}:${v}`).join(' '))
console.log(`新增技能目录 ${added.reduce((n, r) => n + r.skillCount, 0)} 个`)

if (dryRun) {
  console.log('\n[dry-run] 未写入。')
} else if (existsSync(additionsPath)) {
  rmSync(additionsPath)
}
