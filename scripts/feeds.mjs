/**
 * Source registry.
 *
 * Adding a source: append an entry, run `npm run fetch`, check the health table
 * printed at the end. Anything that errors for several consecutive runs gets
 * flagged by the feed-health check in CI.
 *
 *   id       stable slug, used as a key in the UI's source filter
 *   name     display name
 *   url      RSS/Atom endpoint
 *   section  world | geopolitics | defense | cyber   (drives the UI sections)
 *   region   optional geographic hint, shown as a tag
 *   funding  'state' marks state-funded outlets so the UI can label them.
 *            Not a quality judgement — it's context worth having on the page
 *            when you are reading for geopolitical signal.
 *   weight   ranking nudge for Top Stories (1 = default)
 */

export const FEEDS = [
  // ---------------------------------------------------------------- world
  {
    id: 'bbc-world',
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    section: 'world',
    funding: 'public',
    weight: 1.2,
  },
  {
    id: 'guardian-world',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    section: 'world',
    weight: 1.1,
  },
  {
    id: 'aljazeera',
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    section: 'world',
    funding: 'state',
    weight: 1.1,
  },
  {
    id: 'npr-world',
    name: 'NPR World',
    url: 'https://feeds.npr.org/1004/rss.xml',
    section: 'world',
    funding: 'public',
  },
  {
    id: 'dw-world',
    name: 'Deutsche Welle',
    url: 'https://rss.dw.com/rdf/rss-en-world',
    section: 'world',
    funding: 'state',
  },
  {
    id: 'france24',
    name: 'France 24',
    url: 'https://www.france24.com/en/rss',
    section: 'world',
    funding: 'state',
  },
  {
    id: 'cna',
    name: 'CNA',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
    section: 'world',
    region: 'Asia-Pacific',
    funding: 'state',
    weight: 1.1,
  },
  {
    id: 'straits-times-world',
    name: 'The Straits Times',
    url: 'https://www.straitstimes.com/news/world/rss.xml',
    section: 'world',
    region: 'Asia-Pacific',
  },
  {
    id: 'scmp',
    name: 'South China Morning Post',
    url: 'https://www.scmp.com/rss/91/feed',
    section: 'world',
    region: 'Asia-Pacific',
  },

  // ---------------------------------------------------------- geopolitics
  {
    id: 'foreign-policy',
    name: 'Foreign Policy',
    url: 'https://foreignpolicy.com/feed/',
    section: 'geopolitics',
    weight: 1.2,
  },
  {
    id: 'war-on-the-rocks',
    name: 'War on the Rocks',
    url: 'https://warontherocks.com/feed/',
    section: 'geopolitics',
    weight: 1.3,
  },
  {
    id: 'lawfare',
    name: 'Lawfare',
    url: 'https://www.lawfaremedia.org/feeds/all.rss',
    section: 'geopolitics',
    weight: 1.2,
  },
  {
    id: 'the-diplomat',
    name: 'The Diplomat',
    url: 'https://thediplomat.com/feed/',
    section: 'geopolitics',
    region: 'Asia-Pacific',
    weight: 1.2,
  },
  {
    id: 'csis',
    name: 'CSIS',
    url: 'https://www.csis.org/analysis/feed',
    section: 'geopolitics',
    weight: 1.1,
  },
  {
    id: 'cfr',
    name: 'Council on Foreign Relations',
    url: 'https://www.cfr.org/rss/all',
    section: 'geopolitics',
    weight: 1.1,
  },

  // -------------------------------------------------------------- defense
  {
    id: 'defense-news',
    name: 'Defense News',
    url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml',
    section: 'defense',
    weight: 1.3,
  },
  {
    id: 'breaking-defense',
    name: 'Breaking Defense',
    url: 'https://breakingdefense.com/feed/',
    section: 'defense',
    weight: 1.3,
  },
  {
    id: 'defense-one',
    name: 'Defense One',
    url: 'https://www.defenseone.com/rss/all/',
    section: 'defense',
    weight: 1.2,
  },
  {
    id: 'usni-news',
    name: 'USNI News',
    url: 'https://news.usni.org/feed',
    section: 'defense',
    weight: 1.1,
  },
  {
    id: 'military-com',
    name: 'Military.com',
    url: 'https://www.military.com/rss/news',
    section: 'defense',
  },
  {
    id: 'janes',
    name: 'Janes',
    url: 'https://www.janes.com/feeds/news',
    section: 'defense',
    weight: 1.1,
  },

  // ---------------------------------------------------------------- cyber
  {
    id: 'cisa-advisories',
    name: 'CISA Advisories',
    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    section: 'cyber',
    weight: 1.5,
  },
  {
    id: 'the-record',
    name: 'The Record',
    url: 'https://therecord.media/feed',
    section: 'cyber',
    weight: 1.4,
  },
  {
    id: 'bleeping-computer',
    name: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    section: 'cyber',
    weight: 1.2,
  },
  {
    id: 'krebs',
    name: 'Krebs on Security',
    url: 'https://krebsonsecurity.com/feed/',
    section: 'cyber',
    weight: 1.3,
  },
  {
    id: 'hacker-news-sec',
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    section: 'cyber',
  },
  {
    id: 'dark-reading',
    name: 'Dark Reading',
    url: 'https://www.darkreading.com/rss.xml',
    section: 'cyber',
  },
  {
    id: 'security-week',
    name: 'SecurityWeek',
    url: 'https://www.securityweek.com/feed/',
    section: 'cyber',
  },
  {
    id: 'schneier',
    name: 'Schneier on Security',
    url: 'https://www.schneier.com/feed/atom/',
    section: 'cyber',
    weight: 1.2,
  },
  {
    id: 'ars-security',
    name: 'Ars Technica Security',
    url: 'https://feeds.arstechnica.com/arstechnica/security',
    section: 'cyber',
  },
];

