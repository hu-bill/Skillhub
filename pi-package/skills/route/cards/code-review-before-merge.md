---
id: code-review-before-merge
kind: method
symptom: "Review changes carefully before merging or opening a PR"
triggers:
  - "review my changes before I merge"
  - "do a code review on this branch"
  - "check this diff before I open a PR"
  - "should I install a code review plugin"
verdict: pick
do: "Run a fresh read-only review via pi-subagents (the reviewer agent, /parallel-review, or /review-loop) instead of asking the session that wrote the code"
alternative: "/plannotator-review (@plannotator/pi-extension) or git diff main...HEAD | pi --tools read,grep,find,ls -p --no-session: when you want interactive browser PR/diff sign-off or a zero-package read-only pass"
skip:
  - "Stale or repo-less review packages (such as pi-pr-review, last updated 2026-09, or @fyeeme/pi-review, no public repo): pi-subagents and @plannotator/pi-extension are actively maintained"
  - "Third-party code-review MCP servers (such as code-reviewer-ai-mcp): add a server process when native git diff and read-only file tools already inspect the repo"
supersedes: []
ring: adopt
trust: third-party
always_on_cost: low
executes: "An in-process Pi extension that spawns isolated child pi processes; its reviewer agent runs with read-only tools (read, grep, find, ls, watchdog_diff)"
install: "pi install npm:pi-subagents"
undo: "pi remove npm:pi-subagents"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/earendil-works/pi/blob/main/README.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/slash-commands.md
  - https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent
  - https://github.com/nicobailon/pi-subagents
  - https://www.npmjs.com/package/pi-subagents
  - https://github.com/backnotprop/plannotator
  - https://www.npmjs.com/package/@plannotator/pi-extension
  - https://github.com/cmpadden/pi-diff-review
  - https://www.npmjs.com/package/pi-pr-review
  - https://www.npmjs.com/package/@fyeeme/pi-review
---

## Pattern

The session that wrote a change shares the assumptions that produced its bugs. Run code review in a fresh, read-only context over the actual branch diff and touched files. Report concrete defects by severity with file and line evidence and a clear merge verdict, or inspect hunks interactively when a human is signing off.

## Pi recipe

- Vanilla Pi has no `/code-review` command and omits built-in subagents. With `pi-subagents` installed, ask the `reviewer` subagent to inspect `main...HEAD`, run `/parallel-review` to fan out correctness, test and convention checks, or run `/review-loop` to fix and re-verify P0/P1 findings.
- For human line-by-line inspection, run `/plannotator-review` (or `/plannotator-review <PR_URL>`) if `@plannotator/pi-extension` is installed, or `pi-diff-review` (`/diff main...HEAD`) for a terminal-only UI.
- With zero packages, pipe the diff into a fresh read-only pass: `git diff main...HEAD | pi --tools read,grep,find,ls -p --no-session "Review this diff for bugs and missing tests"`.
- For vulnerability, auth, secret or CVE audits rather than general correctness, see `security-review`.

## Why skip the others

- `pi-pr-review` (last release 2026-09-13, no GitHub license file) and `@fyeeme/pi-review` (no repository link on npm) trail actively maintained `pi-subagents` and `@plannotator/pi-extension`.
- Code-review MCP servers wrap diff reading that Pi's native read-only tools already handle directly.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? No `/code-review` command (`docs/slash-commands.md`) or subagents (`README.md`); Pi ships `--tools read,grep,find,ls -p --no-session` (`docs/cli.md`) and a reference `examples/extensions/subagent/agents/reviewer.md`.
2. Publisher: `nicobailon` on GitHub / `nicopreme` on npm (`pi-subagents`), MIT license, public source.
3. Maintained: 0.88.1 released 2026-11-13 (161 npm releases, last push 2026-11-14, 5 open issues).
4. Always-on: low — two skill descriptions (`pi-subagents`, `council-mode`, ~156 tokens estimated) plus `subagents_enable` when dynamic tool loading is supported.
5. Executes: in-process Pi extension spawning child `pi` processes (`reviewer` restricts tools to `read, grep, find, ls, watchdog_diff, contact_supervisor`); 0 npm install scripts.
6. Overlap: none with Pi built-ins; complements `@plannotator/pi-extension` (`/plannotator-review`, 0.28.64) and `pi-diff-review` (0.1.30, MIT, `cmpadden`).
7. Removal: `pi remove npm:pi-subagents`.

Re-check when stale: whether Pi adds a native `/review` command, `pi-subagents` latest release, and `/plannotator-review` default tool cost.
