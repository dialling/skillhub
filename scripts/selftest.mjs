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
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'skillhub-selftest-'))
// `homedir()` reads HOME, so a directory named by `~` has to be able to resolve.
mkdirSync(join(home, '.skillhub'), { recursive: true })
mkdirSync(join(home, 'state'), { recursive: true })

/*
 * Redirect HOME too, not just SKILLHUB_HOME.
 *
 * SKILLHUB_HOME isolates the state files, but agent directories are resolved
 * from `~` — so the suite still scanned the real `~/.dsh/skills`,
 * `~/.cursor/skills` and so on. That was harmless until a test called
 * `reconcileInstalls()`, which writes records for whatever it finds in those
 * real directories; the suite's own cleanup then called `removeItem` for its
 * target repository and deleted the real files it had just discovered.
 *
 * It took exactly one run to remove a real skill from a real agent directory.
 * With HOME pointed at the throwaway directory there is nothing outside it to
 * find, whatever a future test decides to do.
 */
/*
 * Carry the developer's GitHub credentials into the sandbox.
 *
 * The suite makes real API calls — adding a repository, listing its tree,
 * searching the index. With no token it runs on the anonymous allowance of 60
 * requests an hour, which two runs exhaust; the suite then dies with a 429 that
 * looks like a broken test. The token is already on this machine in the real
 * settings file, and the sandbox is a 0700 directory under the system temp
 * directory that is deleted when the run ends.
 */
let token = ''
try {
  const real = join(homedir(), '.skillhub', 'state', 'settings.json')
  if (existsSync(real)) {
    const parsed = JSON.parse(readFileSync(real, 'utf8'))
    const seed = {}
    for (const key of ['token', 'user', 'lang', 'theme']) {
      if (parsed[key] !== undefined) seed[key] = parsed[key]
    }
    writeFileSync(join(home, 'state', 'settings.json'), JSON.stringify(seed))
    token = seed.token || ''
  }
} catch (err) {
  console.warn(`[selftest] 未能读出设置：${err.message}`)
}

/*
 * Resolve the gh CLI credential *before* HOME moves.
 *
 * Signing in usually leaves nothing in settings — `activeToken()` falls through
 * to `gh auth token`, which reads the CLI's config from `~`. Redirecting HOME
 * therefore hides the credential, and the suite silently drops to the anonymous
 * allowance of 60 requests an hour: two runs, then a 429 that reads like a
 * broken test. Resolving it here and handing it over as GH_TOKEN keeps the
 * sandbox hermetic and the quota real.
 */
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  } catch {
    console.warn('[selftest] 未取到 GitHub 凭据，本次将使用匿名额度（可能触发 429）')
  }
}

const result = spawnSync(process.execPath, [join(root, 'out', 'main', 'selftest.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SKILLHUB_HOME: home,
    HOME: home,
    USERPROFILE: home,
    ...(token ? { GH_TOKEN: token } : {})
  }
})

// Keep agent directories out of the picture even if a test forgets: the fake
// agent the suite registers lives inside the throwaway home.
rmSync(home, { recursive: true, force: true })
process.exit(result.status ?? 1)
