---
id: plan-large-feature
kind: method
symptom: "Plan a large feature before writing code"
triggers:
  - "plan this feature before we build it"
  - "I want a design before any code"
  - "should I use a planning framework or spec plugin"
  - "this change touches many files, how should we approach it"
verdict: built-in
do: "Use plan mode: Shift+Tab or /plan, review the plan, edit it with Ctrl+G, then approve"
alternative: "feature-dev (official plugin by Anthropic): when you want a fixed workflow with explorer, architect and reviewer agents for one large feature"
skip:
  - "superpowers for planning alone: about 850 always-on tokens plus a SessionStart hook that injects one more skill, for something plan mode already does"
supersedes: []
ring: adopt
trust: official
always_on_cost: none
executes: null
install: null
undo: null
verified: 2026-11-13
ttl_days: 90
sources:
  - https://code.claude.com/docs/en/permission-modes
  - https://code.claude.com/docs/en/best-practices
  - https://code.claude.com/docs/en/costs
  - https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev
  - https://github.com/obra/superpowers
---

## Pattern

Separate deciding from doing. First explore and write down the approach while nothing is being edited. Have a person review it. Then build from the written plan. When the requirements themselves are unclear, get interviewed into a short spec first and build from that in a fresh context.

## Claude Code recipe

- Enter plan mode with Shift+Tab, or prefix one prompt with `/plan`. Claude reads and explores but does not edit source until you approve.
- Press Ctrl+G to edit the proposed plan in your editor before approving.
- If you do not know what you want yet, ask Claude to interview you until it can write the spec, save it to a file, and start a fresh session to build from it.
- To make plan mode the default for a project's terminal sessions, set `defaultMode` to `plan` in `.claude/settings.json`.

## Why skip the others

- superpowers is a whole working method (TDD, debugging, code review, worktrees) in 15 skills. Installing it only for planning pays its always-on cost for something plan mode already does. Install it when you want the whole method.

## Evidence

Checked on 2026-11-13.

Built-in:

- Plan mode, `/plan`, Ctrl+G, the approval options, `defaultMode`: permission-modes, "Analyze before you edit with plan mode".
- "Use plan mode for complex tasks": costs, "Work efficiently on complex tasks".
- Interview first, then a fresh session: best-practices, "Brainstorm with Claude first".

Alternative, feature-dev 1.0.1:

- Published by Anthropic in the official marketplace. One command (`/feature-dev`) and three agents. No hooks, no MCP server.
- Always-on about 240 tokens, measured with `claude plugin details`.
- Remove with `claude plugin uninstall feature-dev@claude-plugins-official`.

Skipped, superpowers 7.0.0:

- Published by Jesse Vincent (`obra`), MIT, listed in the official marketplace.
- Always-on about 848 tokens for 15 skill descriptions, measured with `claude plugin details`.
- Its SessionStart hook injects the `using-superpowers` skill, about 1,100 tokens, on startup, clear and compact. `plugin details` does not count that.

Re-check when stale: the plan mode section of permission-modes, both plugins' versions and always-on figures.