export const SECTIONS = [
  { id: 'top', label: 'Top Stories' },
  { id: 'cyber', label: 'Cyber' },
  { id: 'defense', label: 'Defense' },
  { id: 'geopolitics', label: 'Analysis' },
  { id: 'world', label: 'World' },
];

/**
 * Keyword tagging. Lets a story from a general outlet surface in the Cyber or
 * Defense sections — a BBC piece on a ransomware attack belongs in Cyber even
 * though BBC World is registered as a `world` source.
 *
 * `tags` are also exposed as filter chips in the UI.
 */
export const TOPIC_RULES = [
  {
    tag: 'cyber',
    section: 'cyber',
    patterns: [
      /\bransomware\b/i,
      /\bmalware\b/i,
      /\bphishing\b/i,
      /\bdata breach\b/i,
      /\bcyber-?(attack|security|espionage|crime|warfare|operations?)\b/i,
      /\bzero-?day\b/i,
      /\bCVE-\d{4}-\d{4,}\b/,
      /\b(APT\s?\d+|Lazarus|Volt Typhoon|Salt Typhoon|Fancy Bear|Sandworm)\b/i,
      /\bvulnerabilit(y|ies)\b/i,
      /\bexploit(ed|ation)?\b/i,
      /\bhackers?\b/i,
      /\bbotnet\b/i,
      /\bspyware\b/i,
      /\bencryption\b/i,
      /\bCISA\b/,
      /\bNSA\b/,
      /\bsupply[- ]chain attack\b/i,
    ],
  },
  {
    tag: 'defense',
    section: 'defense',
    patterns: [
      /\bmilitary\b/i,
      /\bdefen[cs]e (ministry|department|budget|contract|spending)\b/i,
      /\bPentagon\b/i,
      /\bNATO\b/,
      /\bmissile\b/i,
      /\bwarship|frigate|destroyer|submarine|aircraft carrier\b/i,
      /\bfighter jet|F-35|F-16\b/i,
      /\b(army|navy|air force|marines)\b/i,
      /\bdrone strike|UAV|unmanned\b/i,
      /\bceasefire|offensive|troops?\b/i,
      /\barms (deal|sales|export)\b/i,
      /\bnuclear (weapon|warhead|test|deterrent)\b/i,
    ],
  },
  {
    tag: 'ai',
    patterns: [/\bartificial intelligence\b/i, /\bAI (model|chip|safety|regulation)\b/i, /\bLLM\b/],
  },
  { tag: 'ukraine', patterns: [/\bUkrain(e|ian)\b/i, /\bZelensk/i, /\bKyiv\b/i] },
  { tag: 'russia', patterns: [/\bRussian?\b/i, /\bMoscow\b/i, /\bKremlin\b/i, /\bPutin\b/i] },
  {
    tag: 'china',
    patterns: [/\bChin(a|ese)\b/i, /\bBeijing\b/i, /\bTaiwan\b/i, /\bXi Jinping\b/i, /\bPLA\b/],
  },
  {
    tag: 'middle-east',
    patterns: [
      /\bIsrael|Gaza|Hamas|Hezbollah|Iran(ian)?\b/i,
      /\bSaudi|Yemen|Houthi|Syria|Lebanon\b/i,
    ],
  },
  {
    tag: 'indo-pacific',
    patterns: [
      /\bIndo-Pacific\b/i,
      /\bSouth China Sea\b/i,
      /\bASEAN|Singapore|Malaysia|Indonesia|Philippines\b/i,
      /\bJapan|Korea|Australia|AUKUS|Quad\b/i,
    ],
  },
  { tag: 'europe', patterns: [/\bEuropean Union|\bEU\b|Brussels|NATO|Germany|France|UK\b/] },
  { tag: 'economy', patterns: [/\btariffs?\b/i, /\bsanctions?\b/i, /\btrade war\b/i, /\binflation\b/i] },
];
