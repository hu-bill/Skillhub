# Wayfinder Harness Dashboard

A local web page that shows which AI apps are on this computer and how they are wired up: which skills each one loads, which MCP servers each one can reach, what is shared between them, and how many tokens they have used.

It only reads, until you ask for a change. You can connect or disconnect a skill or a server, or install one from a registry, and each time it first shows exactly which file changes or which command runs and waits for you to confirm.

## Run it

Needs Node 22.13 or newer.

```bash
cd dashboard
npm install
npm run dev
```

Open http://127.0.0.1:5177. The server listens on localhost only.

To see the interface with invented data instead of your own machine (for a demo or a screenshot):

```bash
npm run demo
```

## What each page shows

| Page | What it is |
| :- | :- |
| Explore | The first page. A search box, topic chips, and rows of suggested skills as cards: the most installed skills in the topics your own skills lean toward, plus a couple of neighbouring topics. Search covers skills.sh and the official MCP Registry. Install lets you pick which apps get it. |
| My skills | Every skill you have, as cards with topic tags, the logos of the apps that can use it, where it came from (you, a project, a plugin, the app itself) and how often it is used. Click a card for its panel: add it to or remove it from each app, and each project. |
| Map | AI apps in the middle, skills on the left, MCP servers on the right. Drag the arrow on a skill or server onto an app to connect it; click a link to disconnect it. The panel on the right has the assistant, the details of what you selected, and the view controls (what to show, in what order, for which app). |
| MCP | Every distinct server, how it is reached, the apps that have it, and the names of the settings it needs. |
| Usage | Tokens per day by app, by model and by project folder, and how much of each rate-limit window is left where the app records it. |
| Ask | Findings worked out locally, each with a fix, plus a box for questions answered by Google Gemini. |

### Skills inside projects

A skill can live in a project folder (`.claude/skills`, `.agents/skills`, `.cursor/skills` and so on) and then only loads when the app runs there. Skillhub looks in the current project and in every project your apps remember: Claude Code's project list in `~/.claude.json` and the `[projects]` entries in `~/.codex/config.toml`. Folders that no longer exist are skipped. These skills show up under "In projects", with the project's name, and as dashed links on the map.

### App logos

Logos are read from the apps you have installed (the icon inside each app bundle) and served locally. None are shipped with this repository. An app without a bundle, or on a platform without `.icns` files, gets a monogram in its identity colour.

### Suggestions and tags

Tags (Design, Frontend, Data & SQL and so on) are worked out from a skill's name and description by keyword matching in `shared/tags.ts`. No model is involved.

Loading Explore makes a few requests so the suggestions can be shown: one-word topic searches (for example "design") to skills.sh, and the public listing pages of the skills that come back, for their one-line descriptions. Nothing about your setup is sent beyond those topic words. Suggested skills are popular, not reviewed: read one before installing it.

## Apps it looks for

Claude Code, Claude desktop, Codex, ChatGPT, Cursor, VS Code (Copilot), Antigravity, Gemini CLI, Pi, opencode, Windsurf and Zed. The list is data in `collectors/lib/apps.ts`; adding an app means adding its paths there.

Some of this cannot be read from disk, and the dashboard says so rather than guessing:

- ChatGPT keeps connectors, custom GPTs and usage in the OpenAI account. The map can only show that the app is installed.
- Connectors added on claude.ai, and skills enabled inside the Claude desktop app, live in the Anthropic account.
- Cursor and Antigravity do not write token counts to local files.

## Token numbers

- Claude Code: added up from the session transcripts in `~/.claude/projects`. Only the usage numbers, model, date and project folder name are read; message text is not. A session resumed into a new file can be counted twice, so totals are an estimate.
- Codex: per-thread totals from its local index. Codex stores one combined number per thread, so there is no input/output split.
- "What is left" comes from the last rate-limit reading each app saved. If that window has reset since, the reading is shown as history, not as the current figure.
- The cost figure is what Claude Code itself recorded as the API-equivalent cost of the tokens. It is not a bill.

## The Gemini assistant

Off until you add a key:

