#!/usr/bin/env node
/**
 * Generate obviously-fake sample data for local UI work.
 *
 * This exists because you cannot design a reader against an empty list. Every
 * headline is prefixed with [SAMPLE] so seeded data can never be mistaken for
 * real reporting if it is ever served by accident.
 *
 * The scheduled job overwrites public/data/news.json with real items, so run
 * `npm run seed:clear` before committing if you have used this.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEEDS } from './feeds.mjs';
import { clusterItems, scoreItem, classify } from './lib/normalize.mjs';
import { itemId, canonicalUrl } from './lib/normalize.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(ROOT, 'public/data/news.json');

const HEADLINES = [
  ['Undersea cable damage disrupts Baltic data traffic', 'world'],
  ['Ransomware group claims breach of defence contractor', 'cyber'],
  ['CISA adds three actively exploited flaws to catalogue', 'cyber'],
  ['Navy commissions second of class frigate', 'defense'],
  ['Analysis: deterrence signalling in the strait', 'geopolitics'],
  ['Zero-day in widely used VPN appliance under attack', 'cyber'],
  ['Regional summit ends without joint communiqué', 'world'],
  ['Air force accelerates drone wingman programme', 'defense'],
  ['Sanctions package targets shipping intermediaries', 'world'],
  ['State-linked actors probe critical infrastructure', 'cyber'],
  ['Defence budget request grows by four percent', 'defense'],
  ['What the new export controls actually restrict', 'geopolitics'],
  ['Phishing campaign impersonates payroll provider', 'cyber'],
  ['Joint exercise concludes in the South China Sea', 'defense'],
  ['Election result reshapes coalition arithmetic', 'world'],
  ['Supply chain compromise hits build pipeline vendor', 'cyber'],
  ['Treaty talks resume after six-month pause', 'geopolitics'],
  ['Missile test prompts regional condemnation', 'defense'],
];

const SUMMARY =
  'Sample placeholder text used for local layout work. It is roughly the length of a real feed ' +
  'description so the card rhythm matches production.';

const args = new Set(process.argv.slice(2));

async function main() {
  await mkdir(dirname(OUT_FILE), { recursive: true });

  if (args.has('--clear')) {
    const empty = {
      generatedAt: null,
      windowDays: 7,
      displayCutoff: null,
      counts: { total: 0, added: 0, inWindow: 0, clusters: 0 },
      sources: FEEDS.map((f) => ({
        id: f.id,
        name: f.name,
        section: f.section,
        region: f.region || null,
        funding: f.funding || null,
      })),
      health: [],
      items: [],
    };
    await writeFile(OUT_FILE, `${JSON.stringify(empty)}\n`, 'utf8');
    console.log('Reset public/data/news.json to the empty placeholder.');
    return;
  }

  const now = Date.now();
  const items = [];

  HEADLINES.forEach(([headline, section], i) => {
    // A couple of stories get duplicate coverage so clustering is exercised.
    const copies = i % 6 === 0 ? 3 : 1;
    for (let c = 0; c < copies; c += 1) {
      const pool = FEEDS.filter((f) => f.section === section);
      const feed = pool[(i + c) % pool.length];
      const published = new Date(now - (i * 5 + c) * 3_600_000).toISOString();
      const title = `[SAMPLE] ${headline}${c ? ` — ${feed.name} view` : ''}`;
      const url = canonicalUrl(`https://example.invalid/${section}/${i}-${c}`);
      const { tags } = classify({ title: headline, summary: SUMMARY });
      items.push({
        id: itemId(url),
        title,
        url,
        summary: SUMMARY,
        source: feed.name,
        sourceId: feed.id,
        section,
        region: feed.region || null,
        funding: feed.funding || null,
        tags,
        publishedAt: published,
        firstSeenAt: published,
      });
    }
  });

  const weights = new Map(FEEDS.map((f) => [f.id, f.weight || 1]));
  const clusters = clusterItems(items);
  for (const members of clusters) {
    const [lead, ...rest] = members;
    for (const m of members) {
      m.clusterId = lead.id;
      m.isLead = m.id === lead.id;
      m.score = Number(scoreItem(m, members.length, weights.get(m.sourceId) || 1, now).toFixed(4));
    }
    lead.alsoIn = rest.map((m) => ({ source: m.source, url: m.url }));
  }

  const payload = {
    generatedAt: new Date(now).toISOString(),
    windowDays: 7,
    displayCutoff: new Date(now - 7 * 86_400_000).toISOString(),
    counts: { total: items.length, added: items.length, inWindow: items.length, clusters: clusters.length },
    sources: FEEDS.map((f) => ({
      id: f.id,
      name: f.name,
      section: f.section,
      region: f.region || null,
      funding: f.funding || null,
    })),
    health: [{ sourceId: 'sample', name: 'Sample data', ok: false, items: 0, error: 'seeded locally — not real news' }],
    items,
  };

  await writeFile(OUT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`Seeded ${items.length} SAMPLE items across ${clusters.length} clusters.`);
  console.log('Run `npm run seed:clear` before committing.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
