# Skillhub landing page

A one-page site that says what Skillhub is, shows how it works, lists what it does, and tells people how to install it. It uses the same design language as the app (`../dashboard/DESIGN.md`): the green accent, Outfit and Geist, and the arrow.

## Run it

Needs Node 22.13 or newer.

```bash
cd site
npm install
npm run dev
```

Open http://127.0.0.1:5180.

## Publish it

```bash
npm run build
```

This writes plain static files to `dist/`. Asset links are relative, so the folder can be served from any static host, including a sub-path such as GitHub Pages.

## What is on the page

| Section | What it shows |
| :- | :- |
| Hero | The headline, and a live map: skills flowing to AI apps, apps reaching tools. |
| People | A band of crafts (skier, illustrator, mathematician and so on), each paired with a skill an AI can learn. Photo slots, see below. |
| How it works | Three steps with a small animation each: scan, map, connect. |
| Features | Suggestions, the assistant, per-app and per-project control, usage, and the three safety promises. |
| Works with | The AI apps Skillhub reads. Names only; no third-party logos are used on the site. |
| Install | The steps that work from source today, with a copy button. |

## Things to fill in later

- **Photos.** Each person in the band is a slot, filled from `public/people/<slot>.jpg`. The current photos are generated images; swap in real ones if you get them. A missing file shows a drawn placeholder. File names, sizes and prompt starters are in `public/people/README.md`.
- **Install steps.** They describe running from source (`git clone`, `npm install`, `npm run dev`). They assume the dashboard is on the default branch. Replace them when there is a packaged download.

## Facts on the page

Skills named on the page are real listings on skills.sh, and the install counts next to them were read in November 2026. They go stale; update them in the `SKILLS` list in `src/App.tsx` or remove the numbers.

## Where things are

- `src/App.tsx`: the whole page, section by section.
- `src/styles.css`: tokens (copied from the app) and all styles.
- `src/brand/`: the logo and arrow, drawn from the brand SVGs.

Everything that moves animates only `transform` and `opacity`, and `prefers-reduced-motion` turns it off. Content is never hidden behind an animation.
