#!/usr/bin/env node
/**
 * Fetch every registered feed, merge with the previously stored window, and
 * write public/data/news.json.
 *
 * Why merge rather than overwrite: most RSS feeds only expose the last 24-48
 * hours. Accumulating across runs is what makes a genuine 7-day window
 * possible. The JSON is committed back to the repo, so the repo itself is the
 * database — no server, no hosting cost.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEEDS } from './feeds.mjs';
import { parseFeed } from './lib/xml.mjs';
import {
  canonicalUrl,
  itemId,
  cleanSummary,
  classify,
  clusterItems,
  isNoise,
  isRoutine,
  scoreItem,
  truncate,
} from './lib/normalize.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(ROOT, 'public/data/news.json');

const WINDOW_DAYS = 7;
// Retain a little beyond the display window so a story read on day 7 still has
// a source record if the window edge shifts between runs.
const RETAIN_DAYS = 10;
const MAX_ITEMS = 1500;
const MAX_PER_SOURCE = 80;
const FETCH_TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;
const RETRIES = 2;

const USER_AGENT =
  'daily-brief/1.0 (+https://github.com/andrewdpoh/current-affairs-website) feed-reader';

async function fetchFeed(feed) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) {
      // Back off politely; a hammered feed is a feed that blocks you.
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(feed.url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'en',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      const parsed = parseFeed(body);
      return { ok: true, entries: parsed.entries };
    } catch (err) {
      lastError = err.name === 'AbortError' ? new Error(`timeout after ${FETCH_TIMEOUT_MS}ms`) : err;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, entries: [], error: lastError?.message || 'unknown error' };
}

/** Simple bounded-concurrency map — avoids opening 30 sockets at once. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadExisting() {
  try {
    const raw = await readFile(OUT_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return []; // First run, or the file was reset.
  }
}

function toItem(entry, feed, nowIso) {
  const canonical = canonicalUrl(entry.link);
  if (!canonical) return null;

  const title = truncate(entry.title, 220);
  if (!title) return null;

  const summary = cleanSummary(entry.summary, title);
  const { tags, sectionOverride } = classify({ title, summary });

  // A specialist feed already knows its own beat; only let keyword rules move a
  // story that came from a general-news source.
  const section =
    feed.section === 'world' && sectionOverride ? sectionOverride : feed.section;

  let published = entry.publishedAt ? entry.publishedAt.toISOString() : nowIso;
  // Guard against feeds that emit dates in the future, which would otherwise
  // pin a story to the top of the brief forever.
  if (published > nowIso) published = nowIso;

  return {
    id: itemId(canonical),
    title,
    url: canonical,
    summary,
    source: feed.name,
    sourceId: feed.id,
    section,
    region: feed.region || null,
    funding: feed.funding || null,
    tags,
    noise: isNoise({ title, summary }),
    routine: isRoutine({ title }),
    publishedAt: published,
    firstSeenAt: nowIso,
  };
}

// `--dry-run` fetches and reports without touching news.json. CI uses it on
// pull requests and feature branches to catch a feed that has gone dead
// without publishing anything.
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const retainCutoff = new Date(now - RETAIN_DAYS * 86_400_000).toISOString();

  console.log(`Fetching ${FEEDS.length} feeds…\n`);

  const results = await mapLimit(FEEDS, CONCURRENCY, async (feed) => {
    const started = Date.now();
    const res = await fetchFeed(feed);
    const ms = Date.now() - started;
    const status = res.ok ? `${String(res.entries.length).padStart(3)} items` : 'FAILED   ';
    console.log(
      `  ${res.ok ? '✓' : '✗'} ${feed.id.padEnd(24)} ${status} ${String(ms).padStart(6)}ms` +
        (res.ok ? '' : `  — ${res.error}`)
    );
    return { feed, ...res };
  });

  // --- merge -------------------------------------------------------------
  const existing = DRY_RUN ? [] : await loadExisting();
  const merged = new Map();

  for (const item of existing) {
    if (item?.id && item.publishedAt >= retainCutoff) merged.set(item.id, item);
  }

  let added = 0;
  for (const { feed, entries } of results) {
    let kept = 0;
    for (const entry of entries) {
      if (kept >= MAX_PER_SOURCE) break;
      const item = toItem(entry, feed, nowIso);
      if (!item || item.publishedAt < retainCutoff) continue;
      kept += 1;

      const prior = merged.get(item.id);
      if (prior) {
        // Keep the original discovery time — the UI uses it to mark what is new
        // since the last visit — but let corrected metadata through.
        merged.set(item.id, { ...item, firstSeenAt: prior.firstSeenAt });
      } else {
        merged.set(item.id, item);
        added += 1;
      }
    }
  }

  let items = [...merged.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);

  // --- cluster + score ---------------------------------------------------
  const weights = new Map(FEEDS.map((f) => [f.id, f.weight || 1]));
  const clusters = clusterItems(items);

  for (const members of clusters) {
    // Sort so the highest-weighted source becomes the cluster's representative.
    members.sort((a, b) => (weights.get(b.sourceId) || 1) - (weights.get(a.sourceId) || 1));
    const [lead, ...rest] = members;
    const clusterId = lead.id;

    for (const member of members) {
      member.clusterId = clusterId;
      member.isLead = member.id === lead.id;
      member.score = Number(
        scoreItem(member, members.length, weights.get(member.sourceId) || 1, now).toFixed(4)
      );
    }
    // Attach sibling coverage to the lead so the UI can show "also reported by".
    lead.alsoIn = rest.map((m) => ({ source: m.source, url: m.url }));
  }

  const displayCutoff = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const health = results.map(({ feed, ok, entries, error }) => ({
    sourceId: feed.id,
    name: feed.name,
    ok,
    items: entries.length,
    error: error || null,
  }));

  const payload = {
    generatedAt: nowIso,
    windowDays: WINDOW_DAYS,
    displayCutoff,
    counts: {
      total: items.length,
      added,
      inWindow: items.filter((i) => i.publishedAt >= displayCutoff).length,
      clusters: clusters.length,
    },
    sources: FEEDS.map((f) => ({
      id: f.id,
      name: f.name,
      section: f.section,
      region: f.region || null,
      funding: f.funding || null,
    })),
    health,
    items,
  };

  if (!DRY_RUN) {
    await mkdir(dirname(OUT_FILE), { recursive: true });
    await writeFile(OUT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  const failed = health.filter((h) => !h.ok);
  console.log(
    `\n${items.length} items retained (${added} new, ${payload.counts.inWindow} in the ${WINDOW_DAYS}-day window), ` +
      `${clusters.length} clusters.`
  );
  console.log(DRY_RUN ? 'Dry run — news.json not modified.' : `Wrote ${OUT_FILE}`);

  const empties = health.filter((h) => h.ok && h.items === 0);
  if (empties.length) {
    console.log(`\n${empties.length} feed(s) parsed but returned no items:`);
    for (const f of empties) console.log(`  - ${f.sourceId}`);
  }

  if (failed.length) {
    console.log(`\n${failed.length} feed(s) failed:`);
    for (const f of failed) console.log(`  - ${f.sourceId} (${f.name}): ${f.error}`);
  }

  // Fail the job only if the pipeline produced nothing usable. Individual dead
  // feeds are reported and surfaced in the UI, but must not block a deploy.
  if (items.length === 0) {
    console.error('\nNo items produced — refusing to publish an empty brief.');
    process.exit(1);
  }
  if (failed.length === FEEDS.length) {
    console.error('\nEvery feed failed — likely a network problem, not a content problem.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
