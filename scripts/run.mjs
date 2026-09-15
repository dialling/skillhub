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
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

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
