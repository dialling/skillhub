# Non-interactive prompt invocation truth (16 CLI agents)

Researched 2026-09-15. Verified against official docs, `--help` output, and (where
possible) the shipped binary/npm bundle. Every non-`unknown` answer below has a
primary source URL.

Definitions used:
- **one-shot** = prints the answer and exits (no TUI).
- **prefill** = starts the full interactive TUI with the prompt submitted/pre-filled.
- Trap checked everywhere: if usage is `tool [options] [command]`, a bare string is
  parsed as a *subcommand* (usually "unknown command"), so positional is wrong.

## Table

| tool | answer | exact invocation | behaviour | registry mapping |
| --- | --- | --- | --- | --- |
| gemini | **B flag** | `gemini -p "prompt"` (`--prompt`) | one-shot prints + exits | `promptStyle:flag, promptFlag:-p` |
| kimi | **B flag** | `kimi -p "prompt"` (`--prompt`) | one-shot prints + exits | `promptStyle:flag, promptFlag:-p` |
| amp | **B flag** | `amp -x "prompt"` (`--execute`) | one-shot, prints final message + exits | `promptStyle:flag, promptFlag:-x` |
| qoder | **A positional** | `qoder "prompt"` | one-shot — positional *is* non-interactive mode | `promptStyle:positional` |
| neovate | **A positional (+`-q`)** | `neovate -q "prompt"` | positional = prompt, but interactive unless `-q/--quiet` | `promptStyle:positional` + args `-q` |
| deepcode | **B flag** | `deepcode -x -p "prompt"` | `-p` alone = prefill TUI; `-x` makes it one-shot | `promptArgs:[-x,-p], promptStyle:flag` |
| junie | **A positional** | `junie "prompt"` | one-shot; `--task "<p>"` equivalent | `promptStyle:positional` |
| openhands | **B flag** | `openhands --headless -t "prompt"` | one-shot; `--headless` required | `promptArgs:[--headless,-t]` |
| vibe | **B flag** | `vibe --prompt "prompt"` (`-p`) | one-shot "programmatic mode" | `promptStyle:flag, promptFlag:--prompt` |
| aider-desk | **B subcommand** | `aiderdesk run "prompt"` | one-shot, streams + exits (needs server) | `promptArgs:[run], style:positional` |
| ona | **C none** | — | no prompt mode at all | `promptStyle:none` |
| command-code | **B flag** | `cmd -p "prompt"` (`--print`) | one-shot prints + exits | `promptStyle:flag, promptFlag:-p` |
| emdash | **C not a CLI** | — | desktop app (ADE), no prompt CLI | `kind:app` / `promptStyle:none` |
| vtcode | **B flag** | `vtcode -p "prompt"` (`--print`) | one-shot; also `vtcode exec "<p>"`, `vtcode ask "<p>"` | `promptStyle:flag, promptFlag:-p` |
| zencoder | **D unknown** | — | no confirmable terminal CLI | leave `false`/unknown |
| forge (ForgeCode) | **B flag** | `forge -p "prompt"` (`--prompt`) | one-shot, exits without TUI | `promptStyle:flag, promptFlag:-p` |

## Details, traps and sources

### gemini (Gemini CLI) — B, `-p` / `--prompt`
Usage has a positional `query`, but it is **not** one-shot:
"Positional prompt. Defaults to interactive mode in a TTY. Use `-p/--prompt` for
non-interactive execution." Cheatsheet: `gemini "query"` = "Query and continue
interactively". `-i/--prompt-interactive "<q>"` is the explicit prefill form.
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
- https://geminicli.com/docs/cli/tutorials/automation/
- Note: the docs site banner says Gemini CLI was replaced by Antigravity CLI
  (unpaid/Google One tiers, 18 Jun 2026) — worth watching for renames.

### kimi (Kimi Code CLI) — B, `-p` / `--prompt`
Usage is `kimi [options] [command]` → a bare string is a subcommand. Verified
locally on v0.42.0: `-p, --prompt <prompt>  Run one prompt non-interactively and
print the response.` Docs: "`--prompt` cannot be used with `--yolo`, `--auto`, or
`--plan`". `--output-format text|stream-json` for machine output.
- `kimi --help` (local, v0.42.0)
- https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html

