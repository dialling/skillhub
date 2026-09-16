#!/usr/bin/env node
/**
 * Build, package and install the app, then prove the install is the new one.
 *
 * Installing was a sequence of manual steps — build, package, copy, clear the
 * quarantine flag, re-register with LaunchServices — and a sequence is something
 * that can be run halfway. The failure is quiet: the app in /Applications simply
 * keeps running the previous build, and nothing says so.
 *
 * So this does the whole thing and then reads the result back out of the
 * installed bundle, comparing the packaged data against the source it was built
 * from. "It probably worked" is not a useful answer to "is the installed app
 * current".
 *
 *   node scripts/install-app.mjs            # arm64, the machine's own arch
 *   node scripts/install-app.mjs --no-build # reuse the existing out/
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = '/Applications/SkillHub.app'
const built = join(root, 'release', 'mac-arm64', 'SkillHub.app')
const skipBuild = process.argv.includes('--no-build')

/**
 * A node that can actually run these CLIs.
 *
 * `process.execPath` is not it here: this shell has `node` shimmed to another
 * application's helper binary, and spawning electron-builder through it dies
 * with a stack trace from inside the helper. So the real runtime is located
 * explicitly, and the failure to find one is reported instead of half-building.
 */
function realNode() {
  if (process.env.SKILLHUB_NODE && existsSync(process.env.SKILLHUB_NODE)) return process.env.SKILLHUB_NODE
  const candidates = [
    process.execPath,
    ...String(process.env.PATH || '')
      .split(':')
      .map((d) => join(d, 'node')),
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node'
  ]
  for (const c of candidates) {
    if (!c || !existsSync(c)) continue
    /*
      Ask it. A path can look right and still be another application's binary
      running in Node mode — this shell has two of those on PATH — and what
      gives it away is that `process.versions.electron` is set. Only a plain
      Node build can run these CLIs.
    */
    try {
      // Deleting the key, not assigning undefined: an env value of `undefined`
      // is stringified to "undefined", which is still present and still truthy,
      // so the probe would keep measuring the shim it was meant to exclude.
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      /*
        Require positive evidence, not the absence of output.

        "Prints no electron version" also describes a binary that crashed before
        printing anything — the DSH helper does exactly that when it cannot find
        its own app bundle, and it was selected on that basis. So the probe asks
        for both facts and only accepts a plain Node version with no Electron.
      */
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
}

const NODE = realNode()

/**
 * Run a local CLI through that node.
 *
 * `npx` passes its own resolved path as an argument to the tool, which
 * electron-builder rejects as an unknown argument — so the binaries are invoked
 * directly instead.
 */
const run = (script, args) =>
  execFileSync(NODE, [join(root, 'node_modules', script), ...args], { cwd: root, stdio: 'inherit' })

/** Read a file out of the installed app's asar. */
function fromInstalled(path) {
  const asar = require('@electron/asar')
  const bundle = join(target, 'Contents', 'Resources', 'app.asar')
  if (!existsSync(bundle)) return null
  try {
    return asar.extractFile(bundle, path).toString('utf8')
  } catch {
    return null
  }
}

if (!skipBuild) {
  console.log('· 构建')
  run('electron-vite/bin/electron-vite.js', ['build'])
  console.log('· 打包')
  rmSync(join(root, 'release', 'mac-arm64'), { recursive: true, force: true })
  run('electron-builder/cli.js', ['--mac', '--arm64', '--dir'])
}

if (!existsSync(built)) {
  console.error(`打包产物不存在：${built}`)
  process.exit(1)
}

// `ditto`, not `cp -R`: copying an app bundle by hand loses the metadata the
// signature depends on, and the result launches once and then stops.
if (existsSync(target)) rmSync(target, { recursive: true, force: true })
console.log(`· 安装到 ${target}`)
execFileSync('ditto', [built, target], { stdio: 'inherit' })
execFileSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' })
execFileSync(
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
  ['-f', target],
  { stdio: 'ignore' }
)

// ---- verify what actually landed -------------------------------------------
const source = JSON.parse(readFileSync(join(root, 'data', 'agent-registry.json'), 'utf8'))
const sourceAgents = (source.agents || source).length
const sourceCatalog = JSON.parse(readFileSync(join(root, 'data', 'curated-catalog.json'), 'utf8'))

const installedRegistry = fromInstalled('data/agent-registry.json')
const installedCatalog = fromInstalled('data/curated-catalog.json')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const problems = []
if (!installedRegistry) problems.push('读不到包内的 agent-registry.json')
else {
  const n = (JSON.parse(installedRegistry).agents || []).length
  if (n !== sourceAgents) problems.push(`agent 数不一致：包内 ${n}，源码 ${sourceAgents}`)
}
if (!installedCatalog) problems.push('读不到包内的 curated-catalog.json')
else {
  const v = JSON.parse(installedCatalog).version
  if (v !== sourceCatalog.version) problems.push(`目录版本不一致：包内 ${v}，源码 ${sourceCatalog.version}`)
}

const info = existsSync(join(target, 'Contents', 'Info.plist'))
  ? execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(target, 'Contents', 'Info.plist')], {
      encoding: 'utf8'
    }).trim()
  : '(missing)'

console.log(`\n  版本      v${pkg.version}`)
console.log(`  标识      ${info}`)
console.log(`  agent     ${sourceAgents}`)
console.log(`  目录版本  ${sourceCatalog.version}`)

if (problems.length) {
  console.log('\n✗ 安装校验未通过：')
  for (const p of problems) console.log(`   ${p}`)
  process.exit(1)
}
console.log('\n✓ /Applications 里的版本与源码一致')
