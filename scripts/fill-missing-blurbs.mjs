#!/usr/bin/env node
/**
 * Fill in hand-written bilingual copy for catalog entries whose repository has
 * no GitHub description at all.
 *
 *   node scripts/fill-missing-blurbs.mjs [--check]
 *
 * A repo with no `description` field cannot be summarised by the crawler, so
 * these have to be written by reading what the repo actually contains. Keeping
 * them in a script (rather than editing the JSON by hand) means the text is
 * reviewable and the gap is re-checked on every run.
 *
 * `--check` reports gaps without writing, for use as a gate.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'curated-catalog.json')
const checkOnly = process.argv.includes('--check')

/**
 * Written from the repository's actual skill directories, not from its name.
 * Both of these ship no GitHub description, which is why the crawler could not
 * produce anything.
 */
const COPY = {
  'JimLiu/baoyu-skills': {
    descriptionEn:
      "Baoyu's working toolkit for writing and publishing: article illustrations, cover images, comics, diagrams and infographics, Markdown formatting and conversion, image compression, plus one-click publishing to WeChat and Weibo.",
    aboutZh:
      '宝玉的写作与自媒体工具集：给文章配图、做封面、画漫画与流程图、生成信息图，Markdown 排版与格式转换、图片压缩，以及一键发布到公众号和微博。'
  },
  'openai/skills': {
    // The repository's own GitHub description is "Skills Catalog for Codex",
    // which says nothing about the 43 skills inside it.
    descriptionEn:
      "OpenAI's official skill catalog for Codex: 43 installable skills covering Figma design handoff, Notion and Linear workflows, GitHub and CI fixes, Playwright browser automation, PDF and Jupyter handling, security review, and deploying to Vercel, Netlify, Cloudflare and Render.",
    aboutZh:
      'OpenAI 官方 Codex 技能目录，43 个可直接安装的官方技能：Figma 设计交付、Notion 与 Linear 工作流、GitHub 与 CI 修复、Playwright 浏览器自动化、PDF 与 Jupyter 处理、安全审查，以及部署到 Vercel / Netlify / Cloudflare / Render。'
  },
  'MiniMax-AI/skills': {
    descriptionEn:
      "MiniMax's official skill collection: a PPT generation suite covering colour, layout and per-slide orchestration, document and multimodal toolkits, and engineering conventions for Android, iOS, Flutter and web development.",
    aboutZh:
      'MiniMax 官方技能集：PPT 生成套件（配色、版式、逐页编排），文档与多模态工具包，以及 Android、iOS、Flutter 与前后端开发的工程规范。'
  }
}

const catalog = JSON.parse(readFileSync(file, 'utf8'))
const gaps = []
let filled = 0

// A field that exists but says nothing is as useless as a missing one — the
// repository's own one-liner ("Skills Catalog for Codex") is not a description.
const MIN = 25
const thin = (v) => !v || v.trim().length < MIN

for (const repo of catalog.repos) {
  const needsZh = thin(repo.aboutZh)
  const needsEn = thin(repo.descriptionEn)
  if (!needsZh && !needsEn) continue

  const copy = COPY[repo.fullName]
  if (!copy) {
    gaps.push(repo.fullName)
    continue
  }
  if (needsEn) {
    repo.descriptionEn = copy.descriptionEn
    filled++
  }
  if (needsZh) {
    repo.aboutZh = copy.aboutZh
    filled++
  }
}

if (gaps.length) {
  console.error('以下仓库缺少中英文介绍，且没有对应的人工文案：')
  for (const g of gaps) console.error(`  - ${g}`)
  console.error('\n请在 scripts/fill-missing-blurbs.mjs 的 COPY 中补上后再重跑。')
  process.exit(1)
}

if (checkOnly) {
  console.log(filled === 0 ? 'PASS — 所有条目都有中英文介绍' : `需要补写 ${filled} 处`)
  process.exit(filled === 0 ? 0 : 1)
}

if (filled) {
  writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
}
console.log(`已补写 ${filled} 处中英文介绍`)
