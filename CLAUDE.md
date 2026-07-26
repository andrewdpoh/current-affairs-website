# Daily Brief

A self-updating news reader: world, geopolitics, defense and cyber headlines from
the past 7 days, with read items moved to a local history. Static site on GitHub
Pages, data refreshed by GitHub Actions.

## The constraint that shapes everything

**Zero running cost, and zero LLM calls at runtime.** This is the primary design
constraint, not an implementation detail. Before adding anything, check it against
these:

- **No paid services, no API keys.** All 33 sources are public RSS/Atom. If a
  feature needs a key or a paid tier, it does not belong here.
- **No LLM in the pipeline.** Summaries are the publishers' own RSS
  `<description>` text, cleaned up. Ranking is token overlap and arithmetic.
  Section routing is regex. Do not "improve" any of these by calling a model —
  that converts a free site into a metered one.
- **No runtime dependencies, and no build step.** `package.json` has zero
  `dependencies` and zero `devDependencies`, including the XML parser
  (`scripts/lib/xml.mjs` is hand-rolled). The browser loads plain HTML, CSS and
  JS. Keep it that way: it is why this needs no maintenance.
- **No third-party requests from the page.** No CDNs, no web fonts, no analytics.
  System font stack only. The user works in defense cybersecurity; their reading
  activity should not leave their device.

## How it works

```
33 RSS feeds ──▶ scripts/fetch-news.mjs ──▶ public/data/news.json ──▶ public/assets/app.js
                 (GitHub Actions, 3-hourly)   (committed to the repo)   (renders, tracks read state)
```

**The repo is the database.** Most feeds only expose the last day or two, so a
7-day window is impossible from a single fetch. Each run merges new items into
the stored set and commits `public/data/news.json` back to `main`. Deleting that
file loses history until the window refills.

**Read state never leaves the browser.** `localStorage` under one key,
`daily-brief.v1`. There is no backend, no account, no sync. Cross-device means
Settings → Export/Import. History stores *full item snapshots*, not IDs, because
items age out of the 7-day window and would otherwise vanish from history.

## Layout

| Path | What it is |
|---|---|
| `scripts/feeds.mjs` | Source registry (`FEEDS`), `SECTIONS`, `TOPIC_RULES`. Start here to change coverage. |
| `scripts/fetch-news.mjs` | Orchestration: fetch, merge, prune, write. Tunables at the top. |
| `scripts/lib/xml.mjs` | Hand-rolled RSS/Atom parser. `parseFeed`, `stripHtml`, `decodeEntities`, `parseDate`. |
| `scripts/lib/normalize.mjs` | `canonicalUrl`, `itemId`, `classify`, `clusterItems`, `scoreItem`, `cleanSummary`. |
| `public/assets/app.js` | The whole front end. State, rendering, keyboard nav, settings. |
| `scripts/test.mjs` | 32 offline assertions over parsing, normalizing and ranking. No network. |
| `scripts/probe-feeds.mjs` | Hits every feed and reports which are broken. Needs network. |

## Commands

```sh
npm test          # 32 offline assertions — always run before pushing
npm run dev       # local server on :8000
npm run fetch     # real fetch, rewrites public/data/news.json (needs network)
npm run probe     # check all 33 feeds are alive (needs network)
npm run seed      # fake data for UI work, no network
npm run seed:clear
```

`npm run seed` is the one to use for front-end work — it avoids hammering
publishers while iterating on CSS.

## Tunables

