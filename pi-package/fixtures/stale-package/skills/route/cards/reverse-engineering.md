---
id: reverse-engineering
kind: capability
symptom: "Understand how a shipped app, binary or package works without its source"
triggers:
  - "reverse engineer this app"
  - "decompile this binary"
  - "how does this closed-source app talk to its server"
  - "what changed between these two builds"
verdict: pick
do: "Use REA: register its MCP server per project in Pi and add the reverse-engineer-anything skill"
alternative: "Plain shell tools (strings, objdump, unzip): for one quick question about one small file"
skip:
  - "Community reverse-engineering skills with no MCP server: instructions only, with no decompiler or runtime tools behind them"
  - "Setting REA to direct exposure or user scope: keep Pi's default codemode/deferred exposure and register per project (-l)"
supersedes: []
ring: adopt
trust: third-party
always_on_cost: low
executes: "An MCP server started with npx, which downloads and runs rea-agents. On request it drives local analysis engines, debuggers, Frida and adb"
install: "pi mcp add -l rea -- npx -y rea-agents@latest mcp (and optionally npx rea-agents@latest setup for the skill), then /reload"
undo: "pi mcp remove -l rea, then delete ~/.agents/skills/reverse-engineer-anything/ if installed"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/morluto/rea
  - https://www.npmjs.com/package/rea-agents
  - https://rea.tools
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md
---

## Pattern

Claims about a shipped artifact need evidence from the artifact: decompiled code, strings, resources or observed runtime behavior. Give the agent purpose-built analysis tools that return structured evidence. Without them it guesses from file names or pages through raw disassembly in a shell.

## Pi recipe

- Use REA when a claim depends on a shipped binary or package, decompilation, runtime observation, or a comparison between builds.
- Do not use it to analyze a repository whose source is complete.
- Register the server per project with `pi mcp add -l rea -- npx -y rea-agents@latest mcp` (writes `.pi/mcp.json`) and keep Pi's default `codemode` (or `deferred`) exposure so REA's 207 tool schemas stay out of every prompt.
- Check connection health with `/mcp` or `pi mcp list`. If REA is already in `mcp_servers`, start on the target directly.

## Why skip the others

- Skill-only reverse-engineering entries add prose instructions without a decompiler, debugger or runtime bridge.
- User-scope registration (`~/.pi/agent/mcp.json`) launches the stdio server in every project, and `direct` exposure would declare all 207 tool schemas on every turn.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? No. Pi's built-in tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `codemode`) include no binary decompiler or runtime analysis engine.
2. Publisher: `morluto` on GitHub and npm (sole maintainer). MIT license, public source.
3. Maintained: `rea-agents` 6.9.0 released 2026-11-12, 35 npm releases. Latest release asks for Node `^22.23.4`, `^24.22.1` or `>=26.12.1`.
4. Always-on: low in Pi with default `codemode` exposure (one summary line in `mcp_servers`, plus one skill description if the skill is added).
5. Executes: `npx` downloads and runs `rea-agents` (`scripts/rea.mjs mcp`), driving local decompilers, debuggers, Frida and adb.
6. Overlap: none with Pi built-ins.
7. Removal: `pi mcp remove -l rea` removes the `.pi/mcp.json` entry; delete the skill directory if added.

Re-check when stale: `rea-agents` latest release, Node floor, maintainer count, and whether REA's `setup` adds native Pi client support.
