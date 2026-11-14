# Spec: Wayfinder Harness Dashboard (`dashboard/`)

- Status: architecture and concurrency rules agreed on 2026-11-14
- Lane: `dashboard/` (self-contained vertical lane; separate from `pi-package/` and `plugin/`)
- Related docs: `CLAUDE.md`, `dashboard/CLAUDE.md`, `docs/spec.md`, `docs/design-brief.md`

## 1. Purpose and Fit with Wayfinder

Wayfinder solves harness sprawl from two angles:

1. **In the moment (`Route`):** When starting a task, tells the developer whether an existing built-in feature, package, skill, MCP server, or working method fits better than the default.
2. **At a glance (`Dashboard`):** Gives a clean visual overview of everything currently installed and configured in the developer's harness across **user**, **project**, and **local** scopes—including always-on context cost, scope overrides, and how installed items map to Wayfinder's decision cards and ledger.

### Core constraints

- **Inspect-first / read-only:** Like `Route`, the dashboard never silently installs packages or rewrites harness configuration files. When suggesting an action (enable, disable, install, prune), it provides the exact CLI command to copy and run.
- **Zero impact on session context:** The dashboard runs out-of-band as a local web UI / CLI command and adds `0` tokens to agent sessions.
- **Secret redaction by default:** Collectors must redact secret values (API keys, tokens, passwords, auth headers, connection URLs with credentials) before data leaves the backend or is rendered in the UI. Only variable names and scope locations are shown.

## 2. Scopes and Harness Sources Inspected

Every inspected item carries its `scope` (`user` | `project` | `local` | `builtin`) and whether a higher-precedence scope overrides it.

Wayfinder ships dual-harness support (**Pi** in `pi-package/` and **Claude Code** in `plugin/`), so the dashboard inspects both harnesses across scopes:

### 2.1 Pi harness (`pi-package/`)

| Scope | Paths / Commands Inspected |
| :- | :- |
| `user` | `~/.pi/agent/settings.json`, `~/.pi/agent/mcp.json`, `~/.pi/agent/skills/`, `~/.agents/skills/`, `~/.pi/agent/extensions/`, `~/.pi/agent/prompts/`, `~/.pi/agent/themes/`, `~/.pi/agent/CLAUDE.md`, `~/.pi/agent/AGENTS.md`, `pi list` |
| `project` | `.pi/settings.json`, `.pi/mcp.json`, `.pi/skills/`, `.agents/skills/`, `.pi/extensions/`, `.pi/prompts/`, `.pi/themes/`, repo `CLAUDE.md` / `AGENTS.md` (and nested context files) |
| `wayfinder` | `${PI_WAYFINDER_DATA:-~/.pi/agent/data/wayfinder}/ledger.jsonl`, `pi-package/skills/route/cards/` |

### 2.2 Claude Code harness (`plugin/`)

| Scope | Paths / Commands Inspected |
| :- | :- |
| `user` | `~/.claude/settings.json`, `~/.claude.json`, `~/.claude/skills/`, `~/.claude/agents/`, `claude plugin list --json` |
| `project` | `.claude/settings.json`, `.mcp.json`, `.claude/skills/`, `.claude/agents/`, `CLAUDE.md` |
| `local` | `.claude/settings.local.json` (per-project overrides, disabled plugins, `Skill(...)` deny rules) |
| `wayfinder` | `~/.claude/plugins/data/wayfinder-agentic-dev-tools/ledger.jsonl`, `plugin/skills/route/cards/` |

## 3. Parallel Feature Slices

Each feature slice owns one isolated domain end-to-end (collector + UI tab/panel + tests) so two developers and their coding agents can work inside `dashboard/` at the same time without touching the same files:

| Slice ID | Collector | UI Directory | What it shows |
| :- | :- | :- | :- |
| `overview` | `collectors/overview.*` | `src/features/overview/` | Multi-scope summary counts, estimated always-on token budget bar, active opt-outs/overrides, quick health warnings |
| `skills` | `collectors/skills.*` | `src/features/skills/` | Skills across user/project scopes, description char & token budget, auto-trigger vs manual-only (`disable-model-invocation`) |
| `mcp` | `collectors/mcp.*` | `src/features/mcp/` | MCP servers per scope, exposure mode (`codemode` vs `direct`), transport/command, redacted env var names, context cost |
| `packages` | `collectors/packages.*` | `src/features/packages/` | Installed Pi packages, extensions, prompt templates, themes (and Claude plugins), enabled/disabled status per scope |
| `configs` | `collectors/configs.*` | `src/features/configs/` | `settings.json` / `settings.local.json` precedence map, `CLAUDE.md` / `AGENTS.md` instruction chain, permission rules |
| `cards-ledger` | `collectors/cards-ledger.*` | `src/features/cards-ledger/` | Wayfinder decision cards (fresh / expiring / stale), `supersedes` overlap alerts against installed tools, ledger history & top `misses` |

