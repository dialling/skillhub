import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { registerIpc } from './ipc'
import { flushAll, settings, snapshotStars } from './core/db'
import { libraryItems } from './core/library'
import { curatedCatalog } from './core/catalog'
import { ensureEnabledAgents } from './core/agents'
import { m } from './core/msg'
import { electronDefaultIconPath } from './core/paths'
import { isLinux, isMac } from './core/platform'
import { probeRawHost } from './core/github'

// When ELECTRON_RUN_AS_NODE is present in the environment the Electron binary
// boots as plain Node: `require('electron')` then resolves to the npm shim and
// every `app.*` call is undefined. Fail with an actionable message instead of a
// cryptic TypeError from deep inside a module initialiser.
if (!app || typeof app.getPath !== 'function') {
  const detail = m('boot.nodeModeDetail')
  const title = m('boot.nodeModeTitle')
  const button = m('boot.ok')
  /*
    Say it out loud, because stderr goes nowhere when a GUI app is launched.

    On this machine ELECTRON_RUN_AS_NODE is exported globally, and `open` passes
    the launching shell's environment to the app — so an app started from such a
    shell died here and left nothing behind: no window, no message, no crash
    report, and a stderr line nobody was reading. Diagnosing that took far longer
    than it should have. A dialog cannot be missed.

    AppleScript rather than Electron's dialog: in Node mode `require('electron')`
    yields the path of the Electron binary rather than the module, so the one API
    that could report this is the one that is missing.
  */
  try {
    execFileSync(
      'osascript',
      ['-e', `display dialog ${JSON.stringify(detail)} with title ${JSON.stringify(title)} buttons {${JSON.stringify(button)}} default button 1 with icon caution`],
      { stdio: 'ignore', timeout: 120000 }
    )
  } catch {
    /* the dialog is best-effort */
  }
  console.error(`\n[SkillHub] ${detail}\n`)
  process.exit(1)
}

// Must happen before `ready`: this is the name the menu bar and About panel use.
app.setName('SkillHub')

let mainWindow: BrowserWindow | null = null

/**
 * WeChat DevTools ships Electron's stock bundle identifier, so this machine has
 * two apps registered as `com.github.Electron` and the Dock picks the one in
 * /Applications. Pinning the icon here takes that decision away from
 * LaunchServices. A unique bundle id (i.e. actually packaging the app) is the
 * permanent fix.
 */
function pinDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const iconPath = electronDefaultIconPath()
  if (!iconPath) return
  const image = nativeImage.createFromPath(iconPath)
  if (!image.isEmpty()) app.dock.setIcon(image)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    backgroundColor: '#0a0d14',
    // Window chrome differs per platform. macOS keeps the inset traffic lights;
    // Windows gets its controls overlaid on our titlebar (right-hand side, which
    // is what the win32 padding in styles.css reserves room for); Linux keeps a
    // normal frame, since overlay support varies by window manager.
    //
    // Without the overlay, `hiddenInset` on Windows produces a frameless window
    // with no controls at all — the window cannot be closed or minimised.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } }
      : isLinux
        ? {}
        : {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: { color: '#0a0e16', symbolColor: '#a2b2cc', height: 46 }
          }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Headless verification aid:
  //   --shot=<path.png> [--shot-delay=8000] [--eval="<js>"] [--shot-settle=1200]
  // Renders the window, optionally drives it, writes a PNG and exits. This is
  // how UI states that need interaction (a scrolled list, an open detail panel)
  // get verified without a human in the loop.
  const shot = process.argv.find((a) => a.startsWith('--shot='))
  if (shot) {
    const target = shot.slice('--shot='.length)
    const delayArg = process.argv.find((a) => a.startsWith('--shot-delay='))
    const delay = delayArg ? Number(delayArg.split('=')[1]) || 6000 : 6000
    const evalArg = process.argv.find((a) => a.startsWith('--eval='))
    const evalScript = evalArg ? evalArg.slice('--eval='.length) : null
    const settleArg = process.argv.find((a) => a.startsWith('--shot-settle='))
    const settle = settleArg ? Number(settleArg.split('=')[1]) || 1200 : 1200

    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (evalScript) {
            const result = await mainWindow!.webContents.executeJavaScript(
              `(async () => { ${evalScript} })()`,
              true
            )
            if (result !== undefined) console.log('[SkillHub] eval →', JSON.stringify(result))
            await new Promise((r) => setTimeout(r, settle))
          }
          const image = await mainWindow!.webContents.capturePage()
          const { writeFileSync, mkdirSync } = await import('node:fs')
          const { dirname } = await import('node:path')
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, image.toPNG())
          console.log(`[SkillHub] screenshot written to ${target}`)
        } catch (err) {
          console.error('[SkillHub] screenshot failed', err)
        }
        app.exit(0)
      }, delay)
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: m('menu.edit'),
      submenu: [
        { role: 'undo', label: m('menu.undo') },
        { role: 'redo', label: m('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: m('menu.cut') },
        { role: 'copy', label: m('menu.copy') },
        { role: 'paste', label: m('menu.paste') },
        { role: 'selectAll', label: m('menu.selectAll') }
      ]
    },
    {
      label: m('menu.view'),
      submenu: [
        { role: 'reload', label: m('menu.reload') },
        { role: 'toggleDevTools', label: m('menu.devtools') },
        { type: 'separator' },
        { role: 'resetZoom', label: m('menu.actualSize') },
        { role: 'zoomIn', label: m('menu.zoomIn') },
        { role: 'zoomOut', label: m('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: m('menu.fullscreen') }
      ]
    },
    {
      label: m('menu.window'),
      submenu: [
        { role: 'minimize', label: m('menu.minimize') },
        { role: 'zoom', label: m('menu.zoomWindow') },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: 'close', label: m('menu.close') }] as Electron.MenuItemConstructorOptions[]))
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Once per day, record star counts so growth rankings become exact locally. */
async function dailySnapshot(): Promise<void> {
  const last = settings.get().curatedUpdatedAt || 0
  if (Date.now() - last < 12 * 3600_000) return
  try {
    for (const item of libraryItems()) {
      if (item.meta?.stars) snapshotStars(item.fullName, item.meta.stars)
    }
    const repos = await curatedCatalog()
    for (const r of repos) snapshotStars(r.fullName, r.stars)
  } catch (err) {
    console.error('[main] daily snapshot failed', err)
  }
}

app.whenReady().then(() => {
  pinDockIcon()
  buildMenu()
  registerIpc((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  })
  createWindow()
  ensureEnabledAgents()
  setTimeout(() => {
    void dailySnapshot()
  }, 4000)

  // Resolve raw.githubusercontent.com reachability before the user needs it.
  setTimeout(() => {
    void curatedCatalog()
      .then((repos) => {
        const first = repos.find((r) => (r.skillDirs || []).length)
        if (first) return probeRawHost(first.fullName, first.defaultBranch || 'main')
      })
      .catch(() => {})
  }, 1500)

  // The application menu is built from the current language, so rebuild it
  // whenever the renderer switches language.
  ipcMain.handle('menu:rebuild', () => {
    buildMenu()
    return true
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  flushAll()
})
