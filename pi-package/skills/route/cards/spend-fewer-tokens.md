---
id: spend-fewer-tokens
kind: method
symptom: "Spend fewer tokens and lower session model costs"
triggers:
  - "how do I spend fewer tokens"
  - "cut my token and API costs in Pi"
  - "should I install a model router to save money"
  - "which settings matter most for token cost"
verdict: built-in
do: 'Lower /thinking (Shift+Tab) on routine turns, pick a cheaper /model without switching mid-session, keep cacheWarming: "idle" and codemode MCP exposure, and prefix user-only shell checks with !!'
alternative: "Pi virtual-model phase router (examples/extensions/jev-router.ts or npm:@alexeiled/pi-model-router): when you want strong-plan then cheap-implement routing with at most one prompt-cache miss"
skip:
  - "Naive per-turn model routers without switch-cost guards: switching physical models between turns invalidates the provider prompt cache"
  - "Setting MCP servers to direct exposure or leaving unused global servers enabled: declares full tool schemas on every turn"
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
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/virtual-models.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/slash-commands.md
  - https://github.com/alexei-led/pi-model-router
  - https://www.npmjs.com/package/@alexeiled/pi-model-router
---

## Pattern

Token spend comes from three multipliers: output price (including reasoning tokens), repeated uncached input prefixes, and per-turn tool or command bloat. Right-size reasoning effort per turn, keep the prompt prefix cacheable instead of bouncing between models, and keep tool schemas and noisy command outputs out of default context.

## Pi recipe

- **Right-size thinking and model:** Press `Shift+Tab` or run `/thinking low` (or `off`/`minimal`; default is `medium`) for routine edits, and set `modelThinkingLevels` in `settings.json`. Use `/model` (`Ctrl+L`) or `Ctrl+P` (`/scoped-models`) to start mechanical tasks on a cheaper model, rather than switching back and forth every turn.
- **Protect prompt caching:** Keep `cacheWarming: "idle"` (default; warms eligible caches when estimated avoided miss cost is `>= $0.05`) and set `"showCacheMissNotices": true` if you suspect cache churn.
- **Trim per-turn overhead:** Keep MCP servers on default `codemode` (or `deferred`) exposure, disable unused servers in `.pi/mcp.json` (`"enabled": false`) or `--no-mcp`, use `!!<cmd>` for shell checks Pi does not need to read, and filter large outputs or call cheap classifiers (`models.classify()`) in `codemode`.
- For stale long chats use `/new` or `/compact` (see `long-sessions-degrade`); to inspect current spend run `/session` (see `whats-using-context`); to isolate one noisy task use subagents (see `side-task-floods-context`).

## Why skip the others

- Switching physical models between turns loses the provider prompt cache (`docs/virtual-models.md`), which often costs more on medium/long histories than keeping one cached model at lower `/thinking`. If you automate routing, phase-switch once (like Pi's bundled `jev-router.ts`) or enforce switch-cost holds.
- `direct` MCP exposure injects every tool schema into every request; Pi's default `codemode` exposure avoids that tax and appends `mcp_servers` updates without invalidating cached prefixes.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

Built-in:

- `/model`, `/scoped-models`, `/thinking`, `Shift+Tab`, `!!` shell prefix, `/session`: `docs/models.md`, `docs/usage.md`, and `docs/slash-commands.md`.
- `defaultThinkingLevel` (`"medium"`), `modelThinkingLevels`, `cacheWarming` (`"idle"`, `$0.05` threshold), `showCacheMissNotices`: `docs/settings.md` and `docs/models.md`.
- Prompt-cache loss when switching physical models across turns, plus single-switch phase routing (`examples/extensions/jev-router.ts`): `docs/virtual-models.md`.
- Default `codemode` MCP exposure, cache-preserving `mcp_servers` updates, and `models.classify()`: `docs/mcp.md` and `docs/codemode.md`.

Alternative (`@alexeiled/pi-model-router` 0.20.1, 2026-11-13, MIT, `alexeiled`, 31 npm releases, 0 open issues): in-process router extension with `cost`/`balanced`/`quality` modes and explicit switch-cost controls (`pi remove npm:@alexeiled/pi-model-router`).

Re-check when stale: `cacheWarming` and `defaultThinkingLevel` defaults in `docs/settings.md`, `virtual-models.md` cache behavior, and `@alexeiled/pi-model-router` maintenance.
