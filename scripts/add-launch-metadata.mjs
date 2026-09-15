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
  'kimi-code': { kind: 'cli', command: 'kimi', promptArg: true, instructionFile: 'AGENTS.md' },
  'kimi-cli': { kind: 'cli', command: 'kimi', promptArg: true, instructionFile: 'AGENTS.md' },
  dsh: { kind: 'cli', command: 'dsh', promptArg: true, instructionFile: 'AGENTS.md' },
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
for (const agent of registry.agents) {
  const launch = LAUNCH[agent.id]
  if (launch) {
    agent.launch = launch
    added++
  } else if (agent.detect?.binaries?.length) {
    // Fall back to the first known binary: most CLIs take a prompt argument.
    agent.launch = { kind: 'cli', command: agent.detect.binaries[0], promptArg: false, instructionFile: 'AGENTS.md' }
    added++
  }
}
registry.launchAddedAt = new Date().toISOString()
writeFileSync(file, JSON.stringify(registry, null, 2) + '\n', 'utf8')

const byKind = {}
for (const a of registry.agents) if (a.launch) (byKind[a.launch.kind] ||= []).push(a.id)
console.log(`已为 ${added}/${registry.agents.length} 个 agent 补充启动信息`)
for (const [k, list] of Object.entries(byKind)) console.log(`  ${k.padEnd(5)} ${list.length}  ${list.slice(0, 6).join(', ')}${list.length > 6 ? ' …' : ''}`)
const none = registry.agents.filter((a) => !a.launch).map((a) => a.id)
if (none.length) console.log(`\n无启动信息 ${none.length} 个（界面上会置灰）：${none.slice(0, 12).join(', ')}${none.length > 12 ? ' …' : ''}`)
