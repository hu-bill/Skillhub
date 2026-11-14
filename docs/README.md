# Skillhub documentation

Start with the [project README](../README.md) for what Skillhub is, how to run it in two minutes, and a table of claims you can check with one command each. The files here go deeper.

## Where to look

| You want to know | Read |
| :- | :- |
| How the whole thing is built, and why it is safe to run | [`architecture.md`](architecture.md) |
| Every API, framework and tool used, and what data goes to each | [`tech-stack.md`](tech-stack.md) |
| The dashboard's HTTP routes, data contracts, the router's commands, tools and CLI | [`api-reference.md`](api-reference.md) |
| How to run the dashboard, what each page shows, how changes are made | [`../dashboard/README.md`](../dashboard/README.md) |
| The interface's visual language | [`../dashboard/DESIGN.md`](../dashboard/DESIGN.md) |
| Why the project exists and what it deliberately is not | [`design-brief.md`](design-brief.md) |
| What already exists, with links and the date each fact was checked | [`prior-art.md`](prior-art.md) |
| The router in full: card schema, the skill's wording, evals, what testing showed | [`spec.md`](spec.md) |
| The dashboard's contract and how it grew during the build | [`dashboard-spec.md`](dashboard-spec.md) |
| How two people and their coding agents share the repository | [`../CLAUDE.md`](../CLAUDE.md), [`../dashboard/CLAUDE.md`](../dashboard/CLAUDE.md) |

## A reading path for evaluation

About fifteen minutes, in this order:

1. [README](../README.md): the problem, the demo, and "Check our claims".
2. [`architecture.md`](architecture.md), sections 1, 2.3 and 2.5: the two parts, how a change is confirmed, and the trust boundaries.
3. [`tech-stack.md`](tech-stack.md), section 4: the four external services and exactly what each one receives.
4. One decision card, for example [`plan-large-feature.md`](../pi-package/skills/route/cards/plan-large-feature.md): a verdict, what to skip, sources and a review date in under 80 lines.
5. [`plugin/evals/BASELINE.md`](../plugin/evals/BASELINE.md): the router measured against the bare model.

## Two kinds of document

**As built.** `architecture.md`, `tech-stack.md`, `api-reference.md` and the two READMEs describe the code as it is. Where they name a number, the command that produces it is next to it.

**Design record.** `design-brief.md`, `prior-art.md`, `spec.md` and `dashboard-spec.md` were written before and during the build and are kept as they were, with dated amendments. They explain why decisions were made. Where a design record and the code disagree, the later amendment and the as-built files describe the code:

- `spec.md` sections 1 to 15 describe the first slice, for Claude Code. Section 16 covers the Pi package, which is the current target.
- `dashboard-spec.md` sections 1 to 5 describe a read-only dashboard for two harnesses. Section 6 records what was built instead: twelve apps, usage, discovery, and confirmed changes.

## A note on names

The product is Skillhub. Its in-session router was built under the working name Wayfinder. That name is still in command names (`/wayfinder`), package names, paths (`~/.wayfinder/`), environment variables (`PI_WAYFINDER_DATA`) and the older design records. The as-built files call the product Skillhub and write each identifier exactly as the code has it.

## Facts carry dates

Agent harnesses change weekly, so every claim about someone else's product in these files comes with the date it was checked and, where possible, a link. Facts about Pi were checked against version 1.5.2 on 2026-11-14, and facts about Claude Code against 2.1.322 on 2026-11-13.
