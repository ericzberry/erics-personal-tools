import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML, DOMParser} from 'linkedom';
import {rewardProgram, programById, validateOffer, validateProgramCatalog, mergeCatalog, catalogOffers, catalogCategories, offerUrl, titleCase, MAX_OFFERS,catalogGroups,NEW_OPEN_MAX,parseOfferReading,offerKey,programPath,OFFER_READ_LIMIT,READ_TEXT} from '../src/program-data.js';
import {readProgramCards, shouldRead, readProgramFromTab, watchRewardPrograms, READ_MS, READ_STATE_KEY} from '../src/reward-programs.js';
import {CONNECTION_KEY} from '../src/cloud-storage.js';

const reserved = programById('ms-reserved');
const token = 'synthetic-token-at-least-32-characters';

test('a program is recognized by its host, over HTTPS, and nothing else is', () => {
  for (const url of ['https://msreserved.com/client/index.jsf', 'https://www.msreserved.com/offers/all_offers', 'https://msreserved.com/offer/sixt'])
    assert.equal(rewardProgram(url)?.id, 'ms-reserved', url);
  for (const url of ['https://msreserved.com.example.invalid/', 'https://notmsreserved.com/', 'http://msreserved.com/client/index.jsf', 'chrome://extensions', '', undefined])
    assert.equal(rewardProgram(url), null, String(url));
});

test('an offer links to the program’s own site, and a key that is not a path links nowhere', () => {
  assert.equal(offerUrl('ms-reserved', '/offer/sixt'), 'https://msreserved.com/offer/sixt');
  assert.equal(offerUrl('ms-reserved', 'https://elsewhere.example/offer'), '');
  assert.equal(offerUrl('not-a-program', '/offer/sixt'), '');
});

test('a shouted category reads as a name, however the program happened to shout it', () => {
  assert.equal(titleCase('FOOD & DRINK'), 'Food & Drink');
  assert.equal(titleCase('Limited-Time Offer'), 'Limited-Time Offer');
  assert.equal(titleCase('HEALTH & BEAUTY'), 'Health & Beauty');
  // The live program renders some categories uppercase in CSS and some in the
  // text, so one catalogue really does carry both spellings.
  assert.equal(titleCase('SERVICES'), titleCase('Services'));
  assert.equal(titleCase('ENTERTAINMENT'), 'Entertainment');
});

test('a date the program mis-cased reads as a date', () => {
  const offer = validateOffer({key: '/offer/music_city', name: 'Music City Festival', category: 'EVENTS', dates: 'NovemBER 16-18, 2026'});
  assert.equal(offer.dates, 'November 16-18, 2026');
  assert.equal(validateOffer({key: '/o', name: 'n', dates: 'SEPTEMBER 24 - 27, 2026'}).dates, 'September 24 - 27, 2026');
});

// The page this reads is the program's own markup, so the fixture is the
// markup: a category on its own, a category beside a date range, and cards that
// are not offers at all.
const PAGE = `
  <a class="card" href="/offer/sixt"><span class="card-badge">LIMITED-TIME OFFER</span>
    <div class="card-content"><div class="h6">TRAVEL</div><div class="h4">SIXT</div><div class="p">Save up to 20% off car rentals.</div></div></a>
  <a class="card" href="/offer/music_city"><span class="card-badge">NEW</span>
    <div class="card-content"><div class="h6"><span>EVENTS</span> <span>November 16-18, 2026</span></div><div class="h4">Music City Festival</div><div class="p">An invite-only experience.</div></div></a>
  <a class="card" href="/pages/faq"><div class="card-content"><div class="h6">HELP</div><div class="h4">FAQs</div></div></a>
  <a class="card" href="/offer/nameless"><div class="card-content"><div class="h6">RETAIL</div></div></a>`;

