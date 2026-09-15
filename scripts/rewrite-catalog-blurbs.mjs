#!/usr/bin/env node
/**
 * Rewrite the curated catalog's presentation layer.
 *
 *   node scripts/rewrite-catalog-blurbs.mjs
 *
 * Replaces the old `descriptionZh` (median 50 chars, self-referential, often
 * naming implementation details) with a `taglineZh` written in the style the
 * Chinese short-video / listicle genre uses for the same job.
 *
 * Formula derived from the verbatim corpus in docs/research/corpus-own.md:
 *   [动词] + [对象] + [产出或结果]      e.g. 上传 CSV 自动生成统计摘要与可视化
 *   让/把 + [对象] + [告别/变成] [痛点]  e.g. 让你生成的网页告别「AI 味儿」
 *   [输入] → [输出]                     e.g. 照片或一句话 → 极简纸感版面
 * Budget: 13–30 characters, median ~19. No 技能/工具 self-reference, no
 * implementation details, no "这是一个…" openers.
 *
 * Also assigns `fn`, a primary FUNCTION category (what the user wants to do)
 * replacing the old repo-type category as the browse axis. `category` is kept
 * as a secondary provenance label (官方 / 合集 / 工具 …).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'curated-catalog.json')

/** fn = primary functional category; kind = provenance label. */
const ENTRIES = {
  'obra/superpowers': {
    fn: 'coding',
    taglineZh: '把「先规划再写码」变成 AI 的默认习惯',
    taglineEn: "Makes planning-before-coding your agent's default habit",
    useWhen: '想让 AI 别一上来就乱写代码'
  },
  'OthmanAdi/planning-with-files': {
    fn: 'coding',
    taglineZh: '把长任务计划写成文件，断了也能接着干',
    taglineEn: 'Writes the plan to a file so long tasks survive a context reset',
    useWhen: '任务很长、跨会话、容易丢上下文'
  },
  'revfactory/harness': {
    fn: 'coding',
    taglineZh: '按你的领域自动组建一支 AI 团队并分工',
    taglineEn: 'Auto-assembles a specialist agent team for your domain',
    useWhen: '一个 agent 干不完，想拆成多个角色'
  },
  'jnMetaCode/superpowers-zh': {
    fn: 'coding',
    taglineZh: 'superpowers 全中文版，另加原创中文技能',
    taglineEn: 'Full Chinese port of superpowers plus original Chinese skills',
    useWhen: '想要 superpowers 但不想看英文'
  },
  'Gentleman-Programming/gentle-ai': {
    fn: 'coding',
    taglineZh: '给 AI 工具一次性配好记忆、规范与技能',
    taglineEn: 'One-shot setup of memory, specs and skills across your AI tools',
    useWhen: '新机器或新项目要从零配一遍'
  },
  'gotalab/cc-sdd': {
    fn: 'coding',
    taglineZh: '把一份需求文档变成能自己跑完的实现',
    taglineEn: 'Turns an approved spec into long-running autonomous implementation',
    useWhen: '想先写规格，再让 AI 自主实现'
  },
  'codeaholicguy/ai-devkit': {
    fn: 'coding',
    taglineZh: '一个控制台管住所有 AI 工具的技能与配置',
    taglineEn: 'One control plane for skills and config across AI tools',
    useWhen: '用了好几个 AI 工具，配置太散'
  },

  'anthropics/skills': {
    fn: 'docs',
    taglineZh: '让 AI 会读会写 PDF、Word、Excel、PPT',
    taglineEn: 'Reads and writes PDF, Word, Excel and PowerPoint',
    useWhen: '要处理办公文档'
  },
  'kepano/obsidian-skills': {
    fn: 'content',
    taglineZh: '让 AI 直接翻你的 Obsidian 笔记库',
    taglineEn: 'Lets the agent work directly on your Obsidian vault',
    useWhen: '笔记在 Obsidian，想让 AI 读写'
  },
  'anthropics/claude-plugins-official': {
    fn: 'collections',
    taglineZh: 'Anthropic 官方插件目录，挑现成的装',
    taglineEn: "Anthropic's official plugin directory",
    useWhen: '想找官方维护的现成能力'
  },
  'vercel-labs/agent-skills': {
    fn: 'design',
    taglineZh: '按前端最佳实践写 React 与网页',
    taglineEn: 'Frontend best practices for React and the web',
    useWhen: '写前端想少踩坑'
  },
  'googleworkspace/cli': {
    fn: 'docs',
    taglineZh: '一条命令操作 Gmail、Drive、日历和文档',
    taglineEn: 'One CLI for Gmail, Drive, Calendar and Docs',
    useWhen: '要脚本化操作 Google Workspace'
  },
  'openai/skills': {
    fn: 'collections',
    taglineZh: 'OpenAI 官方 Codex 技能目录',
    taglineEn: "OpenAI's official skill directory for Codex",
    useWhen: '用 Codex，想装官方技能'
  },
  'google/skills': {
    fn: 'cloud',
    taglineZh: 'Google 官方技能：Gemini、Cloud 与 GCP',
    taglineEn: 'Official Google skills for Gemini and Google Cloud',
    useWhen: '在 GCP 上开发'
  },
  'google-labs-code/stitch-skills': {
    fn: 'design',
    taglineZh: '把设计稿变成能跑的前端代码',
    taglineEn: 'Turns design mockups into working frontend code',
    useWhen: '有设计稿要实现'
  },
  'browser-act/skills': {
    fn: 'cloud',
    taglineZh: '让 AI 稳定操控浏览器：绕反爬、并行、隔离',
    taglineEn: 'Reliable browser automation that survives anti-bot defences',
    useWhen: '要抓数据或跑网页自动化'
  },
  'microsoft/skill-recorder': {
    fn: 'docs',
    taglineZh: '录下你的屏幕操作，自动变成可复用技能',
    taglineEn: 'Records your screen actions and turns them into a reusable skill',
    useWhen: '有个重复流程想教会 AI'
  },
  'NVIDIA/skills': {
    fn: 'cloud',
    taglineZh: '英伟达官方技能：机器人、仿真与 CUDA',
    taglineEn: 'NVIDIA skills for robotics, simulation and CUDA',
    useWhen: '做机器人、仿真或 GPU 开发'
  },
  'microsoft/skills': {
    fn: 'cloud',
    taglineZh: '微软官方技能：Azure、Foundry 与 .NET',
    taglineEn: 'Microsoft skills for Azure, Foundry and .NET',
    useWhen: '在 Azure 上开发'
  },
  'cloudflare/skills': {
    fn: 'cloud',
    taglineZh: '在 Cloudflare 上写对 Worker、D1 和 R2',
    taglineEn: 'Write correct Workers, D1 and R2 code for Cloudflare',
    useWhen: '部署到 Cloudflare'
  },
  'oracle/skills': {
    fn: 'cloud',
    taglineZh: 'Oracle 全栈：从数据库到云基础设施',
    taglineEn: 'Oracle across database and cloud infrastructure',
    useWhen: '用 Oracle 技术栈'
  },

  'nextlevelbuilder/ui-ux-pro-max-skill': {
    fn: 'design',
    taglineZh: '让 AI 做出来的界面不再一眼假',
    taglineEn: "Stops AI-generated UI from looking obviously templated",
    useWhen: 'AI 生成的前端太丑太像模板'
  },
  'Imbad0202/academic-research-skills': {
    fn: 'research',
    taglineZh: '从选题调研到同行评审走完论文全流程',
    taglineEn: 'Full academic paper workflow from literature review to peer review',
    useWhen: '写论文、做学术研究'
  },
  'K-Dense-AI/scientific-agent-skills': {
    fn: 'research',
    taglineZh: '166 个科研技能：生物、化学、医学、制药',
    taglineEn: '166 research skills across biology, chemistry, medicine and pharma',
    useWhen: '做生命科学或药物研究'
  },
  'mukul975/Anthropic-Cybersecurity-Skills': {
    fn: 'security',
    taglineZh: '818 个网安技能，对齐 MITRE ATT&CK',
    taglineEn: '818 cybersecurity skills mapped to MITRE ATT&CK',
    useWhen: '做安全测试或合规'
  },
  'op7418/guizang-ppt-skill': {
    fn: 'content',
    taglineZh: '生成杂志排版的 HTML 幻灯片',
    taglineEn: 'Generates magazine-grade HTML slide decks',
    useWhen: '要做一份好看的中文演示'
  },
  'Agents365-ai/drawio-skill': {
    fn: 'docs',
    taglineZh: '把代码或 SQL 画成可编辑的架构图',
    taglineEn: 'Turns code, Terraform or SQL into editable draw.io diagrams',
    useWhen: '要画架构图但不想手拖'
  },
  'Vincentwei1021/video-shotcraft': {
    fn: 'content',
    taglineZh: '把网页变成电影感的产品宣传片',
    taglineEn: 'Turns a webpage into a cinematic product video',
    useWhen: '要做一个产品演示视频'
  },
  'trailofbits/skills': {
    fn: 'security',
    taglineZh: '顶级安全公司的找漏洞与审代码套路',
    taglineEn: 'Vulnerability research and code audit playbooks from Trail of Bits',
    useWhen: '要审计代码安全性'
  },
  'addyosmani/web-quality-skills': {
    fn: 'design',
    taglineZh: '照着 Lighthouse 指标把网站调到更快',
    taglineEn: 'Improves site performance against Lighthouse and Core Web Vitals',
    useWhen: '网站慢、想优化性能'
  },
  'antonbabenko/terraform-skill': {
    fn: 'cloud',
    taglineZh: '写对 Terraform 与 OpenTofu 配置',
    taglineEn: 'Write correct Terraform and OpenTofu configuration',
    useWhen: '管理云基础设施'
  },
  'astronomer/agents': {
    fn: 'research',
    taglineZh: '用自然语言搭起并运维数据管道',
    taglineEn: 'Build and operate data pipelines in natural language',
    useWhen: '做数据工程'
  },

  'addyosmani/agent-skills': {
    fn: 'coding',
    taglineZh: '一线工程实践：代码质量、测试、性能、架构',
    taglineEn: 'Production engineering practices: quality, testing, performance, architecture',
    useWhen: '想把代码写得更像样'
  },
  'ComposioHQ/awesome-claude-skills': {
    fn: 'collections',
    taglineZh: 'Claude 技能资源大全，按用途挑现成的',
    taglineEn: 'A large curated index of Claude skills by use case',
    useWhen: '不知道装什么，先逛一遍'
  },
  'hesreallyhim/awesome-claude-code': {
    fn: 'collections',
    taglineZh: 'Claude Code 资源大全：技能、子智能体、插件',
    taglineEn: 'Claude Code resource index: skills, subagents, plugins',
    useWhen: '想系统了解 Claude Code 能做什么'
  },
  'VoltAgent/awesome-openclaw-skills': {
    fn: 'collections',
    taglineZh: '5000+ OpenClaw 技能，已按用途筛选分类',
    taglineEn: '5000+ OpenClaw skills, filtered and categorised by use case',
    useWhen: '用 OpenClaw 想找现成技能'
  },
  'sickn33/agentic-awesome-skills': {
    fn: 'collections',
    taglineZh: '本地技能控制台，内置 2000+ 技能目录',
    taglineEn: 'Local skill control plane bundling 2000+ skill directories',
    useWhen: '想要一个装好就有一大堆技能的环境'
  },
  'wshobson/agents': {
    fn: 'coding',
    taglineZh: '跨运行时的插件市场，一份配置多工具通用',
    taglineEn: 'Cross-runtime plugin marketplace with one shared config',
    useWhen: '在多个 agent 之间来回切'
  },
  'github/awesome-copilot': {
    fn: 'coding',
    taglineZh: 'GitHub 官方 Copilot 资源合集',
    taglineEn: "GitHub's official collection of Copilot instructions and agents",
    useWhen: '用 Copilot 想找官方资源'
  },
  'VoltAgent/awesome-agent-skills': {
    fn: 'collections',
    taglineZh: '上千个社区技能，兼容主流编码智能体',
    taglineEn: 'Thousands of community skills for mainstream coding agents',
    useWhen: '想一次拿到大量社区技能'
  },
  'alirezarezvani/claude-skills': {
    fn: 'collections',
    taglineZh: '380+ 技能覆盖工程、市场、产品与合规',
    taglineEn: '380+ skills spanning engineering, marketing, product and compliance',
    useWhen: '需要非技术岗位的技能'
  },
  'KKKKhazix/khazix-skills': {
    fn: 'coding',
    taglineZh: '卡兹克开源：定目标、整理、写作等实用技能',
    taglineEn: 'Practical skills from Khaizix: goal-setting, tidying, writing',
    useWhen: '想要中文语境下的实用技能'
  },
  'anbeime/skill': {
    fn: 'collections',
    taglineZh: '中文技能商店：文档、创作、编程',
    taglineEn: 'A Chinese skill store covering documents, content and coding',
    useWhen: '想找中文化的技能包'
  },
  'tech-leads-club/agent-skills': {
    fn: 'tooling',
    taglineZh: '经过安全校验的技能注册表，装得放心',
    taglineEn: 'A security-vetted skill registry',
    useWhen: '担心装的技能有后门'
  },
  'libukai/awesome-agent-skills': {
    fn: 'collections',
    taglineZh: '中文整理的智能体技能清单',
    taglineEn: 'A Chinese-curated list of agent skills',
    useWhen: '想快速了解生态里有什么'
  },

  'vercel-labs/skills': {
    fn: 'tooling',
    taglineZh: '一条命令把技能装进 80 种 AI 工具',
    taglineEn: 'One command installs a skill into 80 different agents',
    useWhen: '想在多个工具之间共用技能'
  },
  'NVIDIA/SkillSpector': {
    fn: 'security',
    taglineZh: '装之前先扫一遍：查后门、注入与外泄',
    taglineEn: 'Scans a skill for backdoors, prompt injection and data exfiltration before install',
    useWhen: '要装来路不明的技能'
  },
  'yusufkaraaslan/Skill_Seekers': {
    fn: 'tooling',
    taglineZh: '把文档站、仓库或 PDF 自动变成技能',
    taglineEn: 'Turns documentation sites, repos or PDFs into skills automatically',
    useWhen: '想让 AI 学会一套内部文档'
  },
  'xingkongliang/skills-manager': {
    fn: 'tooling',
    taglineZh: '桌面端统一管理几十种工具的技能',
    taglineEn: 'Desktop manager for skills across dozens of tools',
    useWhen: '技能散落在多个目录里'
  },
  'qufei1993/skills-hub': {
    fn: 'tooling',
    taglineZh: '技能集中管理，装一次到处能用',
    taglineEn: 'Central skill management — install once, use everywhere',
    useWhen: '想让所有工具共用同一份技能'
  },
  'rohitg00/skillkit': {
    fn: 'tooling',
    taglineZh: '让同一份技能在 40+ 工具间通用',
    taglineEn: 'Makes one skill work across 40+ tools',
    useWhen: '工具换着用，不想重复装'
  },
  'MoizIbnYousaf/ai-agent-skills': {
    fn: 'tooling',
    taglineZh: '一条命令把技能部署到十多种运行时',
    taglineEn: 'Deploys a skill to a dozen runtimes with one command',
    useWhen: '要批量部署到多种 agent'
  },
  'jiweiyeah/Skills-Manager': {
    fn: 'tooling',
    taglineZh: '用软链接把一份技能同步到 32 种工具',
    taglineEn: 'Symlinks one skill into 32 tools',
    useWhen: '想保持单一真源'
  },
  'EverMind-AI/SkillCorpus': {
    fn: 'tooling',
    taglineZh: '把散落的 SKILL.md 变成可检索的语料库',
    taglineEn: 'Turns scattered SKILL.md files into a searchable corpus',
    useWhen: '技能太多，找不到想要的'
  },
  'Kamalnrf/claude-plugins': {
    fn: 'tooling',
    taglineZh: '发现并安装公开的 Claude 插件与技能',
    taglineEn: 'Discover and install public Claude plugins and skills',
    useWhen: '想从命令行找插件'
  },
  'antfu/skills-npm': {
    fn: 'tooling',
    taglineZh: '像装 npm 包一样安装 AI 技能',
    taglineEn: 'Install agent skills the way you install npm packages',
    useWhen: '想用 npm 生态分发技能'
  },

  'agentskills/agentskills': {
    fn: 'spec',
    taglineZh: 'SKILL.md 的官方规范：格式与发现机制',
    taglineEn: 'The official SKILL.md specification',
    useWhen: '想知道 SKILL.md 该怎么写'
  },
  'modelcontextprotocol/modelcontextprotocol': {
    fn: 'spec',
    taglineZh: 'MCP 协议官方规范：模型怎么连工具',
    taglineEn: 'The official Model Context Protocol specification',
    useWhen: '要写 MCP 服务器'
  },
  'modelcontextprotocol/registry': {
    fn: 'spec',
    taglineZh: 'MCP 服务器官方注册表，统一发现与查询',
    taglineEn: 'The official MCP server registry',
    useWhen: '想找现成的 MCP 服务器'
  },
  'sno-ai/mda': {
    fn: 'spec',
    taglineZh: '一份 Markdown 源码编译成多种技能格式',
    taglineEn: 'Compiles one Markdown source into multiple agent formats',
    useWhen: '同一份内容要适配多个平台'
  }
}

