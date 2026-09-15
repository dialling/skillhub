#!/usr/bin/env node
/**
 * Check the launch metadata for the mistakes that make a launch do nothing.
 *
 * This exists because the table is hand-written and was wrong in ways nobody
 * could see: DeepSeek Harness was recorded as a terminal tool that takes a
 * prompt, when its CLI is a profile booter and the form people use is the app;
 * `kimi "text"` was recorded as valid when kimi reads a bare string as a
 * subcommand and fails with "unknown command"; `pi` was recorded as taking no
 * prompt when its usage line ends in `[messages...]`.
 *
 * Structure is checkable without the tool installed, so that is what is checked
 * here; whether a given tool's form is *correct* still needs a human or a
 * research pass, and the entries carry a source URL for that reason.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const registry = JSON.parse(readFileSync(join(root, 'data', 'agent-registry.json'), 'utf8'))
const agents = registry.agents || registry

const problems = []
const KINDS = new Set(['cli', 'app', 'web'])

for (const a of agents) {
  const l = a.launch
  if (!l) continue
  const where = `agent "${a.id}"`

  if (!KINDS.has(l.kind)) {
    problems.push(`${where}: unknown launch kind "${l.kind}"`)
    continue
  }

  if (l.kind === 'cli') {
    if (!l.command) problems.push(`${where}: cli launch without a command`)
    // `promptArgs` is the current shape: literal tokens placed before the prompt,
    // empty meaning a plain positional. The older style/flag fields are still
    // read, so both are validated and mixing them is refused.
    if (l.promptArgs !== undefined) {
      if (!Array.isArray(l.promptArgs)) {
        problems.push(`${where}: promptArgs must be an array`)
      } else {
        for (const token of l.promptArgs) {
          if (typeof token !== 'string' || !/^[\w-]+$/.test(token)) {
            // Tokens end up in a shell command line; anything else is refused
            // rather than sanitised into something surprising.
            problems.push(`${where}: promptArgs token "${token}" is not a bare word`)
          }
        }
      }
      if (l.promptStyle !== undefined || l.promptFlag !== undefined || l.promptArg !== undefined) {
        problems.push(`${where}: promptArgs is set alongside the legacy prompt fields`)
      }
    } else {
      if (l.promptStyle && !['positional', 'flag', 'none'].includes(l.promptStyle)) {
        problems.push(`${where}: unknown promptStyle "${l.promptStyle}"`)
      }
      if (l.promptStyle === 'flag' && !l.promptFlag) {
        problems.push(`${where}: promptStyle "flag" without a promptFlag`)
      }
      if (l.promptStyle === 'positional' && l.promptFlag) {
        problems.push(`${where}: promptFlag is set but promptStyle is "positional"`)
      }
      if (l.promptStyle && l.promptArg !== undefined) {
        problems.push(`${where}: both promptStyle and the legacy promptArg are set`)
      }
    }
  }

  if (l.kind === 'app' && !l.appName) {
    problems.push(`${where}: app launch without an appName`)
  }
  if (l.kind === 'web' && !/^https?:\/\//.test(l.url || '')) {
    problems.push(`${where}: web launch without an http(s) url`)
  }
  if (!l.instructionFile) {
    problems.push(`${where}: no instructionFile`)
  }
}

/* Two agents pointing at one command with the same form are duplicates in the
   launch list — the user sees two rows that do the same thing. */
const seen = new Map()
for (const a of agents) {
  const l = a.launch
  if (!l || l.kind !== 'cli' || !l.command) continue
  const key = `${l.command}|${(l.promptArgs || []).join(' ')}|${l.promptStyle || (l.promptArg ? 'positional' : 'none')}|${l.promptFlag || ''}`
  if (seen.has(key)) {
    problems.push(`duplicate launch: "${a.id}" and "${seen.get(key)}" both run ${l.command} identically`)
  } else {
    seen.set(key, a.id)
  }
}

if (problems.length) {
  console.log(`\n✗ 启动元数据有问题：${problems.length}\n`)
  for (const p of problems) console.log(`   ${p}`)
  process.exit(1)
}
console.log(`PASS — ${agents.filter((a) => a.launch).length} 条启动元数据结构正确`)
