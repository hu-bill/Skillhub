---
id: web-ui-testing
kind: capability
symptom: "Open, inspect and test a live web UI in a real browser"
triggers:
  - "test this web UI in a browser"
  - "click through the app and check if the form works"
  - "should I install the Playwright MCP server"
  - "verify how this page renders and check console errors"
verdict: pick
do: "Use Microsoft's official @playwright/cli with its Agent Skill (playwright-cli install --skills=agents); if the repo already has Playwright tests, run npx playwright test via bash"
alternative: "Microsoft @playwright/mcp per project (pi mcp add -l playwright -- npx -y @playwright/mcp@latest): when stateful exploratory loops benefit from MCP calls inside codemode"
skip:
  - "Unreviewed third-party Playwright Pi wrappers (such as pi-playwright or pi-browser-harness): add third-party skills or in-process extensions when Microsoft ships @playwright/cli and @playwright/mcp"
  - "Setting @playwright/mcp or chrome-devtools-mcp to direct exposure or user scope: declares dozens of browser tool schemas in every session"
supersedes: []
ring: adopt
trust: verified
always_on_cost: low
executes: "A global Node CLI (@playwright/cli, no npm install scripts) that launches headless or headed Playwright browser processes on demand"
install: "npm install -g @playwright/cli@latest && playwright-cli install --skills=agents, then /reload"
undo: "npm uninstall -g @playwright/cli && rm -rf .agents/skills/playwright-cli (and .playwright/ if created), then /reload"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/microsoft/playwright-cli
  - https://www.npmjs.com/package/@playwright/cli
  - https://github.com/microsoft/playwright-mcp
  - https://www.npmjs.com/package/@playwright/mcp
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md
  - https://github.com/nicobailon/pi-web-access
  - https://www.npmjs.com/package/pi-playwright
  - https://www.npmjs.com/package/pi-browser-harness
---

## Pattern

Claims about a rendered interface need browser evidence: accessibility snapshots, DOM state, network or console errors, and screenshots. Concise CLI commands that pull targeted page slices (`find`, `eval`, `screenshot`) spend far fewer context tokens than streaming full accessibility trees on every action.

## Pi recipe

- If the project already has an E2E suite, run `npx playwright test` through `bash` first for deterministic regression checks.
- For interactive browser verification, install `@playwright/cli` and run `playwright-cli install --skills=agents` (**include `=agents`** so it writes `.agents/skills/playwright-cli/SKILL.md`, which Pi discovers; bare `--skills` writes `.claude/skills/`).
- Drive flows via `playwright-cli open <url>` (`--headed` or `playwright-cli show` to watch live), `snapshot` / `find`, `click` / `fill`, and `screenshot` (inspect saved PNGs with Pi's `read` tool).
- If you prefer MCP calls inside `codemode`, register `@playwright/mcp` per project (`pi mcp add -l playwright -- npx -y @playwright/mcp@latest`) and keep Pi's default `codemode` exposure.
- If you need visual design craft rather than browser automation, see `frontend-design-quality`.

## Why skip the others

- Microsoft's own `@playwright/mcp` README directs coding agents to `@playwright/cli` + skills first because CLI commands avoid streaming verbose accessibility trees into context on every step.
- Third-party wrappers (`pi-playwright`, 3 releases; `pi-browser-harness`, in-process extension) add unreviewed supply-chain surface without improving on Microsoft's official packages.
- Registering browser MCP servers with `direct` exposure or at user scope bloats unrelated sessions.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? No. Pi ships `read` (supports images) and `bash`, plus `builtin:mcp` and `builtin:codemode`, but no native browser driver (`docs/cli.md`); URL-fetch packages such as `pi-web-access` fetch pages without interactive DOM automation.
2. Publisher: Microsoft Playwright team (`microsoft/playwright-cli`, maintainers `pavelfeldman`, `yurys`, `dgozman-ms`, `microsoft-oss-releases`, `microsoft1es`), `Apache-2.0`.
3. Maintained: `@playwright/cli` 0.1.24 released 2026-11-10 (33 releases), repo pushed 2026-11-11, 2 open issues, Node `>=18`, works with Pi 1.5.2 via `bash` + `.agents/skills/` (`docs/skills.md`).
4. Always-on: low (estimated at ~45 tokens for the 75-char `playwright-cli` skill description in `.agents/skills/`), or 0 tokens via `playwright-cli --help` without the skill.
5. Executes: Node CLI with no npm `preinstall`/`postinstall` scripts; launches local Chromium/Firefox/WebKit processes (headless auto-closes after 1h idle).
6. Overlap: none with Pi built-ins; complements `npx playwright test`.
7. Removal: `npm uninstall -g @playwright/cli` and `rm -rf .agents/skills/playwright-cli` (leaves shared Playwright browser caches and optional `.playwright/` config). Alternative `@playwright/mcp` (0.0.85, 2026-11-09, 438 releases, 6 open issues, Apache-2.0) removes cleanly with `pi mcp remove -l playwright`.

Re-check when stale: `@playwright/cli` and `@playwright/mcp` latest releases, `--skills=agents` target path in `skillCheck.js`, and whether Pi adds a built-in browser tool.
