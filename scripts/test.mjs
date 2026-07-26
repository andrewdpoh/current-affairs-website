#!/usr/bin/env node
/**
 * Offline tests for the parsing and normalization layer.
 * No network: everything here runs against fixtures, so `npm test` is a valid
 * check in any environment (including sandboxes with no egress).
 */

import assert from 'node:assert/strict';
import { parseFeed, stripHtml, decodeEntities, parseDate } from './lib/xml.mjs';
import {
  canonicalUrl,
  cleanSummary,
  classify,
  clusterItems,
  titleTokens,
  truncate,
} from './lib/normalize.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

console.log('\nxml.mjs');

test('parses RSS 2.0 with CDATA and namespaced tags', () => {
  const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel>
        <title>Example Wire</title>
        <item>
          <title><![CDATA[Undersea cable cut disrupts Baltic traffic]]></title>
          <link>https://example.com/a?utm_source=rss</link>
          <description><![CDATA[<p>Two cables were <b>severed</b> overnight.</p>]]></description>
          <pubDate>Sat, 25 Jul 2026 08:14:00 GMT</pubDate>
          <dc:creator>A Reporter</dc:creator>
        </item>
      </channel>
    </rss>`;
  const feed = parseFeed(xml);
  assert.equal(feed.title, 'Example Wire');
  assert.equal(feed.entries.length, 1);
  assert.equal(feed.entries[0].title, 'Undersea cable cut disrupts Baltic traffic');
  assert.equal(feed.entries[0].summary, 'Two cables were severed overnight.');
  assert.equal(feed.entries[0].author, 'A Reporter');
  assert.equal(feed.entries[0].publishedAt.toISOString(), '2026-07-25T08:14:00.000Z');
});

test('parses Atom with link rel=alternate, ignoring rel=self', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Analysis Desk</title>
      <link rel="self" href="https://example.org/feed.xml"/>
      <entry>
        <title>Deterrence after the strait crisis</title>
        <link rel="self" href="https://example.org/wrong"/>
        <link rel="alternate" href="https://example.org/posts/deterrence"/>
        <summary>What the last month changed.</summary>
        <updated>2026-07-24T22:00:00Z</updated>
      </entry>
    </feed>`;
  const feed = parseFeed(xml);
  assert.equal(feed.title, 'Analysis Desk');
  assert.equal(feed.entries[0].link, 'https://example.org/posts/deterrence');
});

test('channel title is not taken from the first item', () => {
  const xml = `<rss><channel><title>Channel Name</title>
    <item><title>Item Name</title><link>https://e.com/1</link></item>
    </channel></rss>`;
  assert.equal(parseFeed(xml).title, 'Channel Name');
});

test('falls back to guid when link is missing', () => {
  const xml = `<rss><channel><item>
      <title>Advisory ICSA-26-001</title>
      <guid isPermaLink="true">https://cisa.gov/advisories/icsa-26-001</guid>
    </item></channel></rss>`;
  assert.equal(parseFeed(xml).entries[0].link, 'https://cisa.gov/advisories/icsa-26-001');
});

test('skips entries with no title or no link', () => {
  const xml = `<rss><channel>
      <item><title>No link here</title></item>
      <item><link>https://e.com/2</link></item>
      <item><title>Good</title><link>https://e.com/3</link></item>
    </channel></rss>`;
  assert.equal(parseFeed(xml).entries.length, 1);
});

test('rejects an HTML error page with a useful message', () => {
  assert.throws(() => parseFeed('<html><body>403 Forbidden</body></html>'), /not a feed/);
});

test('rejects an empty body', () => {
  assert.throws(() => parseFeed(''), /empty response/);
});

