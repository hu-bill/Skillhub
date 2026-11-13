---
id: media-generation
kind: capability
symptom: "Generate images or video for a project"
triggers:
  - "generate a product video"
  - "make an image for the landing page"
  - "create a short video ad"
  - "I need AI-generated visuals"
verdict: pick
do: "Use the Higgsfield CLI with its skills"
alternative: "Higgsfield's hosted MCP connector (https://mcp.higgsfield.ai/mcp): in claude.ai or Claude Desktop chats, or when you do not want a global npm install"
skip:
  - "Community-built Higgsfield MCP servers: unofficial, and Higgsfield publishes its own CLI and connector"
  - "Adding the MCP connector to Claude Code on top of the CLI: Higgsfield's own guide points Claude Code to the CLI, and a CLI adds no tool listing to each session"
supersedes: []
ring: trial
trust: third-party
always_on_cost: medium
executes: "A global npm package whose install script downloads the CLI binary from GitHub releases. The CLI calls Higgsfield's API with your account, and every generation spends paid credits"
install: "npm i -g @higgsfield/cli, then higgsfield auth login, then npx skills add higgsfield-ai/skills"
undo: "npm uninstall -g @higgsfield/cli, then delete the higgsfield-* folders from your skills directory"
verified: 2026-11-13
ttl_days: 30
sources:
  - https://higgsfield.ai/blog/Generate-AI-Videos-From-Claude-with-Higgsfield-MCP
  - https://www.npmjs.com/package/@higgsfield/cli
  - https://github.com/higgsfield-ai/cli
  - https://github.com/higgsfield-ai/skills
---

## Pattern

A coding agent has no image or video model of its own. Give it a tool that calls a generation service, and let it choose the model and parameters from a plain description. Generation costs money per call, so agree on the brief before generating and keep the number of variants small.

## Claude Code recipe

- Install the Higgsfield CLI, sign in, and add its skills. Then describe the image or clip: subject, action, camera, length.
- Every generation spends Higgsfield credits and needs a Higgsfield subscription. Higgsfield says its unlimited models and free generations work only on higgsfield.ai.
- Name the model if you care which one is used. Higgsfield lists Seedance, Kling, Veo and MiniMax Hailuo among them. Otherwise one is chosen for you.
- For a diagram, an icon or a simple illustration, ask Claude to write SVG or HTML. That needs no tool and costs no credits.

## Why skip the others

- Unofficial MCP servers for Higgsfield exist on GitHub. With a first-party CLI and a first-party connector available, there is no reason to route your account through a third party's server.
- The connector and the CLI do the same job. In Claude Code the connector's tools would be listed in every session, and the CLI's would not.

## Evidence

Checked on 2026-11-13.

1. Built in? No image or video generation was found in the Claude Code docs index.
2. Publisher: Higgsfield itself (`higgsfield-ai` on GitHub, five npm maintainers). MIT license. Not in an Anthropic marketplace or the MCP Registry.
3. Maintained: CLI 1.2.2 released 2026-10-16, 57 releases since 2026-05-02, 75 open issues and pull requests. Skills repository last pushed 2026-11-05.
4. Always-on: nine skill descriptions if every skill is added. Not measured. The CLI itself adds nothing.
5. Executes: the npm package runs `node install.js` after install, which downloads a release tarball from `github.com/higgsfield-ai/cli` and compares a checksum. `npx skills add` also runs a second third-party package, Vercel's `skills` CLI.
6. Overlap: none with built-in features.
7. Removal: uninstall the npm package and delete the skill folders.

Higgsfield's guide, dated 2026-10-27, says: "Claude Code connects through the Higgsfield CLI instead of the connector URL."

Re-check when stale: whether the guide still sends Claude Code to the CLI, the CLI's latest release, the credit rules, whether an official marketplace or MCP Registry entry now exists.
