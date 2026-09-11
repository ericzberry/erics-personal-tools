// Local synthetic fixture for Rewards & benefits, and the program offers read
// off a program's own site. Not copied into release builds. The tool, its
// components and its styles are the real modules; only the wallet, the
// catalogue and the connection are synthetic, so the states a person actually
// meets can be inspected at sidebar and page widths without a cloud account.
import {mountRewards} from '../src/rewards-tool.js';
import {validateProgramCatalog, mergeCatalog} from '../src/program-data.js';

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
const STATES = [
  ['Wallet and a program’s offers', WALLET, [CATALOG]],
  ['Nothing read from a program yet', WALLET, []],
  ['A program read, and an empty wallet', [], [CATALOG]]
];
const root = document.getElementById('reward-states');
for (const [label, entries, catalogs] of STATES) {
  const heading = document.createElement('h2');
  heading.textContent = label;
  heading.style.cssText = 'font:600 12px system-ui;letter-spacing:.04em;text-transform:uppercase;opacity:.6;margin:24px 0 8px';
  const panel = document.createElement('main');
  panel.className = 'travel-wallet';
  root.append(heading, panel);
  const tool = mountRewards(panel, {credentials, offline: store(entries), programs: store(catalogs),
    vault: {idleMs: 9e5, available: () => true, unlocked: () => true, touch() {}, lock() {},
      key: async () => {throw Error('The preview seals nothing.');},
      open: async () => {throw Error('The preview seals nothing.');},
      unlockWithRecoveryCode: async () => {}, recoveryCode: () => 'EV1-SYNTHETIC'}});
  await tool.refresh();
}