function page({path = '/client/index.jsf', html = PAGE, catalogHtml = null, fetchFails = false} = {}) {
  const {document} = parseHTML(`<html><body>${html}</body></html>`);
  return {
    document,
    location: {href: `https://msreserved.com${path}`, pathname: path},
    DOMParser,
    fetch: async () => {
      if (fetchFails) throw Error('offline');
      return {ok: catalogHtml !== null, text: async () => `<html><body>${catalogHtml}</body></html>`};
    }
  };
}

// `readProgramCards` is injected, so it runs with the page's globals and no
// closure of its own. Calling it with those globals in scope is the same deal.
async function runReader(window, options = {}) {
  const {document, location, fetch, DOMParser: Parser} = window;
  const globals = {document, location, fetch, DOMParser: Parser, AbortSignal: {timeout: () => undefined}};
  const saved = Object.entries(globals).map(([key, value]) => {
    const had = Object.hasOwn(globalThis, key), previous = globalThis[key];
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
    return () => {if (had) Object.defineProperty(globalThis, key, {value: previous, configurable: true, writable: true}); else delete globalThis[key];};
  });
  try {return await readProgramCards({catalogPath: reserved.catalog, maxHtml: 1e6, timeoutMs: 100, ...options});}
  finally {for (const restore of saved) restore();}
}

test('the reader takes offers off the page and leaves everything else', async () => {
  const result = await runReader(page({path: reserved.catalog}));
  assert.equal(result.complete, true, 'the listing page is the whole catalogue');
  assert.deepEqual(result.offers.map(offer => offer.key), ['/offer/sixt', '/offer/music_city'],
    'a link that is not an offer, and an offer with no name, are both left out');
  assert.deepEqual(result.offers[1], {key: '/offer/music_city', name: 'Music City Festival', category: 'EVENTS',
    dates: 'November 16-18, 2026', summary: 'An invite-only experience.', badge: 'NEW'});
});

test('read from anywhere else on the site, the reader asks the listing page for the rest', async () => {
  const catalogHtml = `<a class="card" href="/offer/lg"><div class="card-content"><div class="h6">HOME</div><div class="h4">LG</div><div class="p">10% off appliances.</div></div></a>`;
  const result = await runReader(page({path: '/offer/sixt', html: PAGE, catalogHtml}));
  assert.equal(result.complete, true);
  assert.deepEqual(result.offers.map(offer => offer.key), ['/offer/lg', '/offer/sixt', '/offer/music_city']);
});

test('a listing page that cannot be reached leaves the reading partial, not empty', async () => {
  for (const broken of [{fetchFails: true}, {catalogHtml: null}, {catalogHtml: '<p>Sorry.</p>'}]) {
    const result = await runReader(page({path: '/offer/sixt', ...broken}));
    assert.equal(result.complete, false, JSON.stringify(broken));
    assert.deepEqual(result.offers.map(offer => offer.key), ['/offer/sixt', '/offer/music_city']);
  }
});

test('a partial reading adds and updates; only a complete one retires an offer', () => {
  const first = mergeCatalog(null, validateProgramCatalog({programId: 'ms-reserved', complete: true,
    offers: [{key: '/offer/sixt', name: 'SIXT', category: 'TRAVEL'}, {key: '/offer/lg', name: 'LG', category: 'HOME'}]}, '2026-08-01T00:00:00.000Z'));
  assert.equal(first.listedAt, '2026-08-01T00:00:00.000Z');

  const partial = mergeCatalog(first, validateProgramCatalog({programId: 'ms-reserved', complete: false,
    offers: [{key: '/offer/sixt', name: 'SIXT Rent', category: 'AUTOMOTIVE'}]}, '2026-09-11T00:00:00.000Z'));
  assert.deepEqual(partial.offers.map(offer => offer.key), ['/offer/sixt', '/offer/lg'], 'the unseen offer is kept');
  assert.equal(partial.offers[0].name, 'SIXT Rent', 'the seen offer is updated');
  assert.equal(partial.offers[0].firstSeenAt, '2026-08-01T00:00:00.000Z', 'an offer stays as old as the owner has had it');
  assert.equal(partial.listedAt, '2026-08-01T00:00:00.000Z', 'a partial reading does not claim the whole list is current');
  assert.equal(partial.complete, true, 'the catalogue is still known to be whole');

  const retired = mergeCatalog(partial, validateProgramCatalog({programId: 'ms-reserved', complete: true,
    offers: [{key: '/offer/sixt', name: 'SIXT Rent'}]}, '2026-09-12T00:00:00.000Z'));
  assert.deepEqual(retired.offers.map(offer => offer.key), ['/offer/sixt'], 'a complete reading drops what the program no longer lists');
  assert.equal(retired.listedAt, '2026-09-12T00:00:00.000Z');
});

