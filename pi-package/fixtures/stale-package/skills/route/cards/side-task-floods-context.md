---
id: side-task-floods-context
kind: method
symptom: "Searches, logs or side investigations dump noise into the main context"
triggers:
  - "keep this log search out of my main context"
  - "when should I use a subagent vs running it here"
  - "investigate this bug without polluting the session"
  - "what do subagents actually cost in tokens"
verdict: pick
do: "Delegate multi-step recon or log triage to pi-subagents (such as scout or researcher with context: \"fresh\"); for one noisy command or query, use Pi's built-in !!<cmd> or codemode first"
alternative: "Pi built-ins (!!<cmd>, codemode QuickJS filtering, /tree with branch summary, or pi -p --no-session): for a single noisy command or detour with no extra package"
skip:
  - "Spawning a subagent for one grep or shell check: pays a separate model turn and system prompt when !!<cmd> or codemode filters output in place"
  - "Using context: \"fork\" on noisy recon subagents: copies the parent session history into the child instead of starting fresh"
  - "Tiny single-maintainer subagent wrappers (such as @jerryan/pi-subagent-tools, 2 releases): pi-subagents is actively maintained with dynamic tool loading"
supersedes: []
ring: adopt
trust: third-party
always_on_cost: low
executes: "An in-process Pi extension that spawns isolated child pi processes (such as scout and researcher with fresh context) and returns a compressed summary"
install: "pi install npm:pi-subagents"
undo: "pi remove npm:pi-subagents"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/earendil-works/pi/blob/main/README.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md
  - https://github.com/nicobailon/pi-subagents
  - https://www.npmjs.com/package/pi-subagents
  - https://www.npmjs.com/package/@jerryan/pi-subagent-tools
---

## Pattern

Raw search hits, stack traces and dead-end investigations stay in the conversation and get re-sent on every later turn. Match isolation to task size: filter single large tool outputs before they enter context, and send multi-step exploration to a separate fresh context that returns only a short answer. Remember that each child agent still pays its own system prompt and model calls.

## Pi recipe

- **One noisy user command:** Prefix with `!!<cmd>` instead of `!<cmd>` in the TUI so output is shown to you but excluded from model context (`docs/usage.md`).
- **Large tool or MCP output:** Enable `codemode` (`"defaultTools": ["+codemode"]`) so QuickJS scripts process up to 1 MiB of `bash`, `read` or `mcp.*` output and return only filtered lines (`docs/codemode.md`).
- **Multi-step recon or parallel research:** Vanilla Pi omits built-in subagents (`README.md`). With `pi-subagents` installed, delegate to `scout` (`thinking: low`, `inheritSkills: false`) or `researcher` with `context: "fresh"` so 20+ noisy file reads collapse into one compressed summary in your main session.
- **Zero-package detour:** Explore on a branch and `/tree` back with a branch summary (`docs/sessions.md`), or run `pi -p --no-session --tools read,grep,find,ls "<question>"` (`docs/cli.md`).

## Why skip the others

- Every subagent call pays a fresh system prompt and model round-trip; `!!<cmd>` and `codemode` cost zero extra model calls for single commands.
- `context: "fork"` clones parent history into the child session, multiplying input tokens when fresh recon only needs the question and file paths.
- Minimal wrappers such as `@jerryan/pi-subagent-tools` (0.2.0, 2 releases) lack `pi-subagents`'s `subagents_enable` loader and role presets.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? Partly: Pi omits built-in subagents (`README.md`, with a reference `examples/extensions/subagent/`), while shipping `!!<cmd>` (`docs/usage.md`), `codemode` output filtering (`docs/codemode.md`), `/tree` branch summaries (`docs/sessions.md`), and `pi -p --no-session` (`docs/cli.md`).
2. Publisher: `nicobailon` on GitHub / `nicopreme` on npm (`pi-subagents`), MIT license, public source.
3. Maintained: 0.88.1 released 2026-11-13 (161 npm releases, last push 2026-11-14, 5 open issues).
4. Always-on: low — two skill descriptions (`pi-subagents`, `council-mode`, ~156 tokens estimated) plus `subagents_enable` on dynamic-tool models; each spawned child pays its own prompt and output tokens (`scout` sets `thinking: low`, `inheritSkills: false`).
5. Executes: in-process Pi extension spawning child `pi` processes; 0 npm install scripts.
6. Overlap: complements built-in `!!<cmd>`, `codemode` and `/tree` (use built-ins for single outputs, subagents for multi-turn recon).
7. Removal: `pi remove npm:pi-subagents`.

Re-check when stale: whether Pi adds native subagents, `pi-subagents` latest release and `scout` defaults, and `codemode` output limits.
