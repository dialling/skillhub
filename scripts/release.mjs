#!/usr/bin/env node
/**
 * Cut a release: bump the version, tag it, publish it, install it.
 *
 * The version sat at 0.1.0 through 189 commits, which made the update check
 * useless in the only way that matters — a user could not tell what they had
 * from what was available, and "发现新版本 20260916" told them nothing about
 * whether the app itself had changed.
 *
 * A version is a promise about what is inside. Bumping it is the step that makes
 * the promise, so it is one command rather than a thing to remember.
 *
 *   node scripts/release.mjs patch        # 0.2.0 → 0.2.1
 *   node scripts/release.mjs minor        # 0.2.0 → 0.3.0
 *   node scripts/release.mjs major        # 0.2.0 → 1.0.0
 *   node scripts/release.mjs 0.4.2        # an explicit version
 *   node scripts/release.mjs minor --dry  # show what would happen
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const kind = args.find((a) => !a.startsWith('--')) || 'patch'

/**
 * A node that can actually run these CLIs — `process.execPath` is another
 * application's helper in this shell.
 */
const NODE = (() => {
  const candidates = [
    process.env.SKILLHUB_NODE,
    process.execPath,
    ...String(process.env.PATH || '').split(':').map((d) => join(d, 'node')),
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node'
  ].filter(Boolean)
  for (const c of candidates) {
    if (!existsSync(c)) continue
    try {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const out = execFileSync(
        c,
        ['-e', 'console.log("node=" + process.versions.node + " electron=" + (process.versions.electron || ""))'],
        // stderr suppressed: a rejected candidate may crash loudly on its way
        // out, and that noise is not this script's output.
        { encoding: 'utf8', timeout: 10000, env, stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim()
      if (/^node=\d+\.\d+\.\d+ electron=$/.test(out)) return c
    } catch {
      continue
    }
  }
  return process.execPath
})()

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: root, stdio: 'inherit', ...opts })

/** Run a local CLI through the real node (see install-app.mjs for why). */
function localCli(script, args) {
  const node = process.env.SKILLHUB_NODE || NODE
  execFileSync(node, [join(root, 'node_modules', script), ...args], { cwd: root, stdio: 'inherit' })
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const current = pkg.version

function nextVersion(from, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind
  const [maj, min, pat] = from.split('.').map(Number)
  if (kind === 'major') return `${maj + 1}.0.0`
  if (kind === 'minor') return `${maj}.${min + 1}.0`
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`
  console.error(`无法识别的版本类型：${kind}（可用 patch / minor / major，或直接给出 x.y.z）`)
  process.exit(1)
}

const next = nextVersion(current, kind)
const tag = `v${next}`

if (git('status', '--porcelain')) {
  console.error('工作区有未提交的改动，先提交或撤销再发布。')
  process.exit(1)
}
/*
  A missing tag makes `git rev-parse --verify` exit non-zero, so "the tag is
  free" arrives as an exception. Catching it is the check.
*/
let tagExists = true
try {
  execFileSync('git', ['rev-parse', '--verify', '--quiet', tag], { cwd: root, stdio: 'ignore' })
} catch {
  tagExists = false
}
if (tagExists) {
  console.error(`标签 ${tag} 已存在。`)
  process.exit(1)
}

console.log(`\n  ${current} → ${next}   (${tag})\n`)
if (dry) {
  console.log('  --dry：到此为止\n')
  process.exit(0)
}

// The gate runs before anything is published. Releasing something that does not
// pass its own checks is worse than not releasing.
console.log('· 门禁')
run('npm', ['run', 'verify'])

console.log('· 写入版本')
pkg.version = next
writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8')

console.log('· 提交并打标签')
run('git', ['add', 'package.json'])
run('git', ['commit', '-m', `release: ${tag}`])
run('git', ['tag', '-a', tag, '-m', tag])
run('git', ['push'])
run('git', ['push', 'origin', tag])

/*
  Build the installers before creating the release.

  The first release this script produced had no assets at all — while its own
  notes told the reader to download a `.dmg` that did not exist. The update check
  opens that page for the user, so a release without an installer is an update
  that cannot be completed. The artifacts are part of the release, not a step
  someone might remember afterwards.
*/
console.log('· 打包安装包')
localCli('electron-builder/cli.js', ['--mac', '--arm64'])

console.log('· 创建 GitHub Release')
const previous = (() => {
  try {
    return git('describe', '--tags', '--abbrev=0', `${tag}^`)
  } catch {
    return ''
  }
})()

/*
  Notes from the commits themselves rather than a hand-written list: the log is
  what actually happened, and a release note that drifts from it is worse than
  none. Only the subject line — the bodies are long and belong in the history.
*/
const range = previous ? `${previous}..${tag}` : tag
const subjects = git('log', '--no-merges', '--format=%s', range)
  .split('\n')
  .filter(Boolean)

/* eslint-disable no-irregular-whitespace */
const body = [
  `## ${tag}`,
  '',
  previous ? `自 ${previous} 以来的改动（${subjects.length} 项）：` : `首个版本，${subjects.length} 项改动：`,
  '',
  ...subjects.map((s) => `- ${s}`),
  '',
  '---',
  '',
  '安装：下载下面的 `SkillHub-' + next + '-arm64.dmg`，打开后把 SkillHub 拖进「应用程序」。',
  '',
  '> 本应用未做 Apple 开发者签名。首次打开若被拦截，右键图标 → 打开。'
].join('\n')

writeFileSync(join(root, '.release-notes.md'), body, 'utf8')
const assets = [`release/SkillHub-${next}-arm64.dmg`, `release/SkillHub-${next}-arm64-mac.zip`]
  .map((p) => join(root, p))
  .filter((p) => existsSync(p))
if (!assets.length) {
  console.error('没有生成任何安装包，发布中止。')
  process.exit(1)
}
try {
  run('gh', ['release', 'create', tag, '--title', `SkillHub ${tag}`, '--notes-file', join(root, '.release-notes.md'), ...assets])
} finally {
  execFileSync('rm', ['-f', join(root, '.release-notes.md')])
}
console.log(`· 已上传 ${assets.length} 个安装包`)

console.log('· 安装到 /Applications')
// Deleting the key rather than assigning undefined: an env value of `undefined`
// is stringified to "undefined", which is still present and still truthy.
const cleanEnv = { ...process.env }
delete cleanEnv.ELECTRON_RUN_AS_NODE
run('npm', ['run', 'install:app'], { env: cleanEnv })

console.log(`\n  ✓ ${tag} 已发布并安装\n`)