## 4. Shared Snapshot Contract (`HarnessSnapshot`)

Backend collectors assemble one JSON snapshot where **each collector writes only its own top-level slice key**:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-14T15:00:00Z",
  "projectRoot": "/path/to/project",
  "activeHarness": "pi",
  "warnings": [],
  "slices": {
    "overview": {},
    "skills": { "items": [] },
    "mcp": { "servers": [] },
    "packages": { "items": [] },
    "configs": { "files": [], "effective": {} },
    "cards-ledger": { "cards": [], "ledger": [], "misses": [] }
  }
}
```

Rules for the contract:

- `dashboard/fixtures/sample-snapshot.json` holds a canonical mock snapshot so UI slices can be developed and tested offline before or while collectors are being built.
- Every collector catches missing files, malformed JSON, or unavailable CLIs and appends a human-readable string to `warnings` instead of throwing.
- Adding fields inside `slices["<slice-id>"]` belongs to that slice's owner; changing the outer envelope (`schemaVersion`, `slices` keys) is a **spine change** and must be coordinated first.

## 5. Internal Layout for Conflict-Free Concurrent Work

```text
dashboard/
├── CLAUDE.md                        agent rules scoped to dashboard/
├── package.json                     isolated dependencies (never use root package.json)
├── shared/
│   └── schema.ts                    outer HarnessSnapshot envelope + Scope types (spine)
├── fixtures/
│   └── sample-snapshot.json         canonical offline fixture (spine)
├── collectors/
│   ├── index.ts                     auto-discovers collector modules (spine)
│   ├── redact.ts                    shared secret-redaction helper (spine)
│   └── <slice-id>.ts                one file per domain slice (feature-owned)
├── src/
│   ├── shell/                       layout, header, scope filter bar, auto-loader (spine)
│   └── features/
│       └── <slice-id>/              one folder per feature slice (feature-owned)
│           ├── feature.tsx          exports { id, title, order, Component }
│           ├── <slice-id>.module.css co-located styles (no global CSS edits)
│           └── __tests__/           slice-local unit/component tests
└── tests/
    └── collectors/
        └── test_<slice-id>.ts       collector-local tests
```

### Why two agents will not collide inside `dashboard/`

1. **Auto-discovery instead of central registration:** `src/shell/` discovers `src/features/*/feature.tsx` automatically (for example via Vite `import.meta.glob('./features/*/feature.tsx', { eager: true })` sorted by `order`), and `collectors/index.*` discovers collector modules automatically. Adding or editing a feature never touches `App.tsx` or a central router.
2. **Co-located styles and tests:** Each slice keeps its own CSS module / scoped classes and its own test files. Nobody appends to a shared `styles.css` or monolithic test file.
3. **Protected spine:** `package.json`, `shared/schema.*`, `src/shell/`, and `collectors/index.*` are changed only in tiny, quick-merged `[spine]` PRs—never opportunistically inside a feature branch.

## 6. Amendment (2026-11-14): first build, all AI apps, usage, discovery

The first working build of `dashboard/` widens the scope from two harnesses to every AI app found on the machine, and adds four slices. This section records what was built and where it departs from sections 1 to 5. Where they differ, this section describes the code.

### 6.1 What changed

| Topic | Sections 1–5 | As built |
| :- | :- | :- |
| Apps inspected | Pi and Claude Code | A registry of apps in `collectors/lib/apps.ts`: Claude Code, Claude desktop, Codex, ChatGPT, Cursor, VS Code, Antigravity, Gemini CLI, Pi, opencode, Windsurf, Zed. Each entry lists where the app is installed, its skill directories and its MCP config files. |
| Slices | `overview`, `skills`, `mcp`, `packages`, `configs`, `cards-ledger` | Collectors: `apps`, `skills`, `mcp`, `packages`, `usage`. Tabs: `map`, `usage`, `skills`, `mcp`, `discover`, `assistant`. `overview`, `configs` and `cards-ledger` are not built yet. |
| Item identity | Per harness | Every skill and server carries a `key` so the same one in several apps is recognised as one (same name and description for a skill; same endpoint or launch package for a server). The map and the sync findings are built on it. |
| Network | None | Two opt-in outbound calls, both started by the user: a registry search in Discover and a Gemini request in Assistant. |

### 6.2 New slices

