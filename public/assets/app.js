/* ===========================================================================
   Daily Brief — client

   Everything is client-side. Read state and history live in localStorage, so
   no server ever learns what you read. That is a deliberate design choice, not
   just a shortcut around having a backend.

   Security note: every value that originates in a feed is written with
   textContent or setAttribute, never innerHTML. Feed content is third-party
   input and is treated as such throughout.
   =========================================================================== */

const STORAGE_KEY = 'daily-brief.v1';
const DATA_URL = 'data/news.json';
const HISTORY_LIMIT = 1200;
const UNDO_MS = 8000;

const SECTION_META = {
  top: { label: 'Top Stories', color: 'var(--sec-top)' },
  geopolitics: { label: 'Geopolitics', color: 'var(--sec-geopolitics)' },
  cyber: { label: 'Cyber', color: 'var(--sec-cyber)' },
  defense: { label: 'Defense', color: 'var(--sec-defense)' },
  world: { label: 'World', color: 'var(--sec-world)' },
};
const SECTION_ORDER = ['top', 'geopolitics', 'cyber', 'defense', 'world'];

/**
 * How many stories a section shows before it needs a click. ~100 items arrive a
 * day, and an unbounded page buries the good ones — capping is what makes the
 * ranking matter at all. Nothing is discarded: every section can be expanded,
 * and a section filter shows it in full.
 *
 * `world` is the tightest on purpose. General coverage is the least of what
 * this site is for, and it is also the largest section by volume.
 */
const SECTION_CAPS = { geopolitics: 14, cyber: 14, defense: 10, world: 6 };
const expandedSections = new Set();

// --------------------------------------------------------------- storage

const defaultState = () => ({
  read: {},        // id -> ISO timestamp read
  history: [],     // full item snapshots, newest first
  prefs: {
    theme: 'auto',
    autoRead: true,
    compact: false,
    groupDupes: true,
    hiddenSources: [],
  },
  lastVisit: null,
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      read: parsed.read && typeof parsed.read === 'object' ? parsed.read : {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
      prefs: { ...base.prefs, ...(parsed.prefs || {}) },
    };
  } catch {
    // Corrupted or unavailable storage should never take the site down.
    return defaultState();
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Quota exceeded: trim the oldest history and retry once.
      if (state.history.length > 200) {
        state.history = state.history.slice(0, Math.floor(state.history.length / 2));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          toast('History trimmed — local storage was full.');
          return;
        } catch {
          /* fall through */
        }
      }
      console.warn('Could not persist state:', err);
    }
  }, 150);
}

const state = loadState();

// ------------------------------------------------------------------ data

let data = { items: [], sources: [], health: [], generatedAt: null, displayCutoff: null };
let view = 'all';
let activeSection = 'all';
let activeTag = null;
let query = '';
let selectedIndex = -1;
let rendered = []; // items currently on screen, in order
let lastAction = null;

const $ = (sel) => document.querySelector(sel);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ------------------------------------------------------------------ time

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// ------------------------------------------------------------ selectors

const isRead = (id) => Boolean(state.read[id]);

function inWindow(item) {
  return !data.displayCutoff || item.publishedAt >= data.displayCutoff;
}

function visibleSources(item) {
  return !state.prefs.hiddenSources.includes(item.sourceId);
}

function matchesQuery(item) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    (item.summary || '').toLowerCase().includes(q) ||
    item.source.toLowerCase().includes(q) ||
    (item.tags || []).some((t) => t.includes(q))
  );
}

/**
 * A cluster is read once any member is read — otherwise the same story
 * reappears under a different masthead the moment you dismiss it.
 */
function clusterIsRead(item) {
  if (isRead(item.id)) return true;
  if (!state.prefs.groupDupes || !item.clusterId) return false;
  return (data.byCluster.get(item.clusterId) || []).some((m) => isRead(m.id));
}

/** Items eligible for the current view, before section/tag/search filtering. */
function baseItems() {
  if (view === 'history') {
    return state.history.filter(visibleSources);
  }
  // "All" means everything still outstanding this week. Anything you have read
  // has moved to History, so the two views partition the window between them.
  const pool = data.items.filter((i) => inWindow(i) && visibleSources(i));
  const deduped = state.prefs.groupDupes ? pool.filter((i) => i.isLead !== false) : pool;
  return deduped.filter((i) => !clusterIsRead(i));
}

function filtered() {
  return baseItems().filter((item) => {
    if (activeSection !== 'all' && item.section !== activeSection) return false;
    if (activeTag && !(item.tags || []).includes(activeTag)) return false;
    return matchesQuery(item);
  });
}

