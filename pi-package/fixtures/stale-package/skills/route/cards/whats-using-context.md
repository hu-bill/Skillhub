---
id: whats-using-context
kind: method
symptom: "See what is filling the context window or driving token usage"
triggers:
  - "what is using all my context"
  - "why is this session using so many tokens"
  - "how do I check my context window and cache hits"
  - "is there a /context or /doctor command in Pi"
verdict: built-in
do: "Read the live footer and run /session for token, cache-hit and cost totals, /mcp (or pi mcp list) for MCP exposure, and pi --verbose for loaded startup files"
alternative: "pi-context-view (npm:pi-context-view): when you need /context to break down hidden system prompt, tool definitions, skills and extension injections"
skip:
  - "Always-on statusline or HUD replacements installed just for token counts: Pi's built-in footer and /session already show live input, cache hits, cost and window %"
  - "Token-analytics MCP servers or background daemons: add tool or process overhead when /session, /mcp and pi --verbose inspect usage locally"
supersedes: []
ring: adopt
trust: official
always_on_cost: none
executes: null
install: null
undo: null
verified: 2026-11-14
ttl_days: 90
sources:
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/slash-commands.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
  - https://github.com/dimk90/pi-context-view
  - https://www.npmjs.com/package/pi-context-view
---

## Pattern

Measure before removing tools or changing habits. Check two things separately: how much of the context window the conversation and tool outputs have accumulated across turns, and what fixed overhead (instructions, skills, tool schemas, extensions) is attached to every request.

## Pi recipe

- **Footer (live):** Shows `↑input ↓output RcacheRead WcacheWrite CH<hit>% $<cost> <pct>%/<window>` plus model and thinking level on every turn (`docs/usage.md`).
- **`/session`:** Breaks down message and tool-call counts, Cached vs Uncached input tokens, cache hit %, Cache Warming savings, `Cache Re-billed` misses, and per-model cost (`docs/slash-commands.md`).
- **Fixed overhead checks:** Run `pi --verbose` to list loaded `AGENTS.md`/`CLAUDE.md`, skills, prompts and extensions (`docs/cli.md`); `/mcp` or `pi mcp list` to verify servers use default `codemode` or `deferred` exposure instead of `direct` (`docs/mcp.md`); and `pi list` / `pi config` to inspect packages (`docs/packages.md`).
- Vanilla Pi has no built-in `/context` or `/doctor` command; add `pi-context-view` (`npm:pi-context-view`) only if you need a per-category map of hidden system prompt, tool definitions and extension injections (`/context usage`, `/context injections`).
- Once you see the culprit, see `long-sessions-degrade`, `side-task-floods-context`, or `spend-fewer-tokens` to trim it.

## Why skip the others

- Custom statusline extensions duplicate metrics Pi's default footer and `/session` already render with zero extra packages.
- MCP usage trackers add server and schema overhead to measure context bloat.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

Built-in:

- Footer token, cache-read/write, cache-hit %, cost and `%` of context window, plus startup resource header: `docs/usage.md`; `--verbose`, `pi list`, `pi config`, `pi mcp list`: `docs/cli.md`.
- `/session` input, cached/uncached, Cache Warming, `Cache Re-billed` and per-model cost breakdown: `docs/slash-commands.md`.
- `/mcp`, `pi mcp list` and `codemode`/`deferred` vs `direct` tool exposure: `docs/mcp.md`.
- `pi list` and `pi config` package/resource inspection: `docs/packages.md`.

Alternative (`pi-context-view` 0.8.4, 2026-11-10, MIT, `dimk90`, public source, 23 npm releases, last push 2026-11-13, 1 open issue, requires Pi `>=1.3.0`): in-process TUI extension registering `/context` (`0` always-on prompt tokens, 0 install scripts; opening `/context` before any turn runs one silent probe unless disabled in `/context config`); complements `/session`. Remove with `pi remove npm:pi-context-view`.

Re-check when stale: whether Pi adds a built-in `/context` breakdown, `/session` fields, and `pi-context-view` latest release.
