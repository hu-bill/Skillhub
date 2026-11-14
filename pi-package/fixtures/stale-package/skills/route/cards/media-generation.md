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
do: "Use the Higgsfield CLI with its Agent Skills for video and multi-model media; for still images only, check Pi's built-in codemode models.generateImages() first"
alternative: "Pi built-in codemode models.generateImages(): for still images when an image-capable provider (such as Gemini or OpenRouter) is already authenticated in Pi"
skip:
  - "Community-built Higgsfield MCP servers: unofficial, when Higgsfield publishes its own CLI and hosted MCP connector"
  - "Adding Higgsfield's MCP connector on top of the CLI when you only need on-demand CLI/skill calls"
supersedes: []
ring: trial
trust: third-party
always_on_cost: medium
executes: "A global npm package whose install script downloads the Higgsfield CLI binary from GitHub releases. Calls Higgsfield's API and spends paid credits per generation"
install: "npm i -g @higgsfield/cli, then higgsfield auth login, then npx skills add higgsfield-ai/skills"
undo: "npm uninstall -g @higgsfield/cli, then delete the higgsfield-* folders from ~/.agents/skills/ (or .agents/skills/)"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md
  - https://higgsfield.ai/blog/Generate-AI-Videos-From-Claude-with-Higgsfield-MCP
  - https://www.npmjs.com/package/@higgsfield/cli
  - https://github.com/higgsfield-ai/cli
  - https://github.com/higgsfield-ai/skills
---

## Pattern

Agree on the visual brief before generating and keep variants small because media calls cost money and time. Use native image-model support when the harness already authenticates an image provider; reach for a dedicated media CLI when you need video models or specialized camera/motion controls.

## Pi recipe

- **Still images first check:** With `codemode` enabled (`"defaultTools": ["+codemode"]`), check `models.getAvailableOfType("image")` and call `models.generateImages()` using your existing Pi provider credentials (`docs/codemode.md`), or write SVG/HTML directly for icons and diagrams.
- **Video or multi-model production:** Install `@higgsfield/cli`, run `higgsfield auth login`, and install `higgsfield-ai/skills` (Pi discovers `~/.agents/skills/` and `.agents/skills/` automatically).
- Every Higgsfield API call spends paid credits; name the model (Seedance, Kling, Veo, MiniMax Hailuo) if you have a preference.

## Why skip the others

- Unofficial Higgsfield MCP servers on GitHub route credentials through third-party code when Higgsfield ships a first-party CLI and connector (`https://mcp.higgsfield.ai/mcp`).
- Running both the MCP connector and the CLI duplicates the same capability.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? Partly: Pi 1.5.2 supports **image** generation natively via `models.generateImages()` in `codemode` (`type ModelType = "chat" | "image" | "classifier"` in `docs/codemode.md`) and `ctx.modelRegistry.generateImages()`, but has **no** built-in video generation model type.
2. Publisher: Higgsfield (`higgsfield-ai` on GitHub, five npm maintainers), MIT license.
3. Maintained: `@higgsfield/cli` 1.2.2 released 2026-10-16, 57 npm releases.
4. Always-on: nine skill descriptions in `<available_skills>` if all `higgsfield-*` skills are installed; the CLI binary itself adds 0 tokens.
5. Executes: npm `postinstall` (`node install.js`) downloads a checksum-verified binary from `github.com/higgsfield-ai/cli`; `npx skills add` runs Vercel's `skills` CLI.
6. Overlap: overlaps `models.generateImages()` for basic still images; adds video and commercial model routing.
7. Removal: `npm uninstall -g @higgsfield/cli` and remove `higgsfield-*` directories from `~/.agents/skills/` or `.agents/skills/`.

Re-check when stale: whether Pi adds video model support in `codemode`, `@higgsfield/cli` latest release, and credit terms.
