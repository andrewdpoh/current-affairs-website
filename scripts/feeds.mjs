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
  // France 24 was dropped: it serves a bot-check HTML page to repeated
  // automated requests, so it failed most scheduled runs even though a
  // one-off probe succeeds. Getting past that would mean impersonating a
  // browser, which is the publisher's decision to make, not ours. Deutsche
  // Welle covers the same continental-European angle reliably.
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
  // Lawfare and CFR were both dropped after verification: Lawfare returns 403
  // to any non-browser user agent on every feed path, and the only live CFR
  // feed redirects to their podcast. Neither is worth spoofing a browser for.
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
    url: 'https://www.csis.org/rss.xml',
    section: 'geopolitics',
    weight: 1.1,
  },
  {
    id: 'foreign-affairs',
    name: 'Foreign Affairs',
    url: 'https://www.foreignaffairs.com/rss.xml',
    section: 'geopolitics',
    weight: 1.2,
  },
  {
    id: 'economist-intl',
    name: 'The Economist',
    url: 'https://www.economist.com/international/rss.xml',
    section: 'geopolitics',
    weight: 1.2,
  },
  {
    id: 'responsible-statecraft',
    name: 'Responsible Statecraft',
    url: 'https://responsiblestatecraft.org/feeds/feed.rss',
    section: 'geopolitics',
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
  // Military.com and Janes both 404 on every documented feed path — replaced
  // with these three, which were verified against the parser before adding.
  {
    id: 'defensescoop',
    name: 'DefenseScoop',
    url: 'https://defensescoop.com/feed/',
    section: 'defense',
    weight: 1.2,
  },
  {
    id: 'naval-news',
    name: 'Naval News',
    url: 'https://www.navalnews.com/feed/',
    section: 'defense',
    weight: 1.1,
  },
  {
    id: 'twz',
    name: 'The War Zone',
    url: 'https://www.twz.com/feed',
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
    url: 'https://arstechnica.com/security/feed/',
    section: 'cyber',
  },
  {
    id: 'cyberscoop',
    name: 'CyberScoop',
    url: 'https://cyberscoop.com/feed/',
    section: 'cyber',
    weight: 1.2,
  },
  {
    id: 'help-net-security',
    name: 'Help Net Security',
    url: 'https://www.helpnetsecurity.com/feed/',
    section: 'cyber',
  },
];

export const SECTIONS = [
  { id: 'top', label: 'Top Stories' },
  { id: 'geopolitics', label: 'Geopolitics' },
  { id: 'cyber', label: 'Cyber' },
  { id: 'defense', label: 'Defense' },
  { id: 'world', label: 'World' },
];

/**
 * What this brief is *for*, and how strongly. Stories in these sections are
 * ranked ahead of general coverage, so a thin news day surfaces geopolitics and
 * cyber rather than padding the top of the page with whatever a wire service
 * filed most recently.
 *
 * Defense sits deliberately lower than the other two. Its feeds are prolific
 * and publish a lot of procurement and fleet-movement detail; weighted equally
 * it took 11 of the top 20 and squeezed out both of the sections this site is
 * primarily meant to cover.
 */
export const FOCUS_WEIGHTS = { geopolitics: 1, cyber: 1, defense: 0.55 };
export const FOCUS_SECTIONS = new Set(Object.keys(FOCUS_WEIGHTS));

/**
 * On-topic but not headline material: recurring columns, weekly round-ups,
 * podcasts, and the routine advisory bulletins that specialist feeds emit daily.
 * "CISA Adds Two Known Exploited Vulnerabilities to Catalog" is worth having and
 * worth finding; it is not worth the top of the page every single day.
 *
 * Unlike NOISE_RULES this applies inside the focus sections too, because that is
 * exactly where these formats occur.
 */
export const ROUTINE_RULES = [
  /\b(bunker talk|open thread|mailbag|reader survey|letters to the editor)\b/i,
  /\b(week in review|weekly (roundup|recap|digest|wrap|update)|this week in|week ahead|morning brief|daily (brief|digest|roundup))\b/i,
  /\b(podcast|episode \d+|webinar|newsletter|transcript)\b/i,
  /\bpulse:/i,
  /\badds?\b.{0,24}\bknown exploited vulnerabilit(y|ies)\b/i,
  /\breleases?\b.{0,20}\b(ics )?(security )?advisor(y|ies)\b/i,
  /\b(photos?|in pictures|video) of the (day|week)\b/i,
];

/**
 * The same idea, matched against the summary, for recurring formats whose titles
 * give nothing away — a newsletter called "Global Risks Heating Up" or a quiz
 * called "What in the World?" both read as headlines until you see the blurb.
 *
 * Kept separate and deliberately narrow: matching general prose against the
 * summary is how you accidentally demote real coverage.
 */
export const ROUTINE_SUMMARY_RULES = [
  /\bwelcome to\b[^.]{2,40}\.\s*(every (other )?week|each week|twice a month)/i,
  /\btest yourself on the week\b/i,
  /\bsign up (here |below )?(to|for) (receive|get) /i,
  /\bsubscribe to\b[^.]{2,40}\bnewsletter\b/i,
  /\bin this (week's|edition of)\b/i,
];

/** Tags that mark a story as geopolitically substantive rather than incidental. */
export const GEO_TAGS = new Set([
  'ukraine',
  'russia',
  'china',
  'middle-east',
  'indo-pacific',
  'europe',
  'economy',
]);

/**
 * Real news, but not what this site is for: sport, entertainment, lifestyle,
 * and rolling live-blogs that re-publish the same URL all day.
 *
 * These only *demote*. A story that several outlets carry, or that also matches
 * a cyber or geopolitics rule, still outranks the penalty — so an attack at a
 * stadium is not buried for containing the word "match". Never turn this into
 * an exclusion list: the failure mode of a false positive then goes from
 * "ranked lower" to "you never saw it".
 */
export const NOISE_RULES = [
  /\b(football|soccer|cricket|tennis|golf|olympics?|world cup|premier league|nba|nfl|formula one|grand prix|tour de france|grand slam|rugby|wimbledon)\b/i,
  /\b(box office|celebrity|singer|album|film festival|netflix|grammys?|oscars?|baftas?|eurovision|red carpet)\b/i,
  /\b(royal family|duchess of|duke of)\b/i,
  /\b(recipe|horoscope|fashion week|dating app|weight loss|travel guide|gift guide|best deals)\b/i,
  // Governing bodies and leagues are unambiguous; club names are not worth
  // enumerating and risk colliding with place names.
  /\b(mls|uefa|fifa|nhl|mlb|atp|wta|ipl|la liga|serie a|bundesliga)\b/i,
  /\b(transfer window|signs for|final stage|quarter-?finals?|semi-?finals?)\b/i,
  /\blive (updates?|blog)\b/i,
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
