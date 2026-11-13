# Wayfinder

A personal Claude Code plugin. When you start a new kind of work, it checks a small set of dated decision cards and tells you whether an existing tool, plugin, MCP server or working method fits better than the default. Most of the time the answer is one line saying nothing needs adding.

`wayfinder` is a working name. The design is in `docs/`: start with `docs/spec.md`.

## Install

The repository is its own one-plugin marketplace. Added from a local path, the plugin loads in place, so edits to cards are live at the next session.

```bash
claude plugin marketplace add /home/billh/projects/agentic-dev-tool-recommender-linux
```

```bash
claude plugin install wayfinder@agentic-dev-tools
```

Then allow Claude to start the Route skill without asking, by adding one rule to `~/.claude/settings.json`:

```json
{ "permissions": { "allow": ["Skill(wayfinder:route)"] } }
```

Without that rule, Claude Code asks for approval each time Route triggers. The skill pre-approves its own card reads and its `wayfinder` command, so nothing else needs a rule.

## What it does

| Piece | What it is |
| :- | :- |
| `/wayfinder:route` | Triggers on its own when a new kind of task starts, or run it by hand with a goal. Answers from a card. With no card, it does a live lookup and labels the result unvetted. |
| `wayfinder ledger show --data ~/.claude/plugins/data/wayfinder-agentic-dev-tools` | What was recommended, adopted and declined |
| `wayfinder ledger misses --data ~/.claude/plugins/data/wayfinder-agentic-dev-tools` | Tasks no card covered, most frequent first. These are the cards to write next. |

Route never installs anything. It prints the command and you run it.

## Turn it off

A whole project, completely:

```bash
claude plugin disable wayfinder@agentic-dev-tools --scope local
```

One session:

```bash
claude --settings '{"enabledPlugins":{"wayfinder@agentic-dev-tools":false}}'
```

Manual only in one project (no auto-trigger, `/wayfinder:route` still works). Put this in the project's `.claude/settings.local.json`:

```json
{ "permissions": { "deny": ["Skill(wayfinder:route)"] } }
```

## Working on it

Cards live in `plugin/skills/route/cards/`, one Markdown file each. The schema is in `docs/spec.md`, section 3.

```bash
python3 tools/cards.py check
```

```bash
python3 tools/cards.py index
```

```bash
python3 tools/cards.py fixture
```

```bash
python3 -m unittest discover tests
```

`check` validates every card and fails if the index or the stale-card test fixture is out of date. `index` and `fixture` regenerate them. `tools/cards.py` needs PyYAML.

To draft a card, open this repository in Claude Code and run `/new-card <symptom or id>`.

Try the plugin from the working tree, without installing:

```bash
claude --plugin-dir ./plugin
```

Measure what it adds to every session:

```bash
claude --plugin-dir ./plugin plugin details wayfinder
```

Run the eval suite. Each run is a real model call and counts against usage:

```bash
claude plugin eval ./plugin --runs 1 --ablation none --no-publish
```

```bash
claude plugin eval ./plugin --threshold 0.67 --no-publish --max-cost-usd 15
```

The first form is for tuning: one run per case, plugin only. The second is the full check: three runs per case, with and without the plugin. The latest full result is in `plugin/evals/BASELINE.md`.
