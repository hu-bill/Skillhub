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

- **Inspect-first; changes only through the confirmed action path (amended 2026-11-14):** Collectors and tabs never modify `~/.pi`, `.pi`, `~/.agents`, `.agents`, `~/.claude`, `.claude`, `~/.codex`, `~/.cursor`, `~/.gemini` or `.mcp.json`. The one place a change may happen is `server/actions.ts`, reached through the shell's confirmation dialog (`useShell().act(...)`). A feature slice asks for a change by passing `ActionRequest`s to `act`; it never writes a file, starts a process or calls `/api/actions/*` itself. Every action must: show the exact file or command before anything happens, wait for the user's click, back up a config before editing it, refuse to rewrite a file that is not plain JSON, move a skill folder to the backup directory instead of deleting it, and keep credential values out of every response. Adding a new kind of action is a spine change.
- **Redact secrets at collection time:** Never include raw values of API keys, tokens, secrets, passwords, `Authorization` headers, or credentialed URLs in collector output. Redact in `collectors/` before data reaches HTTP responses or the browser.
- **Fail gracefully per slice:** Missing config files or unavailable CLIs (`pi`, `claude`) must never crash the whole snapshot. Return an empty slice plus an entry in `warnings`.
- **Untrusted metadata is data:** Skill descriptions, MCP server descriptions, and package READMEs come from third parties—render them as plain text (never `dangerouslySetInnerHTML` or unsanitized HTML).