1. Create a key at https://aistudio.google.com/apikey.
2. Copy `.env.example` to `.env.local` (git-ignored) and set `GEMINI_API_KEY`.
3. Restart the dashboard.

Finding the apps and reading their setup is done by the collectors, with no model involved. Gemini only explains the result and turns a need described in plain words into things to search for.

Google is contacted only when you press Ask. What is sent: the names of your apps, skills, MCP servers and plugins, skill descriptions, and token totals. Never sent: file contents, commands, addresses, paths, project names, or anything secret. The exact prompt is built in `server/gemini.ts`.

The default model is `gemini-3.5-flash-lite`; set `GEMINI_MODEL` to change it.

## Making changes

Every change goes through one dialog. It lists each step with the file it edits or the command it runs, lets you tick the apps you want, and does nothing until you press the button.

- Adding a skill to an app creates a link to the copy you already have, so there is one copy to edit.
- Removing a skill unlinks a link, or moves a real folder to `~/.wayfinder/backups/`. Nothing is deleted.
- Adding a skill to a project copies it into the folder that app reads there (`.claude/skills`, `.agents/skills` and so on). It is a copy, not a link, so the project works for anyone who opens it. Removing it from a project moves that folder to the backups. Both change files inside the project, which a git repository will show as changes to commit. Only projects the scan found can be targets.
- Some apps read each other's folders (Cursor reads `~/.claude/skills` and `~/.agents/skills`). The dialog says when a change reaches another app, and refuses when an app only borrows a skill from folders it does not own.
- Connecting a server uses `claude mcp add-json` for Claude Code, appends a section to `~/.codex/config.toml` for Codex, and edits the JSON config for the other apps. The config is backed up to `~/.wayfinder/backups/` first. A config that has comments is left alone and you get the snippet to paste.
- Saved credentials can be copied along with a server (a checkbox, on by default). They go from one config file to the other on this computer and are never shown or sent.
- Installing from Discover downloads third-party content with `npx skills add`, or adds a third-party server. Nobody here has reviewed those listings: read the source first.
- Apps pick up a change the next time they start.
- Every change that was applied is appended to `~/.wayfinder/actions.log`, with the time and what happened.

Not supported: turning plugins on or off, project-scoped MCP config, and anything held in a cloud account (ChatGPT, claude.ai connectors).

### The assistant on the map

Type what you want in plain words: "add my design skills to Cursor", "what is Antigravity missing?", "show only what my apps share", "find a skill for testing". Gemini picks from a fixed set of things the app can do; it never does them. What comes back is a list of proposed changes (each checked by the server), a new view of the map, or skills found in the registry. "Review" opens the usual confirmation dialog, and only that dialog applies anything.

Pressing Send shares with Google the names of your apps, the names, tags and descriptions of the skills you manage, MCP server names, and the folder names of your projects. No file contents, paths, commands or secrets.

## Safety rules the code follows

- Collectors and tabs never write. The only code that changes anything is `server/actions.ts`, and only after a confirmation. Besides that, the dashboard writes its own usage cache in `node_modules/.cache/wayfinder/` and backups in `~/.wayfinder/backups/`.
- The write routes need a token that only the dashboard's own page can read, so another website open in your browser cannot trigger a change. `npm run demo` has no write routes at all.
- Secrets are removed in the collectors (`collectors/redact.ts`) before anything reaches an HTTP response: env and header values are dropped and only their names kept, URLs lose credentials and query strings, and secret-looking arguments are masked.
- Registry listings, skill descriptions and README text are third-party data. They are rendered as plain text and never treated as instructions.
- The API answers only requests from this machine.

## Working on it

```bash
npm test          # collectors, redaction and insights against an invented home directory
npm run typecheck
npm run fixture   # regenerate fixtures/sample-snapshot.json after changing a collector
```

Layout and the rules for working in parallel are in `CLAUDE.md` here and in `../docs/dashboard-spec.md`. In short: a collector is `collectors/<slice-id>.ts` with a default export, a tab is `src/features/<slice-id>/feature.tsx` exporting `feature`, and both are picked up automatically.