// ------------------------------------------------------------- mutations

function markRead(items, { silent = false } = {}) {
  const list = Array.isArray(items) ? items : [items];
  const now = new Date().toISOString();
  const changed = [];

  for (const item of list) {
    const targets =
      state.prefs.groupDupes && item.clusterId
        ? data.byCluster.get(item.clusterId) || [item]
        : [item];

    for (const target of targets) {
      if (state.read[target.id]) continue;
      state.read[target.id] = now;
      changed.push(target.id);
    }

    // Store a self-contained snapshot: the source item ages out of the 7-day
    // window, but history has to survive that.
    if (!state.history.some((h) => h.id === item.id)) {
      state.history.unshift({ ...item, readAt: now });
    }
  }

  if (state.history.length > HISTORY_LIMIT) {
    state.history.length = HISTORY_LIMIT;
  }

  if (changed.length) {
    lastAction = { ids: changed, historyIds: list.map((i) => i.id) };
    saveState();
    if (!silent) {
      // Count the stories the reader acted on, not the cluster members behind
      // them — dismissing one card that covers three outlets is still one story.
      toast(list.length === 1 ? 'Marked as read' : `${list.length} stories marked as read`, undoLast);
    }
  }
  return changed.length;
}

function markUnread(item) {
  const targets =
    state.prefs.groupDupes && item.clusterId
      ? data.byCluster.get(item.clusterId) || [item]
      : [item];
  for (const t of targets) delete state.read[t.id];
  state.history = state.history.filter((h) => h.id !== item.id);
  saveState();
}

function undoLast() {
  if (!lastAction) return;
  for (const id of lastAction.ids) delete state.read[id];
  const undone = new Set(lastAction.historyIds);
  state.history = state.history.filter((h) => !undone.has(h.id));
  lastAction = null;
  saveState();
  render();
}

// ---------------------------------------------------------------- toast

let toastTimer = null;
function toast(message, onUndo) {
  const node = $('#toast');
  $('#toast-text').textContent = message;
  const action = $('#toast-action');
  action.hidden = !onUndo;
  action.onclick = onUndo
    ? () => {
        onUndo();
        hideToast();
      }
    : null;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, UNDO_MS);
}
function hideToast() {
  $('#toast').hidden = true;
}

// --------------------------------------------------------------- render

function buildCard(item, index) {
  const card = el('article', 'card');
  card.dataset.id = item.id;
  card.dataset.index = String(index);
  if (isRead(item.id)) card.classList.add('is-read');
  if (index === selectedIndex) card.classList.add('is-selected');

  // -- headline
  const h = el('h3', 'card__title');
  const link = el('a', 'card__link');
  link.href = item.url;               // setAttribute path; canonicalized server-side to http(s)
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = item.title;      // never innerHTML: third-party text
  link.addEventListener('click', () => {
    if (state.prefs.autoRead && view !== 'history') {
      markRead(item, { silent: true });
      // Let the new tab open before the card animates away.
      setTimeout(render, 250);
    }
  });
  h.append(link);
  card.append(h);

  // -- summary
  if (item.summary) {
    card.append(el('p', 'card__summary', item.summary));
  }

  // -- meta line
  const meta = el('div', 'card__meta');
  meta.append(el('span', 'card__source', item.source));
  meta.append(el('span', 'card__sep', '·'));
  meta.append(
    el(
      'span',
      null,
      view === 'history' ? `read ${relativeTime(item.readAt)}` : relativeTime(item.publishedAt)
    )
  );

  if (item.funding === 'state') {
    const flag = el('span', 'card__flag', 'state-funded');
    flag.title = 'State-funded outlet — useful context when reading for geopolitical signal.';
    meta.append(flag);
  }
  if (item.region) meta.append(el('span', 'card__flag', item.region));

  for (const tag of (item.tags || []).slice(0, 3)) {
    const btn = el('button', 'card__tag', `#${tag}`);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      render();
    });
    meta.append(btn);
  }
  card.append(meta);

  // -- cross-source coverage
  if (state.prefs.groupDupes && item.alsoIn?.length) {
    const details = el('details', 'card__also');
    const summary = el('summary', null, `also reported by ${item.alsoIn.length} other outlet${item.alsoIn.length > 1 ? 's' : ''}`);
    details.append(summary);
    const list = el('div', 'card__also-list');
    for (const other of item.alsoIn) {
      const a = el('a', null, other.source);
      a.href = other.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      list.append(a);
    }
    details.append(list);
    card.append(details);
  }

  // -- actions
  const actions = el('div', 'card__actions');
  const readBtn = el('button', 'card__btn');
  readBtn.type = 'button';
  const nowRead = isRead(item.id);
  readBtn.title = nowRead ? 'Mark as unread' : 'Mark as read';
  readBtn.setAttribute('aria-label', readBtn.title);
  readBtn.innerHTML = nowRead
    ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10a7 7 0 0 1 14 0M3 10a7 7 0 0 0 14 0" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5 8 14.5 16 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  readBtn.addEventListener('click', () => {
    if (isRead(item.id)) markUnread(item);
    else markRead(item);
    render();
  });
  actions.append(readBtn);
  card.append(actions);

  card.addEventListener('mousedown', () => {
    selectedIndex = index;
  });

  return card;
}