### amp (Sourcegraph Amp) — B, `-x` / `--execute`
Execute mode: "sends the message provided to `-x` to the agent, waits until the
agent ends its turn, prints its final message, and exits." Piped stdin goes to
*interactive* mode as the first user message; redirecting stdout auto-enables
execute mode. A bare positional prompt is **not documented** — do not rely on it.
- https://ampcode.com/docs/cli/execute-mode
- https://ampcode.com/docs/cli

### qoder (Qoder) — A, positional
`qoder [options] [prompt text]` — "Passing a text prompt or `--print` switches to
Non-Interactive Mode"; `-p/--print` is an explicit boolean, `-i/--prompt-interactive
<text>` is the prefill-then-interactive form. Bare positional is genuinely one-shot
here (prints one response and exits). Prompt text that exactly matches a subcommand
name (`mcp`, `commit`, `update`, …) would be parsed as a command.
- https://docs.qoder.com/cli/cli-reference.md

### neovate (Neovate Code) — A positional, but add `-q` for one-shot
Real help from the shipped npm bundle (`@neovate/code@0.28.5`, `neovate --help`):
`Usage: neovate [options] [command] <prompt>` — "Run the code agent with a prompt,
interactive by default, use `-q/--quiet` for non-interactive mode."
So the prompt *is* positional, but without `-q` it opens the TUI (prefill). Because
the usage line has a `[command]` slot, a prompt equal to `run`/`commit`/`config`
would hit a subcommand.
- local `npx @neovate/code --help` (v0.28.5)
- https://github.com/neovateai/neovate-code

### deepcode (Deep Code CLI) — B, `-x -p`
Real `--help` from `@vegamo/deepcode-cli@0.4.0`:
`-p, --prompt  Submit a prompt on launch [string]`, `-x, --exec  Run one prompt
non-interactively (requires --prompt)`. Examples: `deepcode -p <prompt>` = "Launch
the TUI and submit a prompt"; `deepcode -x -p <prompt>` = "Run one prompt without
launching the TUI". No positional prompt (usage: `deepcode [options] [command]`).
- local `node cli.js --help` (v0.4.0) — https://github.com/lessweb/deepcode-cli

### junie (JetBrains Junie) — A, positional (one-shot)
Headless doc: "run the `junie` command with your prompt as a positional argument:
`junie --auth="$JUNIE_API_KEY" "Review and fix any code quality issues in the
latest commit"`" and "Non-interactive runs — one-shot prompts, piped-input tasks,
ACP, and Gateway". Parameter reference adds:
- `--task "<task>"` — "Provide the task description (alternative to positional argument)."
- `--prompt "<p>"` — **interactive**: "Start interactive mode with an initial prompt
  already submitted… You can continue typing new prompts after the initial one."
- `-p` is **`--project`** on Junie (path), not prompt. Do not map `-p` to prompt.
- https://junie.jetbrains.com/docs/junie-headless.html
- https://junie.jetbrains.com/docs/parameters.html

### openhands (OpenHands) — B, `--headless -t`
Usage `openhands [OPTIONS] [COMMAND]`; `-t/--task TEXT` only "seed[s] the
conversation" and `--headless` is required for a non-interactive run: "Headless
mode runs OpenHands without the interactive terminal UI… requires `--task` or
`--file`". Bare positional = subcommand.
- https://docs.openhands.dev/openhands/usage/cli/headless.md
- https://docs.openhands.dev/openhands/usage/cli/command-reference.md

### vibe (Mistral Vibe) — B, `--prompt` / `-p`
README separates the two: `vibe "Refactor…"` = "start Vibe with a prompt"
(interactive TUI), while "Programmatic Mode — run Vibe non-interactively by piping
input or using the `--prompt` flag" with options `--max-turns`, `--max-price`,
`--output text|json|streaming`. `-p` is confirmed as the short form.
- https://github.com/mistralai/mistral-vibe/blob/main/README.md

### aider-desk (AiderDesk) — B, `aiderdesk run "<prompt>"`
"The `aiderdesk run` command lets you execute prompts non-interactively from the
terminal… streams the AI response in real-time, and exits when the task completes."
Requires a running AiderDesk server (`--autostart` can start/stop one). Options
`-q`, `-f json`, `-m`, `-a`, `--task-id`. No bare positional prompt form is documented.
- https://aiderdesk.hotovo.com/docs/advanced/cli-run