| Slice ID | Kind | What it does |
| :- | :- | :- |
| `apps` | collector | Which apps are installed, the evidence, and how much of each can be read locally (`full`, `partial`, `none`). |
| `usage` | collector + tab | Tokens per day, model and project from Claude Code transcripts and Codex's thread index; remaining rate-limit windows where an app saves a reading; skill and plugin invocation counts. |
| `map` | tab | Apps in the middle, skills left, MCP servers right, one node per distinct item. |
| `discover` | tab + `server/discover.ts` | Live lookup against skills.sh and the official MCP Registry (and npm `keywords:pi-package` when Pi is installed). |
| `assistant` | tab + `server/gemini.ts` | Local findings from `shared/insights.ts`, plus questions answered by Gemini. |

### 6.3 How the constraints in section 1 are kept

- **Read-only by default, changes only on a confirmed action (see 6.7).** Collectors and tabs write nothing. A finding still comes with the command that would fix it (`ln -s` for a skill folder, `claude mcp add` / `codex mcp add` or a config snippet for a server). Apart from confirmed actions, the one file written is the dashboard's own usage cache under `dashboard/node_modules/.cache/`.
- **No hosted index.** Discover queries existing public registries on demand. Each result shows its registry, a source link, the date checked, and the word "unvetted". Nothing is ranked or endorsed beyond the registry's own install count.
- **Secret redaction.** Unchanged, and now covered by tests that plant fake credentials in a fixture home and assert none appear in the snapshot or in any suggested command.
- **Usage privacy.** Only token counts, model, date and the project folder's base name are read from transcripts. Message text is never parsed into the snapshot.

### 6.4 Gemini

Scanning is deterministic; Gemini only explains the result and turns a plain-language need into search phrases. It is off until `GEMINI_API_KEY` is set in `dashboard/.env.local`, and is called only when the user presses Ask. The request carries app, skill, server and plugin names, skill descriptions and token totals, and nothing else. Without a key, or when the call fails, the same panel shows the local findings.

Checked 2026-11-14 against https://aistudio.google.com/api-reference/generate-content: `POST /v1beta/models/{model}:generateContent`, header `x-goog-api-key`, JSON output through `generationConfig.responseMimeType` and `responseSchema`. Default model `gemini-3.5-flash-lite`. The docs now recommend the Interactions API for new work; `generateContent` remains supported and is used here because its request shape is the simpler one.

### 6.5 Facts this build relies on (checked 2026-11-14)

| Fact | Source |
| :- | :- |
| MCP Registry: `GET /v0.1/servers?search=&version=latest&limit=`, no auth, `search` matches the server name only and needs three characters | https://registry.modelcontextprotocol.io/openapi.yaml |
| skills.sh: `GET /api/search?q=&limit=` works without auth but is undocumented; the documented `/api/v1` needs a token | https://skills.sh/docs/api |
| `npx skills add <owner/repo> --skill <name> -g [-a <agent>]` and its per-agent directories | https://github.com/vercel-labs/skills/blob/main/docs/agents.md |
| Codex loads skills from `.agents/skills` (repo) and `$HOME/.agents/skills` (user); `codex mcp add <name> --url <url>` and `codex mcp add <name> -- <command>` | https://learn.chatgpt.com/docs/build-skills, https://learn.chatgpt.com/docs/extend/mcp |
| Cursor loads `~/.cursor/skills`, `~/.agents/skills` and, for compatibility, `~/.claude/skills` and `~/.codex/skills` | https://cursor.com/docs/skills |
| `claude mcp add --transport http --scope user <name> <url>` and `claude mcp add --scope user <name> -- <command>` | https://code.claude.com/docs/en/mcp |

Read off a live install rather than documentation, and so liable to change without notice: Codex's `state_*.sqlite` thread table and the `rate_limits` block in its rollout files, Claude Code's `skillUsage` / `pluginUsage` counters in `~/.claude.json`, and the Claude desktop app's `plan-usage-history.json`, whose `fh` and `sd` fields are read as the five-hour and seven-day windows by inference.

### 6.6 Open items (see the end of 6.7 for the list)

### 6.7 Amendment (2026-11-14, later the same day): confirmed actions

Section 1 said the dashboard never changes harness configuration and only shows commands. That is relaxed in one narrow way, at the product owner's request: the dashboard can now carry out a change after the user confirms it. "Never silently" and "never automatically" still hold.

**What can be done** (all in `server/actions.ts`, nothing else writes):

| Action | How |
| :- | :- |
| Add a user-level skill to another app | A symlink in that app's skills folder pointing at the existing copy. |
| Remove a skill from an app | A link is unlinked. A real folder is moved to `~/.wayfinder/backups/`, never deleted. Only the app's own folders are touched: an app that merely reads another app's folder (Cursor reading `~/.claude/skills`) is refused, with the reason. |
| Connect an MCP server to another app | Claude Code: `claude mcp add-json --scope user`. Codex: a `[mcp_servers.<name>]` section appended to `config.toml`. Other apps: the entry added to their JSON config. |
| Disconnect an MCP server | `claude mcp remove` / `codex mcp remove`, or the entry removed from the JSON config. User scope only; plugin and project servers are refused. |
| Install from Discover | Skills: one `npx skills add <repo> --skill <name> -g -y -a <agent>…` for the chosen apps. MCP servers: the registry's address or package added as above. |

