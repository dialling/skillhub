#!/usr/bin/env node
/**
 * Bilingual completeness audit.
 *
 *   node scripts/i18n-audit.mjs [--json]
 *
 * The app must never show Chinese in English mode, nor a raw `some.key` in
 * either mode. Two failure modes are checked:
 *
 *   1. HARDCODED  — a Chinese string literal in renderer code, or a Chinese
 *                   message in the main process that is surfaced through IPC.
 *                   These appear verbatim in English mode.
 *   2. MISSING    — a `t('…')` key that has no dictionary entry, so the UI
 *                   renders the key itself.
 *
 * Comments are stripped before scanning, so Chinese comments are not flagged.
 * Exit code is non-zero when anything is found, which makes this usable as a
 * build gate.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const asJson = process.argv.includes('--json')

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'out') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** Remove block and line comments while keeping line numbers stable. */
function stripComments(src) {
  let out = ''
  let i = 0
  let state = 'code'
  let quote = ''
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (state === 'code') {
      if (c === '/' && n === '*') {
        state = 'block'
        out += '  '
        i += 2
        continue
      }
      if (c === '/' && n === '/') {
        state = 'line'
        out += '  '
        i += 2
        continue
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c
        state = 'string'
      }
      out += c
      i++
      continue
    }
    if (state === 'block') {
      if (c === '*' && n === '/') {
        state = 'code'
        out += '  '
        i += 2
        continue
      }
      out += c === '\n' ? '\n' : ' '
      i++
      continue
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += '\n'
        i++
        continue
      }
      out += ' '
      i++
      continue
    }
    // inside a string literal
    if (c === '\\') {
      out += c + (n ?? '')
      i += 2
      continue
    }
    if (c === quote) state = 'code'
    out += c
    i++
  }
  return out
}

/* ----------------------------------------------------------- dictionary --- */

const i18nPath = join(root, 'src', 'renderer', 'src', 'i18n.ts')
const i18nSrc = readFileSync(i18nPath, 'utf8')
const dictKeys = new Set([...i18nSrc.matchAll(/^\s*'([^']+)':\s*\[/gm)].map((m) => m[1]))

const usedKeys = new Map() // key -> [{file, line}]
for (const file of walk(join(root, 'src', 'renderer', 'src'))) {
  if (file === i18nPath) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(/\bt\(\s*'([^']+)'/g)) {
      if (!usedKeys.has(m[1])) usedKeys.set(m[1], [])
      usedKeys.get(m[1]).push({ file: relative(root, file), line: idx + 1 })
    }
  })
}

const missing = [...usedKeys.entries()]
  .filter(([key]) => !dictKeys.has(key))
  .map(([key, refs]) => ({ key, refs: refs.slice(0, 3), uses: refs.length }))

/**
 * A dictionary entry whose two languages are identical is almost always an
 * entry someone forgot to translate — that is exactly how English leaks into
 * Chinese mode. A short allowlist covers strings that are legitimately the same
 * in both (language names, protocol names, symbols).
 */
const SAME_IN_BOTH = new Set([
  // Language names are conventionally written in their own language.
  'lang.zh',
  'lang.en',
  'common.en',
  // Product names.
  'app.name',
  'card.viewRepo',
  'settings.github',
  'profile.src.gh-cli'
])

const untranslated = []
for (const m of i18nSrc.matchAll(/^\s*'([^']+)':\s*\[\s*'([^']*)',\s*'([^']*)'\s*\]/gm)) {
  const [, key, zh, en] = m
  if (zh === en && !SAME_IN_BOTH.has(key) && /[A-Za-z]/.test(zh)) untranslated.push({ key, value: zh })
}

/* ------------------------------------------------------------- hardcoded --- */

const hardcoded = []

/** Renderer: any CJK left in code (comments already stripped) is UI-facing. */
for (const file of walk(join(root, 'src', 'renderer', 'src'))) {
  if (file === i18nPath) continue
  const stripped = stripComments(readFileSync(file, 'utf8'))
  stripped.split('\n').forEach((line, idx) => {
    if (!CJK.test(line)) return
    // Template keys built with interpolation are fine (the value is a key).
    hardcoded.push({
      file: relative(root, file),
      line: idx + 1,
      text: line.trim().slice(0, 110),
      area: 'renderer'
    })
  })
}

/**
 * Main process: Chinese in messages that travel to the UI through IPC is a real
 * leak, but Chinese in console.* logging is not. Flag the former only.
 */
for (const file of walk(join(root, 'src', 'main'))) {
  // cli.ts and selftest.ts are terminal tools, not the app UI: their output is
  // intentionally Chinese-only and never reaches the window. msg.ts is the
  // main-process dictionary, so it is bilingual by definition.
  if (/\/(cli|selftest|msg)\.ts$/.test(file)) continue
  const stripped = stripComments(readFileSync(file, 'utf8'))
  stripped.split('\n').forEach((line, idx) => {
    if (!CJK.test(line)) return
    if (/console\.(log|warn|error|info)/.test(line)) return
    // Bilingual data fields (`descriptionZh` next to `descriptionEn`, etc.) are
    // content with a counterpart, not a UI string that forgot to be translated.
    if (/\b\w+Zh\s*:/.test(line)) return
    hardcoded.push({ file: relative(root, file), line: idx + 1, text: line.trim().slice(0, 110), area: 'main' })
  })
}

/* ------------------------------------------------------------------ report --- */

if (asJson) {
  console.log(JSON.stringify({ dictKeys: dictKeys.size, missing, hardcoded, untranslated }, null, 2))
} else {
  console.log(`字典词条 ${dictKeys.size} 条 · 代码中引用 ${usedKeys.size} 条\n`)

  console.log(`✗ 缺失词条（界面会直接显示 key 本身）：${missing.length}`)
  for (const m of missing) console.log(`   ${m.key}  ← ${m.refs[0]?.file}:${m.refs[0]?.line}  (${m.uses} 处)`)

  const renderer = hardcoded.filter((h) => h.area === 'renderer')
  const main = hardcoded.filter((h) => h.area === 'main')
  console.log(`\n✗ 渲染层硬编码中文（英文模式下仍显示中文）：${renderer.length}`)
  for (const h of renderer) console.log(`   ${h.file}:${h.line}  ${h.text}`)

  console.log(`\n✗ 主进程面向用户的硬编码中文（经 IPC 显示）：${main.length}`)
  for (const h of main) console.log(`   ${h.file}:${h.line}  ${h.text}`)

  console.log(`\n✗ 未翻译的词条（中英相同 → 中文模式下会显示英文）：${untranslated.length}`)
  for (const u of untranslated) console.log(`   ${u.key} = ${JSON.stringify(u.value)}`)
}

const failed = missing.length + hardcoded.length + untranslated.length
console.log(`\n${failed === 0 ? 'PASS — 无缺失、无硬编码' : `FAIL — ${failed} 项待处理`}`)
process.exit(failed === 0 ? 0 : 1)