function buildSection(id, items, startIndex, totalAvailable = items.length) {
  const meta = SECTION_META[id] || { label: id, color: 'var(--accent)' };
  const section = el('section', 'section');
  section.style.setProperty('--section-color', meta.color);

  const head = el('div', 'section__head');
  const title = el('h2', 'section__title');
  title.append(document.createTextNode(meta.label));
  title.append(el('span', 'section__count', String(totalAvailable)));
  head.append(title);

  if (view === 'all') {
    const mark = el('button', 'section__mark', 'Mark all read');
    mark.type = 'button';
    mark.addEventListener('click', () => {
      // Marks everything in the section, not just the capped slice on screen —
      // "mark all read" that left hidden items behind would be a lie.
      markRead(items);
      render();
    });
    head.append(mark);
  }
  section.append(head);

  const grid = el('div', 'section__grid');
  items.forEach((item, i) => grid.append(buildCard(item, startIndex + i)));
  section.append(grid);

  const hidden = totalAvailable - items.length;
  if (hidden > 0) {
    const more = el('button', 'section__more', `Show ${hidden} more in ${meta.label}`);
    more.type = 'button';
    more.addEventListener('click', () => {
      expandedSections.add(id);
      render();
    });
    section.append(more);
  }

  return section;
}

/**
 * Top Stories, with a guaranteed section mix rather than a global top-N.
 *
 * A single global ranking does not work here. Cyber reporting is usually
 * single-source — one outlet breaks a breach and nobody else picks it up — so it
 * can never compete on cross-source corroboration with a wildfire that eight
 * wires cover. Ranked globally, cyber took 1 of the top 20 while general news
 * took 8. Quotas make the ranking compete *within* a section, which is the only
 * comparison where the corroboration signal means anything.
 */
const TOP_QUOTAS = { geopolitics: 2, cyber: 2, defense: 1, world: 1 };

function pickTopStories(bySection) {
  const picked = [];
  for (const [section, quota] of Object.entries(TOP_QUOTAS)) {
    picked.push(...(bySection.get(section) || []).slice(0, quota));
  }
  // Backfill from whatever is left if a section was empty, so a quiet day still
  // shows a full block rather than two lonely stories.
  if (picked.length < 6) {
    const seen = new Set(picked.map((i) => i.id));
    const rest = [...bySection.values()]
      .flat()
      .filter((i) => !seen.has(i.id))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    picked.push(...rest.slice(0, 6 - picked.length));
  }
  return picked.sort((a, b) => (b.score || 0) - (a.score || 0));
}

