---
id: long-sessions-degrade
kind: method
symptom: "Long sessions fill up, cost more and get worse"
triggers:
  - "the context is almost full"
  - "the agent forgot what I said earlier"
  - "this session has gotten slow and expensive"
  - "should I use a context compression tool"
verdict: built-in
do: "Run /new between unrelated tasks, /compact <focus> inside a long one, filter large outputs in codemode, and isolate noisy side work"
alternative: "pi-subagents (npm:pi-subagents): when noisy codebase exploration or review should run in an isolated child Pi session"
skip:
  - "Context-compression proxy packages (such as billion-context): route every request through a local proxy when /compact, /tree and codemode already trim context"
  - "Setting large MCP servers to direct exposure: keep Pi's default codemode or deferred exposure so tool schemas do not bloat every request"
supersedes: []
ring: adopt
trust: official
always_on_cost: none
executes: null
install: null
undo: null
verified: 2026-01-01
ttl_days: 90
sources:
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md
  - https://www.npmjs.com/package/pi-subagents
---

## Pattern

A conversation is sent again on every turn, so old material costs money and attention long after it stopped being useful. Keep one task per context. Carry forward a short summary of what matters. Filter large tool outputs and run noisy exploration in a separate context that returns only its result.

## Pi recipe

- `/new` when switching to unrelated work; run `/name <label>` first so `/resume` finds the old session easily.
- `/compact <what to keep>` inside a long task (note: if `compaction.enabled` is `false` in `settings.json`, compaction runs only when you call `/compact`). Put standing rules in `AGENTS.md` or `CLAUDE.md` so they survive compaction.
- `/tree` or `/fork` to branch from an earlier message with optional branch summarization instead of carrying dead ends forward.
- Enable `codemode` (`"defaultTools": ["+codemode"]`) to filter large command or MCP outputs in QuickJS before they reach the model, and use `pi-subagents` (if installed) for noisy recon.
- Check `/session` and the footer token counter before changing your setup.

## Why skip the others

- Proxy packages such as `billion-context` interpose a local proxy (`bili-proxy`) in front of provider traffic and risk breaking prompt caching, when Pi's built-in `/compact`, `cacheWarming` and `codemode` output reduction run natively.
- `direct` MCP exposure declares every tool schema on every turn; Pi's default `codemode` exposure avoids that overhead.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

Built-in:

- `/new`, `/name`, `/resume`, `/session`, `/tree`, `/fork`, `/compact [instructions]`: `docs/sessions.md` and `docs/slash-commands.md`.
- Auto-compaction (`compaction.enabled`, `reserveTokens: 16384`, `keepRecentTokens: 20000`) and branch summaries: `docs/compaction.md` and `docs/settings.md`.
- Filtering large outputs in QuickJS before model context: `docs/codemode.md`.
- Default `codemode` / `deferred` MCP tool exposure: `docs/mcp.md`.

Alternative (`pi-subagents` 0.88.1, 2026-11-13, MIT, `nicopreme`, 161 releases): delegates recon/review to isolated child Pi sessions and uses a small `subagents_enable` loader when dynamic tool loading is supported.

Skipped (`billion-context` 0.1.214, 2026-11-14, MIT, `ranxianglei`, 9,266 npm versions): runs a proxy process overlapping built-in compaction and codemode.

Re-check when stale: Pi compaction defaults, `codemode` output limits, and `pi-subagents` loader behavior.