test('a catalogue refuses a program it does not know, and is bounded', () => {
  assert.throws(() => validateProgramCatalog({programId: 'made-up', offers: []}), /not one this tool knows/);
  const offers = Array.from({length: MAX_OFFERS + 1}, (_, index) => ({key: `/offer/${index}`, name: `Offer ${index}`}));
  assert.throws(() => validateProgramCatalog({programId: 'ms-reserved', offers}), /at most/);
  const duplicated = validateProgramCatalog({programId: 'ms-reserved', offers: [
    {key: '/offer/sixt', name: 'SIXT'}, {key: '/offer/sixt', name: 'SIXT again'}, {key: '', name: 'No key'}, {key: '/offer/x', name: ''}]});
  assert.deepEqual(duplicated.offers.map(offer => offer.name), ['SIXT']);
});

test('offers are searched, filtered, and led by what is new to the owner', () => {
  const catalog = mergeCatalog(null, validateProgramCatalog({programId: 'ms-reserved', complete: true, offers: [
    {key: '/offer/lg', name: 'LG', category: 'HOME', summary: '10% off appliances', firstSeenAt: '2020-01-01T00:00:00.000Z'},
    {key: '/offer/sixt', name: 'SIXT', category: 'TRAVEL', summary: '20% off car rentals'},
    {key: '/offer/engine', name: 'Engine', category: 'TRAVEL', summary: '60% off lodging', firstSeenAt: '2020-01-01T00:00:00.000Z'}]}, '2026-09-11T00:00:00.000Z'));
  const now = new Date('2026-09-12T00:00:00.000Z');
  assert.deepEqual(catalogCategories(catalog), ['Home', 'Travel']);
  assert.deepEqual(catalogOffers(catalog, {now}).map(offer => offer.name), ['SIXT', 'Engine', 'LG'], 'new to the owner comes first');
  assert.deepEqual(catalogOffers(catalog, {category: 'Travel', now}).map(offer => offer.name), ['SIXT', 'Engine']);
  assert.deepEqual(catalogOffers(catalog, {query: 'lodging', now}).map(offer => offer.name), ['Engine'], 'the summary is searched too');
  assert.deepEqual(catalogOffers(catalog, {query: 'nothing here', now}), []);
});

test('the listing page is always worth reading; every other page waits its turn', () => {
  const state = {'ms-reserved': {at: 1000}};
  assert.equal(shouldRead(reserved, `https://msreserved.com${reserved.catalog}`, state, 1000), true);
  assert.equal(shouldRead(reserved, 'https://msreserved.com/offer/sixt', state, 1000 + READ_MS - 1), false);
  assert.equal(shouldRead(reserved, 'https://msreserved.com/offer/sixt', state, 1000 + READ_MS), true);
  assert.equal(shouldRead(reserved, 'https://msreserved.com/offer/sixt', {}, 0), true, 'a program never read is due');
  assert.equal(shouldRead(reserved, 'https://msreserved.com/offer/sixt', state, 500), true, 'so is one whose last reading is in the future');
  assert.equal(shouldRead(reserved, 'not a url', {}, 0), false);
});

