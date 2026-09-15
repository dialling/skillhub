#!/usr/bin/env node
/**
 * Add "how do we start this thing" metadata to the agent registry.
 *
 *   node scripts/add-launch-metadata.mjs
 *
 * Knowing where an agent reads skills from is not enough to *use* one: the app
 * also has to be able to start the agent in a workspace with a prompt that says
 * which skill to apply. That needs per-agent launch knowledge:
 *
 *   kind: 'cli'   a terminal command, can be handed the prompt as an argument
 *   kind: 'app'   a GUI application opened at the workspace folder
 *   kind: 'web'   a hosted chat; we can only open it and copy the prompt
 *
 * `instructionFile` names the file that agent reads automatically at the start
 * of a session, so the active skill is announced even without a prompt argument.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'agent-registry.json')

const LAUNCH = {
  'claude-code': { kind: 'cli', command: 'claude', promptArg: true, instructionFile: 'CLAUDE.md' },
  codex: { kind: 'cli', command: 'codex', promptArg: true, instructionFile: 'AGENTS.md' },
  cursor: { kind: 'app', appName: 'Cursor', command: 'cursor', instructionFile: 'AGENTS.md' },
  'gemini-cli': { kind: 'cli', command: 'gemini', promptArg: true, instructionFile: 'GEMINI.md' },
  // Usage ends in `[messages...]`, so the prompt IS positional. The table had it
  // as promptArg: false, which meant the prompt was never passed at all.
  pi: { kind: 'cli', command: 'pi', promptStyle: 'positional', instructionFile: 'AGENTS.md' },
  'github-copilot': { kind: 'cli', command: 'copilot', promptArg: true, instructionFile: 'AGENTS.md' },
  windsurf: { kind: 'app', appName: 'Windsurf', command: 'windsurf', instructionFile: 'AGENTS.md' },
  cline: { kind: 'app', appName: 'Visual Studio Code', command: 'code', instructionFile: 'AGENTS.md' },
  opencode: { kind: 'cli', command: 'opencode', promptArg: true, instructionFile: 'AGENTS.md' },
  'roo-code': { kind: 'app', appName: 'Visual Studio Code', command: 'code', instructionFile: 'AGENTS.md' },
  'kilo-code': { kind: 'app', appName: 'Visual Studio Code', command: 'code', instructionFile: 'AGENTS.md' },
  'qwen-code': { kind: 'cli', command: 'qwen', promptArg: true, instructionFile: 'AGENTS.md' },
  amp: { kind: 'cli', command: 'amp', promptArg: true, instructionFile: 'AGENTS.md' },
  goose: { kind: 'cli', command: 'goose', promptArg: false, instructionFile: 'AGENTS.md' },
  zed: { kind: 'app', appName: 'Zed', command: 'zed', instructionFile: 'AGENTS.md' },
  trae: { kind: 'app', appName: 'Trae', instructionFile: 'AGENTS.md' },
  warp: { kind: 'app', appName: 'Warp', instructionFile: 'AGENTS.md' },
  kiro: { kind: 'app', appName: 'Kiro', instructionFile: 'AGENTS.md' },
  continue: { kind: 'app', appName: 'Visual Studio Code', command: 'code', instructionFile: 'AGENTS.md' },
  // Usage is `kimi [options] [command]`: a bare string is read as a subcommand and
  // fails with "unknown command". Verified on this machine. The prompt needs -p.
  'kimi-code': { kind: 'cli', command: 'kimi', promptStyle: 'flag', promptFlag: '-p', instructionFile: 'AGENTS.md' },
  // DSH's desktop client, not its CLI. `dsh` on PATH is "profile boot, plugin
  // management, and the browser UI alias" — it does not take a prompt, and the
  // form people actually work in is the app. Launching the CLI opened a terminal
  // that did not start anything resembling the agent.
  dsh: { kind: 'app', appName: 'DSH Desktop', command: 'dsh', instructionFile: 'AGENTS.md' },
  'agents-standard': { kind: 'web', url: 'https://chatgpt.com', instructionFile: 'AGENTS.md' },
  'factory-droid': { kind: 'cli', command: 'droid', promptArg: true, instructionFile: 'AGENTS.md' },
  openclaw: { kind: 'app', appName: 'OpenClaw', instructionFile: 'AGENTS.md' },
  'gemini': { kind: 'cli', command: 'gemini', promptArg: true, instructionFile: 'GEMINI.md' },
  replit: { kind: 'web', url: 'https://replit.com', instructionFile: 'AGENTS.md' },
  devin: { kind: 'web', url: 'https://app.devin.ai', instructionFile: 'AGENTS.md' },
  'jules': { kind: 'web', url: 'https://jules.google.com', instructionFile: 'AGENTS.md' },
  'grok': { kind: 'web', url: 'https://grok.com', instructionFile: 'AGENTS.md' },
  'openhands': { kind: 'cli', command: 'openhands', promptArg: true, instructionFile: 'AGENTS.md' },
  'crush': { kind: 'cli', command: 'crush', promptArg: true, instructionFile: 'AGENTS.md' },
  'mistral-vibe': { kind: 'cli', command: 'vibe', promptArg: true, instructionFile: 'AGENTS.md' },
  'qoder': { kind: 'cli', command: 'qoder', promptArg: true, instructionFile: 'AGENTS.md' },
  'lingma': { kind: 'app', appName: 'Tongyi Lingma', instructionFile: 'AGENTS.md' },
  'codebuddy': { kind: 'cli', command: 'codebuddy', promptArg: true, instructionFile: 'AGENTS.md' }
}

const registry = JSON.parse(readFileSync(file, 'utf8'))
let added = 0
let kept = 0
for (const agent of registry.agents) {
  /*
    Never overwrite metadata that is already there.

    This script used to reassign `agent.launch` for every entry in the table
    above, and to invent one for anything with a binary on the strength of the
    comment "most CLIs take a prompt argument". That assumption is what produced
    the wrong entries: `kimi "text"` errors with "unknown command", `crush` needs
    its `run` subcommand, DeepSeek Harness is a desktop app rather than a
    terminal tool. The registry is now the verified source — each entry was
    checked against the vendor's own documentation — so this pass only fills in
    what is missing.
  */
  if (agent.launch) {
    kept++
    continue
  }
  const launch = LAUNCH[agent.id]
  if (launch) {
    agent.launch = launch
    added++
  }
  // No fallback. Guessing a prompt form from the presence of a binary is how
  // the wrong entries got in; an agent with no verified launch is simply not
  // offered as launchable.
}
registry.launchAddedAt = new Date().toISOString()
writeFileSync(file, JSON.stringify(registry, null, 2) + '\n', 'utf8')

const byKind = {}
for (const a of registry.agents) if (a.launch) (byKind[a.launch.kind] ||= []).push(a.id)
console.log(`已为 ${added} 个 agent 补充启动信息，保留 ${kept} 条已验证的记录`)
for (const [k, list] of Object.entries(byKind)) console.log(`  ${k.padEnd(5)} ${list.length}  ${list.slice(0, 6).join(', ')}${list.length > 6 ? ' …' : ''}`)
const none = registry.agents.filter((a) => !a.launch).map((a) => a.id)
if (none.length) console.log(`\n无启动信息 ${none.length} 个（界面上会置灰）：${none.slice(0, 12).join(', ')}${none.length > 12 ? ' …' : ''}`)