**Where it is offered:** the map (drag the dot on a skill or server onto an app to connect; click a link to disconnect), the detail panel, Discover's Install button, and "Fix this" on an Assistant finding. Each opens the same dialog, where the user ticks which apps are affected or selects all.

**Guarantees, each covered by a test in `tests/collectors/test_actions.ts`:**

- Nothing happens before the user confirms a plan that names the exact file or command. The plan is recomputed on the server at apply time from a fresh scan.
- A request names items by snapshot id; paths and commands are derived on the server. Registry names and addresses must match a strict pattern (no leading dash, no shell characters, `https` only) or the step is refused.
- Processes are started without a shell, and only `claude`, `codex` and `npx`.
- A config is backed up to `~/.wayfinder/backups/` before it is edited and written atomically. A file with comments is never rewritten; the step is refused and the manual snippet shown.
- Credentials can be copied from one app's config to another's (a checkbox, on by default). The values stay on disk and are absent from the plan, the result and every HTTP response. With `claude mcp add-json` they are briefly present in that process's arguments.
- The two write routes need a per-start token that only a page served by the dashboard can read, a JSON body and a local `Origin`. Demo mode has no write routes.

**Not done:** enabling or disabling plugins, editing project-scoped config, an undo button (the inverse action and the backups serve), and any change to ChatGPT or other cloud-held setups.

Open items:

- `overview`, `configs` and `cards-ledger` from section 3 are still to build.
- Gemini CLI, opencode, Windsurf and Zed paths follow documentation and have not been checked on a machine that has them.
- Claude Code usage is deduplicated per transcript, not across transcripts.
- CI does not run the dashboard's tests yet (`npm test` and `npm run typecheck` in `dashboard/`).

### 6.8 Amendment (2026-11-14, evening): discovery first

The product's stated problem is awareness of good skills, so the first page is now about finding one.

- **Pages:** `explore` (replaces `overview` and `discover`), `skills` ("My skills"), `map`, `mcp`, `usage`, `assistant` ("Ask"). Navigation is plain words in a top bar.
- **Suggestions** (`server/suggest.ts`, `GET /api/suggestions`): the most installed skills on skills.sh in the three topics the user's own skills lean toward, plus two neighbouring topics, minus what is already installed. Shown as rows of cards. This is a third outbound call, and unlike the other two it happens when Explore loads rather than on a button press. What is sent is a few one-word topic queries, and requests for the public listing pages of the returned skills (for their descriptions). Results are cached for 15 minutes.
- **Tags** (`shared/tags.ts`): a fixed list of topics assigned by keyword match on name and description. Deterministic, no model.
- **Skills in other projects:** besides the inspected project, project-scoped skill folders are scanned in every project the apps remember (`projects` in `~/.claude.json`, `[projects]` in `~/.codex/config.toml`), up to 200 folders that still exist. The home folder and `/` are never treated as projects. Such a skill carries `project` (the folder name), is excluded from the always-on cost of the current project, and is never offered for sync.
- **App logos** (`collectors/lib/icons.ts`, `GET /api/app-icon?id=`): the PNG inside the installed app's own `.icns`, served locally. No third-party artwork is added to the repository. The id is matched against the app registry; the path is never taken from the request.

### 6.9 Amendment (2026-11-14, night): depth

- **Skill panel** (`src/features/skills/SkillDetail.tsx`): clicking a card in My skills opens a panel listing every app and every project the skill is in, with Add and Remove for each.
- **Skills inside projects are now managed, not only read.** `skill.project.add` copies a skill into a project's skill folder for one app; removing a project skill moves its folder to the backups. The target project must be one the scan found (`slices.skills.projects`), so a request cannot name a folder of its own.
- **Assistant commands** (`server/command.ts`, `POST /api/assistant/command`): Gemini is given the setup with short ids and returns choices from a fixed list (six kinds of change, a map view, a registry search). The server resolves the ids, plans the changes with the same code as a manual action and returns the plan. The route never applies anything; unknown ids and unknown operations are dropped. Project folder names are now part of what is sent to Google when the user presses Send.
- **Map panel**: assistant, selected item, and view controls (show, order, focus app, shared only, project skills, bundles). The assistant can set the same view fields; anything else it returns is ignored.
- **App colours** come from the apps' own icons (`--app-<id>` tokens).
- The confirmation dialog shows the logo of the app each step is about (`PlannedStep.app`).
