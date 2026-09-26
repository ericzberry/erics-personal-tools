// The reward programs this tool reads for itself, and the shape of what it
// reads.
//
// A program is a perks portal: a membership with no balance, whose value is the
// catalogue of offers behind it. That catalogue is the part that moves — offers
// are added, retired, and re-dated without notice — so it is read from the
// program's own pages rather than typed in, and replaced whenever the owner
// visits. Nothing about the owner's account is read: only the list of what the
// program currently offers, which every member sees alike.
//
// The wallet beside it stays what it was. A catalogue is reference data the
// program publishes; a wallet entry is the owner's own note about what they
// hold, and nothing here writes one.

export const MAX_OFFERS = 500;
export const FIELD_MAX = {name: 200, category: 60, summary: 400, badge: 40, dates: 80, card: 120, path: 500};
// A catalogue is one document, and a large program's is several times the 64 KB
// an ordinary record is allowed. Both ends of the write agree on this number:
// the device refuses to send more, and the Worker refuses to read more.
export const MAX_CATALOG_BYTES = 256 * 1024;
export const KEY_MAX = 120;

// How a program's catalogue is read. `markup` is the original: the watcher
// injects a reader into the page and takes the offer cards out of the markup,
// which costs nothing and is exact. `text` is for a program whose offers are
// the owner's own — an issuer's offers are picked per card and sit behind a
// sign-in — where the page is an application rather than a listing and its
// markup is nobody's contract. Those are read by the wallet's own page
// reading, from the text of the page the owner is looking at, and only when
// the owner presses for it.
export const READ_MARKUP = 'markup';
export const READ_TEXT = 'text';

export const REWARD_PROGRAMS = [
  {
    id: 'ms-reserved',
    label: 'Morgan Stanley Reserved',
    source: 'Morgan Stanley Reserved Living & Giving',
    hosts: ['msreserved.com'],
    origin: 'https://msreserved.com',
    // The whole catalogue sits on one page. Every other page shows a subset, so
    // a reading taken anywhere else may only add and update offers — see
    // `mergeCatalog`, which is what keeps a visit to one offer page from
    // emptying the catalogue.
    catalog: '/offers/all_offers',
    // An offer's own page. Its path is the offer's identity everywhere here.
    offer: /^\/offer\/[a-z0-9_.-]+$/i,
    reading: READ_MARKUP
  },
  {
    id: 'chase-offers',
    label: 'Chase Offers & Travel',
    source: 'Chase',
    hosts: ['chase.com', 'ultimaterewards.com'],
    origin: 'https://secure.chase.com',
    catalog: '/web/auth/dashboard#/dashboard/travel',
    offer: null,
    reading: READ_TEXT
  },
  {
    id: 'amex-offers',
    label: 'Amex Offers',
    source: 'American Express',
    hosts: ['americanexpress.com'],
    origin: 'https://global.americanexpress.com',
    // Every offer the owner is eligible for is on this one page, behind their
    // sign-in and chosen for their cards. Nothing here fetches it: the reading
    // is the text of the page they already have open.
    catalog: '/offers/eligible',
    // An Amex offer has no page of its own — it is a tile on that one page —
    // so there is no path to recognize and the offer's link is the page it
    // lives on.
    offer: null,
    reading: READ_TEXT
  }
];

const hostMatches = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);

