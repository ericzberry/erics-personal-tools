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
export const FIELD_MAX = {name: 200, category: 60, summary: 400, badge: 40, dates: 80};
// A catalogue is one document, and a large program's is several times the 64 KB
// an ordinary record is allowed. Both ends of the write agree on this number:
// the device refuses to send more, and the Worker refuses to read more.
export const MAX_CATALOG_BYTES = 256 * 1024;
export const KEY_MAX = 120;

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
    offer: /^\/offer\/[a-z0-9_.-]+$/i
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
export function offerUrl(programId, key) {
  const program = programById(programId);
  if (!program || !String(key || '').startsWith('/')) return '';
  return `${program.origin}${key}`;
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
    firstSeenAt: isoDate(input.firstSeenAt)
  };
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
  return {
    ...next,
    offers: [...merged, ...kept].slice(0, MAX_OFFERS),
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
      (!needle || [offer.name, offer.category, offer.summary, offer.badge].join(' ').toLowerCase().includes(needle)))
    .map(offer => ({...offer, isNew: Date.parse(offer.firstSeenAt) >= fresh}))
    .sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || a.name.localeCompare(b.name));
}
