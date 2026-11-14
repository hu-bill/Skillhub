---
id: security-review
kind: method
symptom: "Audit code or a diff for security vulnerabilities, secrets or risky dependencies"
triggers:
  - "do a security review of these changes"
  - "audit this repo for vulnerabilities"
  - "check this PR for security issues before merge"
  - "is there a security scanner or skill I should add"
verdict: pick
do: "Install Cloudflare's security-audit skill for source-first trust-boundary and disprover review, and run deterministic CLI scanners (semgrep, gitleaks, osv-scanner) on demand via bash"
alternative: "Trail of Bits differential-review skill (npx skills add trailofbits/skills --skill differential-review): when reviewing a PR or commit specifically for regression and blast-radius risk"
skip:
  - "Runtime command blockers (such as cc-safety-net or @casualjim/pi-heimdall) as code review: they block dangerous shell commands or secret reads at runtime, not flaws in your code"
  - "Archived semgrep/mcp or always-on scanner MCP servers: semgrep/mcp is deprecated in favor of the semgrep CLI, and on-demand CLI runs add 0 always-on tokens"
  - "Unreviewed wrapper extensions (such as @insaidermobile-ux/pi-security-review, 0.2.1, 6 releases): runs in-process with full OS permissions to adapt Cloudflare's skill"
supersedes: []
ring: trial
trust: verified
always_on_cost: low
executes: "A Markdown Agent Skill (plus zero-dependency Node validators validate-findings.cjs and validate-coverage-ledger.cjs during full audits); npx skills add runs Vercel's skills CLI"
install: "npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit"
undo: "Delete .agents/skills/security-audit (or ~/.agents/skills/security-audit if installed with --global)"
verified: 2026-11-14
ttl_days: 30
sources:
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md
  - https://github.com/cloudflare/security-audit-skill
  - https://github.com/trailofbits/skills/tree/main/plugins/differential-review
  - https://github.com/semgrep/semgrep
  - https://github.com/gitleaks/gitleaks
  - https://github.com/google/osv-scanner
  - https://github.com/semgrep/mcp
  - https://github.com/kenryu42/cc-safety-net
  - https://www.npmjs.com/package/@casualjim/pi-heimdall
  - https://www.npmjs.com/package/@insaidermobile-ux/pi-security-review
---

## Pattern

Language models spot broken trust boundaries and missing authorization checks, while deterministic scanners catch known CVEs, regex signatures and leaked secrets. Combine both: run static, secret and lockfile scanners on demand, then trace untrusted inputs across trust boundaries in a fresh read-only pass and try to disprove each candidate finding before reporting it.

## Pi recipe

- Run deterministic checks on demand via `bash` (or filter JSON/SARIF output in `codemode` so raw scan logs stay out of context): `semgrep scan`, `gitleaks git`, and `osv-scanner scan .` (or `npm audit` / `trivy fs .`).
- Add `cloudflare/security-audit-skill` into `.agents/skills/security-audit/` (Pi discovers `.agents/skills/` automatically). It stays in lightweight guidance mode for focused questions and runs a 6-phase hunter + disproving-verifier workflow (`confirmed`, `needs_validation`, `rejected`) for full audits, pairing naturally with `pi-subagents` (`reviewer` / `scout`) if installed.
- Note that Pi's `docs/security.md` (`/trust`, sandboxing) and `cc-safety-net` protect **your machine while running Pi**; they do not audit application code. For general non-security diff checks, see `code-review-before-merge`.

## Why skip the others

- `cc-safety-net` (2.7.13) and `@casualjim/pi-heimdall` intercept risky runtime tool calls; neither inspects diffs or lockfiles for vulnerabilities.
- Standalone `semgrep/mcp` is archived by Semgrep in favor of the `semgrep` binary, and episodic security scans do not justify an always-on MCP server.
- `@insaidermobile-ux/pi-security-review` (0.2.1) executes in-process code to wrap guidance adapted from `cloudflare/security-audit-skill`.

## Evidence

Checked on 2026-11-14 against Pi 1.5.2.

1. Built in? No `/security-review`, SAST, secret or CVE scanner (`docs/security.md` covers harness `/trust` and container sandboxes; `docs/skills.md` covers `.agents/skills/` discovery).
2. Publisher: Cloudflare (`cloudflare/security-audit-skill` on GitHub), known primary security vendor, MIT license, public source.
3. Maintained: pushed 2026-09-14, 127 open issues; zero-dependency `validate-findings.cjs` and `validate-coverage-ledger.cjs`. Alternative `trailofbits/skills` (`CC-BY-SA-4.0`) pushed 2026-11-12.
4. Always-on: low — one skill description (`security-audit`, ~118 tokens estimated in `<available_skills>`), 0 tools or extensions.
5. Executes: Markdown files read on demand; Node `.cjs` schema validators run locally during full 6-phase audits.
6. Overlap: none with Pi built-ins or runtime guard `cc-safety-net` (2.7.13, MIT, `kenryu42`).
7. Removal: delete `.agents/skills/security-audit` (or `~/.agents/skills/security-audit`).

Re-check when stale: whether Pi adds a native security review command, `cloudflare/security-audit-skill` commits, and `semgrep` CLI/MCP guidance.