/** English counterpart of each `useWhen`, so English mode shows no Chinese. */
const USE_WHEN_EN = {
  'obra/superpowers': 'AI starts coding before thinking',
  'OthmanAdi/planning-with-files': 'the task spans sessions and loses context',
  'revfactory/harness': "one agent can't cover the whole job",
  'jnMetaCode/superpowers-zh': 'you want superpowers without the English',
  'Gentleman-Programming/gentle-ai': 'setting up a new machine or project',
  'gotalab/cc-sdd': 'you want a spec before autonomous implementation',
  'codeaholicguy/ai-devkit': 'config sprawl across several AI tools',
  'anthropics/skills': 'you need to handle office documents',
  'kepano/obsidian-skills': 'your notes live in Obsidian',
  'anthropics/claude-plugins-official': 'you want official, maintained capabilities',
  'vercel-labs/agent-skills': 'writing frontend code',
  'googleworkspace/cli': 'scripting Google Workspace',
  'openai/skills': 'you use Codex and want official skills',
  'google/skills': 'building on Google Cloud',
  'google-labs-code/stitch-skills': 'you have a design to implement',
  'browser-act/skills': 'scraping or automating the web',
  'microsoft/skill-recorder': 'you have a repetitive flow to teach',
  'NVIDIA/skills': 'robotics, simulation or GPU work',
  'microsoft/skills': 'building on Azure',
  'cloudflare/skills': 'deploying to Cloudflare',
  'oracle/skills': 'working with the Oracle stack',
  'nextlevelbuilder/ui-ux-pro-max-skill': 'AI-generated UI looks templated',
  'Imbad0202/academic-research-skills': 'writing a paper or doing research',
  'K-Dense-AI/scientific-agent-skills': 'life-science or pharma research',
  'mukul975/Anthropic-Cybersecurity-Skills': 'security testing or compliance',
  'op7418/guizang-ppt-skill': 'you need a good-looking deck',
  'Agents365-ai/drawio-skill': 'diagrams without dragging boxes',
  'Vincentwei1021/video-shotcraft': 'you need a product demo video',
  'trailofbits/skills': 'auditing code for security',
  'addyosmani/web-quality-skills': 'the site is slow',
  'antonbabenko/terraform-skill': 'managing cloud infrastructure',
  'astronomer/agents': 'doing data engineering',
  'addyosmani/agent-skills': 'you want better code quality',
  'ComposioHQ/awesome-claude-skills': 'browsing before you pick',
  'hesreallyhim/awesome-claude-code': 'learning what Claude Code can do',
  'VoltAgent/awesome-openclaw-skills': 'you use OpenClaw',
  'sickn33/agentic-awesome-skills': 'you want a large preinstalled library',
  'wshobson/agents': 'you switch between agents',
  'github/awesome-copilot': 'you use Copilot',
  'VoltAgent/awesome-agent-skills': 'you want many community skills at once',
  'alirezarezvani/claude-skills': 'you need non-engineering skills',
  'KKKKhazix/khazix-skills': 'you want practical Chinese-language skills',
  'anbeime/skill': 'looking for Chinese-localised packs',
  'tech-leads-club/agent-skills': 'you worry about untrusted skills',
  'libukai/awesome-agent-skills': 'getting oriented in the ecosystem',
  'vercel-labs/skills': 'sharing skills across tools',
  'NVIDIA/SkillSpector': 'installing something unfamiliar',
  'yusufkaraaslan/Skill_Seekers': 'teaching the agent your internal docs',
  'xingkongliang/skills-manager': 'skills scattered across directories',
  'qufei1993/skills-hub': 'you want every tool on one set of skills',
  'rohitg00/skillkit': 'you keep switching tools',
  'MoizIbnYousaf/ai-agent-skills': 'deploying to several agents',
  'jiweiyeah/Skills-Manager': 'you want a single source of truth',
  'EverMind-AI/SkillCorpus': 'too many skills to find what you want',
  'Kamalnrf/claude-plugins': 'finding plugins from the terminal',
  'antfu/skills-npm': 'distributing skills through npm',
  'agentskills/agentskills': 'learning how to write a SKILL.md',
  'modelcontextprotocol/modelcontextprotocol': 'writing an MCP server',
  'modelcontextprotocol/registry': 'finding an existing MCP server',
  'sno-ai/mda': 'one source targeting several platforms'
}

