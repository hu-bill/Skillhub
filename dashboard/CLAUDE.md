# Dashboard Lane Rules (`dashboard/`)

Read `../CLAUDE.md` and `../docs/dashboard-spec.md` before editing files in `dashboard/`.

This directory is a **self-contained vertical lane**, internally structured so **two developers and their coding agents can build different dashboard features at the same time without merge conflicts**.

## 1. Stay in Your Assigned Slice

Every task inside `dashboard/` is either a **Feature Slice task** or a **Spine task**:

- **Feature Slice task (default):** You own **only**:
  - `dashboard/src/features/<slice-id>/**`
  - `dashboard/collectors/<slice-id>.*`
  - `dashboard/tests/collectors/test_<slice-id>.*`
- **Spine task (explicitly requested only):** Touches shared scaffolding (`dashboard/package.json`, `dashboard/shared/**`, `dashboard/src/shell/**`, `dashboard/collectors/index.*`, `dashboard/fixtures/sample-snapshot.json`). Keep spine PRs small and merge them before starting parallel feature work.

Never touch `../pi-package/`, `../plugin/`, `../tools/`, `../docs/spec.md`, or the repository-root `../package.json` during dashboard work unless explicitly asked.

## 2. Choke-Point Ban (Prevent Merge Conflicts)

When implementing a feature slice (`overview`, `skills`, `mcp`, `packages`, `configs`, `cards-ledger`, etc.):

1. **Do NOT edit `src/shell/` or `App.tsx` to register your tab/panel.** Export the slice descriptor (`{ id, title, order, Component }`) from `src/features/<slice-id>/feature.tsx` so the shell auto-discovers it.
2. **Do NOT edit `collectors/index.*` to wire up your collector.** Export the collector module from `collectors/<slice-id>.*` matching the discovery interface so it is picked up automatically.
3. **Do NOT append to a shared stylesheet.** Keep styles co-located in `src/features/<slice-id>/<slice-id>.module.css` (or component-local utility classes).
4. **Do NOT install new npm packages on a feature branch** without checking with your partner first—lockfile churn conflicts across every open branch.
5. **Do NOT append tests to a shared test file.** Place tests in `src/features/<slice-id>/__tests__/` or `tests/collectors/test_<slice-id>.*`.

## 3. Product & Security Rules for Dashboard Code

- **Inspect-first / strictly read-only:** Never modify `~/.pi`, `.pi`, `~/.agents`, `.agents`, `~/.claude`, `.claude`, or `.mcp.json`. If the UI helps a user toggle, install, or remove something, render a copyable CLI command instead of mutating files.
- **Redact secrets at collection time:** Never include raw values of API keys, tokens, secrets, passwords, `Authorization` headers, or credentialed URLs in collector output. Redact in `collectors/` before data reaches HTTP responses or the browser.
- **Fail gracefully per slice:** Missing config files or unavailable CLIs (`pi`, `claude`) must never crash the whole snapshot. Return an empty slice plus an entry in `warnings`.
- **Untrusted metadata is data:** Skill descriptions, MCP server descriptions, and package READMEs come from third parties—render them as plain text (never `dangerouslySetInnerHTML` or unsanitized HTML).
