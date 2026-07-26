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
| `scripts/test.mjs` | 22 offline assertions over parsing and normalizing. No network. |
| `scripts/probe-feeds.mjs` | Hits every feed and reports which are broken. Needs network. |

## Commands

```sh
npm test          # 22 offline assertions — always run before pushing
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