function render() {
  const feed = $('#feed');
  feed.textContent = '';

  document.body.classList.toggle('is-compact', state.prefs.compact);

  const items = filtered();
  rendered = [];

  // -- counts on the view tabs
  const windowItems = data.items.filter((i) => inWindow(i) && visibleSources(i));
  const leads = state.prefs.groupDupes ? windowItems.filter((i) => i.isLead !== false) : windowItems;
  $('#count-history').textContent = String(state.history.length);
  $('#count-all').textContent = String(leads.filter((i) => !clusterIsRead(i)).length);

  renderFilters(windowItems);

  if (items.length === 0) {
    showEmptyState();
    return;
  }
  $('#state-empty').classList.add('is-hidden');

  if (view === 'history') {
    // History reads best strictly chronologically, grouped by the day you read it.
    const sorted = [...items].sort((a, b) => String(b.readAt).localeCompare(String(a.readAt)));
    let currentDay = null;
    let grid = null;
    sorted.forEach((item) => {
      const label = dayLabel(item.readAt);
      if (label !== currentDay) {
        currentDay = label;
        feed.append(el('div', 'day-divider', label));
        // A fresh grid per day, so cards column-fill within a day rather than
        // flowing across a divider.
        grid = el('div', 'section__grid');
        feed.append(grid);
      }
      grid.append(buildCard(item, rendered.length));
      rendered.push(item);
    });
    return;
  }

  // Brief / All: Top Stories first, then each section.
  const bySection = new Map();
  for (const item of items) {
    if (!bySection.has(item.section)) bySection.set(item.section, []);
    bySection.get(item.section).push(item);
  }
  for (const list of bySection.values()) list.sort((a, b) => (b.score || 0) - (a.score || 0));

  // "Top" is derived, not a feed section: the highest-scoring stories overall,
  // which in practice means recent stories carried by several outlets.
  const showTop = activeSection === 'all' && !activeTag && !query;
  const topIds = new Set();
  if (showTop) {
    const top = pickTopStories(bySection);
    if (top.length >= 3) {
      top.forEach((i) => topIds.add(i.id));
      const section = buildSection('top', top, rendered.length);
      // The lead story gets the full width and a display headline; without a
      // focal point a uniform grid reads as an undifferentiated wall.
      section.classList.add('section--top');
      feed.append(section);
      rendered.push(...top);
    }
  }

  for (const id of SECTION_ORDER) {
    if (id === 'top') continue;
    const list = (bySection.get(id) || []).filter((i) => !topIds.has(i.id));
    if (!list.length) continue;

    // Caps apply only to the unfiltered page. Once you have picked a section or
    // typed a search you have asked for that set, so show all of it.
    const capped =
      activeSection === 'all' && !activeTag && !query && !expandedSections.has(id)
        ? list.slice(0, SECTION_CAPS[id] ?? list.length)
        : list;

    feed.append(buildSection(id, capped, rendered.length, list.length));
    rendered.push(...capped);
  }
}

function showEmptyState() {
  const empty = $('#state-empty');
  empty.classList.remove('is-hidden');
  const title = $('#empty-title');
  const body = $('#empty-body');
  const showAllBtn = $('#empty-view-all');

  if (query || activeTag || activeSection !== 'all') {
    title.textContent = 'Nothing matches those filters';
    body.textContent = 'Try clearing the search box or picking a different section.';
    showAllBtn.textContent = 'Clear filters';
    showAllBtn.hidden = false;
    showAllBtn.onclick = () => {
      query = '';
      activeTag = null;
      activeSection = 'all';
      $('#search').value = '';
      render();
    };
    return;
  }

  if (view === 'history') {
    title.textContent = 'No reading history yet';
    body.textContent = 'Stories you open or mark as read will be filed here.';
    showAllBtn.hidden = true;
    return;
  }

  const total = data.items.filter(inWindow).length;
  title.textContent = "You're all caught up";
  body.textContent = total
    ? `You have read everything from the past ${data.windowDays || 7} days. New stories arrive a few times a day.`
    : 'No stories have been collected yet. The first scheduled update will fill this in.';
  showAllBtn.hidden = !total;
  showAllBtn.textContent = 'Review what you read';
  showAllBtn.onclick = () => setView('history');
}

function renderFilters(pool) {
  // Section chips
  const sectionRow = $('#section-filters');
  sectionRow.textContent = '';

  const counts = new Map();
  const relevant = view === 'history' ? state.history : pool.filter((i) => !clusterIsRead(i));
  for (const item of relevant) counts.set(item.section, (counts.get(item.section) || 0) + 1);

  const allChip = makeChip('All', activeSection === 'all', () => {
    activeSection = 'all';
    render();
  });
  sectionRow.append(allChip);

  for (const id of SECTION_ORDER) {
    if (id === 'top') continue;
    const count = counts.get(id) || 0;
    if (!count && activeSection !== id) continue;
    const chip = makeChip(SECTION_META[id].label, activeSection === id, () => {
      activeSection = activeSection === id ? 'all' : id;
      render();
    });
    chip.style.setProperty('--chip-color', SECTION_META[id].color);
    chip.prepend(el('span', 'chip__dot'));
    chip.append(el('span', 'chip__count', String(count)));
    sectionRow.append(chip);
  }

  // There is deliberately no standing row of topic chips: with ten of them it
  // read as a second navigation layer for something almost never used. Tags are
  // still on every card — clicking one filters, and it appears here as a single
  // dismissible chip so the filter is always visible and always clearable.
  if (activeTag) {
    const chip = makeChip(`#${activeTag} ✕`, true, () => {
      activeTag = null;
      render();
    });
    chip.title = `Stop filtering by #${activeTag}`;
    sectionRow.append(chip);
  }
}

