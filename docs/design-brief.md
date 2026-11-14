# Design brief: agentic development tool recommender

- Working name: Wayfinder (not final)
- Status: idea agreed; v0.1 target updated on 2026-11-14 to the **Pi harness** (`pi-package/`), while preserving the 2026-11-13 Claude Code walking skeleton in `plugin/`. See `spec.md` (especially section 16).
- Last updated: 2026-11-14
- Origin: a brainstorming session in the Claude app on 2026-11-10. This file is the handoff from that session.

Facts about Claude Code and third-party tools in this file were checked on 2026-11-10. Sources are in `prior-art.md`. Claude Code changes weekly, so re-check anything the design depends on before building it.

## 1. Problem

There are far more plugins, skills, MCP servers, hooks and working methods (subagents, agent teams, workflows, context-saving techniques) than one developer can follow, and the set changes every week. That leaves a standing worry: some tool or method would make the current task easier or its result better, and the developer doesn't know it exists.

The cost is not only effort. Without the right tool, the developer spends tokens on a worse product and never finds out. Two examples from the developer (added 2026-11-13, not yet verified against the rubric in 4.6): REA for reverse engineering (https://github.com/morluto/rea), and the Higgsfield MCP server for generating video and images. These are domain capability tools, a different kind of entry from the workflow symptoms that make up most of the seed list in section 8.

Goal: whatever the developer is about to do with Claude Code, point them to a good way of doing it with things that already exist, in a way they can trust not to have missed something important.

## 2. Core position

Do not build another index of tools, and do not build another "search for tools" prompt. Both already exist in several forms (see `prior-art.md`). Build the editorial layer on top of them:

1. **Decision cards**: a small set of dated, opinionated verdicts, used as a cache.
2. **Live lookups**: only to revalidate a stale card or to cover a case no card covers.
3. **A weekly digest**: what changed that matters to this developer, and how much was ignored.

### Why not a pure index

- It goes stale without anyone noticing.
- Large catalogs already exist. One community directory lists about 740,000 skill files and 19,000 MCP servers.
- Keeping a catalog current is a job in itself.
- Long lists ranked by popularity are what cause the fear of missing out in the first place.

### Why not pure search

- Two sessions can return two different answers, which makes the doubt worse.
- Search results on this topic are full of listicles and SEO content.
- It costs tokens and time on every use.
- Unreviewed third-party plugins and MCP servers run code on the developer's machine, so recommending whatever ranks first is a security risk.

### Why the two together still aren't enough

An index and a search are both things the developer has to remember to consult. The fear is about what they don't know to ask. That needs two more things: a trigger at the moment of need without being asked, and a periodic push that ends with "nothing else you need."

### The split by rate of change

| Changes | What | Where it lives |
| :- | :- | :- |
| Slowly (months) | How to choose between features and working methods | Official docs. Link to them; don't rewrite them. |
| Every few weeks | Which specific tool is the pick for a use case | Decision cards, each with a verification date and an expiry |
| Daily | New releases and the long tail | Live lookups against registries |

## 3. What is missing today

Existing recommenders (details in `prior-art.md`) share three gaps:

1. **They start from the repository, not from the goal.** They detect a stack and suggest tools for it. None was found that routes from a symptom or endeavor ("my context keeps filling up", "run this overnight", "parallelize a migration"), or that covers working methods together with tools.
2. **They never say "you need nothing."** A popularity ranking always returns something. A credible "the built-in feature covers this" or "skip X, it is built in now" is the answer that removes doubt.
3. **They give no closure over time.** There is no dated verdict per use case and no note on what changed for this developer since they last looked.

## 4. Design

### 4.1 Decision cards

One card per symptom or endeavor. Start with about 30 and grow by demand. A card is a Markdown file with front matter. Draft fields:

```yaml
symptom: "Claude reads dozens of files to find where a symbol is defined"
verdict: official-plugin      # built-in | official-plugin | pick | nothing-needed
do: "Install the code-intelligence (LSP) plugin for your language"
alternative: null             # at most one, with when to prefer it
skip:
  - "<code-index MCP server>: only if no LSP plugin covers your language"
ring: adopt                   # adopt | trial | assess | hold
always_on_cost: low
trust: official               # official | verified | third-party
verified: 2026-11-10
ttl_days: 60
sources:
  - https://code.claude.com/docs/en/features-overview
  - https://code.claude.com/docs/en/plugins/code-intelligence.md
```

The verdict in this example comes from the trigger table in the Claude Code docs. The `skip` line is a placeholder.

Rules for cards:

- One verdict and at most one alternative. A card that lists five options has failed.
- The `skip` list matters as much as the pick. It names hyped options and says why to pass on them.
- `nothing-needed` and `built-in` are first-class verdicts.
- The body separates the harness-neutral pattern (for example "isolate exploration in a separate context") from the Claude Code recipe (the exact feature, command or plugin).
- Every card has sources and a verification date. A card past `verified + ttl_days` is stale.

### 4.2 Resolution order

For any request, walk this order and stop at the first step that answers it:

1. A built-in Claude Code feature
2. Something already installed on this machine
3. A choice the developer already made (recorded in the ledger, see 4.5)
4. A fresh card
5. A live lookup

Live lookups query structured sources before the open web: the official marketplace catalog, the official MCP Registry API, `npx skills find`, and the Claude Code What's New digest. They run in a subagent so the main conversation only receives the verdict. Results are labeled unvetted. Nothing is ever installed automatically.

### 4.3 Entry points

- **Route.** Fires when the developer starts a new kind of work, or when they run it by name with a goal. Returns one setup: the working method, the feature or tool, what to skip, how to try it and how to undo it.
- **Dashboard.** An out-of-band, inspect-first visual overview (`dashboard/`, specified in `docs/dashboard-spec.md`) of everything installed and configured across user, project and local scopes: skills, MCP servers, packages/plugins, instruction & settings files, always-on context cost, and Wayfinder card/ledger status.
- **Radar.** A weekly run that compares the sources with the developer's history and reports a few lines, for example "2 relevant, 37 ignored, nothing replaces what you use." The ignored count is the part that gives closure.
- **Prune.** Wraps the native checks (`/doctor`, `/skill-doctor`, `claude plugin details`) and adds one check of its own: a card says this tool is built in now, so remove it.

### 4.4 Proactivity and the off switch

Default behavior: auto-trigger plus the weekly digest (decision 3 in section 7).

A project can opt out completely. Plugin enablement is scoped, and a local-scope setting overrides the user-scope one. Running this in a shell inside a project turns the plugin off there and nowhere else:

```bash
claude plugin disable <plugin>@<marketplace> --scope local
```

That writes an override for the plugin in the project's `.claude/settings.local.json`. With the plugin disabled, its skill description is not in context and none of its hooks run, so the project is vanilla. `claude plugin enable <plugin>@<marketplace> --scope local` turns it back on.

For a single session, start Claude Code with a `--settings` value that sets the plugin to `false` under `enabledPlugins`. That source outranks the settings files and lasts for that session only.

The weekly digest is a scheduled task, so it is paused or deleted like any other scheduled task. In a project where the plugin is disabled, no digest notice appears.

Option to decide in the spec: a middle setting that keeps the manual commands but stops auto-triggering. Auto-triggering works through the routing skill's description sitting in context, and the `skillOverrides` setting does not apply to plugin skills. The clean way would be two plugins: a core plugin whose skills are manual only (`disable-model-invocation: true`), and a small add-on that depends on it and carries the model-invocable routing skill. Disabling only the add-on in a project gives "manual only." This adds packaging complexity, so do it only if the full opt-out proves too coarse.

### 4.5 How it improves over time

- **Cards are a cache.** Fresh card: answer from it. Stale card: revalidate against its sources before answering. No card: do a live lookup and log the miss. If curation stops, the tool degrades to rubric-guided search and does not serve stale advice as current.
- **An agent drafts, the developer merges.** A weekly curator run reads the sources, re-verifies stale cards and opens a pull request: a new card, a ring change, or "retire: now built in," each with evidence. Nothing changes without review. This also keeps prompt-injected content out of the cards.
- **Evals gate every change.** Each card gets an eval case, including "should recommend nothing" and "should not trigger" cases. `claude plugin eval` runs each case with and without the plugin, so the delta shows whether the plugin beats the bare model. Run it in CI on every card change. Each run is a real model call and counts against usage, so keep the suite small and prefer graders that don't call a judge model.
- **A local ledger.** Records what was recommended, adopted and declined (with the reason), and the date of the last digest. It stops the tool from pitching the same thing twice and shows which cards to write next. It lives in the plugin's persistent data directory (`${CLAUDE_PLUGIN_DATA}`), which survives plugin updates.

Where the scheduled runs execute (proposal):

- The curator run works only on this repository, so it can run as a cloud scheduled task.
- The digest needs the local ledger and the list of what is installed, so it has to run on the developer's machine, for example as a desktop scheduled task. Those run only while the desktop app is open and the computer is awake.

### 4.6 Rubric for judging a candidate

Used when writing cards and during live lookups:

1. Does a built-in feature already do this?
2. Who publishes it, and has anyone reviewed it? (official marketplace, verified publisher, or unreviewed third party)
3. Is it maintained? (last release, open issues, works with the current Claude Code version)
4. What does it add to every session? (always-on tokens)
5. What can it execute? (hooks, MCP servers, executables, network access)
6. Does it overlap or conflict with something already installed?
7. How easy is it to remove?

### 4.7 Form and packaging

- The core is an Agent Skill: a `SKILL.md` plus the cards. That format is an open standard read by many harnesses, which keeps the door open for later.
- A Claude Code plugin wraps it and adds the scout subagent, the eval suite, the ledger and the scheduled runs.
- Cost target: one short skill description always in context, everything else loaded on demand. Check with `claude plugin details`.
- Distribution: this repository doubles as a single-plugin marketplace. Third-party marketplaces have auto-update off by default, so turn it on for this one in `/plugin` under Marketplaces.
- Limitation: plugins installed on the developer's machine do not load in cloud sessions. v1 targets local sessions (terminal, desktop app with a local environment, VS Code).
- Development loop: load the plugin from this repository for one session with `claude --plugin-dir .`, check its files with `claude plugin validate .`, and run the eval suite with `claude plugin eval .`.

Draft repository layout, to confirm in the spec:

```text
agentic-development-tool-recommender/
├── CLAUDE.md
├── docs/                      design brief, prior art, later the spec
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json       so the repo can be added as a marketplace
├── skills/
│   ├── route/SKILL.md         model-invocable; this is the auto-trigger
│   ├── radar/SKILL.md         manual and scheduled
│   └── prune/SKILL.md         manual
├── cards/                     one Markdown file per symptom
├── agents/
│   └── scout.md               live lookups in an isolated context
├── evals/                     one case per card, plus negative cases
└── scripts/                   helpers (card freshness check, ledger)
```

## 5. Not in v1

- Other harnesses (Codex, Cursor, Gemini CLI and so on)
- Community contributions or a public catalog
- A hosted index or an MCP server
- Always-on hooks, for example a hook that classifies every prompt
- Automatic installation of anything
- `relevance` blocks for Claude Code's native plugin suggestions. That is an organization feature behind managed settings. Worth revisiting if this is ever shared with a team.
- A mod (pane or band in the interface) for the digest

## 6. Risks

- **Curation is ongoing work.** The agent drafts, but the developer has to own the opinions. If curation stops, the cache rules keep the tool honest but make it less useful.
- **"Optimal" is not knowable.** The promise is a defensible default with a date and evidence.
- **The tool is a supply-chain surface.** Third-party marketplaces are not reviewed by Anthropic. Hence reviewed cards, unvetted labels on live results and no automatic installs.
- **Auto-trigger reliability.** Whether Claude loads the routing skill at the right moments depends on its description. Measure with trigger and non-trigger eval cases and tune the wording.
- **Native features keep absorbing this space** (plugin suggestions, usage checks, doctor commands). Delegate to them instead of reimplementing them, so parts of this tool can be retired without pain.
- **The model's own knowledge of the ecosystem is out of date by default.** The skill has to force verification for anything that changes quickly.

## 7. Decisions

| Date | Decision | Notes |
| :- | :- | :- |
| 2026-11-10 | Personal tool | Not a community project |
| 2026-11-10 | Claude Code only first | Cards keep pattern and recipe separate so other harnesses can follow |
| 2026-11-10 | Auto-trigger plus weekly digest, with a way to turn it off per project for a vanilla setup | Mechanism in 4.4 |
| 2026-11-13 | Spec, sign-off, then a thin slice | v0.1 is Route, about 12 cards, the ledger, live lookup and evals. The weekly loop and Prune are specified after one to two weeks of use |
| 2026-11-13 | First cards cover domain capability tools, context and cost, and quality gates | Scale and autonomy waits |
| 2026-11-13 | Private GitHub repository | Commits carry no Claude co-author trailer |
| 2026-11-13 | Quiet auto-trigger | One line, then the task continues. It stops only when the developer has to install something or change working method |
| 2026-11-14 | **Pi harness as v1 target** | Build v1 for Pi (`pi-package/`) instead of Claude Code first; keep the Claude Code v0.1 slice intact in `plugin/` |
| 2026-11-14 | **Multi-scope Harness Dashboard** | Add an inspect-first visual dashboard (`dashboard/`, `docs/dashboard-spec.md`) showing installed skills, MCPs, packages/plugins, configs, context cost and card/ledger status across user, project and local scopes |
| 2026-11-14 | **Concurrent vertical-lane & feature-slice workflow** | Isolate `dashboard/` as a vertical lane and split its internals into auto-discovered feature slices (`features/<slice>/` + `collectors/<slice>`) so two developers and their agents can build features simultaneously without merge conflicts |

Sections 2 to 6 are the working proposal from the brainstorming session. The developer accepted it as the basis for the project; details can still change in the spec.

### Where the spec changes this brief

`spec.md` was written after re-checking the docs on 2026-11-13. Where the two differ, the spec wins.

- **4.1:** the card schema gains `id`, `kind`, `triggers`, `supersedes`, `executes`, `install` and `undo`.
- **4.2:** live lookups start from the local catalog (`claude plugin list --available --json`). `npx skills find` is not used at runtime. The scout subagent has web and read tools only.
- **4.4:** the "manual only" middle setting is tried first as a `Skill(wayfinder:route)` deny rule. The two-plugin split is the fallback.
- **4.5:** stale cards are handled in two tiers. Only a stale card that recommends an install is re-checked before answering.
- **4.7:** the plugin lives in `plugin/`, the cards live inside the Route skill, and Route's read path uses no shell. Authoring tools live outside the plugin.

## 8. Open questions

1. Final name. Plugin names can't start with `claude-`, `anthropic-` or similar reserved prefixes.
2. Repository visibility: private or public.
3. Card schema: the final fields, and where cards live so both the plugin and a standalone skill can read them.
4. Which symptoms come first, and in what order. A seed list is below.
5. Trigger wording for the routing skill, and how often it should fire.
6. Digest delivery: a file, a notification, a line at session start, or a mix.
7. Whether the "manual only" middle setting from 4.4 is needed.
8. Sources for the curator run: which feeds, how often, and how to bound the cost.
9. Ledger format, and whether it should ever sync between machines.

Status on 2026-11-13: the spec answers 2 (private), 3, 4 and 9 (no sync in v1), and drafts 5, which the evals then tune. Question 7 has a candidate answer that the first build tests. Questions 1, 6 and 8 stay open; the spec gives each a default.

### Seed list of symptoms and endeavors

A draft from the brainstorming session and the trigger table in the Claude Code docs. Unverified and unprioritized. Each one needs its own research before it becomes a card.

Steering and memory

- Claude gets a convention or command wrong again and again
- The same prompt or playbook gets typed or pasted repeatedly
- A rule has to hold every single time
- Every answer should have a different tone, length or format
- Claude should remember things between sessions

Context and cost

- Long sessions fill up and get worse
- A side task floods the conversation with output
- Unclear what is using the context window or the usage allowance
- Spend fewer tokens

Codebase

- Claude reads many files to find a symbol
- Getting oriented in an unfamiliar codebase
- Claude's knowledge of a library is out of date

Connections

- Claude needs data from a system it can't see
- Claude should see and test a web UI
- Database work

Scale and autonomy

- Run a long task unattended
- Parallelize one big job (migration, audit)
- Work on several tasks at once without collisions
- Run something on a schedule
- React to CI or pull request events
- Steer or check sessions away from the desk
- Give Claude more autonomy safely

Quality

- Review code before merge
- Security review
- Plan a large feature before coding
- Tests
- Front-end and design quality
- Keep docs in sync with code

Setup

- Share a setup across repositories or machines
- Something in the configuration is broken
- Build a skill or plugin
- Remove what is no longer used

## 9. Next step

Status on 2026-11-13: `docs/spec.md` exists as a draft that covers the seven items below, with v0.1 in full and the scheduled runs as an outline. The next step is the developer's sign-off, then the walking skeleton.

Write the spec in `docs/spec.md`:

1. Card schema, with two or three complete example cards
2. The prioritized list of the first 30 or so symptoms
3. Repository layout and plugin manifest
4. Skill descriptions and trigger wording for route, radar and prune
5. Eval cases, including negative ones
6. The curator run and the digest run: where each executes, and what each reads and writes
7. The opt-out behavior

Agree on the spec before writing plugin code.
