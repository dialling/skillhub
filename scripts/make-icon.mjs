#!/usr/bin/env node
/**
 * Build the application icon from `build/icon-src.svg`.
 *
 *   node scripts/make-icon.mjs
 *
 * Electron renders the SVG (it is the only vector rasteriser guaranteed to be
 * present — the project has no image dependencies and macOS ships no SVG
 * converter), `sips` produces the sizes, and `iconutil` packs the `.icns`. The
 * SVG is the source of truth: the icon is regenerated, never hand-edited pixel
 * by pixel, so a change to the mark is one file and one command.
 *
 * Writes build/icon.icns (macOS) and build/icon.png (1024, used by Linux and as
 * electron-builder's Windows fallback).
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const build = join(root, 'build')
const svgPath = join(build, 'icon-src.svg')
const master = join(build, 'icon-1024.png')

if (!existsSync(svgPath)) {
  console.error(`✗ 找不到 ${svgPath}`)
  process.exit(1)
}

const svg = readFileSync(svgPath, 'utf8')

/*
 * A dedicated renderer script rather than the app itself: the icon build must
 * not need the app to compile, and it must not touch the user's real state.
 */
const renderer = join(build, '.icon-render.cjs')
writeFileSync(
  renderer,
  `const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const svg = ${JSON.stringify(svg)}
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  const html = '<html><body style="margin:0;background:transparent">' + svg + '</body></html>'
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // decodeURIComponent needs the SVG to be laid out before the capture
  await new Promise((r) => setTimeout(r, 400))
  const image = await win.webContents.capturePage()
  writeFileSync(${JSON.stringify(master)}, image.toPNG())
  app.exit(0)
})
`,
  'utf8'
)

const electron = require('electron')
const bin =
  typeof electron === 'string'
    ? electron
    : join(
        root,
        'node_modules',
        'electron',
        'dist',
        process.platform === 'darwin'
          ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
          : process.platform === 'win32'
            ? 'electron.exe'
            : 'electron'
      )

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

try {
  execFileSync(bin, [renderer], { stdio: 'inherit', cwd: root, env })
} finally {
  rmSync(renderer, { force: true })
}

if (!existsSync(master)) {
  console.error('✗ Electron 没有产出 PNG')
  process.exit(1)
}

/* macOS: the ten representations `iconutil` requires, each rendered from the
   1024 master with sips rather than by scaling the browser rasteriser. */
const iconset = join(build, 'icon.iconset')
rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset, { recursive: true })

const sizes = [16, 32, 64, 128, 256, 512]
for (const size of sizes) {
  for (const scale of [1, 2]) {
    const px = size * scale
    if (px > 1024) continue
    const out = join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)
    execFileSync('sips', ['-z', String(px), String(px), master, '--out', out], { stdio: 'pipe' })
  }
}
copyFileSync(master, join(iconset, 'icon_512x512@2x.png'))

execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'icon.icns')], { stdio: 'pipe' })
rmSync(iconset, { recursive: true, force: true })
copyFileSync(master, join(build, 'icon.png'))

const bytes = (p) => `${Math.round(readFileSync(p).length / 1024)} KB`
console.log(`✓ build/icon.icns  ${bytes(join(build, 'icon.icns'))}`)
console.log(`✓ build/icon.png   ${bytes(join(build, 'icon.png'))}  (1024×1024)`)
