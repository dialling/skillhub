#!/usr/bin/env node
/**
 * Guards the code against re-acquiring macOS-only assumptions.
 *
 *   node scripts/crossplatform-audit.mjs
 *
 * Every rule below was a real defect that either crashed or silently misbehaved
 * on Windows:
 *   /bin/sh does not exist          → use which() in core/platform.ts
 *   POSIX symlinks need elevation   → use a junction on Windows
 *   a minimal PATH (Finder launch)  → resolve binaries, do not assume a shell
 *   `\` vs `/`                      → use path.dirname / normalized comparison
 *
 * A rule may be waived per file, but only with a stated reason. Exit code is
 * non-zero when anything is unwaived, so this gates a build like the i18n audit.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const RULES = [
  {
    id: 'posix-shell',
    what: '依赖 /bin/sh —— Windows 没有，改用 platform.ts 的 which()',
    test: (line) => /['"]\/bin\/sh['"]/.test(line),
    waived: { 'src/main/core/platform.ts': '这是唯一允许调用 POSIX shell 的地方，which() 在此分平台' }
  },
  {
    id: 'mac-only-binary-paths',
    what: '硬编码 macOS 二进制目录 —— 应通过 which() 解析，或放入平台分支',
    test: (line) => /['"]\/(opt\/homebrew|usr\/local\/bin|usr\/bin)\//.test(line),
    waived: {
      'src/main/core/platform.ts': 'loginShellDirs() 就是各平台 PATH 补充目录的定义处',
      'src/main/core/github.ts': 'findGh() 的 macOS 分支，Windows 分支在同一个 isWindows 三元里',
      'scripts/release.mjs':
        '与 install-app.mjs 同理：这个脚本做的是 macOS 发布（打包 dmg、调用 gh 发 Release、安装 .app），本身没有跨平台形态。那几行是查找纯 Node 运行时的候选目录，找不到会回退到 process.execPath，不是平台分支逻辑。',
      'scripts/install-app.mjs':
        '这个脚本只做 macOS 安装（ditto 拷贝 .app 到 /Applications、重登记 LaunchServices、读 Info.plist），本身没有跨平台形态。那几行是查找一个纯 Node 运行时的候选目录，不是平台分支逻辑 —— 找不到就回退到 process.execPath，不会因为路径不存在而失败。'
    }
  },
  {
    id: 'posix-symlink',
    what: "创建 POSIX 目录符号链接 —— Windows 需要管理员或开发者模式，应使用 'junction'",
    test: (line) => /symlinkSync\([^)]*['"]dir['"]/.test(line),
    // satisfied when the same file branches on Windows and falls back to a copy
    requires: (source) => /isWindows/.test(source) && /junction/.test(source),
    waived: {}
  },
  {
    id: 'manual-path-split',
    what: "手工用 '/' 切分文件系统路径 —— Windows 用 '\\'，应使用 path.dirname",
    test: (line) => /\.slice\([^)]*lastIndexOf\(['"]\/['"]\)/.test(line),
    waived: {
      'src/main/core/github.ts': '切分的是 GitHub 文件树路径，该 API 始终使用 /，与本地文件系统无关'
    }
  },
  {
    id: 'hardcoded-electron-app',
    what: '硬编码 Electron.app 路径 —— Windows 是 electron.exe，Linux 是 electron',
    test: (line) => /['"]Electron\.app['"]/.test(line),
    waived: {
      'src/main/core/paths.ts': '只在 macOS 分支调用（pinDockIcon 先行 return），且用于取 .icns',
      'scripts/run.mjs': '位于 process.platform 三元表达式的 darwin 分支内'
    }
  }
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (['node_modules', 'out', 'dist', 'release'].includes(name)) continue
      walk(full, out)
    } else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/*
  Consistency rules. These catch a different failure than the pattern rules above:
  not "the code uses a macOS-only API" but "two halves of one feature disagree".
  They exist because a claimed platform branch was once committed in a message
  while the edit silently did not apply, and no single-file check could see it.
*/
const CONSISTENCY = [
  {
    what: 'CSS 为 Windows 预留了窗口控件空间，主进程却没有设置 titleBarOverlay（窗口将无法关闭）',
    check: (read) => {
      const css = read('src/renderer/src/styles.css') || ''
      const main = read('src/main/index.ts') || ''
      if (!/data-platform='win32'/.test(css)) return null
      if (/titleBarOverlay/.test(main)) return null
      return "styles.css 里有 html[data-platform='win32'] .titlebar 的留白，但 index.ts 从未设置 titleBarOverlay"
    }
  },
  {
    what: 'CSS 为 macOS 预留了红绿灯空间，主进程却没有使用 hiddenInset',
    check: (read) => {
      const css = read('src/renderer/src/styles.css') || ''
      const main = read('src/main/index.ts') || ''
      if (!/data-platform='darwin'/.test(css)) return null
      if (/titleBarStyle:\s*'hiddenInset'/.test(main)) return null
      return "styles.css 为 darwin 留了 92px，但 index.ts 没有 hiddenInset，标题栏会白白空出一块"
    }
  }
]

const findings = []
let waivedCount = 0

for (const file of [...walk(join(root, 'src')), ...walk(join(root, 'scripts'))]) {
  const rel = relative(root, file)
  const source = readFileSync(file, 'utf8')
  source.split('\n').forEach((line, i) => {
    // shebangs are correct as-is, and comments are not code
    if (line.startsWith('#!')) return
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '')
    for (const rule of RULES) {
      if (!rule.test(code)) continue
      if (rule.requires && rule.requires(source)) {
        waivedCount++
        continue
      }
      if (rule.waived[rel]) {
        waivedCount++
        continue
      }
      findings.push({ rule: rule.id, what: rule.what, file: rel, line: i + 1, text: line.trim().slice(0, 100) })
    }
  })
}

for (const rule of CONSISTENCY) {
  const problem = rule.check((rel) => {
    try {
      return readFileSync(join(root, rel), 'utf8')
    } catch {
      return null
    }
  })
  if (problem) findings.push({ rule: 'consistency', what: rule.what, file: '(跨文件)', line: 0, text: problem })
}

if (!findings.length) {
  console.log(`PASS — 未发现未处理的平台专属写法（已豁免 ${waivedCount} 处，均有书面理由），跨文件一致性检查通过`)
  process.exit(0)
}

console.log(`发现 ${findings.length} 处平台相关问题：\n`)
for (const f of findings) console.log(`  ${f.file}:${f.line}\n    [${f.rule}] ${f.what}\n    ${f.text}\n`)
process.exit(1)