function api({connected = true, injected = {complete: true, offers: [{key: '/offer/sixt', name: 'SIXT', category: 'TRAVEL'}]}, throws = false} = {}) {
  const store = {...(connected ? {[CONNECTION_KEY]: {token}} : {})};
  return {
    store,
    storage: {local: {
      get: async key => (Array.isArray(key) ? key : [key]).reduce((found, name) => (name in store ? {...found, [name]: store[name]} : found), {}),
      set: async values => {Object.assign(store, values);}
    }},
    scripting: {executeScript: async () => {if (throws) throw Error('cannot read'); return [{result: injected}];}}
  };
}

test('a reading goes up as it was read, and the API is left to fold it in', async () => {
  const chrome = api();
  const sent = [];
  const request = async (access, path, options) => {sent.push({access, path, options}); return {catalog: {id: 'ms-reserved', offers: options.value.offers}};};
  const catalog = await readProgramFromTab({id: 7, url: 'https://msreserved.com/offers/all_offers'}, {api: chrome, request, now: () => 5000});
  assert.equal(sent.length, 1, 'one write, and no read to merge against');
  assert.equal(sent[0].path, '/v1/rewards/programs/ms-reserved');
  assert.equal(sent[0].options.method, 'PUT');
  assert.equal(sent[0].access, token);
  assert.equal(sent[0].options.value.offers[0].category, 'Travel');
  assert.equal(catalog.offers.length, 1);
  assert.equal(chrome.store[READ_STATE_KEY]['ms-reserved'].at, 5000, 'the attempt is recorded, not just the success');
});

test('nothing is read without a program, a connection, or something on the page', async () => {
  const request = async () => {throw Error('should not be called');};
  assert.equal(await readProgramFromTab({id: 7, url: 'https://example.com/'}, {api: api(), request}), null);
  assert.equal(await readProgramFromTab({url: 'https://msreserved.com/offers/all_offers'}, {api: api(), request}), null, 'a tab with no id');
  assert.equal(await readProgramFromTab({id: 7, url: 'https://msreserved.com/offers/all_offers'}, {api: api({connected: false}), request}), null);
  assert.equal(await readProgramFromTab({id: 7, url: 'https://msreserved.com/offers/all_offers'}, {api: api({injected: {complete: true, offers: []}}), request}), null);
  assert.equal(await readProgramFromTab({id: 7, url: 'https://msreserved.com/offers/all_offers'}, {api: api({throws: true}), request}), null, 'a page Chrome will not let it read');
});

test('a page that will not be read is not retried on the next load', async () => {
  const chrome = api({throws: true});
  const tab = {id: 7, url: 'https://msreserved.com/offer/sixt'};
  const request = async () => {throw Error('should not be called');};
  await readProgramFromTab(tab, {api: chrome, request, now: () => 1000});
  assert.equal(await readProgramFromTab(tab, {api: chrome, request, now: () => 1000 + READ_MS - 1}), null);
});

test('the watcher considers a finished load and an activated tab, one at a time', async () => {
  const listeners = {};
  const tabs = {
    onUpdated: {addListener: fn => {listeners.updated = fn;}},
    onActivated: {addListener: fn => {listeners.activated = fn;}},
    get: async () => ({id: 9, url: 'https://msreserved.com/offer/sixt'})
  };
  const seen = [];
  let read = 0;
  const watcher = watchRewardPrograms({tabs}, {
    read: async tab => {read++; seen.push(tab.url); return read === 1 ? {id: 'ms-reserved'} : null;},
    onRead: catalog => seen.push(`saved:${catalog.id}`)
  });
  listeners.updated(1, {status: 'loading'}, {id: 1, url: 'https://msreserved.com/offers/all_offers'});
  assert.equal(read, 0, 'a page still loading is not read');
  listeners.updated(1, {status: 'complete'}, {id: 1, url: 'https://example.com/'});
  assert.equal(read, 0, 'a page that is not a program is not read');
  listeners.updated(1, {status: 'complete'}, {id: 1, url: 'https://msreserved.com/offers/all_offers'});
  await listeners.activated({tabId: 9});
  await watcher.consider({id: 1, url: 'https://msreserved.com/offer/x'});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(seen, ['https://msreserved.com/offers/all_offers', 'saved:ms-reserved',
    'https://msreserved.com/offer/sixt', 'https://msreserved.com/offer/x']);
});

