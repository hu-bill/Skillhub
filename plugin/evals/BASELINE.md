# Eval baseline

Full run on 2026-11-13 with Claude Code 2.1.322 and the session default model (`claude-opus-5-5`): three runs per case with the plugin, three without. Cost about $4.58 at list price for the first ten cases, plus $0.54 for `route-media-generation`, which was added and run separately the same day.

| Case | With | Without | Delta | Route fired |
| :- | :- | :- | :- | :- |
| `no-trigger-explain` | 1.00 | 1.00 | +0.00 | 0 of 3 |
| `no-trigger-small-edit` | 1.00 | 1.00 | +0.00 | 0 of 3 |
| `no-trigger-typo` | 1.00 | 1.00 | +0.00 | 0 of 3 |
| `route-compare-builds` | 1.00 | 0.00 | +1.00 | 3 of 3 |
| `route-compression-tool` | 1.00 | 0.50 | +0.50 | 3 of 3 |
| `route-long-session` | 1.00 | 1.00 | +0.00 | 3 of 3 |
| `route-media-generation` | 1.00 | 0.00 | +1.00 | 3 of 3 |
| `route-plan-feature` | 1.00 | 0.50 | +0.50 | 3 of 3 |
| `route-planning-framework` | 0.83 | 0.50 | +0.33 | 3 of 3 |
| `route-reverse-engineering` | 1.00 | 0.00 | +1.00 | 3 of 3 |
| `route-stale-card` | 1.00 | 0.00 | +1.00 | 3 of 3 |

## Reading it

- **Triggering:** Route fired in every run of every routing case (24 of 24) and in no run of the must-not-trigger cases (0 of 9).
- **Largest gains** are the two domain cards. The bare model never names REA or Higgsfield.
- **`route-long-session` shows no gain.** The bare model already recommends `/clear` and `/compact`, and this case's graders check nothing else. The same card does gain on `route-compression-tool`, where the dated verdict matters. The case needs a grader for what the card adds, or the card needs a narrower job.
- **`route-planning-framework` missed the date once** in three runs. Everything else in that run was right.
- A `tool_used: Skill` grader is an indicator in a two-arm run, not part of the score. The scores above come from the content graders.

## Caveats

- Three runs per case is a small sample.
- The description gained two trigger phrases after this run ("generating images or video", and the general "specialized domain" clause). A one-run pass over all eleven cases after those edits scored 1.00 on each.
- The live lookup case in `plugin/evals-live/` passed once. It uses the network and is not part of this table.
