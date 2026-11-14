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
