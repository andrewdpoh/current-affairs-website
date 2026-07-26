import { createHash } from 'node:crypto';
import { TOPIC_RULES } from '../feeds.mjs';

/** Query params that identify a campaign/referrer, never the article itself. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^mc_(cid|eid)$/i,
  /^ref$/i,
  /^referrer$/i,
  /^source$/i,
  /^at_(medium|campaign|custom\d)$/i,
  /^ito$/i,
  /^cmpid$/i,
  /^smid$/i,
  /^__twitter_impression$/i,
  /^guccounter$/i,
  /^taid$/i,
];

/**
 * Canonicalize a URL so the same article from two feeds collapses to one entry.
 * Returns null for anything that isn't a usable http(s) URL — which also blocks
 * javascript:/data: URLs from ever reaching the rendered page.
 */
export function canonicalUrl(raw) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // Feeds are inconsistent about http vs https for the same article.
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) url.searchParams.delete(key);
  }
  url.search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

export function itemId(canonical) {
  return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

const STOPWORDS = new Set(
  ('a an the and or but of in on at to for from with by as is are was were be been being this that ' +
    'these those it its his her their they we you i he she has have had will would could should may ' +
    'might can new says say said after before over under more most new report reports')
    .split(' ')
);

/** Content-bearing token set for a headline, used for near-duplicate detection. */
export function titleTokens(title) {
  return new Set(
    String(title)
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Truncate on a word boundary, appending an ellipsis only if we actually cut. */
export function truncate(text, max = 280) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * A lot of feeds pad descriptions with boilerplate. Strip the common shapes so
 * the card shows something informative rather than "The post X appeared first on Y".
 */
const BOILERPLATE = [
  /The post .*? appeared first on .*$/i,
  /Continue reading\.*$/i,
  /Read (the full story|more)( here)?\.*$/i,
  /^\s*(Reuters|AP|AFP)\s*[-–—]\s*/i,
  /\[…\]\s*$/,
  /^\s*<?p>?\s*$/i,
];

export function cleanSummary(summary, title) {
  let text = String(summary || '').trim();
  for (const re of BOILERPLATE) text = text.replace(re, '').trim();

  // Several feeds set description === title; that's noise, not a summary.
  if (!text) return '';
  const t = title.trim().toLowerCase();
  const s = text.toLowerCase();
  if (s === t || (s.startsWith(t) && s.length - t.length < 12)) return '';

  return truncate(text, 300);
}

/** Apply keyword rules; returns { tags, sectionOverride }. */
export function classify(item) {
  const haystack = `${item.title} ${item.summary}`;
  const tags = new Set();
  let sectionOverride = null;

  for (const rule of TOPIC_RULES) {
    let hits = 0;
    for (const re of rule.patterns) {
      if (re.test(haystack)) hits += 1;
      if (hits >= 2) break;
    }
    if (hits === 0) continue;
    tags.add(rule.tag);

    // Only reassign a story's section on a strong signal (2+ distinct matches),
    // and never pull a story *out* of a specialist feed into a general one.
    if (rule.section && hits >= 2 && !sectionOverride) sectionOverride = rule.section;
  }

  return { tags: [...tags], sectionOverride };
}

/**
 * Group near-duplicate stories across sources.
 *
 * Being covered by several independent outlets is the best free signal of
 * importance available without an LLM, so the cluster size feeds the Top
 * Stories ranking as well as deduplicating the list.
 *
 * O(n·k) rather than O(n²): candidates are limited to items sharing a rare
 * token, which keeps a few thousand items well within budget.
 */
export function clusterItems(items) {
  const byToken = new Map();
  const clusters = [];

  // Rarer tokens first makes the candidate buckets small and precise.
  const docFreq = new Map();
  const tokenSets = items.map((item) => {
    const tokens = titleTokens(item.title);
    for (const t of tokens) docFreq.set(t, (docFreq.get(t) || 0) + 1);
    return tokens;
  });

  items.forEach((item, i) => {
    const tokens = tokenSets[i];
    const keys = [...tokens].sort((a, b) => (docFreq.get(a) || 0) - (docFreq.get(b) || 0)).slice(0, 4);

    let target = null;
    const seen = new Set();
    for (const key of keys) {
      for (const idx of byToken.get(key) || []) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        if (jaccard(tokens, clusters[idx].tokens) >= 0.55) {
          target = idx;
          break;
        }
      }
      if (target !== null) break;
    }

    if (target === null) {
      target = clusters.length;
      clusters.push({ tokens, members: [] });
    }
    clusters[target].members.push(item);
    for (const key of keys) {
      if (!byToken.has(key)) byToken.set(key, []);
      byToken.get(key).push(target);
    }
  });

  return clusters.map((c) => c.members);
}

/**
 * Rank a story. Recency dominates, cross-source coverage is the next strongest
 * signal, then the source's editorial weight.
 */
export function scoreItem(item, clusterSize, weight, now) {
  const ageHours = Math.max(0, (now - new Date(item.publishedAt).getTime()) / 3_600_000);
  const recency = Math.exp(-ageHours / 36); // ~half-life of a day and a half
  const coverage = Math.log2(1 + clusterSize);
  return recency * 2 + coverage * 1.5 + (weight - 1);
}
