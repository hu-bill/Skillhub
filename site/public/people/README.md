# Photos for the "Nobody is born good at it" band

Drop a file here and it replaces the drawn placeholder for that slot. Nothing else needs changing: the page looks for `people/<slot>.jpg` and falls back to the placeholder when the file is missing.

| File | Shape | Size to export | Who |
| :- | :- | :- | :- |
| `skier.jpg` | tall, 4:5 | 1200 x 1500 | A skier mid-turn |
| `illustrator.jpg` | wide, 4:3 | 1600 x 1200 | An illustrator drawing |
| `mathematician.jpg` | tall, 4:5 | 1200 x 1500 | A mathematician at a board |
| `painter.jpg` | square | 1400 x 1400 | A painter at a canvas |
| `accountant.jpg` | tall, 4:5 | 1200 x 1500 | An accountant with ledgers |
| `architect.jpg` | wide, 4:3 | 1600 x 1200 | An architect over a plan |
| `chess-player.jpg` | square | 1400 x 1400 | A chess player thinking |

To add or reorder people, edit the `PEOPLE` list in `src/App.tsx`. A new entry needs a `slot` (the file name), a line for `who` and `learns`, the `skill` shown under it, and a `shape` (`tall`, `wide` or `square`).

## Keeping the set consistent

The seven photos sit side by side, so they should look like one series.

- One style for all: documentary photograph, natural light, shallow depth of field, the person absorbed in the work and not looking at the camera.
- One grade for all: muted, slightly cool, with deep green-black shadows so they sit on the page's dark background (`#0a0f0d`). No heavy saturation.
- Keep the subject away from the bottom fifth of the frame; the caption sits right under the photo.
- No text, logos or watermarks in the image.

## Prompt starters

Use the same style sentence at the end of every prompt.

Style sentence: `Documentary photograph, natural light, shallow depth of field, muted cool colour grade with deep green-black shadows, candid, no text, no logos.`

- Skier: `A downhill skier carving a hard turn on a steep slope, snow spraying, low sun, seen from slightly below.`
- Illustrator: `An illustrator's hands and forearm drawing with a pencil on a large sheet, desk lamp, sketches pinned behind.`
- Mathematician: `A mathematician writing equations on a tall blackboard, chalk dust in the air, seen from the side.`
- Painter: `A painter stepping back from a large canvas in a studio, brush in hand, paint on the apron.`
- Accountant: `An accountant at a desk checking a paper ledger against a calculator, evening window light.`
- Architect: `An architect leaning over a large drawing on a table, scale ruler and model beside it.`
- Chess player: `A chess player in deep thought over a board mid-game, hand hovering above a piece.`

If the photos show real, recognisable people, make sure you have the right to use them.
