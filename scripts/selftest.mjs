#!/usr/bin/env node
/**
 * Run the self-test against a throwaway home.
 *
 * SKILLHUB_HOME has to be set before the test module is evaluated, because its
 * imports read the path at load time — so it cannot be set from inside the test.
 *
 * This wrapper exists because the suite once ran against the real home: its
 * cleanup step uninstalled every recorded skill, and there were 201 of them
 * across Cursor, Copilot and DeepSeek Harness. A test that can delete a user's
 * data is not a test.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'skillhub-selftest-'))

const result = spawnSync(process.execPath, [join(root, 'out', 'main', 'selftest.js')], {
  stdio: 'inherit',
  env: { ...process.env, SKILLHUB_HOME: home }
})

// Keep agent directories out of the picture even if a test forgets: the fake
// agent the suite registers lives inside the throwaway home.
rmSync(home, { recursive: true, force: true })
process.exit(result.status ?? 1)
