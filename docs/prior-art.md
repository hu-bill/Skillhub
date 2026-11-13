# Prior art and native features

Checked on 2026-11-10 from official docs and public listings. The source code of the third-party tools was not read, so treat "how it works" details as approximate and re-check before relying on them. Items marked "unverified" were seen in a single roundup or listing only.

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