test('decodes named, numeric and double-encoded entities', () => {
  assert.equal(decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.equal(decodeEntities('caf&#233;'), 'café');
  assert.equal(decodeEntities('&#x2014;'), '—');
  assert.equal(decodeEntities('it&amp;#39;s'), "it's");
  assert.equal(decodeEntities('&unknownentity;'), '&unknownentity;');
});

test('stripHtml drops script bodies and keeps word boundaries', () => {
  assert.equal(stripHtml('<script>alert(1)</script>Hello'), 'Hello');
  assert.equal(stripHtml('<p>One</p><p>Two</p>'), 'One Two');
});

test('parseDate handles RFC822, ISO and bare timestamps', () => {
  assert.equal(parseDate('Sat, 25 Jul 2026 08:14:00 +0800').toISOString(), '2026-07-25T00:14:00.000Z');
  assert.equal(parseDate('2026-07-25T08:14:00Z').toISOString(), '2026-07-25T08:14:00.000Z');
  assert.equal(parseDate('2026-07-25 08:14:00').toISOString(), '2026-07-25T08:14:00.000Z');
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
});

console.log('\nnormalize.mjs');

test('canonicalUrl strips tracking params and normalizes host', () => {
  assert.equal(
    canonicalUrl('http://WWW.Example.com/story/?utm_source=rss&utm_medium=feed&id=7#top'),
    'https://example.com/story?id=7'
  );
});

test('canonicalUrl collapses feed variants of the same article', () => {
  const a = canonicalUrl('https://www.example.com/a/b/');
  const b = canonicalUrl('http://example.com/a/b?fbclid=xyz');
  assert.equal(a, b);
});

test('canonicalUrl rejects non-http schemes', () => {
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  assert.equal(canonicalUrl('data:text/html,<script>'), null);
  assert.equal(canonicalUrl('not a url'), null);
  assert.equal(canonicalUrl(''), null);
});

test('cleanSummary removes boilerplate and title echoes', () => {
  assert.equal(cleanSummary('The post Big News appeared first on Blog.', 'Big News'), '');
  assert.equal(cleanSummary('Big News', 'Big News'), '');
  assert.equal(cleanSummary('A real summary of events.', 'Big News'), 'A real summary of events.');
});

test('truncate cuts on a word boundary', () => {
  const out = truncate('alpha beta gamma delta epsilon', 18);
  assert.ok(out.endsWith('…'), out);
  assert.ok(!out.includes('delta'), out);
  assert.equal(truncate('short', 20), 'short');
});

test('classify tags a cyber story and can override a world section', () => {
  const { tags, sectionOverride } = classify({
    title: 'Ransomware crew exploits zero-day in state networks',
    summary: 'CISA warned of active exploitation, tracked as CVE-2026-1234.',
  });
  assert.ok(tags.includes('cyber'));
  assert.equal(sectionOverride, 'cyber');
});

test('classify needs a strong signal before overriding a section', () => {
  const { sectionOverride } = classify({
    title: 'Local council debates library hours',
    summary: 'One councillor mentioned hackers once.',
  });
  assert.equal(sectionOverride, null);
});

test('classify picks up regional and topical tags', () => {
  const { tags } = classify({
    title: 'Beijing responds to South China Sea patrol',
    summary: 'Taiwan and the Philippines both issued statements.',
  });
  assert.ok(tags.includes('china'));
  assert.ok(tags.includes('indo-pacific'));
});

test('titleTokens drops stopwords and short words', () => {
  const tokens = titleTokens('The Navy is in the South China Sea');
  assert.ok(!tokens.has('the'));
  assert.ok(!tokens.has('is'));
  assert.ok(tokens.has('navy'));
  assert.ok(tokens.has('china'));
});

test('clusterItems groups the same story across outlets', () => {
  const items = [
    { id: '1', title: 'NATO agrees new cyber defence pledge at summit', sourceId: 'a' },
    { id: '2', title: 'NATO members agree cyber defence pledge at summit', sourceId: 'b' },
    { id: '3', title: 'Coffee prices hit a record high in Brazil', sourceId: 'c' },
  ];
  const clusters = clusterItems(items);
  assert.equal(clusters.length, 2);
  const big = clusters.find((c) => c.length === 2);
  assert.ok(big, 'expected the two NATO headlines to cluster');
  assert.deepEqual(big.map((i) => i.id).sort(), ['1', '2']);
});

test('clusterItems keeps genuinely different stories apart', () => {
  const items = [
    { id: '1', title: 'Germany raises defence spending target', sourceId: 'a' },
    { id: '2', title: 'Germany recalls ambassador over espionage claim', sourceId: 'b' },
  ];
  assert.equal(clusterItems(items).length, 2);
});

test('clusterItems handles an empty input', () => {
  assert.deepEqual(clusterItems([]), []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
