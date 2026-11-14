# APIs, frameworks and tools

Everything Skillhub is built with or talks to, with the version, where it is used in the code, and what data crosses the boundary. Versions are the ones resolved in `dashboard/package-lock.json` or installed on the development machine on 2026-11-14.

Naming: the product is Skillhub. Its in-session router was built under the working name `wayfinder`, and that identifier is still in command names, package names, paths and environment variables. This file uses the identifiers exactly as they appear in the code.

## 1. At a glance

| Layer | Technology | Where |
| :- | :- | :- |
| Dashboard UI | React 19, TypeScript, CSS Modules, hand-written SVG | `dashboard/src/` |
| Dashboard server | Node.js 22.13 or newer, Vite 8 dev server with a custom API middleware | `dashboard/vite.config.ts`, `dashboard/server/` |
| Dashboard data | Read-only collectors over local config files, no database | `dashboard/collectors/` |
| Router for Pi | Agent Skill + Pi extension (TypeScript) + Python CLI | `pi-package/` |
| Router for Claude Code | Claude Code plugin: skill, subagent, Python CLI | `plugin/`, `.claude-plugin/` |
| Authoring and evals | Python 3.12, PyYAML | `tools/`, `tests/` |
| Model APIs | Google Gemini (optional, user's own key); the coding agent's own model for the router | `dashboard/server/gemini.ts`, `dashboard/server/command.ts` |
| Public registries | skills.sh, the official MCP Registry, the npm registry | `dashboard/server/discover.ts`, `pi-package/bin/wayfinder` |
| CI | GitHub Actions | `.github/workflows/check.yml` |

There is no hosted backend, no account system, no database and no telemetry. Both parts run on the developer's own computer.

## 2. Languages and runtimes

| Technology | Version | Used for |
| :- | :- | :- |
| TypeScript | 7.0.2 (`strict`, `noEmit`) | The whole dashboard and the Pi extension |
| Node.js | 22.13 or newer (`engines` in `dashboard/package.json`); developed on 24.21 | Runs the dashboard. Built-in modules used: `node:fs`, `node:http` types, `node:child_process` (`execFile`, never a shell), `node:crypto` (the write token), `node:readline`, and `node:sqlite` (read-only, for Codex's local thread index, when the runtime has it) |
| Python | 3.12 | The router's CLI (`bin/wayfinder`, standard library only), the authoring tools and the unit tests |
| Markdown with YAML front matter | | Decision cards, skills, the scout prompt and every eval case |

## 3. Frameworks and libraries

### 3.1 Dashboard (`dashboard/package.json`)

| Package | Version | License | What it does here |
| :- | :- | :- | :- |
| `react`, `react-dom` | 19.3.1 | MIT | The interface. Plain function components and hooks; no router, state library or component kit |
| `vite` | 8.3.8 | MIT | One process serves the page and the API. `configureServer` mounts `/api`, `ssrLoadModule` loads the server code, and `import.meta.glob` discovers collectors and tabs without a central registry |
| `@vitejs/plugin-react` | 6.3.0 | MIT | JSX transform and fast refresh |
| `typescript` | 7.0.2 | Apache-2.0 | Type checking (`npm run typecheck`) |
| `vitest` | 5.1.0 | MIT | Unit tests for collectors, redaction, actions and the fixture (`npm test`) |
| `smol-toml` | 1.9.1 | BSD-3-Clause | Parses Codex's `config.toml`, and validates the file again before a section is appended |
| `@fontsource-variable/geist`, `geist-mono`, `outfit` | 5.3.0 | OFL-1.1 | Fonts bundled with the app, so nothing is fetched from a font service on load |
| `@types/node`, `@types/react`, `@types/react-dom` | 22.20.5, 19.3.0, 19.3.0 | MIT | Type definitions |

Charts and the map are drawn as SVG in the feature code. No chart or graph library is used. The visual language is in [`dashboard/DESIGN.md`](../dashboard/DESIGN.md).

### 3.2 Router for Pi (`pi-package/package.json`)

| Package or standard | Version | What it does here |
| :- | :- | :- |
| [Pi coding agent](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`) | 1.5.2 | The host. Extension API used: `registerCommand`, `registerFlag`, `registerTool` with `exposure: "deferred"`, `registerEntryRenderer`, `appendEntry`, `sendUserMessage`, and the `session_start` and `tool_call` events |
| `@earendil-works/pi-agent-core` | peer | Declared because Pi's extension types depend on it; not imported directly |
| `@earendil-works/pi-ai` | peer | `StringEnum` for tool parameters |
| `@earendil-works/pi-tui` | peer | `Box` and `Text` for the `/wayfinder` output in the terminal UI |
| `typebox` | peer | JSON Schema for the three tool parameter objects |
| [Agent Skills](https://agentskills.io) (`SKILL.md`) | | The `route` skill. Its description (954 of 1,024 characters) is the only text always in the model's context |
| Pi package format | | `"keywords": ["pi-package"]` and the `pi` block in `package.json` declare the extension and the skill folder |

All five npm packages are peer dependencies supplied by Pi. The package installs nothing of its own.

### 3.3 Router for Claude Code (`plugin/`)

| Technology | Version checked | What it does here |
| :- | :- | :- |
| Claude Code plugin format | Claude Code 2.1.322 | `plugin/.claude-plugin/plugin.json`, a skill, a subagent (`agents/scout.md`), an executable on the Bash tool's PATH (`bin/wayfinder`) and eval suites |
| Local plugin marketplace | | `.claude-plugin/marketplace.json` makes the repository a one-plugin marketplace |
| `claude plugin eval` | 2.1.269 or newer | Runs each eval case with and without the plugin and reports the difference |

### 3.4 Authoring tools

| Package | Used by | Note |
| :- | :- | :- |
| PyYAML | `tools/cards.py`, `tools/pi_eval.py`, some unit tests | The only third-party Python dependency. Not needed at run time: the shipped CLI uses the standard library only |
| `unittest` | `tests/` | Standard library |

## 4. External APIs

Four services are called. Each call is listed with its trigger, because "what leaves the machine, and when" is the main privacy question for a tool that reads local configuration.

### 4.1 Google Gemini API

| | |
| :- | :- |
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Auth | The user's own key in the `x-goog-api-key` header. Read from `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `dashboard/.env.local`, which is git-ignored |
| Model | `gemini-3.5-flash-lite` by default; `GEMINI_MODEL` overrides it |
| Features used | `systemInstruction`, and structured JSON output through `generationConfig.responseMimeType` and `responseSchema` |
| Called from | `dashboard/server/gemini.ts` (the Ask tab) and `dashboard/server/command.ts` (the assistant on the map) |
| Trigger | Only when the user presses Ask or Send. Never on page load. Off entirely until a key is set |
| Sent | Names of detected apps, skills, MCP servers and plugins; skill descriptions and tags; token totals; for the map assistant, project folder names; the user's question |
| Never sent | File contents, commands, URLs, full paths, env or header names, credentials |
| Limits | 45 second timeout. When a call fails, the Ask tab shows the locally computed findings instead and the map assistant says it could not be reached |
| Docs checked | 2026-11-14, https://aistudio.google.com/api-reference/generate-content |

Gemini never acts. In the Ask tab it explains the scan and proposes search phrases. On the map it chooses from a fixed list of six operations by short id (`S3`, `M1`, `P2`); the server resolves the ids, plans the change with the same code as a manual action, and the user confirms it in the usual dialog. A reply that names an unknown id proposes nothing.

### 4.2 Official MCP Registry

| | |
| :- | :- |
| Endpoint | `GET https://registry.modelcontextprotocol.io/v0.1/servers?search=<term>&version=latest&limit=20` |
| Auth | None |
| Called from | `dashboard/server/discover.ts` (Explore search). The router's scout is also told to consult the registry (`pi-package/agents/scout.md`) |
| Trigger | A search typed in Explore |
| Sent | The first word of the search |
| Docs checked | 2026-11-14, https://registry.modelcontextprotocol.io/openapi.yaml |

### 4.3 skills.sh

| | |
| :- | :- |
| Endpoints | `GET https://skills.sh/api/search?q=<query>&limit=<n>` and the public listing page `https://skills.sh/<owner>/<repo>/<skill>` (for its one-line description) |
| Auth | None. The search endpoint is undocumented and may change |
| Called from | `dashboard/server/discover.ts`, `dashboard/server/suggest.ts`, `dashboard/server/command.ts` |
| Trigger | A search in Explore, a registry search the map assistant asks for, and loading the Explore page (suggestions) |
| Sent | The search text, or for suggestions a few one-word topics such as "design". Nothing about the user's setup |
| Cache | Suggestions for 15 minutes; descriptions for the life of the process |

Loading Explore is the one place the dashboard contacts the network without a button press. Demo mode (`npm run demo`) replaces the scan of the machine with bundled data, but Explore's suggestions and search still query the public registries.

### 4.4 npm registry

| | |
| :- | :- |
| Endpoint | `GET https://registry.npmjs.org/-/v1/search?text=keywords:pi-package+<terms>&size=<n>` |
| Auth | None |
| Called from | `pi-package/bin/wayfinder catalog search` (15 second timeout, skipped when `PI_OFFLINE=1`) and `dashboard/server/discover.ts` when Pi is installed |
| Trigger | The router's live lookup for a task no card covers; a search in Explore |
| Sent | The search keywords. The router is told to use three to five generic words and to leave out file names, company names and code |

### 4.5 Model calls made by the router

The router itself calls no model API. It is a skill that the developer's own coding agent reads, so its reasoning runs on whatever model that agent is configured with. The scout (`wayfinder scout`) starts a second, isolated `pi` process on the same configuration.

## 5. Command-line tools the code starts

Every process is started with an argument list and no shell.

| Tool | Started by | For |
| :- | :- | :- |
| `claude mcp add-json`, `claude mcp remove` | `dashboard/server/actions.ts` | Connecting or disconnecting an MCP server in Claude Code, after confirmation |
| `codex mcp remove` | `dashboard/server/actions.ts` | Disconnecting an MCP server in Codex. Connecting appends a section to `~/.codex/config.toml` instead |
| `npx skills add` ([vercel-labs/skills](https://github.com/vercel-labs/skills)) | `dashboard/server/actions.ts` | Installing a skill found in Explore, after confirmation |
| `python3 bin/wayfinder` | `pi-package/extensions/index.ts` | Ledger, catalog search and scout, on behalf of the `/wayfinder` command and the deferred tools |
| `pi --print …` | `pi-package/bin/wayfinder scout` | The isolated, read-only live lookup |
| `pi --mode json …` | `tools/pi_eval.py` | One eval run |
| `claude plugin list --available --json` | `plugin/bin/wayfinder catalog search` | The Claude Code plugin catalog, read locally |

## 6. Local data sources

The dashboard reads the configuration of twelve AI apps: Claude Code, Claude desktop, Codex, ChatGPT, Cursor, VS Code (Copilot), Antigravity, Gemini CLI, Pi, opencode, Windsurf and Zed. The paths for each are data in [`dashboard/collectors/lib/apps.ts`](../dashboard/collectors/lib/apps.ts): skill folders, MCP config files (JSON or TOML) and the evidence that the app is installed.

Token usage comes from Claude Code's session transcripts under `~/.claude/projects` (numbers, model, date and project folder name only) and from Codex's local SQLite thread index and rollout files. What cannot be read from disk is listed in [`dashboard/README.md`](../dashboard/README.md#apps-it-looks-for).

## 7. Development and quality tools

| Tool | Use |
| :- | :- |
| Git and GitHub pull requests | One short-lived branch per lane or slice; rules in [`CLAUDE.md`](../CLAUDE.md) |
| GitHub Actions (`actions/checkout@v4`, `actions/setup-python@v5`) | `check.yml` validates the cards and runs the Python unit tests on every push and pull request. No model calls |
| Vitest, `tsc` | Dashboard tests and type check, run locally |
| `tools/cards.py` | Validates the card schema, regenerates `INDEX.md` and the stale-card fixtures |
| `tools/pi_eval.py`, `claude plugin eval` | Routing evals with and without the package. Real model calls, run locally |
| Mermaid, Shields.io | Diagrams and badges in the README |

### AI tools used during development

The project was built with coding agents, which is also why it exists. The repository carries their instructions: [`CLAUDE.md`](../CLAUDE.md) and [`dashboard/CLAUDE.md`](../dashboard/CLAUDE.md) (lane and slice rules that let two people and their agents work at once), and the maintainer skill `new-card` for both harnesses (`.claude/skills/new-card/`, `.pi/skills/new-card/`). Claude Code and Pi were the agents used.

## 8. What is not a dependency

Decision cards name third-party tools as recommendations, for example REA, Plannotator or the Higgsfield CLI. None of them is a dependency, none is bundled, and nothing in this repository installs them. A card prints the install command and the developer decides.