// A catalogue the size the real one reaches is not a list to read down: it is
// grouped so the wallet underneath it stays reachable.
test('a long catalogue is grouped by category, with what is new on top',()=>{
  const offers=Array.from({length:136},(_,i)=>({key:`/o/${i}`,name:`Offer ${i}`,
    category:['AUTOMOTIVE','DINING','EVENTS','RETAIL','TRAVEL'][i%5],summary:'s',
    firstSeenAt:i<7?new Date().toISOString():'2020-01-01T00:00:00.000Z'}));
  const groups=catalogGroups({programId:'ms-reserved',offers},{});
  assert.equal(groups[0].label,'New','what is new is the reason to look, so it is first');
  assert.equal(groups[0].open,true,'and it is the only group that starts open');
  assert.equal(groups[0].offers.length,7);
  assert.ok(groups.slice(1).every(group=>group.open===false),'every category starts closed');
  assert.deepEqual(groups.slice(1).map(group=>group.label),
    ['AUTOMOTIVE','DINING','EVENTS','RETAIL','TRAVEL'],'categories are in their own order, not the offers’');
  // Every offer is reachable through a category, including the new ones: `New`
  // is a lens over the catalogue, not a place offers are moved to.
  const byCategory=groups.slice(1).reduce((count,group)=>count+group.offers.length,0);
  assert.equal(byCategory,136);
});

test('a narrowed catalogue is one flat run of matches, with no groups to open through',()=>{
  const offers=[{key:'/a',name:'Sixt',category:'AUTOMOTIVE',summary:'cars',firstSeenAt:'2020-01-01T00:00:00.000Z'},
    {key:'/b',name:'Hertz',category:'AUTOMOTIVE',summary:'cars',firstSeenAt:'2020-01-01T00:00:00.000Z'},
    {key:'/c',name:'Dinner',category:'DINING',summary:'food',firstSeenAt:'2020-01-01T00:00:00.000Z'}];
  const catalog={programId:'ms-reserved',offers};
  for(const narrowed of [catalogGroups(catalog,{query:'cars'}),catalogGroups(catalog,{category:'AUTOMOTIVE'})]){
    assert.equal(narrowed.length,1);
    assert.equal(narrowed[0].flat,true);
    assert.equal(narrowed[0].offers.length,2);
  }
});

test('a first reading has no New group, because every offer would be in it',()=>{
  const offers=Array.from({length:136},(_,i)=>({key:`/o/${i}`,name:`Offer ${i}`,
    category:['A','B','C'][i%3],summary:'s',firstSeenAt:new Date().toISOString()}));
  const groups=catalogGroups({programId:'ms-reserved',offers},{});
  assert.ok(!groups.some(group=>group.label==='New'),
    'a group holding the whole catalogue says nothing about it');
  assert.deepEqual(groups.map(group=>group.label),['A','B','C']);
  assert.ok(groups.every(group=>group.open===false),'so the catalogue costs three closed lines');
});

test('a New group too long to be worth opening waits to be asked',()=>{
  const build=fresh=>({programId:'ms-reserved',offers:Array.from({length:136},(_,i)=>({
    key:`/o/${i}`,name:`Offer ${i}`,category:'A',summary:'s',
    firstSeenAt:i<fresh?new Date().toISOString():'2020-01-01T00:00:00.000Z'}))});
  assert.equal(catalogGroups(build(NEW_OPEN_MAX),{})[0].open,true);
  assert.equal(catalogGroups(build(NEW_OPEN_MAX+1),{})[0].open,false,
    'still first in the list, but it no longer opens itself');
  assert.equal(catalogGroups(build(NEW_OPEN_MAX+1),{})[0].label,'New');
});

