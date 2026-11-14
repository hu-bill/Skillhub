# Prior art and native features

Checked on 2026-11-10 from official docs and public listings. The source code of the third-party tools was not read, so treat "how it works" details as approximate and re-check before relying on them. Items marked "unverified" were seen in a single roundup or listing only.

Section 5 was added on 2026-11-13 and checked against Claude Code 2.1.322. Section 6 was added on 2026-11-14 and checked against Pi 1.5.2 (`@earendil-works/pi-coding-agent`).

The complete index of Claude Code docs is at https://code.claude.com/docs/llms.txt. Start there when checking whether a feature still works as described here.

## 1. Native Claude Code features to build on

Delegate to these instead of reimplementing them.

| Need | Native feature | Doc |
| :- | :- | :- |
| Choose between CLAUDE.md, output styles, skills, hooks, subagents, MCP and plugins | "Extend Claude Code" has a goal-to-feature table, a trigger-to-feature table ("build your setup over time") and the context cost of each feature | https://code.claude.com/docs/en/features-overview |
| Choose how to run work in parallel | "Run agents in parallel" compares subagents, agent view, agent teams, dynamic workflows and projects | https://code.claude.com/docs/en/agents.md |
| Stack-triggered plugin suggestions | A `relevance` block on a marketplace entry. Signals: working directory, commands run, hostnames, files read, manifest dependencies. Matched locally, rate-limited, never installs on its own. Needs `pluginSuggestionMarketplaces` in managed settings, so it is an organization feature. | https://code.claude.com/docs/en/plugins/relevance.md |
| Plugin hints from a CLI | A CLI or SDK can emit a `claude-code-hint` tag to suggest its official-marketplace plugin | https://code.claude.com/docs/en/plugins/cli-hints.md |
| What a plugin costs | `claude plugin details <name>` shows always-on tokens and a per-component breakdown. Official-marketplace plugins show their context cost before install. | https://code.claude.com/docs/en/plugins/measure.md |
| What is no longer used | "Not used recently" on the Installed tab of `/plugin` (after 14 days and 10 sessions unused), `/skill-doctor`, `/doctor`, and the share breakdown in `/usage` | https://code.claude.com/docs/en/plugins/measure.md |
| Regression tests for a plugin | `claude plugin eval`. A case is a prompt plus graders (`regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`). Three runs per case by default. Reports the score with and without the plugin and the difference. Exit codes for CI. Needs v2.1.269 or later. Every run is a real model call. | https://code.claude.com/docs/en/plugin-evals.md |
| Turn a plugin off in one project | `enabledPlugins` can be set in six sources. From lowest to highest precedence: `--add-dir`, user, project, local, the `--settings` flag (one session), managed. `claude plugin disable <name> --scope local` writes an override to `.claude/settings.local.json` even when the plugin is declared at a lower scope. | https://code.claude.com/docs/en/plugins/loading.md, https://code.claude.com/docs/en/plugins/cli-reference.md |
| Develop and test a plugin locally | `claude --plugin-dir <path>` loads a plugin from a directory for one session. `claude plugin validate <dir>` checks the manifest and component files. `claude plugin init <name>` scaffolds a plugin, but only under `~/.claude/skills/<name>/`. | https://code.claude.com/docs/en/plugins/cli-reference.md, https://code.claude.com/docs/en/plugins/create.md |
| Persistent plugin state | `${CLAUDE_PLUGIN_DATA}` resolves to `~/.claude/plugins/data/<id>/` and survives plugin updates. `${CLAUDE_PLUGIN_ROOT}` changes on update, so no state there. | https://code.claude.com/docs/en/plugins/manifest-reference.md |
| Plugin structure | Components at the plugin root: `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `monitors/`, `evals/`, `bin/`. Manifest in `.claude-plugin/plugin.json`. Supports `dependencies` and `userConfig`. | https://code.claude.com/docs/en/plugins/manifest-reference.md |
| Skill mechanics | The description is always in context (description plus `when_to_use` is cut at 1,536 characters). The body loads on invocation. `disable-model-invocation: true` removes the description from context. `context: fork` runs the skill in a subagent. `skillOverrides` does not apply to plugin skills. | https://code.claude.com/docs/en/skills |
| Scheduling | Cloud scheduled tasks (formerly routines) run in the cloud on a schedule, an API call or a GitHub event. Desktop scheduled tasks run locally, only while the app is open and the machine is awake. `/loop` is session-scoped. | https://code.claude.com/docs/en/routines.md, https://code.claude.com/docs/en/desktop-scheduled-tasks.md, https://code.claude.com/docs/en/scheduled-tasks.md |
| Feed of native changes | Weekly What's New digest and the changelog | https://code.claude.com/docs/en/whats-new/index.md, https://code.claude.com/docs/en/changelog.md |
| Marketplaces | Official (`claude-plugins-official`, added automatically, auto-update on), community (`claude-community`), demo. Third-party marketplaces are not reviewed by Anthropic and have auto-update off by default. | https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md |
| Plugin trust | What a plugin can do on the machine and how to review one before installing | https://code.claude.com/docs/en/plugins/security.md |
| Interface extensions | Mods can add panes, a band above the prompt and commands. A possible later surface for the digest. | https://code.claude.com/docs/en/plugins/mods/overview.md |

Two constraints that affect this project:

- Plugins installed on a local machine do not load in cloud sessions. (https://code.claude.com/docs/en/plugins/install.md)
- A cloud session can be pulled into a terminal with `claude --teleport` only from a checkout of the same git repository, with a clean working tree and the session's branch pushed. (https://code.claude.com/docs/en/claude-code-on-the-web.md)

## 2. Existing recommenders and catalogs

| Tool | What it does | What it leaves open | Link |
| :- | :- | :- | :- |
| `claude-code-setup` (Anthropic, official marketplace) | Scans the repository, detects the stack and returns one or two recommendations per category (MCP servers, skills, hooks, subagents, slash commands). Read-only. Uses bundled reference files plus web search. | Starts from the repository, not from a goal. No working methods. No dated verdicts. No digest. | https://claude.com/marketplace/plugins/claude-code-setup |
| `find-skills` (Vercel Labs) | Runs `npx skills find <query>` against skills.sh, checks the leaderboard, install counts and source reputation, and offers `npx skills add`. | Skills only. Ranked by popularity. Always returns something. | https://skillselion.com/skills/vercel-labs/skills/find-skills |
| ClaudePluginHub | A directory with `npx claudepluginhub recommend` (reads dependency and config file names, ranks by directory engagement), `npx claudepluginhub doctor` (broken installs, missing prerequisites, risky hooks, context cost) and hybrid search. Lists about 740,000 skill files and 19,000 MCP servers. | Stack-based and popularity-ranked. | https://www.claudepluginhub.com/ |
| Claude Marketplace (web) | Anthropic's web catalog of the official marketplace. Shows install counts and marks some plugins "Anthropic verified". | Catalog only. | https://claude.com/marketplace/plugins |
| Official MCP Registry | The canonical registry of public MCP servers, with a REST API (`/v0/servers?search=...`). Third-party guides put it near 2,000 servers. | Catalog only. | https://registry.modelcontextprotocol.io, https://modelcontextprotocol.info/tools/registry/ |
| skills.sh | Vercel's directory and CLI for Agent Skills, with install-count leaderboards. | Catalog only. | https://skills.sh |
| Skillselion (unverified) | Ranks skills and MCP servers by adoption, offers an MCP server that loads skills mid-task, and sends a weekly newsletter. | Popularity-ranked. | https://skillselion.com |
| HOL Plugins (unverified) | A cross-harness registry with security scanning, according to one roundup. | Not examined. | https://www.ayautomate.com/blog/best-claude-code-plugins |
| Personal tech radars | Individuals already publish adopt, trial, assess and hold lists for their own Claude Code tooling. | Static pages. | https://dohrm.github.io/claude-rules/tech-radar/ |

## 3. Agent Skills standard

Relevant for later portability to other harnesses.

- Agent Skills is an open standard published at agentskills.io. A `SKILL.md` folder is read by Claude Code, Codex CLI, Gemini CLI, GitHub Copilot, Cursor and many other tools. (https://www.firecrawl.dev/blog/agent-skills)
- Portability is imperfect in practice. Harnesses differ in which frontmatter fields and bundled assets they honor. (https://mcp.directory/blog/cross-agent-skills-cursor-codex-cline-antigravity-gemini-mastra-portability)
- Uploads to claude.ai and the Skills API accept only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools` in the frontmatter and fail on any other field. Claude Code-only fields such as `context: fork` and `disable-model-invocation` therefore belong in the plugin wrapper, not in a portable core skill. (https://code.claude.com/docs/en/skills)

## 4. What was not found

After the searches on 2026-11-10, nothing turned up that does all of the following. This is the gap the project aims at. Absence in a search is weak evidence, so look again before investing heavily.

1. Routes from a goal or symptom, covering working methods and tools in one answer
2. Returns "you need nothing" or "skip X, it is built in now" as a first-class answer
3. Keeps a dated verdict per use case and reports what changed for the individual developer

## 5. Added on 2026-11-13

Checked on this date against the docs and Claude Code 2.1.322.

### Native features found or re-checked

| Need | Native feature | Source |
| :- | :- | :- |
| A local, structured catalog of installable plugins | `claude plugin list --available --json` returns every plugin in the configured marketplaces, with no network call. On this machine: 4,047 entries (317 from `claude-plugins-official`, 3,730 from `anthropic-plugin-directory`), each with `pluginId`, `name`, `description`, `marketplaceName`, `installCount` and `source`. | Command output; https://code.claude.com/docs/en/plugins/cli-reference.md |
| What is installed, with scope and state | `claude plugin list --json` lists installed plugins with `scope`, `enabled` and `installPath` | Command output |
| In-session plugin and skill suggestions | In the desktop app's Code tab, Claude has tools that search the claude.ai plugin catalog and render an install card: `SearchPlugins`, `SuggestPluginInstall`, `ListPlugins`, `SearchSkills`, `SuggestSkills`. Results carry the publisher tier, a `reach` value (contained, remote or privileged) and the component list. They are keyword matches with no verdict. | Observed in a session on 2026-11-13. No docs page found yet. |
| Stop Claude from invoking one skill | A `Skill(name)` deny rule in permission settings. The docs do not say whether a typed `/name` still runs under it. | https://code.claude.com/docs/en/skills.md (Restrict Claude's skill access) |
| Edit a plugin and see the change at once | A plugin with a relative-path source, in a marketplace added from a local path, loads in place. Edits apply at the next session or `/reload-plugins`, with no version change. | https://code.claude.com/docs/en/plugins/loading.md (In-place and copied plugins) |
| Turn off the commit trailer | `attribution.commit` set to an empty string in a settings file. A CLAUDE.md rule about attribution also takes precedence. | https://code.claude.com/docs/en/settings-reference.md |
| Write eval cases | `claude plugin eval init` has Claude write a suite. `claude plugin eval init --bare <name>` writes one blank case. | https://code.claude.com/docs/en/plugin-evals.md |

### Constraints found

- Eval runs are isolated: an empty workspace, no user or project configuration, and only the plugin under test. `Bash`, `Write`, `Edit`, `WebFetch` and `WebSearch` are removed unless granted with `--allow-tools`. Granting `Bash` needs a sandbox backend, which on Linux means `bubblewrap` and `socat`. A skill's own `allowed-tools` cannot widen this. (plugin-evals.md)
- Each eval case runs three times with the plugin and three times without it. The docs' example costs about $0.41 for one case. Reports are published to claude.ai unless `--no-publish` is passed. (plugin-evals.md)
- A shell command injected into a skill with the `` !`command` `` syntax aborts the whole skill invocation when it fails, when its permission check does not return allow, or when the session has no shell tool. (skills.md, Inject dynamic context)
- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are substituted in skill and agent text. They are not in the environment of commands Claude runs through the Bash tool. (plugins/manifest-reference.md, Environment variables)
- Files in a plugin's `bin/` are on the Bash tool's PATH. claude.ai and Cowork do not install a plugin that has a top-level `bin/`. (plugins/components.md, Executables)
- A `CLAUDE.md` at a plugin root is not loaded, and `claude plugin validate` warns about it. (plugins/manifest-reference.md, Standard layout)
- A plugin agent can set `model`, `tools`, `maxTurns` and similar fields. Its `hooks`, `mcpServers` and `permissionMode` fields are ignored. (plugins/components.md, Agents)
- `disable-model-invocation: true` also stops a session-scoped scheduled task from firing the skill as its prompt. (skills.md, Frontmatter reference)
- A desktop scheduled task that missed runs does one catch-up run, for the most recent miss within seven days. Its prompt is stored at `~/.claude/scheduled-tasks/<task-name>/SKILL.md`. (desktop-scheduled-tasks.md)
- A cloud session loads the repository's `.claude/skills/` but not plugins declared in the repository's settings. Its default network allowlist includes `code.claude.com`, `github.com`, `*.modelcontextprotocol.io`, npm and PyPI. (cloud-environments.md)

### Catalog coverage check

The developer's two examples of domain tools are not in the 4,047-entry catalog. No entry matches REA (`rea-agents`, `rea.tools`, `morluto`) or Higgsfield. A search for "reverse engineering" returns a different community skill. Tools of this kind therefore need curated cards and sources beyond Anthropic's catalogs, such as the MCP Registry and GitHub.

No plugin named `wayfinder` exists in that catalog.

## 6. Added on 2026-11-14: Pi harness (`@earendil-works/pi-coding-agent` 1.5.2)

Checked against the installed Pi 1.5.2 documentation and runtime on this machine.

| Need | Native Pi feature | Source |
| :- | :- | :- |
| Package distribution | Pi Packages (`package.json` with `"keywords": ["pi-package"]` and `"pi": { "extensions", "skills", "prompts", "themes" }`). `pi install ./pi-package` loads a local directory in place without copying; `pi -e ./pi-package` loads both extensions and skills from a package for one invocation. | `docs/packages.md`, `dist/core/resource-loader.js` |
| On-demand routing instructions | Agent Skills (`SKILL.md`). Pi places `<name>`, `<description>` (`<= 1,024` chars) and `<location>` in `<available_skills>`; the model loads `SKILL.md` with `read` and resolves relative paths against the skill directory. Manual invocation: `/skill:route <goal>`. `disable-model-invocation: true` hides maintainer skills (`new-card`) from model context. | `docs/skills.md` |
| Zero-token extension commands and deferred tools | `pi.registerCommand("wayfinder", ...)` and `pi.registerFlag("no-wayfinder", ...)` add 0 tokens to LLM context. Tools registered with `exposure: "deferred"` are omitted from active tool declarations and `codemode` inline listings (0 always-on tokens) while remaining callable from `codemode`, `tool_search`, and explicit `--tools` runs. | `docs/extensions.md` |
| Built-in capabilities vs intentional omissions | Pi ships `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, plus built-in extensions `builtin:mcp` (default `codemode` exposure), `builtin:codemode` (QuickJS tool scripting + `models.classify()` + `models.generateImages()`), and `builtin:tool-search`. Pi intentionally omits built-in subagents and plan mode (`README.md`). | `README.md`, `docs/cli.md`, `docs/codemode.md`, `docs/mcp.md` |
| Ecosystem catalog | npm packages tagged `keywords:pi-package` (`https://registry.npmjs.org/-/v1/search?text=keywords:pi-package...`, 13,746 packages on 2026-11-14), alongside the official MCP Registry and Agent Skills directories (`~/.agents/skills/`, `.agents/skills/`). | `docs/packages.md`, npm registry query |
| Opt-out and manual-only mode | Full project opt-out via `.pi/settings.json` package resource filter (`"autoload": false, "skills": []`) or `pi config --local`. Single-session manual-only mode via `pi --no-wayfinder` or `/wayfinder off` (blocks model `read` calls on `route/SKILL.md` while explicit `/skill:route` still expands). | `docs/packages.md`, `docs/extensions.md` |
| Isolated subagent & eval execution | `pi --print --no-session --no-skills --no-prompt-templates --no-context-files --exclude-tools edit,write --system-prompt ...` runs `scout` in a separate read-only process. `pi --mode json --no-session` emits strict LF-delimited JSONL records for local evals (`tools/pi_eval.py`). | `docs/cli.md`, `docs/json.md`, `examples/extensions/subagent/` |

