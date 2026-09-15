#!/usr/bin/env node
/**
 * Launcher that guarantees the Electron runtime is enabled.
 *
 * Some shells (including the one this project was developed in) export
 * ELECTRON_RUN_AS_NODE=1 globally. When that variable exists — even as an empty
 * string, because Electron only checks for its presence — the Electron binary
 * boots as plain Node: `require('electron')` resolves to the npm shim and every
 * `app.*` call is undefined.
 *
 *   node scripts/run.mjs --electron .            # run the built app
 *   node scripts/run.mjs electron-vite dev       # run a local bin with a clean env
 */
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

/**
 * Give the development run its own identity on macOS.
 *
 * Unpackaged, the app executes `node_modules/electron/dist/Electron.app`, whose
 * bundle identifier is Electron's stock `com.github.Electron`. WeChat DevTools
 * was packaged without changing that identifier, so on this machine two apps
 * claim it and LaunchServices hands every bundle-driven surface — the app
 * switcher, the Force Quit window — the WeChat icon. `app.dock.setIcon()` only
 * covers the Dock, which is why the tile looked right while everything else did
 * not.
 *
 * A bundle identifier cannot be changed from inside a running process, so the
 * stock bundle is copied once and its Info.plist rewritten. ~200 MB on first
 * run, then it is reused.
 */
function devBundle(original) {
  if (process.platform !== 'darwin') return original
  const target = join(homedir(), '.skillhub', 'dev-app', 'SkillHub Dev.app')
  const plist = join(target, 'Contents', 'Info.plist')
  const stamp = join(target, 'Contents', 'Resources', '.skillhub-stamp')
  // original is <Bundle>.app/Contents/MacOS/Electron
  const sourceBundle = dirname(dirname(dirname(original)))
  const sourcePlist = join(sourceBundle, 'Contents', 'Info.plist')
  try {
    const sourceVersion = readFileSync(sourcePlist, 'utf8').length
    if (!existsSync(plist) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== String(sourceVersion)) {
      mkdirSync(dirname(target), { recursive: true })
      // `ditto` is the macOS-native way to copy an app bundle: it preserves the
      // framework's internal symlink structure. `fs.cpSync` produced a bundle
      // that could not find its own ICU data, because Electron's frameworks are
      // built out of relative symlinks that a naive recursive copy breaks.
      execFileSync('ditto', [sourceBundle, target], { stdio: 'pipe' })
      for (const [key, value] of [
        ['CFBundleIdentifier', 'com.dialling.skillhub.dev'],
        ['CFBundleName', 'SkillHub Dev'],
        ['CFBundleDisplayName', 'SkillHub Dev']
      ]) {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], { stdio: 'pipe' })
      }
      writeFileSync(stamp, String(sourceVersion), 'utf8')
      console.log(`[run] 已为开发版生成独立 bundle：${target}`)
    }
    return join(target, 'Contents', 'MacOS', 'Electron')
  } catch (err) {
    console.warn(`[run] 生成独立 bundle 失败，回退到原始 Electron：${err.message}`)
    return original
  }
}

const argv = process.argv.slice(2)
let cmd
let args

if (argv[0] === '--electron') {
  const resolved = require('electron')
  // Under plain Node this is the path to the binary; under Electron it is the
  // module object, so fall back to the per-platform location.
  cmd =
    typeof resolved === 'string'
      ? resolved
      : join(
          root,
          'node_modules',
          'electron',
          'dist',
          process.platform === 'win32'
            ? 'electron.exe'
            : process.platform === 'darwin'
              ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
              : 'electron'
        )
  cmd = devBundle(cmd)
  args = argv.slice(1)
} else {
  // .cmd shims on Windows, plain shims elsewhere
  const names = process.platform === 'win32' ? [`${argv[0]}.cmd`, `${argv[0]}.exe`, argv[0]] : [argv[0]]
  const local = names.map((n) => join(root, 'node_modules', '.bin', n)).find((p) => existsSync(p))
  cmd = local || argv[0]
  args = argv.slice(1)
}

const child = spawn(cmd, args, { stdio: 'inherit', env, cwd: root })
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
child.on('error', (err) => {
  console.error(`[run] failed to launch ${cmd}:`, err.message)
  process.exit(1)
})