In `scripts/fetch-news.mjs`: `WINDOW_DAYS` (7, what's displayed), `RETAIN_DAYS`
(10, what's kept — deliberately longer so items don't vanish mid-read),
`MAX_ITEMS` (1500), `MAX_PER_SOURCE` (80), `FETCH_TIMEOUT_MS`, `CONCURRENCY` (6,
keep it polite).

In `scripts/lib/normalize.mjs`: the cross-source clustering threshold is Jaccard
`>= 0.55`. This is deliberately conservative and only catches near-identical
headlines, not paraphrases — a false merge *hides a distinct story*, which is
worse than showing two angles on one. Do not lower it without a good reason.

In `public/assets/app.js`: `SECTION_CAPS` is how many stories each section shows
before a click, and `TOP_QUOTAS` fixes the section mix of Top Stories. Together
they take the first screen from ~640 cards to ~50.

## Design

The palette lives entirely in custom properties at the top of
`public/assets/styles.css`. Three token blocks carry it: dark (the default),
`:root[data-theme="light"]`, and the same light values again under
`@media (prefers-color-scheme: light)` for `data-theme="auto"`. Change a colour
in one and you must change it in all three.

- **Contrast is deliberately not maximal.** Body text is ~11:1 on dark and
  ~10:1 on light, down from 15.6:1 and 16.3:1. Near-white on near-black is glare
  over a long read. Do not "fix" this by darkening the ground or brightening the
  ink — it was measured, not guessed.
- **But AA is a floor.** Every text token clears WCAG AA (4.5:1) on its own
  ground; `--text` and `--accent` clear AAA. The previous light theme's muted
  tone failed at 3.84:1, which is what prompted checking. If you retune, verify
  the ratios rather than eyeballing them.
- **Neutrals are blue-biased, not warm.** This is a situation report, not a
  literary quarterly, and warm-cream-plus-serif is the single most over-used
  look in generated design. The bias also ties the greys to the accent.
- **`--shell` (1180px) is the page frame; `--measure` (62ch) is one story's
  reading width.** They are separate so the frame can use a desktop screen while
  lines stay short. 1560px gave three columns and read as a wall of text.
- **Summaries are line-clamped** (4 lines in the grid, 5 on the lead). Grid rows
  take the height of their tallest card, so one long excerpt punches a hole
  beside it. These are publisher excerpts, not the article.
- **System fonts only**, per the no-third-party-requests rule above. Do not add
  `@font-face`, including as a data URI — it defeats the instant first paint that
  makes this feel fast.

## Ranking

There is no model here; ranking is arithmetic over four signals in `scoreItem`:

- **Corroboration** (`coverage`) — several independent desks choosing the same
  story is a free editorial judgement, and it is weighted highest.
- **Recency** — deliberately *not* dominant. It used to be, which made the page
  an expensive reverse-chronological list.
- **Focus** — `FOCUS_WEIGHTS` plus `GEO_TAGS` hits. Defense sits at 0.55 against
  1.0 for geopolitics and cyber: its feeds are prolific and at equal weight it
  took 11 of the top 20 and squeezed out the two sections this site is for.
- **Demotions** — `NOISE_RULES` (sport, entertainment, lifestyle) and
  `ROUTINE_RULES` / `ROUTINE_SUMMARY_RULES` (recurring columns, round-ups,
  routine advisory bulletins).

Two things to preserve if you touch this:

- **The demotion lists only reorder; they never exclude.** A false positive then
  costs a lower rank rather than a story you never saw. Do not convert them into
  a filter.
- **Top Stories uses quotas, not a global top-N.** Cyber reporting is usually
  single-source, so it can never win on corroboration against a wildfire eight
  wires cover. Quotas make the ranking compete *within* a section, which is the
  only comparison where corroboration means anything.

## Feed registry

Each entry: `{ id, name, url, section, funding, weight }`.

- `section` — one of `world`, `geopolitics`, `defense`, `cyber`. Current spread:
  8 / 7 / 7 / 11. The cyber and defense weighting is intentional and matches what
  the site is for; keep it when adding sources.
- `funding` — `independent`, `public`, or `state`. Surfaced in the UI so
  state-funded outlets are visible as such rather than hidden. Always set it
  honestly on new sources.
- `weight` — nudges ranking. Reserve the high end for outlets with genuine
  original reporting.

When adding a feed: run `npm run probe` to confirm it resolves and parses, and
set `funding` accurately. A feed that 404s degrades the site silently, which is
why CI probes them on every branch.

## Conventions

- **Comments explain *why*, not *what*.** The existing comments are load-bearing
  context (why the repo is the database, why the threshold is 0.55, why Pages
  needs manual enabling). Match that register; don't narrate the obvious.
- **`main` is deployed.** Pushing to `main` under `public/**` triggers a rebuild.
  Data commits from the workflow are excluded via `paths` and, being
  `GITHUB_TOKEN`-authored, would not retrigger anyway.
- Never commit anything work-related. This repo is public.

## Gotchas

- **Pages needed enabling by hand** (Settings → Pages → Source: GitHub Actions).
  `configure-pages` with `enablement: true` cannot do it — creating a Pages site
  needs admin rights `GITHUB_TOKEN` is not granted, even with `pages: write`.
  Already done; relevant only if the repo is ever recreated.
- **Scheduled workflows get disabled after 60 days of repo inactivity.** The
  3-hourly data commits normally prevent this. If the brief goes stale, check
  whether the schedule was disabled before debugging the code.
- **`git pull --rebase` before pushing.** The workflow commits to `main` every
  three hours, so a local branch goes stale quickly.
- **Cron is best-effort.** `17 */3 * * *` can run late under GitHub load. Eight
  runs a day makes that invisible; don't chase a "late" run as a bug.