// A program whose offers are the owner's own: picked per card, behind a
// sign-in, on a page that is an application rather than a listing.
test('an issuer’s offers are recognized as a program of their own, read from the page’s text', () => {
  for (const url of ['https://global.americanexpress.com/offers/eligible', 'https://www.americanexpress.com/'])
    assert.equal(rewardProgram(url)?.id, 'amex-offers', url);
  assert.equal(programById('amex-offers').reading, READ_TEXT);
  // Every offer is a tile on the one page, so an offer's link is that page.
  assert.equal(offerUrl('amex-offers', 'hyatt-spend-500'), 'https://global.americanexpress.com/offers/eligible');
});

test('visiting an issuer’s site reads nothing on its own: that reading is the owner’s to press', async () => {
  let asked = 0;
  const api = {
    storage: {local: {get: async () => ({[CONNECTION_KEY]: {token}, [READ_STATE_KEY]: {}}), set: async () => {}}},
    scripting: {executeScript: async () => {asked++; return [{result: {complete: true, offers: [{key: '/offer/x', name: 'X'}]}}];}}
  };
  assert.equal(await readProgramFromTab({id: 7, url: 'https://global.americanexpress.com/offers/eligible'}, {api, request: async () => {throw Error('nothing should be written');}}), null);
  assert.equal(asked, 0, 'the markup reader is never injected into a page it cannot read');
  const seen = [];
  const listeners = {};
  watchRewardPrograms({tabs: {onUpdated: {addListener: fn => {listeners.updated = fn;}}, onActivated: {addListener: () => {}}, get: async () => ({})}},
    {read: async tab => {seen.push(tab.url); return null;}});
  listeners.updated(1, {status: 'complete'}, {id: 1, url: 'https://global.americanexpress.com/offers/eligible'});
  listeners.updated(2, {status: 'complete'}, {id: 2, url: 'https://msreserved.com/offers/all_offers'});
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(seen, ['https://msreserved.com/offers/all_offers']);
});

test('a page reading of an issuer’s offers becomes catalogue offers, once each', () => {
  const offers = parseOfferReading({offers: [
    {merchant: 'Hyatt', offer: 'Spend $500 or more, get $100 back', category: 'TRAVEL', badge: 'Added', expires: 'Expires 12/31/2026'},
    {merchant: 'Hyatt', offer: 'Spend $500 or more, get $100 back', category: 'Travel'},
    {merchant: 'Saks Fifth Avenue', offer: 'Spend $100, get $20 back'},
    {merchant: '', offer: 'A merchant this page never named'},
    {merchant: 'A merchant with no offer against it', offer: ''}
  ]}, 'amex-offers');
  assert.deepEqual(offers.map(offer => offer.name), ['Hyatt', 'Saks Fifth Avenue']);
  assert.equal(offers[0].category, 'Travel', 'a shouted category reads as a name here too');
  assert.equal(offers[0].badge, 'Added');
  assert.equal(offers[0].dates, 'Expires 12/31/2026');
  // The key is what the page states, so the same offer read twice is one offer
  // and a merchant's new offer is a new one.
  assert.equal(offers[0].key, offerKey('', 'Hyatt', 'Spend $500 or more, get $100 back'));
  assert.notEqual(offers[0].key, offerKey('', 'Hyatt', 'Spend $700 or more, get $150 back'));
  // A catalogue read from markup takes nothing from a page reading.
  assert.deepEqual(parseOfferReading({offers: [{merchant: 'Hyatt', offer: 'Spend $500'}]}, 'ms-reserved'), []);
  assert.deepEqual(parseOfferReading({}, 'amex-offers'), []);
  assert.throws(() => parseOfferReading({offers: Array.from({length: OFFER_READ_LIMIT + 1}, (_, index) => ({merchant: `M${index}`, offer: 'Spend $10'}))}, 'amex-offers'), /at most/);
});