function makeChip(label, active, onClick) {
  const chip = el('button', `chip${active ? ' is-active' : ''}`);
  chip.type = 'button';
  chip.setAttribute('aria-pressed', String(active));
  chip.append(document.createTextNode(label));
  chip.addEventListener('click', onClick);
  return chip;
}

// ----------------------------------------------------------------- views

function setView(next) {
  view = next;
  selectedIndex = -1;
  expandedSections.clear();
  for (const tab of document.querySelectorAll('.view-tab')) {
    tab.classList.toggle('is-active', tab.dataset.view === next);
  }
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------- keyboard

function moveSelection(delta) {
  if (!rendered.length) return;
  selectedIndex = Math.max(0, Math.min(rendered.length - 1, selectedIndex + delta));
  const card = document.querySelector(`.card[data-index="${selectedIndex}"]`);
  for (const c of document.querySelectorAll('.card.is-selected')) c.classList.remove('is-selected');
  if (card) {
    card.classList.add('is-selected');
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

let chordPending = null;
function onKeydown(e) {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

  if (e.key === 'Escape') {
    if (!$('#settings').hidden) return closeSettings();
    if (typing) {
      $('#search').blur();
      if (query) {
        query = '';
        $('#search').value = '';
        render();
      }
    }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

  if (chordPending === 'g') {
    chordPending = null;
    if (e.key === 'h') return setView('history');
    if (e.key === 'a') return setView('all');
    return;
  }

  switch (e.key) {
    case 'j':
      e.preventDefault();
      moveSelection(1);
      break;
    case 'k':
      e.preventDefault();
      moveSelection(-1);
      break;
    case 'g':
      chordPending = 'g';
      setTimeout(() => (chordPending = null), 900);
      break;
    case 'o':
    case 'Enter': {
      const item = rendered[selectedIndex];
      if (!item) break;
      e.preventDefault();
      window.open(item.url, '_blank', 'noopener,noreferrer');
      if (state.prefs.autoRead && view !== 'history') {
        markRead(item, { silent: true });
        render();
      }
      break;
    }
    case 'm': {
      const item = rendered[selectedIndex];
      if (!item) break;
      e.preventDefault();
      if (isRead(item.id)) markUnread(item);
      else markRead(item);
      render();
      break;
    }
    case 'a': {
      if (view !== 'all' || !rendered.length) break;
      e.preventDefault();
      markRead(filtered());
      render();
      break;
    }
    case 'u':
      e.preventDefault();
      undoLast();
      hideToast();
      break;
    case '/':
      e.preventDefault();
      $('#search').focus();
      break;
    case '?':
      e.preventDefault();
      openSettings();
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------- settings

function openSettings() {
  const drawer = $('#settings');
  drawer.hidden = false;
  $('#settings-toggle').setAttribute('aria-expanded', 'true');
  renderSourceToggles();
  renderHealth();
  renderStorageUsage();
  drawer.querySelector('.icon-btn')?.focus();
}
function closeSettings() {
  $('#settings').hidden = true;
  $('#settings-toggle').setAttribute('aria-expanded', 'false');
  $('#settings-toggle').focus();
}

function renderSourceToggles() {
  const container = $('#source-toggles');
  container.textContent = '';
  const grouped = new Map();
  for (const source of data.sources) {
    if (!grouped.has(source.section)) grouped.set(source.section, []);
    grouped.get(source.section).push(source);
  }
  for (const sectionId of SECTION_ORDER) {
    const sources = grouped.get(sectionId);
    if (!sources) continue;
    container.append(el('div', 'source-toggles__group', SECTION_META[sectionId].label));
    for (const source of sources) {
      const label = el('label', 'switch');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !state.prefs.hiddenSources.includes(source.id);
      input.addEventListener('change', () => {
        const hidden = new Set(state.prefs.hiddenSources);
        if (input.checked) hidden.delete(source.id);
        else hidden.add(source.id);
        state.prefs.hiddenSources = [...hidden];
        saveState();
        render();
      });
      label.append(input, el('span', null, source.name));
      container.append(label);
    }
  }
}

function renderHealth() {
  const container = $('#health-report');
  container.textContent = '';
  for (const entry of (data.health || []).filter((h) => !h.ok)) {
    const row = el('div', 'health__row');
    row.append(el('span', null, entry.name));
    row.append(el('span', null, entry.error || 'failed'));
    container.append(row);
  }
}

function renderStorageUsage() {
  try {
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
    const n = state.history.length;
    $('#storage-usage').textContent =
      `${n} ${n === 1 ? 'story' : 'stories'} in history · ${(bytes / 1024).toFixed(0)} KB stored locally`;
  } catch {
    $('#storage-usage').textContent = '';
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daily-brief-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      if (!incoming || typeof incoming !== 'object') throw new Error('not an object');

      // Merge rather than replace, so importing on a second device is additive.
      Object.assign(state.read, incoming.read || {});
      const seen = new Set(state.history.map((h) => h.id));
      for (const entry of incoming.history || []) {
        if (entry?.id && !seen.has(entry.id)) {
          state.history.push(entry);
          seen.add(entry.id);
        }
      }
      state.history.sort((a, b) => String(b.readAt).localeCompare(String(a.readAt)));
      if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
      if (incoming.prefs) Object.assign(state.prefs, incoming.prefs);

      saveState();
      applyPrefs();
      render();
      toast('History imported');
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function applyPrefs() {
  document.documentElement.dataset.theme = state.prefs.theme;
  $('#opt-autoread').checked = state.prefs.autoRead;
  $('#opt-compact').checked = state.prefs.compact;
  $('#opt-group-dupes').checked = state.prefs.groupDupes;
}

// ------------------------------------------------------------------ boot

async function loadData() {
  $('#state-loading').classList.remove('is-hidden');
  $('#state-error').classList.add('is-hidden');
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();

    data = payload;
    data.items = Array.isArray(payload.items) ? payload.items : [];
    data.byCluster = new Map();
    for (const item of data.items) {
      const key = item.clusterId || item.id;
      if (!data.byCluster.has(key)) data.byCluster.set(key, []);
      data.byCluster.get(key).push(item);
    }

    $('#state-loading').classList.add('is-hidden');

    const updated = payload.generatedAt ? relativeTime(payload.generatedAt) : 'unknown';
    const failing = (payload.health || []).filter((h) => !h.ok).length;
    $('#colophon-status').textContent =
      `${data.items.length} stories from ${payload.sources?.length || 0} sources · updated ${updated}` +
      (failing ? ` · ${failing} feed${failing > 1 ? 's' : ''} currently failing` : '');

    render();
    state.lastVisit = new Date().toISOString();
    saveState();
  } catch (err) {
    $('#state-loading').classList.add('is-hidden');
    $('#state-error').classList.remove('is-hidden');
    $('#error-detail').textContent =
      `${err.message}. If this is the first deploy, the scheduled update may not have run yet.`;
  }
}

function init() {
  applyPrefs();

  $('#masthead-date').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  for (const tab of document.querySelectorAll('.view-tab')) {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  }

  let searchTimer = null;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => {
      query = value.trim();
      selectedIndex = -1;
      render();
    }, 120);
  });

  $('#theme-toggle').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(state.prefs.theme) + 1) % order.length];
    state.prefs.theme = next;
    document.documentElement.dataset.theme = next;
    saveState();
    toast(`Theme: ${next}`);
  });

  $('#settings-toggle').addEventListener('click', () =>
    $('#settings').hidden ? openSettings() : closeSettings()
  );
  for (const node of document.querySelectorAll('[data-close-settings]')) {
    node.addEventListener('click', closeSettings);
  }

  const bindPref = (sel, key) =>
    $(sel).addEventListener('change', (e) => {
      state.prefs[key] = e.target.checked;
      saveState();
      render();
    });
  bindPref('#opt-autoread', 'autoRead');
  bindPref('#opt-compact', 'compact');
  bindPref('#opt-group-dupes', 'groupDupes');

  $('#export-data').addEventListener('click', exportData);
  $('#import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importData(file);
    e.target.value = '';
  });
  $('#clear-data').addEventListener('click', () => {
    if (!confirm('Clear all reading history? Every story will show as unread again.')) return;
    state.read = {};
    state.history = [];
    saveState();
    renderStorageUsage();
    render();
    toast('History cleared');
  });

  $('#retry').addEventListener('click', loadData);
  document.addEventListener('keydown', onKeydown);

  // Refresh when the tab regains focus after a while — the data file updates
  // several times a day and a long-lived tab would otherwise go stale.
  let lastLoad = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 15 * 60 * 1000) {
      lastLoad = Date.now();
      loadData();
    }
  });

  loadData();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is a bonus, never a hard requirement */
    });
  }
}

init();
