#!/usr/bin/env node
/**
 * Probe candidate feed URLs before adding them to the registry.
 *
 *   npm run probe -- https://example.com/feed https://example.com/rss.xml
 *
 * Publishers move and retire feeds without notice, and a URL that looks right
 * often returns an HTML error page with a 200. This reports what each URL
 * actually is, so `feeds.mjs` only ever gains verified entries.
 */

import { parseFeed } from './lib/xml.mjs';

const USER_AGENT =
  'daily-brief/1.0 (+https://github.com/andrewdpoh/current-affairs-website) feed-reader';

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//i.test(a));

if (!urls.length) {
  console.error('Usage: npm run probe -- <url> [<url>…]');
  process.exit(2);
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en',
      },
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };

    const feed = parseFeed(body);
    return {
      ok: true,
      note: `${feed.entries.length} items · "${feed.title || 'untitled'}"`,
      sample: feed.entries[0]?.title,
      finalUrl: res.url !== url ? res.url : null,
    };
  } catch (err) {
    return { ok: false, note: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(urls.map(async (url) => [url, await probe(url)]));

console.log('');
for (const [url, r] of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${url}`);
  console.log(`    ${r.note}`);
  if (r.finalUrl) console.log(`    redirected → ${r.finalUrl}`);
  if (r.sample) console.log(`    e.g. "${r.sample}"`);
}

const working = results.filter(([, r]) => r.ok).length;
console.log(`\n${working}/${results.length} candidates usable.\n`);