// Recognizes a program from the address of a page. HTTPS only: a program read
// over plain HTTP is not this program.
export function rewardProgram(url) {
  let parsed;
  try {parsed = new URL(url);} catch {return null;}
  if (parsed.protocol !== 'https:') return null;
  return REWARD_PROGRAMS.find(program => program.hosts.some(host => hostMatches(parsed.hostname, host))) || null;
}
export const programById = id => REWARD_PROGRAMS.find(program => program.id === id) || null;
// An offer's page on the program's own site. The stored key is that page's
// path, so the link is the program's address and nothing of the owner's.
export function offerUrl(programId, offer) {
  const program = programById(programId);
  if (!program) return '';
  // An offer with a page of its own is linked to it. One without — a tile on a
  // list — is linked to the list it sits on, which for an issuer is the list
  // for that one card, and failing that to the program's own.
  const key = typeof offer === 'string' ? offer : text(offer?.key, KEY_MAX);
  const path = typeof offer === 'string' ? '' : text(offer?.path, FIELD_MAX.path);
  if (key.startsWith('/')) return `${program.origin}${key}`;
  if (program.reading !== READ_TEXT) return '';
  return `${program.origin}${path.startsWith('/') ? path : program.catalog}`;
}
export const catalogUrl = programId => {
  const program = programById(programId);
  return program ? `${program.origin}${program.catalog}` : '';
};

// Programs shout — FOOD & DRINK — and some of them shout in CSS rather than in
// the text, so the same category arrives as "SERVICES" from one page and
// "Services" from another, and a date as "NovemBER 16-18, 2026". Normalizing
// both is what keeps one catalogue from listing a category twice.
const SMALL = new Set(['a', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the', 'to']);
export function titleCase(value) {
  return String(value || '').toLowerCase().split(/(\s+|&|-)/).map((part, index) => {
    if (!/[a-z]/.test(part)) return part;
    if (index && SMALL.has(part)) return part;
    return part.replace(/^[a-z]/, character => character.toUpperCase());
  }).join('').trim();
}

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isoDate = value => (/^\d{4}-\d{2}-\d{2}T/.test(String(value || '')) && Number.isFinite(Date.parse(value)) ? value : '');

// One offer as the catalogue stores it. `key` is the offer's own path on the
// program's site, which is stable across readings and is what lets a second
// visit update an offer instead of duplicating it.
export function validateOffer(input = {}) {
  const key = text(input.key, KEY_MAX);
  const name = text(input.name, FIELD_MAX.name);
  if (!key || !name) return null;
  return {
    key,
    name,
    category: titleCase(text(input.category, FIELD_MAX.category)),
    summary: text(input.summary, FIELD_MAX.summary),
    badge: titleCase(text(input.badge, FIELD_MAX.badge)),
    dates: titleCase(text(input.dates, FIELD_MAX.dates)),
    // Which card the offer is on, where the program keeps a list per card. An
    // issuer does: the same merchant offer is on the Platinum and not on the
    // Blue Cash, and a list that mixed them would answer neither.
    card: text(input.card, FIELD_MAX.card),
    // The page the offer was read off, as a path on the program's own origin.
    // An issuer's list is one page per card — `/offers/eligible?account_key=…`
    // — so this is what makes an offer's link open the list it is actually on.
    path: String(input.path || '').startsWith('/') ? text(input.path, FIELD_MAX.path) : '',
    firstSeenAt: isoDate(input.firstSeenAt)
  };
}

// One reading of a program whose offers are read from the page's text rather
// than its markup. The shape is the catalogue's own, so nothing downstream
// knows which way an offer was read.
//
// The key is the offer's identity across readings, and a tile on a list has no
// path to be identified by. So it is made from what the page states — the
// merchant and the offer itself — which is stable while the offer is, and
// changes when the offer does, which is the right answer: a merchant's new
// offer is a new offer.
// What one press can bring back. An issuer's own list runs to a hundred offers
// on a premium card, and a reading that stopped at a handful of them would need
// pressing over and over to say the same thing — so the limit is the list, and
// the page's own paging is what bounds it in practice.
export const OFFER_READ_LIMIT = 100;
// The card comes first, because an issuer's offers are per card: the same
// merchant offer on two of them is two offers, and one key for both would keep
// whichever was read last and lose the other.
export const offerKey = (card, name, summary) =>
  `${text(card, FIELD_MAX.card)} ${text(name, FIELD_MAX.name)} ${text(summary, FIELD_MAX.summary)}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, KEY_MAX);
// `path` is the page the reading came off, which the device knows and the
// reading is never asked: an issuer's list is one page per card, and its
// address is how an offer's link opens the list it is on rather than whichever
// card the issuer shows first.
export function parseOfferReading(input, programId, {path = ''} = {}) {
  const program = programById(programId);
  if (!program || program.reading !== READ_TEXT) return [];
  const found = Array.isArray(input?.offers) ? input.offers : [];
  if (found.length > OFFER_READ_LIMIT) throw Error(`A page reading returns at most ${OFFER_READ_LIMIT} offers.`);
  const here = programPath(programId, path);
  const seen = new Set();
  return found.map(row => {
    const name = text(row?.merchant ?? row?.name, FIELD_MAX.name);
    const summary = text(row?.offer ?? row?.summary, FIELD_MAX.summary);
    if (!name || !summary) return null;
    const card = text(row?.card, FIELD_MAX.card);
    const offer = validateOffer({key: offerKey(card, name, summary), name, summary, card, path: here,
      category: text(row?.category, FIELD_MAX.category),
      badge: text(row?.badge, FIELD_MAX.badge),
      dates: text(row?.dates ?? row?.expires, FIELD_MAX.dates)});
    if (!offer || seen.has(offer.key)) return null;
    seen.add(offer.key);
    return offer;
  }).filter(Boolean);
}
// An address on the program's own site, as the path an offer is stored with.
// Anything else — another origin, a page the program does not serve — is no
// address of this program's and is kept out of the catalogue.
export function programPath(programId, url) {
  const program = programById(programId);
  if (!program) return '';
  let parsed;
  try {parsed = new URL(String(url || ''), program.origin);} catch {return '';}
  if (parsed.origin !== program.origin) return '';
  // Keep application routes, but never persist login tokens or redirect state.
  for (const key of [...parsed.searchParams.keys()])
    if (/token|password|secret|authorization|^code$|^state$|^session$/i.test(key)) parsed.searchParams.delete(key);
  let hash = '';
  if (parsed.hash.startsWith('#/')) {
    const route = new URL(parsed.hash.slice(1), program.origin);
    if (/^\/[a-z0-9/_-]+$/i.test(route.pathname)) {
      for (const key of [...route.searchParams.keys()])
        if (!['accountId', 'offerId', 'offerCategoryName'].includes(key)) route.searchParams.delete(key);
      hash = `#${route.pathname}${route.search}`;
    }
  }
  return text(`${parsed.pathname}${parsed.search}${hash}`, FIELD_MAX.path);
}

