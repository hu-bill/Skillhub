---
id: frontend-design-quality
kind: capability
symptom: "Build or redesign frontend UI so it looks distinctive and intentional rather than generic AI output"
triggers:
  - "make this UI look designed, not like generic AI slop"
  - "build a distinctive landing page or dashboard frontend"
  - "should I install the frontend-design skill or plugin"
  - "improve the typography, palette and layout quality of this app"
verdict: pick
do: "Install Anthropic's official frontend-design skill (anthropics/skills) into ~/.agents/skills/frontend-design/ or .agents/skills/frontend-design/, and pair UI edits with a real browser screenshot check"
alternative: "Impeccable (npx impeccable install, pbakaus/impeccable): when critiquing, auditing or polishing an existing product UI with structured commands (/impeccable critique, audit, polish)"
skip:
  - "Third-party npm repacks (@sentiolabs/pi-frontend-design, @firstpick/pi-skill-frontend-design): unreviewed snapshots lagging Anthropic's upstream SKILL.md"
  - "Multi-skill anti-slop packs or Python design-engine bundles installed globally for routine UI tasks: add multiple always-on skills or local script dependencies"
supersedes: []
ring: adopt
trust: verified
always_on_cost: low
executes: "Nothing: a single plain-Markdown SKILL.md file with no scripts, hooks, MCP servers or network calls"
install: "mkdir -p ~/.agents/skills/frontend-design && curl -fsSL https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md -o ~/.agents/skills/frontend-design/SKILL.md, then /reload"
undo: "rm -rf ~/.agents/skills/frontend-design (or .agents/skills/frontend-design if installed per project), then /reload"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/anthropics/skills/tree/main/skills/frontend-design
  - https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md
  - https://github.com/pbakaus/impeccable
  - https://www.npmjs.com/package/impeccable
  - https://www.npmjs.com/package/@sentiolabs/pi-frontend-design
  - https://www.npmjs.com/package/@firstpick/pi-skill-frontend-design
---

## Pattern

Without explicit aesthetic constraints, models converge on default system fonts, safe purple-blue gradients, and uniform card grids. Commit to a subject-grounded visual direction, 1–2 deliberate typefaces, explicit CSS color tokens, and a clear focal hierarchy before writing component code—then inspect the rendered page in a real browser.

## Pi recipe

- Install `frontend-design/SKILL.md` into `~/.agents/skills/frontend-design/` (or `.agents/skills/frontend-design/` per project), then run `/reload`; Pi discovers both paths natively (`docs/skills.md`) and exposes `/skill:frontend-design`.
- When modifying an existing app that already has a design system, follow its established tokens instead of inventing a competing palette.
- Do not judge layout from source code alone: render the page and inspect a real browser screenshot with `@playwright/cli` + `read` (see `web-ui-testing`), or generate bespoke hero/illustration assets via `codemode` `models.generateImages()` (see `media-generation`).

## Why skip the others

- `@sentiolabs/pi-frontend-design` (`0.1.1`, `2026-05-06`, 2 releases) and `@firstpick/pi-skill-frontend-design` (`0.1.1`, `2026-09-17`, 2 releases) repackage an older 4.4 KB snapshot of Anthropic's skill rather than the current 9.4 KB upstream `SKILL.md`.
- Multi-skill bundles (4+ skills) or Python script suites add broader always-on prompt cost or local runtime dependencies when a single zero-code Markdown brief suffices.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? No. Pi ships `models.generateImages()` and vision `models.classify()` in `codemode` (`docs/codemode.md`), but no frontend typography or layout design skill. Pi's `docs/skills.md` explicitly cites `anthropics/skills` for Agent Skills examples.
2. Publisher: Anthropic (`anthropics/skills` and `anthropics/claude-plugins-official` 1.1.1, verified byte-for-byte identical `SKILL.md`), `Apache-2.0` (`LICENSE.txt`).
3. Maintained: `anthropics/skills` pushed 2026-11-14 (1,541 open issues/PRs across the monorepo); portable frontmatter (`name`, `description`, `license`) loads cleanly in Pi 1.5.2.
4. Always-on: low—`description` is 191 chars (estimated at ~83 tokens in `<available_skills>`); the 9,363-char (estimated ~2,340-token) body loads via `read` only when invoked.
5. Executes: nothing (`SKILL.md` + `LICENSE.txt` only; direct `curl` avoids running third-party `npx` installers).
6. Overlap: none with Pi built-ins; complements `web-ui-testing` for rendered screenshot verification.
7. Removal: `rm -rf ~/.agents/skills/frontend-design` (or `.agents/skills/frontend-design`), leaving nothing behind. Alternative `impeccable` (4.9.1, 2026-11-14, `paulbakaus`, Apache-2.0, 48 releases, 61 open issues) installs via `npx impeccable install`.

Re-check when stale: upstream `anthropics/skills/skills/frontend-design/SKILL.md` size/frontmatter, `impeccable` latest release, and whether Anthropic publishes an official npm skill package.