test('an issuer’s offers fold in like any catalogue, and a partial reading retires none of them', () => {
  const read = list => validateProgramCatalog({programId: 'amex-offers', complete: false, offers: parseOfferReading({offers: list}, 'amex-offers')}, '2026-09-20T00:00:00.000Z');
  const first = read([{merchant: 'Hyatt', offer: 'Spend $500, get $100 back'}, {merchant: 'Saks', offer: 'Spend $100, get $20 back'}]);
  const merged = mergeCatalog(first, read([{merchant: 'Saks', offer: 'Spend $100, get $20 back'}, {merchant: 'Delta', offer: 'Spend $200, get $40 back'}]));
  assert.deepEqual(merged.offers.map(offer => offer.name).sort(), ['Delta', 'Hyatt', 'Saks']);
  assert.equal(merged.complete, false);
  assert.equal(merged.offers.find(offer => offer.name === 'Saks').firstSeenAt, first.offers[1].firstSeenAt,
    'an offer seen twice keeps the day it was first seen');
});

// An issuer keeps a list per card, on a page of its own, and the same merchant
// offer is on one card and not on another.
const BLUE = '/offers/eligible?account_key=816A6198A3E8D902DDA67A8F65D407A8';
const PLATINUM = '/offers/eligible?account_key=4330AEBF5B30A98811A86533F1ABABFC';
test('an issuer’s offers belong to the card they are on, and link to that card’s own list', () => {
  const read = (path, card) => parseOfferReading({offers: [
    {merchant: 'Hyatt', offer: 'Spend $500 or more, get $100 back', card, category: 'Travel'},
    {merchant: 'Synthetic Grocer', offer: 'Spend $75, get $15 back', card, category: 'Food & Drink'}
  ]}, 'amex-offers', {path: `https://global.americanexpress.com${path}`});
  const blue = read(BLUE, 'Blue Cash Preferred® ····72005');
  const platinum = read(PLATINUM, 'Platinum Card® ····61007');
  // Two cards, one merchant, two offers — and neither key takes the other's place.
  assert.notEqual(blue[0].key, platinum[0].key);
  assert.equal(blue[0].card, 'Blue Cash Preferred® ····72005');
  assert.equal(offerUrl('amex-offers', blue[0]), `https://global.americanexpress.com${BLUE}`);
  assert.equal(offerUrl('amex-offers', platinum[0]), `https://global.americanexpress.com${PLATINUM}`);
  // Both cards' offers live in the one catalogue, and a partial reading of one
  // card leaves the other card's offers alone.
  const catalog = mergeCatalog(
    validateProgramCatalog({programId: 'amex-offers', complete: false, offers: blue}),
    validateProgramCatalog({programId: 'amex-offers', complete: false, offers: platinum}));
  assert.equal(catalog.offers.length, 4);
  // Which is why the card is searched: it is how the owner asks for one list.
  assert.deepEqual(catalogOffers(catalog, {query: 'platinum'}).map(offer => offer.card),
    ['Platinum Card® ····61007', 'Platinum Card® ····61007']);
  // A page of somebody else's is no address of this program's.
  assert.equal(programPath('amex-offers', 'https://phishing.example/offers/eligible'), '');
  assert.equal(parseOfferReading({offers: [{merchant: 'Hyatt', offer: 'Spend $500', card: 'Platinum'}]},
    'amex-offers', {path: 'https://phishing.example/offers'})[0].path, '');
  // With no page to link to, an offer still links to the program's own list.
  assert.equal(offerUrl('amex-offers', {key: 'x', path: ''}), 'https://global.americanexpress.com/offers/eligible');
});
