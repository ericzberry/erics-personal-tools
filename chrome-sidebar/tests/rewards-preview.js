// Local synthetic fixture for Rewards & benefits, and the program offers read
// off a program's own site. Not copied into release builds. The tool, its
// components and its styles are the real modules; only the wallet, the
// catalogue and the connection are synthetic, so the states a person actually
// meets can be inspected at sidebar and page widths without a cloud account.
import {mountRewards} from '../src/rewards-tool.js';
import {mountPurchaseAdvisor} from '../src/purchase-advisor.js';
import {mountCards} from '../src/cards.js';
import {validateProgramCatalog, mergeCatalog} from '../src/program-data.js';
import {directoryBalances} from '../src/balance-data.js';
import {LOYALTY_PROGRAMS} from '../src/loyalty-sites.js';

const token = 'synthetic-preview-token-at-least-32-characters';
const credentials = {get: async () => token};
const WALLET = [
  {id: '11111111-1111-4111-8111-111111111111', kind: 'membership', name: 'Reserved Living & Giving',
   source: 'Morgan Stanley', value: 'Member offers', state: 'available', url: 'https://msreserved.com/client/index.jsf',
   notes: 'No points, no card, no cost. Eligibility is reviewed periodically.', due: '', secret: '', secretHint: '',
   updatedAt: new Date().toISOString(), revision: 'synthetic-1'},
  {id: '22222222-2222-4222-8222-222222222222', kind: 'balance', name: 'Synthetic Airline miles',
   source: 'Synthetic Airline', value: '42,000 miles', state: 'available', url: '', notes: '', due: '',
   secret: '', secretHint: '', updatedAt: '2026-06-01T00:00:00.000Z', revision: 'synthetic-2'}
];
// Shaped like a real reading: long names, a category with an ampersand, a
// dated event, every badge, and a summary long enough to wrap at 280px.
const OFFERS = [
  {key: '/offer/sixt', name: 'SIXT', category: 'AUTOMOTIVE', badge: 'LIMITED-TIME OFFER',
   summary: 'For a limited time, save up to 20% off SIXT car rentals. Offer expires on 9/30/2026.'},
  {key: '/offer/music_city_festival', name: 'Music City Festival', category: 'EVENTS', badge: 'NEW',
   dates: 'November 16-18, 2026',
   summary: 'An exclusive three-day, invite-only experience featuring curated showcases and behind-the-scenes access to a lineup of country artists in Nashville, Tennessee.'},
  {key: '/offer/synthetic_cellars', name: 'Synthetic Cellars Wine & Food Tasting Experience',
   category: 'FOOD & DRINK', badge: 'EXCLUSIVE', summary: '$50 off a wine and food tasting or cooking class, plus 20% off select gift sets.'},
  {key: '/offer/synthetic_appliances', name: 'Synthetic Appliances', category: 'HOME',
   summary: 'Upgrade your home with at least 10% off major appliances, plus free shipping and installation.'},
  {key: '/offer/synthetic_spa', name: 'Synthetic Health Spa', category: 'HEALTH & BEAUTY',
   summary: 'Get 10% off your stay, plus other benefits.'},
  {key: '/offer/synthetic_leather', name: 'Synthetic Leather Goods', category: 'RETAIL',
   summary: 'Enjoy 20% off luxury leather goods and accessories.'}
];
// Two readings, so the catalogue carries offers the owner has had a while and
// offers that are new to them — which is the order the list is shown in.
const old = new Date(Date.now() - 90 * 86400000).toISOString();
const CATALOG = mergeCatalog(
  mergeCatalog(null, validateProgramCatalog({programId: 'ms-reserved', complete: true, offers: OFFERS.slice(2)}, old)),
  validateProgramCatalog({programId: 'ms-reserved', complete: true, offers: OFFERS}));

const store = records => ({request: async () => ({records})});
// The wallet as a directory: every program this tool knows, none of them read
// yet. This is what the owner meets immediately after adding them, and what
// they prune — so the row's own shape, its link out to the program's page, and
// the one press that deletes it are all reviewed here.
const DIRECTORY = directoryBalances(LOYALTY_PROGRAMS, []).map((entry, index) =>
  ({...entry, revision: `synthetic-directory-${index}`}));
// What the owner actually has: a catalogue far too long to read down. Built
// here at the size the real one reaches, so the grouping is reviewed against
// the problem it exists for rather than against six rows.
const MANY = Array.from({length: 136}, (_, i) => ({
  key: `/offer/synthetic_${i}`,
  name: `Synthetic offer ${String(i + 1).padStart(3, '0')}`,
  category: ['AUTOMOTIVE', 'DINING', 'EVENTS', 'HOME', 'RETAIL', 'TRAVEL', 'WELLNESS'][i % 7],
  badge: i % 11 === 0 ? 'LIMITED-TIME OFFER' : '',
  summary: 'A synthetic offer, long enough in its own right to wrap onto a second line at sidebar width.'
}));
// Seven of them first seen this week, so the New group has something in it.
const BIG = mergeCatalog(
  mergeCatalog(null, validateProgramCatalog({programId: 'ms-reserved', complete: true, offers: MANY.slice(7)}, old)),
  validateProgramCatalog({programId: 'ms-reserved', complete: true, offers: MANY}));

