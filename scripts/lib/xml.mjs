/**
 * Minimal RSS 2.0 / Atom / RDF feed parser. Zero dependencies.
 *
 * Feed XML is far more regular than XML in general, so we deliberately avoid a
 * full parser: this keeps the repo dependency-free (no install step in CI, no
 * lockfile drift, no supply-chain surface) and it cannot break on a dep bump.
 *
 * Handles what real feeds actually use: CDATA sections, numeric and named
 * entities, namespaced tags (dc:creator, content:encoded, media:*), self-closing
 * elements, and attribute-carried links (Atom <link href>).
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ccedil: 'ç',
  pound: '£',
  euro: '€',
  deg: '°',
  middot: '·',
  bull: '•',
  trade: '™',
  copy: '©',
  reg: '®',
};

/** Resolve XML/HTML entities, including double-encoded ones (&amp;#39;). */
export function decodeEntities(input, depth = 0) {
  if (!input) return '';
  const out = input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      // Reject non-characters and anything outside the Unicode range.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
  // Feeds not infrequently double-encode. Bounded recursion, never unbounded.
  if (depth < 2 && out !== input && /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/.test(out)) {
    return decodeEntities(out, depth + 1);
  }
  return out;
}

/** Strip HTML tags and collapse whitespace. Feed descriptions are full of markup. */
export function stripHtml(input) {
  if (!input) return '';
  return decodeEntities(
    input
      // Drop entire script/style blocks including content.
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      // Block-level boundaries become spaces so words don't run together.
      .replace(/<\/?(p|br|div|li|tr|h[1-6]|blockquote)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the inner text of the first matching element.
 * `name` may be a bare local name; namespace prefixes are matched too.
 */
function firstTag(xml, names) {
  for (const name of Array.isArray(names) ? names : [names]) {
    // Match <name ...>...</name> allowing an optional namespace prefix.
    const re = new RegExp(
      `<(?:[A-Za-z0-9_.-]+:)?${name}(\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?${name}\\s*>`,
      'i'
    );
    const m = re.exec(xml);
    if (m) return unwrapCdata(m[2]);
  }
  return '';
}

/** Extract an attribute value from the first matching element. */
function firstTagAttr(xml, name, attr, filter) {
  const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}\\s([^>]*?)\\/?>`, 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    if (filter && !filter(attrs)) continue;
    const am = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
    if (am) return decodeEntities(am[2] ?? am[3] ?? '');
  }
  return '';
}

function unwrapCdata(text) {
  if (!text) return '';
  // A value may be several CDATA sections, or a mix of CDATA and plain text.
  if (text.includes('<![CDATA[')) {
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  }
  return text;
}

/** Split a feed document into its per-item chunks. */
function splitEntries(xml) {
  const chunks = [];
  const re = /<(?:[A-Za-z0-9_.-]+:)?(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?\1\s*>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) chunks.push(m[2]);
  return chunks;
}

/**
 * Pick the best link for an entry.
 * RSS uses <link>text</link>; Atom uses <link rel="alternate" href="...">.
 */
function extractLink(chunk) {
  const atomAlternate = firstTagAttr(
    chunk,
    'link',
    'href',
    (attrs) => !/\brel\s*=\s*["']?(self|enclosure|edit|replies|hub)/i.test(attrs)
  );
  if (atomAlternate) return atomAlternate;

  const rssLink = stripHtml(firstTag(chunk, 'link'));
  if (rssLink && /^https?:\/\//i.test(rssLink)) return rssLink;

  // Some feeds only put the canonical URL in guid/id.
  for (const tag of ['guid', 'id']) {
    const v = stripHtml(firstTag(chunk, tag));
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return '';
}

/** Best-effort date parse across RFC 822, ISO 8601 and common malformations. */
export function parseDate(raw) {
  if (!raw) return null;
  const text = stripHtml(raw).trim();
  if (!text) return null;

  let ms = Date.parse(text);
  if (!Number.isNaN(ms)) return new Date(ms);

  // Some feeds emit a bare "2026-07-26 08:30:00" (no T, no zone).
  const bare = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (bare) {
    ms = Date.parse(`${bare[1]}-${bare[2]}-${bare[3]}T${bare[4]}:${bare[5]}:${bare[6] || '00'}Z`);
    if (!Number.isNaN(ms)) return new Date(ms);
  }

  // Trailing named zone abbreviations Date.parse chokes on (e.g. "... +0800 SGT").
  const trimmed = text.replace(/\s+\([A-Z]{2,5}\)\s*$/, '').replace(/\s+[A-Z]{2,5}$/, '');
  if (trimmed !== text) {
    ms = Date.parse(trimmed);
    if (!Number.isNaN(ms)) return new Date(ms);
  }
  return null;
}

/**
 * Parse a feed document into normalized raw entries.
 * Returns { title, entries: [{ title, link, summary, publishedAt, author, guid }] }
 */
export function parseFeed(xml) {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new Error('empty response body');
  }
  // Trim anything before the root element (BOM, stray whitespace, doctype junk).
  const start = xml.indexOf('<');
  const doc = start > 0 ? xml.slice(start) : xml;

  if (!/<(?:[A-Za-z0-9_.-]+:)?(rss|feed|rdf:RDF|RDF)\b/i.test(doc)) {
    // Give a useful error instead of silently returning zero items, so feed
    // health reporting can distinguish "blocked/HTML error page" from "empty".
    const looksHtml = /<html\b/i.test(doc);
    throw new Error(looksHtml ? 'got HTML page, not a feed' : 'unrecognized feed format');
  }

  // Channel-level title: look outside the entries so we don't grab an item title.
  const firstEntry = doc.search(
    /<(?:[A-Za-z0-9_.-]+:)?(item|entry)(?:\s[^>]*)?>/i
  );
  const head = firstEntry > 0 ? doc.slice(0, firstEntry) : doc;
  const feedTitle = stripHtml(firstTag(head, 'title'));

  const entries = [];
  for (const chunk of splitEntries(doc)) {
    const title = stripHtml(firstTag(chunk, 'title'));
    const link = extractLink(chunk);
    if (!title || !link) continue;

    // Prefer a real summary over full content; fall back through the usual tags.
    const summaryRaw =
      firstTag(chunk, 'description') ||
      firstTag(chunk, 'summary') ||
      firstTag(chunk, ['encoded', 'content']) ||
      '';

    const dateRaw =
      firstTag(chunk, ['pubDate', 'published', 'updated', 'date', 'created']) || '';

    entries.push({
      title,
      link,
      summary: stripHtml(summaryRaw),
      publishedAt: parseDate(dateRaw),
      author: stripHtml(firstTag(chunk, ['creator', 'author', 'name'])),
      guid: stripHtml(firstTag(chunk, ['guid', 'id'])),
    });
  }

  return { title: feedTitle, entries };
}
