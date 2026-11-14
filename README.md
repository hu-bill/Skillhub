# Wayfinder

A [Pi](https://github.com/earendil-works/pi) package and multi-scope harness dashboard:

1. **In-session routing (`pi-package/`):** When you start a new kind of work, checks a small set of dated decision cards and tells you whether an existing Pi feature, package, skill, MCP server or working method fits better than the default. Most of the time the answer is one line saying nothing needs adding.
2. **Harness Dashboard (`dashboard/`):** Gives a clean, read-only overview of all skills, MCP servers, packages/extensions, permissions/configs, always-on context cost, and Wayfinder cards/ledger across user, project, and local scopes.

`wayfinder` is a working name. The design is in `docs/`: start with `docs/spec.md` (section 16 for the Pi v0.1 target) and `docs/dashboard-spec.md` (for the dashboard lane). The earlier Claude Code plugin implementation is preserved in `plugin/`.

## Install (Pi)

Install from a local path so Pi loads the package in place—edits to cards apply at the next session or `/reload`:

```bash
pi install ./pi-package
```

Or try it for a single session without changing settings:

```bash
pi -e ./pi-package
```

## What it does

| Piece | What it is |
| :- | :- |
| `/skill:route <goal>` (and auto-trigger) | Loads automatically via `<available_skills>` when a new kind of task starts, or run `/skill:route <goal>` by hand. Answers from a card. With no card on a substantial specialized task, runs an isolated live lookup and labels the result unvetted. |
| `/wayfinder [status\|ledger\|misses\|route <goal>\|off\|on]` | Interactive command from the Pi extension: inspect card freshness, view ledger entries or uncached misses, trigger routing, or mute/unmute auto-triggering for the current session (adds 0 tokens to model context). |
| `pi-package/bin/wayfinder ledger show` | CLI view of what was recommended, adopted and declined (stored in `${PI_WAYFINDER_DATA:-~/.pi/agent/data/wayfinder}`). |
| `pi-package/bin/wayfinder ledger misses` | Tasks no card covered, most frequent first. These are the cards to write next. |
| `dashboard/` | Multi-scope Harness Dashboard (in progress; see `docs/dashboard-spec.md`): inspect skills, MCP servers, packages/extensions, configs, token cost, and card/ledger status across user, project, and local scopes. |

Route never installs anything. It prints the command and you run it.

## Turn it off

**A whole project, completely (0 tokens in context).** Run `pi config --local` to disable the package's `route` skill in that project, or add a package filter in `.pi/settings.json`:

```json
{
  "packages": [
    {
      "source": "/path/to/repo/pi-package",
      "autoload": false,
      "skills": []
    }
  ]
}
```

**One session (manual-only: `/skill:route` still works, auto-trigger blocked):**

```bash
pi --no-wayfinder
```

Or inside a running session:

```text
/wayfinder off
```

**One session with all skills off:** `pi -ns`.

## Working on it

Pi cards live in `pi-package/skills/route/cards/` (preserved Claude Code cards live in `plugin/skills/route/cards/`). The schema is in `docs/spec.md`, section 3.

```bash
python3 tools/cards.py index
python3 tools/cards.py fixture
python3 tools/cards.py check
python3 tools/cards.py status --target all
python3 -m unittest discover tests
```

`check` validates both the Pi and Claude Code card sets, indexes, and stale-card fixtures (`--target pi` or `--target claude` checks one). `tools/cards.py` needs PyYAML.

To draft a Pi card, open this repository in Pi and run `/skill:new-card <symptom or id>`.

Measure always-on token cost (no model calls):

```bash
python3 tools/pi_eval.py --measure
```

Run Pi eval cases (real model calls—counts against usage):

```bash
# Single case / tuning
python3 tools/pi_eval.py ./pi-package --runs 1 --ablation none --case route-reverse-engineering

# Full offline check (with vs without package)
python3 tools/pi_eval.py ./pi-package --runs 3 --ablation both --threshold 0.67

# Live lookup case (uses network)
python3 tools/pi_eval.py ./pi-package --eval-dir evals-live --runs 1 --ablation none
```

## Concurrent Team & Agent Workflow

The repository is structured into vertical lanes (`dashboard/`, `pi-package/`, `plugin/`) and **feature slices inside `dashboard/`** so two developers can work concurrently with coding agents without merge conflicts (full rules in `CLAUDE.md` and `dashboard/CLAUDE.md`):

- **Short-lived feature branches:** Branch off `main` (`spine/dashboard-shell`, `feat/dashboard-skills`, `feat/dashboard-mcp`, `card/<id>`) and merge via PR.
- **Parallel dashboard work:** Merge shared `[spine]` scaffolding first (`dashboard/package.json`, `shared/schema.*`, `src/shell/`), then assign one slice per branch (`overview`, `skills`, `mcp`, `packages`, `configs`, `cards-ledger`). Each slice owns `dashboard/src/features/<slice>/` and `dashboard/collectors/<slice>.*` via auto-discovery—never edit `App.tsx`, global CSS, or `dashboard/package.json` on a feature branch.
- **Scope your coding agent up front:** Tell your agent its exact slice boundary at the start of the session so it does not touch shared docs or another slice.

## Preserved Claude Code plugin (`./plugin`)

The earlier Claude Code v0.1 slice remains intact under `plugin/`, `.claude-plugin/marketplace.json`, and `.claude/`:

```bash
claude --plugin-dir ./plugin
claude --plugin-dir ./plugin plugin details wayfinder
claude plugin eval ./plugin --runs 1 --ablation none --no-publish
```
