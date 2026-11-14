# Skillhub design language: "Forward"

The logo is the word Skillhub with an arrow where the two halves meet. Everything in the interface comes from that arrow: it points from a skill to the place it is used, and it only ever moves one way.

The tokens live in `src/shell/shell.css`. Feature slices read them and never define colours of their own.

## Principles

1. **Say it in plain words first.** Every page opens with one sentence a newcomer can follow. A term such as "MCP server" is explained the first time it appears on a page.
2. **Show before you change.** Reading is free. Any change names the exact file or command and waits for a yes.
3. **One accent, one direction.** Green means "this is the thing to do" or "this is selected". The arrow means "forward": continue, connect, loading.
4. **Calm surface, loud data.** Neutrals carry the layout. Colour is spent on app identity and on the accent, nowhere else.

## Colour

One accent and one family of neutrals, each neutral tinted toward the accent's green so nothing reads as a stray grey.

| Role | Light | Dark | Use |
| :- | :- | :- | :- |
| `--bg` | `#f2f6f4` | `#0a0f0d` | Page |
| `--surface` | `#ffffff` | `#111816` | Cards, inputs, nodes |
| `--surface-2` | `#ecf2ef` | `#18211e` | Hover, wells, tags, command blocks |
| `--border` / `--border-strong` | `#d9e3de` / `#bccac3` | `#232e2a` / `#35443f` | Hairlines / controls |
| `--text` / `--text-2` / `--text-3` | `#0b1512` / `#45554e` / `#73827b` | `#ecf3ef` / `#a9b8b1` / `#74837c` | Primary / secondary / hints |
| `--accent` | `#00c37d` | `#08de91` | Fills, outlines, the logo (the two brand greens) |
| `--accent-text` | `#00774a` | `#2ee6a3` | Accent used as text or link, where the fill colour would not pass contrast |
| `--accent-ink` | `#04261a` | `#04261a` | Text on an accent fill |

Rules:

- A filled button is accent with `--accent-ink` text. Never white on green.
- Accent as text always uses `--accent-text`.
- Each AI app has a fixed identity colour (`--app-<id>`), taken from the app's own icon: Claude's clay, Codex's blue-violet, Antigravity's blue, a neutral for Cursor and ChatGPT. It follows the app onto the map and the charts and is never used for anything else. Identity is never colour alone: the app's name or logo is always next to it. The two that share a chart today (Claude Code and Codex) pass the colour-blind separation check in both themes; re-run it when a third app starts reporting usage.
- Topic tints for skill glyphs come from a separate set (`--series-1` … `--series-8`).
- Status colours (`--status-*`) are for state only, and come with words.
- Shadows are tinted with the surface hue, not black.

## Type

| Family | Token | Use |
| :- | :- | :- |
| Outfit | `--display` | Headings, big numbers, app names. Its round geometry echoes the wordmark. |
| Geist | `--font` | Everything else. |
| Geist Mono | `--mono` | Commands, paths, addresses. |

All three are bundled with the app (`@fontsource-variable/*`). Nothing is fetched from a font service, because a local tool should not call out on load.

Headings are sentence case with tight tracking. Numbers that are compared use tabular figures. Body copy stops at about 66 characters.

## Shape

Containers are soft, what sits inside them is tighter: `--radius-lg` 18 (hero, dialog, map), `--radius` 14 (cards, app nodes), `--radius-sm` 9 (buttons, inputs, nodes), `--radius-xs` 6 (tags).

- Tags are small squared labels, not pills.
- App identity marks are rounded squares, not circles.
- A card has a hairline border and no shadow. Shadow is kept for things that float: the dialog, tooltips, the app nodes on the map.

## Patterns

Two textures, each with one job.

- **Chevron tile** (`--pattern-chevron`): the arrow, repeated at very low contrast. Marks the two "brand moments": the Explore hero and the head of the confirmation dialog.
- **Dot grid** (`--pattern-dots`): the map's canvas, so links read as drawn on a surface.

## The arrow

The arrow component is `Arrow` in `src/shell/brand/Brand.tsx`, drawn from the brand SVG.

| Where | What it does |
| :- | :- |
| Logo | Sits between "Skill" and "hub". Nudges forward on hover and while a scan runs. |
| First load (`Splash`) | The letters rise in, then the arrow arrives between them with a small overshoot and keeps nudging. |
| Loading (`ArrowLoader`) | Three arrows march forward in sequence. Used in buttons, the dialog and search. There are no spinners anywhere. |
| Rescan | A thin sweep runs along the bottom of the top bar. |
| Map | The handle on each skill and server is an arrow pointing at the apps: drag it onto one to connect. |
| Links and buttons | A trailing arrow means "go there"; it slides 3px on hover. |

The arrow never rotates and never points backward, except on the map's right-hand column, where it is mirrored so it still points at the apps.

## Motion

- Two curves: `--ease` for almost everything, `--spring` for the arrow's arrival and the map handle.
- Durations: 120–200ms for feedback, 280–450ms for things entering.
- Pages and the dialog settle upward 10px as they appear, without fading: content is never hidden behind an animation, so it is readable even where animations are paused. Buttons press down 1px.
- Only `transform` and `opacity` are animated.
- `prefers-reduced-motion` turns all of it off.

## Layout

- A sticky top bar: logo, then the sections as plain words, then search, theme and Rescan. No icons and no sidebar. The current section is the one in the accent colour. A hairline separates the two groups (finding and managing skills; looking at numbers and asking).
- Section names are one or two short words: Explore, My skills, Map, MCP, Usage, Ask.
- Content is capped at 1360px.
- Below 980px the sections move to their own scrolling row and grids collapse to one column.

## The skill card

The unit Explore and My skills are built from (`SkillCard` in `src/shell/ui.tsx`).

- A glyph (the skill's first two letters on a tile tinted by its first tag), the name, and one small line for who made it or where it lives.
- A description held to two lines.
- Up to three topic tags. A tag is a filter: pressing one narrows the page to that topic.
- One line at the bottom: a number or the logos of the apps that have it on the left, the single action on the right.
- Cards sit in a grid, or in a row that scrolls sideways when there are several rows on a page.

## Less text

A page says what it is in one short line, or lets a headline do it. Explanations live where they are needed (a tooltip, the confirmation dialog), not above the content. If a label can be two words, it is.

## App marks

An app is shown by its own logo, read from the installed app (`AppMark`). Where there is no icon to read, a monogram tile in the app's identity colour stands in. In charts the identity colour is still what carries the app, with its name in the legend.

## Voice

Plain and specific. Sentence case. No exclamation marks. An error says what happened and what to do next. A button names its outcome ("Open the map", "Fix this"), and a button that removes something is outlined in red and says "Remove".