// A whole catalogue, as it is stored and as it crosses the network. `complete`
// records whether the reading could see every offer; only a complete one is
// allowed to retire an offer that is no longer listed.
export function validateProgramCatalog(input = {}, now = new Date().toISOString()) {
  const program = programById(text(input.programId, 40));
  if (!program) throw Error('That reward program is not one this tool knows how to read.');
  const seen = new Set();
  const offers = (Array.isArray(input.offers) ? input.offers : []).map(offer => validateOffer(offer)).filter(offer => {
    if (!offer || seen.has(offer.key)) return false;
    seen.add(offer.key);
    return true;
  });
  if (offers.length > MAX_OFFERS) throw Error(`A catalogue holds at most ${MAX_OFFERS} offers.`);
  const readAt = isoDate(input.readAt) || now;
  return {
    id: program.id,
    programId: program.id,
    label: program.label,
    source: program.source,
    complete: input.complete === true,
    offers: offers.map(offer => ({...offer, firstSeenAt: offer.firstSeenAt || readAt})),
    readAt,
    updatedAt: now
  };
}

// Folds a fresh reading into what was already stored.
//
// Two facts survive from the previous catalogue. The first is `firstSeenAt`, so
// "new" means new to the owner rather than new to this reading. The second is
// every offer the reading could not see: a partial reading — one taken on a
// single offer's page, or on a category — adds and updates, and only a complete
// one may drop an offer the program has retired.
export function mergeCatalog(previous, next) {
  const before = new Map((previous?.offers || []).map(offer => [offer.key, offer]));
  const merged = next.offers.map(offer => {
    const older = before.get(offer.key);
    before.delete(offer.key);
    return {...offer, firstSeenAt: older?.firstSeenAt || offer.firstSeenAt};
  });
  const kept = next.complete ? [] : [...before.values()];
  if (merged.length + kept.length > MAX_OFFERS)
    throw Error(`This catalogue exceeds ${MAX_OFFERS} offers. No offers were discarded; narrow the catalogue before retrying.`);
  return {
    ...next,
    offers: [...merged, ...kept],
    // A catalogue stays complete once a complete reading has filled it: a later
    // partial reading refreshes part of it without making the whole unknown.
    complete: next.complete || previous?.complete === true,
    readAt: next.readAt,
    // The last time the whole catalogue was seen at once, which is the date
    // worth showing: a partial reading does not confirm the rest is current.
    listedAt: next.complete ? next.readAt : previous?.listedAt || (previous?.complete ? previous.readAt : '')
  };
}

