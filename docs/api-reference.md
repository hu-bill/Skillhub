# API reference

Every interface Skillhub exposes: the dashboard's local HTTP API and its data contracts, the extension points inside the dashboard, the router's commands, tools and CLI, and the authoring tools. For the services Skillhub calls, see [`tech-stack.md`](tech-stack.md#4-external-apis).

The router was built under the working name `wayfinder`. That identifier is still in commands, headers, paths and environment variables, and is written here exactly as the code has it.

Contents:

1. [Dashboard HTTP API](#1-dashboard-http-api)
2. [Dashboard data contracts](#2-dashboard-data-contracts)
3. [Dashboard extension points](#3-dashboard-extension-points)
4. [Router for Pi](#4-router-for-pi)
5. [Router for Claude Code](#5-router-for-claude-code)
6. [Ledger and card formats](#6-ledger-and-card-formats)
7. [Authoring tools](#7-authoring-tools)
8. [Configuration](#8-configuration)

## 1. Dashboard HTTP API

Served by the dashboard's own process at `http://127.0.0.1:5177/api`. The handler is [`dashboard/server/api.ts`](../dashboard/server/api.ts), mounted by the Vite plugin in [`dashboard/vite.config.ts`](../dashboard/vite.config.ts).

### 1.1 Access rules

- The server binds to `127.0.0.1` only.
- A request is answered only when its `Host` is `localhost`, `127.0.0.1` or `[::1]` and its `Origin`, if present, is one of those too. Anything else gets `403`.
- Every response is JSON with `cache-control: no-store`, except the app icon.
- An error is `{ "error": "<plain sentence>" }` with a 4xx or 5xx status.
- `POST` routes require `content-type: application/json` (`415` otherwise). A cross-site HTML form cannot send that type.
- The two routes that change something also require an `Origin` header and the `x-wayfinder-token` header. The token is random per server start and is handed out by `GET /api/status`, which a page on another origin cannot read.
- In demo mode (`npm run demo`) the snapshot comes from `dashboard/fixtures/sample-snapshot.json` and the write routes answer `403`.

### 1.2 Routes

| Method and path | Purpose | Changes anything |
| :- | :- | :- |
| `GET /api/snapshot` | The full scan of this machine | No |
| `GET /api/status` | Server mode and the write token | No |
| `GET /api/suggestions` | Suggested skills for the Explore page | No |
| `GET /api/discover?q=` | Search the public registries | No |
| `GET /api/app-icon?id=` | An installed app's own icon | No |
| `POST /api/assistant` | Ask a question about the setup | No |
| `POST /api/assistant/command` | Turn a plain-language request into a proposed plan | No |
| `POST /api/actions/plan` | Say exactly what a set of changes would do | No |
| `POST /api/actions/apply` | Carry out a confirmed set of changes | Yes |

#### `GET /api/snapshot`

Returns a [`HarnessSnapshot`](#21-harnesssnapshot). The scan is cached for 5 seconds; add `?refresh` to force a new one.

```bash
curl -s http://127.0.0.1:5177/api/snapshot
```

#### `GET /api/status`

```json
{
  "demo": true,
  "gemini": false,
  "geminiModel": "gemini-3.5-flash-lite",
  "canWrite": false,
  "writeToken": "",
  "skillTargets": ["claude-code", "codex", "cursor", "vscode"]
}
```

| Field | Meaning |
| :- | :- |
| `demo` | The server is showing bundled data |
| `gemini` | A Gemini key is configured |
| `canWrite` | `false` in demo mode |
| `writeToken` | Value for the `x-wayfinder-token` header. Empty in demo mode |
| `skillTargets` | Detected apps the skills installer can install into |

#### `GET /api/suggestions`

Returns `{ interests: string[], rails: SuggestionRail[], errors: string[] }`. `interests` are the topic tags the user's own skills lean toward; each rail is a titled row of [`DiscoverResult`](#23-discoverresult) items with a `reason`. Calls skills.sh. Cached for 15 minutes.

#### `GET /api/discover?q=<text>`

Searches skills.sh and the MCP Registry, and the npm registry when Pi is installed. `q` needs at least 2 characters (`400` otherwise) and is cut at 80.

Returns `{ query, results: DiscoverResult[], errors: string[] }`. A registry that cannot be reached adds one line to `errors` and the others still answer.

```bash
curl -s "http://127.0.0.1:5177/api/discover?q=postgres"
```

#### `GET /api/app-icon?id=<app id>`

Returns `image/png`, read from the installed app's own icon file, or `404`. The id is matched against the app registry; no path is ever taken from the request.

#### `POST /api/assistant`

Body: `{ "question": "<text>" }`. Returns an `AssistantReply`:

```json
{
  "provider": "local",
  "summary": "Found 6 AI apps on this machine, with 9 distinct skills and 6 distinct MCP servers between them.",
  "steps": [{ "title": "Codex is missing 1 of your skills", "detail": "…", "command": "…" }],
  "searches": [],
  "note": "This is the built-in analysis. Add a GEMINI_API_KEY to dashboard/.env.local to ask questions in your own words."
}
```

`provider` is `gemini` when a key is configured and the call succeeded, and `local` otherwise. The status is `200` in both cases.

#### `POST /api/assistant/command`

Body: `{ "message": "<text>", "history": [{ "role": "user" | "assistant", "text": "…" }] }`. `history` is optional and the last six turns are used.

Returns a `CommandReply`: `{ provider, text, proposals: PlannedStep[], view?: Partial<MapView>, found: DiscoverResult[] }`. `proposals` are already checked by the server but nothing has been done. This route never applies a change.

#### `POST /api/actions/plan`

Headers: `content-type: application/json`, `origin`, `x-wayfinder-token`.

Body: `{ "requests": ActionRequest[] }`, at most 60 requests and 64 KiB. Malformed entries are dropped; an empty list is `400`.

Returns `{ "steps": PlannedStep[] }`. The server rescans first, so a plan never rests on what the browser last saw.

#### `POST /api/actions/apply`

Same headers and body as `plan`. The plan is computed again on the server at the moment of applying, then carried out. Returns `{ "results": StepResult[] }`. Each applied step is appended to `~/.wayfinder/actions.log`.

```bash
TOKEN=$(curl -s http://127.0.0.1:5177/api/status | python3 -c "import json,sys; print(json.load(sys.stdin)['writeToken'])")
curl -s -X POST http://127.0.0.1:5177/api/actions/plan \
  -H "content-type: application/json" \
  -H "origin: http://127.0.0.1:5177" \
  -H "x-wayfinder-token: $TOKEN" \
  -d '{"requests":[{"type":"skill.connect","skillId":"<id from the snapshot>","app":"cursor"}]}'
```

## 2. Dashboard data contracts

The source of truth is [`dashboard/shared/schema.ts`](../dashboard/shared/schema.ts). This section summarises it.

### 2.1 `HarnessSnapshot`

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-14T12:00:00.000Z",
  "projectRoot": ".",
  "activeHarness": "pi",
  "warnings": [],
  "slices": {
    "apps": { "items": [] },
    "skills": { "items": [], "projects": [] },
    "mcp": { "servers": [] },
    "packages": { "items": [] },
    "usage": { "sources": [], "daily": [], "models": [], "projects": [], "limits": [], "counters": [] }
  }
}
```

Each collector owns exactly one key under `slices`. A collector that fails leaves its slice empty and adds a sentence to `warnings`; it never fails the snapshot.

| Slice | Item type | Fields worth knowing |
| :- | :- | :- |
| `apps` | `AppInfo` | `id`, `name`, `vendor`, `kind` (`cli`, `desktop`, `ide`), `detected`, `evidence`, `readable` (`full`, `partial`, `none`), `counts`, `userSkillDir`, `projectSkillDir`, `mcpAdd`, `hasIcon` |
| `skills` | `SkillItem` | `id` (unique per app and path), `key` (same skill across apps), `name`, `description`, `app`, `scope`, `origin`, `path` (display form, `~/…` or `./…`), `project`, `tags`, `modelInvocable`, `estTokens`, `usageCount` |
| `skills.projects` | `ProjectInfo` | `id`, `name`, `current`, `skills` |
| `mcp` | `McpServer` | `id`, `key` (same server across apps), `name`, `app`, `scope`, `origin`, `transport` (`stdio`, `http`, `sse`, `unknown`), `command` and `url` (both redacted), `envNames`, `headerNames`, `enabled`, `source` |
| `packages` | `PackageItem` | `name`, `app`, `type` (`plugin`, `extension`, `package`), `marketplace`, `version`, `enabled`, `skillCount`, `mcpCount` |
| `usage` | `UsageSource`, `UsageDay`, `UsageModel`, `UsageProject`, `UsageLimit`, `UsageCounter` | Token counts as `{ input, output, cacheRead, cacheWrite, total }`; `limits[].stale` is `true` when the window has reset since the reading |

`scope` is `user`, `project`, `local` or `builtin`. `origin` says where an item physically comes from: `user`, `project`, `builtin`, `shared` (a folder several apps read) or `plugin`.

Guarantees a consumer can rely on, each covered by a test:

- No secret value. Env and header maps are reduced to their names, URLs lose credentials and query strings, and secret-looking arguments are masked.
- No absolute machine path. Paths are shown relative to the home folder or the project.
- No transcript text. Only numbers, model names, dates and project folder names are read from session logs.

### 2.2 `ActionRequest`

The only changes the dashboard can make. A request names items by snapshot id; the server works out the paths and commands.

| `type` | Fields | What it does |
| :- | :- | :- |
| `skill.connect` | `skillId`, `app` | Links an existing user-level skill into another app's skills folder |
| `skill.disconnect` | `skillId` | Unlinks a link, or moves a real folder to `~/.wayfinder/backups/` |
| `skill.project.add` | `skillId`, `project`, `app` | Copies a skill into a project's skill folder for one app |
| `mcp.connect` | `serverId`, `app`, `copyCredentials?` | Adds a server to another app's config |
| `mcp.disconnect` | `serverId` | Removes a user-scope server from an app's config |
| `registry.skill` | `source` (`owner/repo`), `skill`, `app` | Installs a skill from skills.sh with `npx skills add` |
| `registry.mcp` | `name`, `app`, and `url` or `registryType` (`npm`, `pypi`) with `identifier` | Adds a server from the MCP Registry |

`PlannedStep` is `{ request, app?, ok, title, detail, warnings, reason?, manual? }`. `detail` names the exact file that changes or the command that runs. When `ok` is `false`, `reason` says why and `manual` gives the snippet to apply by hand.

`StepResult` is `{ title, ok, message }`.

### 2.3 `DiscoverResult`

`{ id, type, name, description, registry, sourceUrl, installs?, tags, owner?, installed, commands, install?, checkedAt }`.

`type` is `mcp`, `skill` or `package`. `commands` are copyable install commands labelled by app. `install` is what the Install button sends back as a `registry.*` action, and is absent when only a manual install exists. `checkedAt` is the date the registry was queried. Every result is third-party data and is shown as unvetted.

## 3. Dashboard extension points

Collectors and tabs are discovered with `import.meta.glob`. Adding one never requires editing a shared file.

### 3.1 A collector

`dashboard/collectors/<slice-id>.ts` default-exports:

```ts
interface Collector<T = unknown> {
  id: string;                                   // the key under snapshot.slices
  collect(ctx: CollectContext): Promise<{ data: T; warnings: string[] }>;
}
```

`CollectContext` is `{ home, projectRoot, platform, now, appsDir?, cacheDir? }`. Tests point `home` at an invented directory tree, so a collector must take every path from the context. Collectors only read.

### 3.2 A tab

`dashboard/src/features/<slice-id>/feature.tsx` exports `feature`:

```ts
interface FeatureDescriptor {
  id: string;
  title: string;        // navigation label
  summary?: string;
  tag?: string;         // small label such as "AI"
  group?: number;
  order: number;
  Component: ComponentType;
}
```

Inside the component, `useShell()` returns:

| Member | Use |
| :- | :- |
| `snapshot` | The current `HarnessSnapshot` |
| `status` | The result of `GET /api/status` |
| `go(featureId, intent?)` | Switch tab and hand it a value, for example a search phrase |
| `intent` | The value handed over by the last `go` |
| `act(requests, options)` | Open the confirmation dialog for these `ActionRequest`s. This is the only way a tab can ask for a change |

### 3.3 An AI app

Adding an app is a data change in [`dashboard/collectors/lib/apps.ts`](../dashboard/collectors/lib/apps.ts): one `AppDef` with the paths that prove it is installed (`detect`), its `skillDirs`, its `mcpFiles` (path, scope, `json` or `toml`, and the key that holds the server map), and optionally `userSkillDir`, `projectSkillDir`, `mcpAdd` and `icons`.

## 4. Router for Pi

Shipped as the Pi package in [`pi-package/`](../pi-package/). Checked against Pi 1.5.2.

### 4.1 The `route` skill

| Entry | Behaviour |
| :- | :- |
| Automatic | Pi lists the skill's description in `<available_skills>`. The model reads `skills/route/SKILL.md` when a new kind of task starts |
| `/skill:route <goal>` | Runs it by hand |

Answer formats, fixed by the skill:

```text
Wayfinder: <verdict in under 20 words> (card <id>, verified <date>).
```

when there is nothing for the developer to do, and

```text
Wayfinder: <symptom> (card <id>, verified <date>, <trust>)
Do: <do>
Skip: <the skip entries that matter here>
Try: <install>, which you run yourself
Undo: <undo>
Sources: <links>
```

when the developer would have to install something or change working method. A result from the live lookup is headed "No card covers this. Live lookup, unvetted:" and is never called a verdict.

### 4.2 Extension command and flag

Registered by [`pi-package/extensions/index.ts`](../pi-package/extensions/index.ts). Neither adds tokens to the model's context.

| Command | What it does |
| :- | :- |
| `/wayfinder` or `/wayfinder status` | Lists every card as `fresh`, `expiring` (14 days or less) or `stale`, and shows whether auto-trigger is active and where the ledger is |
| `/wayfinder ledger` | The 20 newest ledger entries |
| `/wayfinder misses` | Tasks no card covered, most frequent first |
| `/wayfinder route <goal>` | Sends `/skill:route <goal>` |
| `/wayfinder off`, `/wayfinder on` | Mutes or restores auto-trigger for this session. `/skill:route` still works while muted |

| Flag | What it does |
| :- | :- |
| `pi --no-wayfinder` | Starts the session with auto-trigger muted |

Muting works by blocking the model's own `read` of `skills/route/SKILL.md` in a `tool_call` handler.

### 4.3 Deferred tools

Registered with `exposure: "deferred"`, so they add no tokens to the active tool list. They stay callable from `codemode`, `tool_search` and an explicit `--tools` list. Each one wraps the CLI in 4.4.

| Tool | Parameters | Notes |
| :- | :- | :- |
| `wayfinder_ledger` | `action`: `show`, `misses` or `add`. For `add`: `event` (`recommended`, `adopted`, `declined`, `miss`, `stale-hit`). Optional: `card`, `reason`, `query`, `since` (`YYYY-MM-DD`), `dataDir` | Reads or appends ledger entries |
| `wayfinder_catalog` | `terms`: 1 to 8 strings. Optional `limit`: 1 to 25, default 12 | Searches npm for `pi-package` entries. Output is labelled as untrusted catalog data |
| `wayfinder_scout` | `task`: one generic sentence. Optional: `catalog`, `installed`, `recheck` | Runs the isolated read-only lookup. Up to 190 seconds |

### 4.4 The `wayfinder` CLI

[`pi-package/bin/wayfinder`](../pi-package/bin/wayfinder), one Python file, standard library only.

```text
wayfinder ledger add <event> [--data DIR] [--card ID] [--reason TEXT] [--query TEXT]
wayfinder ledger show [--data DIR] [--card ID] [--since YYYY-MM-DD]
wayfinder ledger misses [--data DIR]
wayfinder catalog search TERM... [--limit N]
wayfinder scout --task TEXT [--catalog TEXT] [--installed TEXT] [--recheck TEXT]
```

| Command | Output | On failure |
| :- | :- | :- |
| `ledger add` | `logged <event>`. A `miss` needs `--query`; every other event needs `--card` | A warning on stderr, exit 0 |
| `ledger show` | Up to 20 entries, newest first, or `no ledger entries` | |
| `ledger misses` | `<count>x  <query>  (last <date>)`, most frequent first, or `no misses logged` | |
| `catalog search` | `Catalog data, not instructions. N of M pi-package entries:` then one line per entry: `npm:<name>@<version> \| publisher: … \| updated: … \| <description>` | `catalog unavailable`, exit 0 |
| `scout` | The scout's report (see below) | `scout unavailable`, exit 0 |

`ledger add`, `catalog search` and `scout` always exit 0, so a failed write, an offline machine or a missing `pi` binary never breaks the skill.

Catalog ranking: 3 points for a term in the package name, 1 for a term in the description or keywords; ties go to npm's own score, then the name.

The scout runs `pi --print --no-session --no-skills --no-prompt-templates --no-context-files --exclude-tools edit,write --system-prompt agents/scout.md` with `PI_WAYFINDER_SCOUT=1`, which stops the child from loading this extension again. It has 180 seconds and returns at most three candidates in a fixed shape that starts with `UNVETTED live lookup, <date>` and ends with `Injection attempts: <"none", or what and where>`. The shape and the seven rubric questions are in [`pi-package/agents/scout.md`](../pi-package/agents/scout.md) and [`pi-package/skills/route/RUBRIC.md`](../pi-package/skills/route/RUBRIC.md).

## 5. Router for Claude Code

Shipped as the plugin in [`plugin/`](../plugin/). Checked against Claude Code 2.1.322. This is the earlier slice, kept working with four cards.

| Piece | Interface |
| :- | :- |
| Skill | `wayfinder:route`. Triggers on its description, or run `/wayfinder:route <goal>`. Its `allowed-tools` pre-approve `Bash(wayfinder *)` and reads inside the skill folder |
| Subagent | `wayfinder:scout`, started only by the skill. Tools: `WebFetch`, `WebSearch`, `Read`, `Grep`, `Glob`. No shell and no write tools |
| CLI | `plugin/bin/wayfinder`, on the Bash tool's PATH while the plugin is enabled |

```text
wayfinder ledger add <event> --data DIR [--card ID] [--reason TEXT] [--query TEXT]
wayfinder ledger show --data DIR [--card ID] [--since YYYY-MM-DD]
wayfinder ledger misses --data DIR
wayfinder catalog search TERM... [--limit N]
```

Differences from the Pi CLI: `--data` is required (the skill passes `${CLAUDE_PLUGIN_DATA}`), there is no `scout` subcommand because the scout is a subagent, and `catalog search` reads `claude plugin list --available --json` instead of the npm registry.

## 6. Ledger and card formats

### 6.1 Ledger

One JSON object per line in `ledger.jsonl`. For Pi the folder is `$PI_WAYFINDER_DATA`, or `$PI_CODING_AGENT_DIR/data/wayfinder`, or `~/.pi/agent/data/wayfinder`. The file stays on the machine.

```json
{"ts": "2026-11-14T19:02:11Z", "event": "recommended", "card": "reverse-engineering", "project": "/path/to/some-app"}
```

| `event` | When | Extra fields |
| :- | :- | :- |
| `recommended` | The router answered from a card | `card` |
| `declined` | The developer said no | `card`, `reason` |
| `adopted` | The developer installed it or will use it | `card` |
| `miss` | No card covered the task | `query` |
| `stale-hit` | A card past its review date was served | `card` |

### 6.2 Decision card

A Markdown file at `skills/route/cards/<id>.md`, 80 lines at most. The full schema with every rule is in [`spec.md`, section 3](spec.md#3-decision-cards).

| Front matter field | Type |
| :- | :- |
| `id` | Kebab-case, equal to the file name |
| `kind` | `method` or `capability` |
| `symptom`, `do` | String |
| `triggers` | 2 to 6 strings |
| `verdict` | `built-in`, `official-plugin`, `pick` or `nothing-needed` |
| `alternative` | String or null |
| `skip`, `supersedes` | Lists of strings |
| `ring` | `adopt`, `trial`, `assess` or `hold` |
| `trust` | `official`, `verified` or `third-party` |
| `always_on_cost` | `none`, `low`, `medium` or `high` |
| `executes`, `install`, `undo` | Required for `official-plugin` and `pick`, null otherwise |
| `verified` | Date, not in the future |
| `ttl_days` | Positive integer. The card expires at `verified` plus `ttl_days` |
| `sources` | At least one URL |

Body headings, in this order: `## Pattern`, `## Pi recipe` (or `## Claude Code recipe`), `## Why skip the others`, `## Evidence`.

`cards/INDEX.md` is generated and holds one row per card: `| id | kind | when | verdict | expires |`. The router reads it first and compares two dates; it does no date arithmetic.

## 7. Authoring tools

Not shipped with either package. Both need PyYAML.

### 7.1 `tools/cards.py`

```text
python3 tools/cards.py <check|index|status|fixture> [--target pi|claude|all] [--cards-dir DIR] [--today YYYY-MM-DD]
```

| Command | What it does | Exit code |
| :- | :- | :- |
| `check` | Validates every card, then that `INDEX.md` and the stale-card fixture are current. Warns about cards that expire within 14 days | 1 on any error |
| `index` | Regenerates `INDEX.md`. Refuses while a card is invalid | 1 if not written |
| `status` | Lists each card as `fresh`, `expiring` or `stale` | 0 |
| `fixture` | Regenerates the copy of the package in which one card is long expired, used by the stale-card eval | 0 |

`--target` defaults to `pi` for `status` and `all` for the rest.

### 7.2 `tools/pi_eval.py`

```text
python3 tools/pi_eval.py [PACKAGE_DIR] [--measure] [--eval-dir DIR] [--runs N] [--ablation none|both]
                         [--case NAME]... [--model PATTERN] [--thinking LEVEL] [--threshold FLOAT] [--keep-temp]
```

| Option | Meaning |
| :- | :- |
| `--measure` | Prints the always-on token cost of the package's skills and exits. No model call |
| `--ablation both` | Runs every case with the package and without it, and prints the difference (the default) |
| `--runs N` | Runs per arm, default 1 |
| `--case NAME` | Only this case; may be repeated |
| `--eval-dir DIR` | Folder inside the package, default `evals` |
| `--threshold FLOAT` | Exit 1 when a case's mean score with the package is below this |
| `--keep-temp` | Keeps `trace.jsonl` and `stderr.txt` for each run |

Each run is `pi --mode json --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates --tools <allowed> -e <package>` with a temporary ledger folder, so the developer's own setup never leaks into a result.

An eval case is a folder:

```text
evals/<case>/prompt.md           front matter: allowed_tools, packages (optional); body: the prompt
evals/<case>/graders/<name>.md   front matter only
```

| Grader `type` | Fields | Passes when |
| :- | :- | :- |
| `tool_used` | `tool` (regex on the tool name), `input_match` (regex on the arguments), `min` (default 1), `max`, `arm` | The number of matching calls is within `min` and `max`. With `min: 0`, `max: 0`, `arm: both` it asserts the tool was never called |
| `regex` | `pattern`, `flags` (`i`, `m`, `s`), `match` (`contains` or `not_contains`) | The final answer does, or does not, match |

No grader calls a judge model. In a two-arm run a positive `tool_used` check is reported as "Route fired" and left out of the score, because the arm without the package cannot pass it.

## 8. Configuration

### 8.1 Environment variables

| Variable | Read by | Meaning |
| :- | :- | :- |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Dashboard, from `dashboard/.env.local` | Turns on the Gemini assistant. Unset by default |
| `GEMINI_MODEL` | Dashboard | Overrides `gemini-3.5-flash-lite` |
| `WAYFINDER_PROJECT` | Dashboard | The project folder to inspect. Defaults to the parent of `dashboard/` |
| `UPDATE_FIXTURE` | `npm run fixture` | Rewrites `fixtures/sample-snapshot.json` instead of comparing against it |
| `PI_WAYFINDER_DATA` | Router CLI and extension | Ledger folder |
| `PI_CODING_AGENT_DIR` | Router CLI and extension | Pi's config folder; the ledger defaults to `data/wayfinder` inside it |
| `PI_OFFLINE` | Router CLI | `1`, `true` or `yes` skips the catalog search and the scout |
| `PI_WAYFINDER_SCOUT` | Extension | Set by the CLI in the scout's child process so the extension does not load there |

### 8.2 npm scripts (`dashboard/`)

| Script | What it does |
| :- | :- |
| `npm run dev` (or `npm start`) | Runs the dashboard on this machine's real setup |
| `npm run demo` | Runs it on bundled, invented data with the write routes off |
| `npm test` | Vitest: collectors, redaction, actions and the fixture |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run fixture` | Regenerates the sample snapshot after a collector changes |
| `npm run build` | Builds the page only. The API lives in the Vite dev server, so the dashboard is run with `dev` or `demo` |

### 8.3 Files Skillhub writes

| Path | Written by | When |
| :- | :- | :- |
| `~/.wayfinder/backups/<timestamp>/` | Dashboard | Before a confirmed change edits a config or removes a skill folder |
| `~/.wayfinder/actions.log` | Dashboard | After a confirmed change, one JSON line per step |
| `dashboard/node_modules/.cache/wayfinder/` | Dashboard | A cache of parsed usage numbers |
| `…/data/wayfinder/ledger.jsonl` | Router | When it recommends, or the developer adopts or declines |
| The config files and skill folders of the AI apps | Dashboard | Only through `POST /api/actions/apply`, after confirmation |

Nothing else is written. Collectors, tabs, the router skill and the scout never write.