// An established wallet: two accounts of one product, told apart by their
// digits, with credits read on one and never read on the other; a membership
// waiting to be set up; a balance gone stale; and card terms for the product.
const P1 = '61111111-1111-4111-8111-111111111111', P2 = '62222222-2222-4222-8222-222222222222';
const ESTABLISHED = [
  {id: P1, kind: 'card', name: 'Synthetic Platinum Card', source: 'Synthetic Bank', value: '5x flights, 1x everything else', state: 'available', secretHint: '1111', url: 'https://issuer.example/benefits', updatedAt: '2026-09-01T00:00:00.000Z', revision: 'p1'},
  {id: P2, kind: 'card', name: 'Synthetic Platinum Card', source: 'Synthetic Bank', value: '5x flights, 1x everything else', state: 'available', secretHint: '2222', updatedAt: '2026-09-01T00:00:00.000Z', revision: 'p2'},
  {id: '63333333-3333-4333-8333-333333333333', kind: 'benefit', name: 'Dining credit', source: 'Synthetic Platinum Card', value: '$100 per quarter', remaining: '$62.50', cadence: 'quarterly', state: 'available', card: P1, updatedAt: '2026-09-20T00:00:00.000Z', revision: 'b1'},
  {id: '64444444-4444-4444-8444-444444444444', kind: 'benefit', name: 'Airline fee credit', source: 'Synthetic Platinum Card', value: '$200 per year', remaining: '', cadence: 'annual', state: 'available', card: P2, updatedAt: '2026-09-01T00:00:00.000Z', revision: 'b2'},
  {id: '65555555-5555-4555-8555-555555555555', kind: 'membership', name: 'Synthetic Lounge Collection', source: 'Synthetic Platinum Card', value: 'Membership', state: 'activation', card: P1, url: 'https://issuer.example/lounge', updatedAt: '2026-09-01T00:00:00.000Z', revision: 'm1'},
  {id: '66666666-6666-4666-8666-666666666666', kind: 'balance', name: 'Bonvoy', source: 'Marriott', value: '240,118 points', state: 'available', updatedAt: '2026-05-01T00:00:00.000Z', revision: 'bal1'},
  {id: '67777777-7777-4777-8777-777777777777', kind: 'balance', name: 'Membership Rewards', source: 'American Express', value: '13,674 points', state: 'available', updatedAt: '2026-09-21T00:00:00.000Z', revision: 'bal2'}
];
const TERMS = [{id: '68888888-8888-4888-8888-888888888888', revision: 't1', name: 'Synthetic Platinum Card', unit: 'points', base: 1, cpp: 1.5, checked: '2026-09-01', source: '', notes: '',
  rules: JSON.stringify([{category: 'Dining', channel: 'Any', rate: 4, remaining: null, active: true, end: '', condition: '', merchant: ''}])}];
const recordStore = list => {
  let saved = [...list];
  return {async request(token, url, options = {}) {
    const id = url.split('/').at(-1);
    if (!options.method) return {records: [...saved], syncMessage: ''};
    if (options.method === 'DELETE') {saved = saved.filter(record => record.id !== id); return {records: [...saved]};}
    const value = {...options.value, id, revision: 'next'};
    saved = saved.some(record => record.id === id) ? saved.map(record => record.id === id ? value : record) : [...saved, value];
    return {record: value, records: [...saved]};
  }, async saved() {return [...saved];}, async resolve() {return {records: [...saved]};}};
};
const STATES = [
  ['An established wallet: For you, coverage, Pay and Points', ESTABLISHED, [CATALOG], TERMS],
  ['Wallet and a program’s offers', WALLET, [CATALOG]],
  ['Nothing read from a program yet', WALLET, []],
  ['A program read, and an empty wallet', [], [CATALOG]],
  ['Every program added, none read yet', DIRECTORY, []],
  ['A catalogue of 136 offers', WALLET, [BIG]]
];
const root = document.getElementById('reward-states');
for (const [label, entries, catalogs, terms = []] of STATES) {
  const heading = document.createElement('h2');
  heading.textContent = label;
  heading.style.cssText = 'font:600 12px system-ui;letter-spacing:.04em;text-transform:uppercase;opacity:.6;margin:24px 0 8px';
  const panel = document.createElement('main');
  panel.className = 'travel-wallet';
  root.append(heading, panel);
  const cards = recordStore(terms), wallet = recordStore([]), offline = store(entries);
  const remote = async (token, path) => path === '/v1/ai-connections' ? {connections: []} : {};
  const tool = mountRewards(panel, {credentials, offline, programs: store(catalogs), cards, wallet, remote,
    mountPay: node => mountPurchaseAdvisor(node, {credentials, cards, wallet: offline, programs: store(catalogs), remote, embedded: true}),
    mountRates: node => mountCards(node, {credentials, offline: cards, wallet: offline, remote, purchase: false, heading: false}),
    vault: {idleMs: 9e5, available: () => true, unlocked: () => true, touch() {}, lock() {},
      key: async () => {throw Error('The preview seals nothing.');},
      open: async () => {throw Error('The preview seals nothing.');},
      unlockWithRecoveryCode: async () => {}, recoveryCode: () => 'EV1-SYNTHETIC'}});
  await tool.refresh();
}
