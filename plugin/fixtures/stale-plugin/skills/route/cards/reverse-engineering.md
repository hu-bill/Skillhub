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
do: "Use REA: its MCP server plus the reverse-engineer-anything skill"
alternative: "Plain shell tools (strings, objdump, unzip): for one quick question about one small file"
skip:
  - "The reverse-engineering skill in the Anthropic directory (community): a skill only, with no analysis tools behind it"
  - "Registering REA at user scope: its 207 tool names then load in every session. Register it per project"
supersedes: []
ring: adopt
trust: third-party
always_on_cost: medium
executes: "An MCP server started with npx, which downloads and runs the rea-agents npm package. On request it drives local analysis engines, debuggers, Frida and adb"
install: "npx rea-agents setup (interactive: choose Claude Code, review the proposed changes, approve, restart)"
undo: "claude mcp remove rea, then delete ~/.claude/skills/reverse-engineer-anything/"
verified: 2026-11-13
ttl_days: 30
sources:
  - https://github.com/morluto/rea
  - https://www.npmjs.com/package/rea-agents
  - https://rea.tools
---

## Pattern

Claims about a shipped artifact need evidence from the artifact: decompiled code, strings, resources or observed runtime behavior. Give the agent purpose-built analysis tools that return structured evidence. Without them it guesses from file names or pages through raw disassembly in a shell.

## Claude Code recipe

- Use REA when a claim depends on a shipped binary or package, decompilation, runtime observation, or a comparison between builds.
- Do not use it to analyze a repository whose source is complete. REA's own skill says the same.
- If REA's tools are already available in the session, start on the target. Do not run its setup or diagnostics first.
- Register the server at project or local scope, in the projects that do reverse engineering.

## Why skip the others

- The `reverse-engineering` entry in the Anthropic directory lists one skill and no MCP server. It adds instructions but no decompiler, debugger or runtime tooling.
- A user-scope registration lists 207 tool names in every session, whatever the project.

## Evidence

Checked on 2026-11-13.

1. Built in? No. Claude Code has no decompiler or binary analysis tools.
2. Publisher: `morluto` on GitHub and npm, the only npm maintainer. MIT license, public source. Not in the official marketplace or the Anthropic directory.
3. Maintained: release 6.9.0 on 2026-11-12, 35 releases since 2026-07-12, last push 2026-11-13, 1,839 open issues and pull requests.
4. Always-on: 207 tool names plus the server instructions while the server is connected. Estimated at about 2,000 tokens, not measured. Check with `/context`.
5. Executes: `npx` downloads and runs the package, which has no npm install scripts. Its tools can start debuggers, attach Frida, and install or pull packages over adb.
6. Overlap: none with built-in features. The latest release asks for Node `^22.23.4`, `^24.22.1` or `>=26.12.1`.
7. Removal: two things to remove, the MCP registration and the skill folder.

Re-check when stale: latest release date, number of maintainers, whether an official marketplace entry now exists, the tool count.