/** Functional categories: what the user wants to do, not what the repo is. */
const FN_LABELS = {
  docs: { zh: '文档与办公', en: 'Documents & Office', icon: 'FileText' },
  design: { zh: '设计与前端', en: 'Design & Frontend', icon: 'Palette' },
  coding: { zh: '编程与开发', en: 'Coding', icon: 'Code' },
  research: { zh: '科研与数据', en: 'Research & Data', icon: 'FlaskConical' },
  security: { zh: '安全与合规', en: 'Security', icon: 'ShieldCheck' },
  cloud: { zh: '云与自动化', en: 'Cloud & Automation', icon: 'Cloud' },
  content: { zh: '内容与创意', en: 'Content & Media', icon: 'Clapperboard' },
  tooling: { zh: '技能管理', en: 'Skill Tooling', icon: 'Wrench' },
  collections: { zh: '技能合集', en: 'Collections', icon: 'Library' },
  spec: { zh: '规范与标准', en: 'Specs', icon: 'BookMarked' }
}

const doc = JSON.parse(readFileSync(file, 'utf8'))
let patched = 0
const missing = []

for (const repo of doc.repos) {
  const entry = ENTRIES[repo.fullName]
  if (!entry) {
    missing.push(repo.fullName)
    continue
  }
  repo.fn = entry.fn
  repo.taglineZh = entry.taglineZh
  repo.taglineEn = entry.taglineEn
  repo.useWhen = entry.useWhen
  repo.useWhenEn = USE_WHEN_EN[repo.fullName]
  // The long repo-centric blurb moves to the detail page as `about`.
  repo.aboutZh = repo.descriptionZh
  patched++
}

