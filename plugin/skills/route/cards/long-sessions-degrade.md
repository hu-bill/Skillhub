---
id: long-sessions-degrade
kind: method
symptom: "Long sessions fill up, cost more and get worse"
triggers:
  - "the context is almost full"
  - "Claude forgot what I said earlier"
  - "this session has gotten slow and expensive"
  - "should I use a context compression tool"
verdict: built-in
do: "Run /clear between unrelated tasks, /compact with a focus inside a long one, and send side work to a subagent"
alternative: "Headroom proxy: when /usage shows large tool outputs dominating and you accept a proxy in front of every request"
skip:
  - "Leaving a compression proxy on for every session: Remote Control is disabled while ANTHROPIC_BASE_URL points away from api.anthropic.com"
  - "Adding an MCP server to save context: every connected server adds its tool names to each session"
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
  - https://code.claude.com/docs/en/how-claude-code-works
  - https://code.claude.com/docs/en/best-practices
  - https://code.claude.com/docs/en/costs
  - https://code.claude.com/docs/en/env-vars
  - https://github.com/headroomlabs-ai/headroom
---

## Pattern

A conversation is sent again on every turn, so old material costs money and attention long after it stopped being useful. Keep one task per context. Carry forward a short summary of what matters. Do noisy work in a separate context that returns only its result.

## Claude Code recipe

- `/clear` when switching to unrelated work. `/clear <name>` names the session you are leaving so you can come back.
- `/compact <what to keep>` inside one long task. Put rules that must survive compaction in CLAUDE.md, or in a "Compact Instructions" section there.
- Send searches, log reading and other noisy side work to a subagent.
- Look before changing anything: `/context` shows what fills the window, and `/usage` shows where the usage goes.
- Running out of room is rare now. Most current models have a 1M-token window and compaction is automatic. The usual costs are paying for stale context and losing early instructions when compaction summarizes them.

## Why skip the others

- A proxy changes what Claude Code can do. Remote Control is off while `ANTHROPIC_BASE_URL` points at another host, and MCP tool search can need extra setup behind a gateway. Turn a proxy on for the sessions that need it, not as a default.
- An MCP server sold as a context saver starts by adding context: its tool names are listed in every session where it is connected.

## Evidence

Checked on 2026-11-13.

Built-in:

- Automatic compaction, `/compact` with a focus, "Compact Instructions", `/context`: how-claude-code-works, "When context fills up".
- `/clear` between tasks, `/usage` first, the 1M-token window, compaction of idle sessions past about 200K tokens: best-practices, "Keep cost and context down".
- Subagents for verbose operations, MCP server overhead: costs, "Reduce token usage".
- Remote Control and `ANTHROPIC_BASE_URL`: env-vars.

Alternative, Headroom (`headroom-ai`):

1. Built in? Partly. Compaction is built in. Compressing individual tool outputs before they are sent is not.
2. Publisher: `headroomlabs-ai` on GitHub. Apache-2.0. Not in an Anthropic marketplace.
3. Maintained: release 0.44.0 on 2026-11-10, 207 releases, last push 2026-11-13, 299 open issues and pull requests.
4. Always-on: small. It registers a `headroom` MCP server for retrieving compressed content, which adds its tool names.
5. Executes: a local proxy that every request passes through, selected with `ANTHROPIC_BASE_URL`.
6. Overlap: with built-in compaction. Its savings figures (20% for coding agents, 60 to 95% for JSON) are the project's own and were not measured here.
7. Removal: unset `ANTHROPIC_BASE_URL`, remove the MCP registration, uninstall the package.

Re-check when stale: the window size and compaction wording in best-practices, the Remote Control restriction, Headroom's latest release.