### ona (Ona, ex-Gitpod) — C, none
The `ona` CLI is a control plane for environments/automations (`ona environment *`,
`ona project *`, `ona webhook *`, `ona login`, …). No prompt/agent-run command
exists; `ona "<prompt>"` would be an unknown command. (`ona env codex [id]`
"Configure and open an environment workspace in Codex on macOS" — that opens
Codex, it does not pass a prompt.)
- https://ona.com/docs/ona/reference/cli
- https://ona.com/docs/ona/integrations/cli

### command-code (Command Code) — B, `-p` / `--print`
Headless doc: "Use the `-p` (or `--print`) flag to run in headless mode…
executes a single query, outputs the response to stdout, and exits."
CLI reference: `-p, --print [query]  Run in non-interactive mode, output response
and exit`; `cmd "message"` starts an **interactive** session with an initial message.
Tested binary names on npm (`command-code@1.54.0`): `cmd`, `cmdc`, `commandcode`,
`command-code` — the docs write the binary as `cmd`.
- https://commandcode.ai/docs/headless
- https://commandcode.ai/docs/reference/cli
- https://registry.npmjs.org/command-code/latest

### emdash (Emdash) — C, not a prompt CLI
Emdash is an open-source *desktop app* (Electron ADE) that runs other agents in
parallel: "Emdash is an open source desktop app for working with coding agents."
The repo has `apps/emdash-desktop` and `apps/workspace-server` and no `bin` entry —
there is no `emdash` terminal command that takes a prompt. It is a *consumer* of
CLI agents, not one.
- https://emdash.sh/docs
- https://github.com/generalaction/emdash

### vtcode (VT Code) — B, `-p` / `--print`
From the Rust CLI definition (`-p, --print <PROMPT>`, global): "Print response
without launching the interactive TUI". Also `vtcode ask "<p>"` ("single prompt
mode… process exits after replying") and `vtcode exec "<p>"` (headless agent with
the full tool loop). **Trap:** the top-level positional is `workspace_path`, not a
prompt, so `vtcode "prompt"` would be read as a workspace path.
- https://github.com/vinhnx/VTCode/blob/main/crates/codegen/vtcode-core/src/cli/args/mod.rs
- https://github.com/vinhnx/VTCode/blob/main/docs/user-guide/exec-mode.md

### zencoder (Zencoder) — D, unknown
Zencoder's surfaces are the Zenflow desktop app and IDE plugins. "Zen CLI" exists
but is documented as Zencoder's *native runtime* selected inside the IDE ("select
your runtime… available CLIs (Zen CLI, Claude Code, or OpenAI Codex)"), not as a
standalone terminal command with a prompt argument. No install page, package or
`--help` output for a `zencoder`/`zen` binary could be confirmed; `zencoder.ai/cli`
404s and the docs are Cloudflare-protected (page bodies only reachable via a text
proxy). Recommendation: treat as no-prompt / do not append anything.
- https://docs.zencoder.ai/features/universal-cli-platform
- https://docs.zencoder.ai/llms.txt

### forge (ForgeCode) — B, `-p` / `--prompt`
Top-level clap flag in `crates/forge_main/src/cli.rs`:
`/// Direct prompt to process without entering interactive mode.` with
`#[arg(long, short = 'p', allow_hyphen_values = true)]`, and
`is_interactive()` returns true only when neither prompt, piped input, nor a
subcommand is present. Bare positional = subcommand (unknown command).
- https://github.com/tailcallhq/forgecode/blob/main/crates/forge_main/src/cli.rs
- https://forgecode.dev/docs/

## Notes for the launcher

- `qoder`, `junie`, `neovate` (with `-q`) are the only true positional-prompt tools
  in this list; everything else needs a flag or a subcommand.
- Registry entries that are currently wrong (or at least unsafe):
  `gemini`, `kimi`, `amp`, `qoder` are `promptArg: true` — wrong (or prefill-only)
  for one-shot use in all four; `openhands`, `mistral-vibe` are `true` (must become
  a flag/subcommand+flag); `deepcode`, `neovate`, `junie`, `vtcode`, `forgecode`
  are `false` but **do** support prompts (neovate/junie positionally, the rest via a
  flag) — `false` there means the user's prompt is silently dropped.
- `neovate`: `promptArg:true` + a `-q` arg would be the accurate encoding.
- `junie`: do not reuse `-p`; on Junie `-p` is `--project`.
