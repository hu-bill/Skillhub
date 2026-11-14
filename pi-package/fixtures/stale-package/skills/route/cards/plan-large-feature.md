---
id: plan-large-feature
kind: method
symptom: "Plan a large feature before writing code"
triggers:
  - "plan this feature before we build it"
  - "I want a design before any code"
  - "should I use a planning framework or spec plugin"
  - "this change touches many files, how should we approach it"
verdict: pick
do: "Use Plannotator (@plannotator/pi-extension): enter plan mode with /plannotator-plan-mode, Ctrl+Alt+P or pi --plan, review and annotate the plan, then approve"
alternative: "pi --tools read,grep,find,ls (or Pi's bundled examples/extensions/plan-mode): for a lightweight read-only planning pass with no third-party package"
skip:
  - "Minimal unmaintained plan packages (such as pi-plan, 2 releases): Plannotator blocks destructive edits, diffs plan revisions and supports inline annotations"
  - "Large multi-skill workflow bundles installed only for planning: add always-on skill descriptions to every session"
supersedes: []
ring: adopt
trust: third-party
always_on_cost: low
executes: "An in-process Pi extension that restricts write/bash tools during planning and opens a local browser review UI when plannotator_submit_plan runs"
install: "pi install npm:@plannotator/pi-extension"
undo: "pi remove npm:@plannotator/pi-extension"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/earendil-works/pi/blob/main/README.md
  - https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/plan-mode
  - https://github.com/backnotprop/plannotator
  - https://www.npmjs.com/package/@plannotator/pi-extension
---

## Pattern

Separate deciding from doing. First explore and write down the approach while nothing is being edited. Have a person review and annotate it. Then build from the approved plan. When requirements are unclear, get interviewed into a short spec first and build from that in a fresh session.

## Pi recipe

- Vanilla Pi intentionally omits built-in plan mode; if `@plannotator/pi-extension` is installed, toggle plan mode with `/plannotator-plan-mode`, `Ctrl+Alt+P`, or start Pi with `pi --plan`.
- During planning, writes are restricted to the plan file; when `plannotator_submit_plan` runs, approve or send inline annotations from the browser UI before execution unlocks full tools.
- If requirements are still fuzzy, ask Pi to interview you into a spec file first, then run `/new` to implement from the written spec.
- Without installing anything, `pi --tools read,grep,find,ls` enforces a strictly read-only exploration session, or load Pi's reference `examples/extensions/plan-mode` extension.

## Why skip the others

- Tiny wrappers such as `pi-plan` have minimal maintenance compared with Plannotator's tool gating, plan diffing and phase configuration (`.pi/plannotator.json`).
- Multi-skill methodology packs charge always-on prompt tokens on every turn even when you are not planning.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? No. Pi's `README.md` states: "Pi ships with powerful defaults but skips features like sub-agents and plan mode." Pi does ship `--tools read,grep,find,ls` (`docs/cli.md`) and a reference extension at `examples/extensions/plan-mode/`.
2. Publisher: `backnotprop` on GitHub and npm (`@plannotator/pi-extension`), `MIT OR Apache-2.0`, public source.
3. Maintained: 0.28.64 released 2026-11-13, 188 npm releases, targets Pi `>=0.79.1` (tested on Pi 1.5.2).
4. Always-on: low/none outside plan mode (`plannotator_submit_plan` activates during the planning phase; bundled skill is suppressed if a CLI skill already exists).
5. Executes: runs in-process as a Pi extension and starts a local HTTP/browser UI for plan review.
6. Overlap: none with Pi built-ins.
7. Removal: `pi remove npm:@plannotator/pi-extension` (and delete `~/.plannotator` or `.pi/plannotator.json` if created).

Re-check when stale: whether Pi adds a built-in plan mode, `@plannotator/pi-extension` latest release, and its always-on tool behavior.