const missingEn = doc.repos.filter((r) => !r.useWhenEn).map((r) => r.fullName)
if (missingEn.length) {
  console.error(`缺少英文 useWhen：\n  ${missingEn.join('\n  ')}`)
  process.exit(1)
}

if (missing.length) {
  console.error(`未覆盖 ${missing.length} 个仓库：\n  ${missing.join('\n  ')}`)
  process.exit(1)
}

doc.fnLabels = FN_LABELS
doc.blurbStyle = {
  formula: '[动词] + [对象] + [产出]；或 让/把 + [对象] + [告别/变成] + [痛点]',
  budgetChars: '13–30',
  writtenAt: new Date().toISOString(),
  corpus: 'docs/research/corpus-own.md'
}

writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8')

const lens = doc.repos.map((r) => r.taglineZh.length).sort((a, b) => a - b)
const median = lens[Math.floor(lens.length / 2)]
const byFn = doc.repos.reduce((m, r) => {
  m[r.fn] = (m[r.fn] || 0) + 1
  return m
}, {})

console.log(`已改写 ${patched} 条简介`)
console.log(`字数 min ${lens[0]} · 中位 ${median} · p90 ${lens[Math.floor(lens.length * 0.9)]} · max ${lens[lens.length - 1]}`)
console.log(`（改写前：min 35 · 中位 50 · p90 64 · max 89）`)
console.log('\n功能分类分布：')
for (const [fn, n] of Object.entries(byFn).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${FN_LABELS[fn].zh.padEnd(8)} ${fn}`)
}
const selfRef = doc.repos.filter((r) => /技能|工具|skill/i.test(r.taglineZh)).length
console.log(`\n自指（含「技能/工具」）的条目：${selfRef} / ${doc.repos.length}（改写前 58/60）`)