export const NEW_DAYS = 30;
// How many new offers are worth opening on arrival. Beyond this the group is
// still the first thing in the list, but it waits to be asked.
export const NEW_OPEN_MAX = 12;
// The categories actually present, so the filter offers nothing that would
// return an empty list.
export const catalogCategories = catalog =>
  [...new Set((catalog?.offers || []).map(offer => offer.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Search and category filter over one catalogue, newest first. `isNew` is the
// only derived flag: it is why the owner would look at this list at all.
export function catalogOffers(catalog, {query = '', category = '', now = new Date()} = {}) {
  const needle = query.trim().toLowerCase();
  const fresh = now.getTime() - NEW_DAYS * 86400000;
  return (catalog?.offers || [])
    .filter(offer => (!category || offer.category === category) &&
      (!needle || [offer.name, offer.category, offer.summary, offer.badge, offer.card].join(' ').toLowerCase().includes(needle)))
    .map(offer => ({...offer, isNew: Date.parse(offer.firstSeenAt) >= fresh}))
    .sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || a.name.localeCompare(b.name));
}

// A catalogue of a hundred and thirty-six offers is not a list to read down.
// Grouped it is a handful of lines: what is new, and then one line per category
// to open when it is wanted. The groups are closed, so the whole catalogue
// costs the height of its categories until the owner asks for one.
//
// Narrowing already answers the question, so a search or a chosen category
// returns one flat run of matches rather than groups to open through.
//
// A new offer is listed twice — under `New` and under its own category — on
// purpose: `New` is a lens over the catalogue, not a place offers live, and a
// category that quietly omitted its newest offers would be the wrong answer to
// "what is there".
export function catalogGroups(catalog, {query = '', category = '', now = new Date()} = {}) {
  const offers = catalogOffers(catalog, {query, category, now});
  if (query.trim() || category) return [{key: 'matches', label: '', offers, open: true, flat: true}];
  const groups = [];
  const fresh = offers.filter(offer => offer.isNew);
  // A first reading stamps every offer as first seen that day, so `New` would
  // hold the entire catalogue and say nothing about it. The group earns its
  // place only as a genuine subset, and it opens only while it is short enough
  // to be worth opening — otherwise it sits closed like any other.
  if (fresh.length && fresh.length < offers.length)
    groups.push({key: 'new', label: 'New', offers: fresh, open: fresh.length <= NEW_OPEN_MAX});
  const byCategory = new Map();
  for (const offer of offers) {
    const label = offer.category || 'Everything else';
    if (!byCategory.has(label)) byCategory.set(label, []);
    byCategory.get(label).push(offer);
  }
  for (const [label, list] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0])))
    groups.push({key: `category:${label}`, label, offers: list, open: false});
  return groups;
}
