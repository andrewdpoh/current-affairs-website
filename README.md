# Daily Brief

A self-updating current-affairs brief: world news, geopolitics, defense and cybersecurity from
the past seven days. Stories you have read disappear from the brief and are filed into history.

- **Runs for free.** GitHub Actions fetches the feeds, GitHub Pages serves the site. No API keys,
  no database, no server, no paid tier.
- **No dependencies.** `node_modules` is empty by design — the feed parser, the clustering and the
  UI are all hand-written. Nothing to patch, nothing to keep up with.
- **Private by construction.** Read state lives in your browser's local storage. No accounts, no
  analytics, no third-party requests of any kind.

---

## How it works

```
 GitHub Actions (every 3h)
        │
        ├── scripts/fetch-news.mjs
        │     fetch ~30 RSS/Atom feeds in parallel
        │     normalize · dedupe · tag · cluster · score
        │     merge into the stored 7-day window
        │
        ├── commit public/data/news.json   ← the repo is the database
        │
        └── deploy public/ to GitHub Pages
                │
                └── the page fetches news.json and renders it client-side
```

The merge step is the important one. Most RSS feeds only expose the last 24–48 hours, so a true
seven-day window has to be accumulated over successive runs and stored. Committing the JSON back
to the repository is what gives us persistence without paying for a database.

### Why the repo is the database

| | |
|---|---|
| Cost | £0 — Actions minutes are unlimited on public repos, Pages is free |
| Durability | Every update is a commit; the history is fully auditable |
| Failure mode | A bad run leaves the previous `news.json` in place |
| Limit | Fine to a few MB. Well beyond the ~1,500 items retained here |

---

## Layout

```
scripts/
  feeds.mjs           source registry + keyword rules — edit this to change coverage
  fetch-news.mjs      the pipeline
  lib/xml.mjs         RSS 2.0 / Atom / RDF parser (no dependencies)
  lib/normalize.mjs   canonicalization, dedupe, clustering, scoring
  test.mjs            offline unit tests — no network needed
  dev-seed.mjs        generates [SAMPLE] data for local UI work
  serve.mjs           static dev server
public/               deployed verbatim to Pages
  index.html
  assets/app.js       the reader
  assets/styles.css
  data/news.json      generated; committed by the workflow
  sw.js               offline support
```

## Local development

```bash
npm test          # offline unit tests
npm run seed      # fill news.json with obvious [SAMPLE] data
npm run dev       # http://localhost:4173
npm run seed:clear   # IMPORTANT: reset before committing
```

To pull real feeds locally (needs outbound network):

```bash
npm run fetch              # writes public/data/news.json
npm run fetch -- --dry-run # fetch and report, write nothing
```

---

## Setup

### 1. Enable Pages

Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The repo must be **public** for this to be free: Pages on a private repo requires a paid plan, and
Actions minutes are only unlimited on public repos. Nothing sensitive lives here — the feed list is
the only content, and your reading history never leaves your browser.

### 2. Custom domain

Add a `public/CNAME` file containing your domain (e.g. `brief.example.com`), then point DNS at
GitHub:

| Type | Name | Value |
|---|---|---|
| `CNAME` | `brief` | `<your-github-username>.github.io` |

For an apex domain use four `A` records instead: `185.199.108.153`, `185.199.109.153`,
`185.199.110.153`, `185.199.111.153`. Then tick **Enforce HTTPS** in Settings → Pages once the
certificate is issued.

### 3. First run

The workflow runs on its own schedule, but you can seed it immediately from the **Actions** tab →
**Update brief** → **Run workflow**. The first run populates `news.json`; the window fills out over
the following days as the feeds roll forward.

---

## Changing what you read

Everything lives in `scripts/feeds.mjs`.

**Add a source:**

```js
{
  id: 'nato',
  name: 'NATO Newsroom',
  url: 'https://www.nato.int/cps/en/natohq/news.rss',
  section: 'defense',   // world | geopolitics | defense | cyber
  weight: 1.2,          // ranking nudge for Top Stories
}
```

Then `npm run fetch -- --dry-run` to confirm it parses.

**Add a topic tag:** append to `TOPIC_RULES`. A rule with a `section` can also promote a story from
a general outlet into a specialist section — that is how a BBC piece about ransomware ends up under
Cyber.

**Feeds that die** show up in the log and in Settings → Source health on the site itself. The CI
job checks reachability on every push without failing the build.

---

## Design notes

**Top Stories is derived, not curated.** Headlines are tokenized, near-duplicates are clustered
across outlets, and cluster size feeds the ranking. A story carried by six outlets in the last two
hours outranks one carried by one outlet yesterday. This is the best importance signal available
without paying for an LLM.

**State-funded outlets are labelled.** Al Jazeera, CNA, DW and NPR carry a `state-funded` or
`public` tag. Not a quality judgement — it is context worth having on the page when you are reading
for geopolitical signal, and it is a reason to keep them rather than drop them.

**Sources are verified, not assumed.** Seven of the first thirty feeds were already dead — a 23%
failure rate on URLs that all looked plausible. Every source in the registry has been fetched and
parsed successfully in CI. Two publishers (Lawfare, France 24) were dropped rather than worked
around: both block automated clients, and getting past that would mean impersonating a browser,
which is the publisher's call to make.

**Third-party text is never trusted.** Feed content is written to the DOM with `textContent`, never
`innerHTML`. URLs are canonicalized server-side and anything that isn't `http(s)` is dropped, so a
malicious feed cannot inject a `javascript:` link. The page also ships a restrictive CSP.

> Note: `frame-ancestors` and HSTS cannot be set from a `<meta>` tag and GitHub Pages does not let
> you set response headers. If you later want real security headers, put Cloudflare (free tier) in
> front of the domain and set them there.

**Excerpts, not reproductions.** The site shows a headline, a short summary from the publisher's own
feed, and a link to the source. That is what RSS is for. Don't extend it to full-text scraping.

---

## Operational caveats

- **GitHub's cron is best-effort.** Scheduled runs are queued and can be delayed by 10–30 minutes
  under load, occasionally longer. Running every three hours makes this invisible.
- **Scheduled workflows are disabled after 60 days of repository inactivity.** The workflow's own
  data commits count as activity, so an actively-running brief keeps itself alive. If you pause it
  for a couple of months, re-enable it in the Actions tab.
- **Read state is per-browser.** Local storage is not shared between your laptop and your phone.
  Settings → Your data → Export/Import moves it across. Cross-device sync would need a backend and
  is deliberately out of scope.
