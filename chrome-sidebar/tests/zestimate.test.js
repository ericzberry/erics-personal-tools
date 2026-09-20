import test from 'node:test';
import assert from 'node:assert/strict';
import {readZillowValue, readZestimate, homesAgree, LOOKS} from '../src/zestimate.js';
import {zillowHome} from '../src/finance-data.js';

// What a house is worth is published on a page anyone can open, so the ledger
// can read it rather than be told it. These tests are about the two ways that
// goes wrong: the wrong figure off the right page, and the right figure off the
// wrong house.

// Injected into the page by Chrome, so it must work from its source text alone
// with no closure over this module.
const inPage = (document, location) =>
  Function('document', 'location', `return (${readZillowValue.toString()})()`)(document, location);
const pageOf = ({text = '', labelled = '', scripts = [], address = ''} = {}) => ({
  querySelector: selector => selector === 'h1' ? (address ? {textContent: address} : null)
    : (labelled ? {textContent: labelled} : null),
  querySelectorAll: selector => selector === 'script' ? scripts.map(textContent => ({textContent})) : [],
  body: {innerText: text}
});
const HERE = {href: 'https://www.zillow.com/homedetails/220-Riverside-Blvd-APT-11J-New-York-NY-10069/63869112_zpid/'};

test('the Zestimate is read off the label the page puts on it', () => {
  const page = inPage(pageOf({
    labelled: '$3,985,700',
    address: '220 Riverside Blvd APT 11J, New York, NY 10069',
    // A home for sale prints its asking price larger than its Zestimate and
    // directly above it, so "the big number" is the wrong number.
    text: '$4,100,000\n220 Riverside Blvd APT 11J, New York, NY 10069\n$3,985,700 Zestimate®'
  }), HERE);
  assert.equal(page.value, 3985700);
  assert.equal(page.address, '220 Riverside Blvd APT 11J, New York, NY 10069');
  assert.equal(page.url, HERE.href);
  assert.equal(page.checked, false);
});

test('and failing that, off the data the page was built from, and then off the line a person would read', () => {
  const stated = inPage(pageOf({
    text: 'Nothing here states it plainly.',
    scripts: ['window.x={}', '{\\"monthlyHoaFee\\":3174,\\"zestimate\\":3985700,\\"rentZestimate\\":null}']
  }), HERE);
  assert.equal(stated.value, 3985700, 'rentZestimate is the same word with a letter in front of it');

  const printed = inPage(pageOf({text: 'Zestimate®\n$1,240,000\nRent Zestimate®\n$5,800/mo'}), HERE);
  assert.equal(printed.value, 1240000);

  // The rent is a different figure about the same house, and never this one.
  const rentOnly = inPage(pageOf({text: 'Rent Zestimate®\n$5,800/mo'}), HERE);
  assert.equal(rentOnly.value, 0);
});

// A page that loaded and holds no house at all. Said apart from "no figure
// found", because the answer to it is to open the page yourself.
test('a bot check is reported as what it is', () => {
  const page = inPage(pageOf({text: 'Press and hold to confirm you are a human'}), HERE);
  assert.equal(page.value, 0);
  assert.equal(page.checked, true);
});

test('a Zillow home page is the one page a figure can be read off', () => {
  assert.equal(zillowHome('https://www.zillow.com/homedetails/123-Example-St/1234_zpid/'),
    'https://www.zillow.com/homedetails/123-Example-St/1234_zpid/');
  assert.equal(zillowHome('http://www.zillow.com/homedetails/123-Example-St/1234_zpid/'), '', 'https only');
  assert.equal(zillowHome('https://zillow.com.example.test/homedetails/'), '', 'a host that merely contains the name');
  assert.equal(zillowHome('https://www.redfin.com/123-Example-St'), '');
  assert.equal(zillowHome(''), '');
});

// The failure worth guarding against is the neighbour's Zestimate filed against
// this house. A street number, a postcode and a unit are written the same way
// whoever writes them; everything else is "Blvd" against "Boulevard".
test('two ways of writing one address agree about the parts nobody rewrites', () => {
  assert.equal(homesAgree('220 Riverside Blvd, Apartment 11J, NY NY 10069', '220 Riverside Blvd APT 11J, New York, NY 10069'), true);
  assert.equal(homesAgree('220 Riverside Blvd, Apartment 11J, NY NY 10069', '220 Riverside Blvd APT 15J, New York, NY 10069'), false);
  assert.equal(homesAgree('220 Riverside Blvd, NY NY 10069', '218 Riverside Blvd, New York, NY 10069'), false);
  assert.equal(homesAgree('220 Riverside Blvd, NY NY 10069', '220 Riverside Blvd, New York, NY 10023'), false);
  // A part only one of them states settles nothing.
  assert.equal(homesAgree('220 Riverside Blvd', '220 Riverside Blvd APT 11J, New York, NY 10069'), true);
  assert.equal(homesAgree('', '220 Riverside Blvd APT 11J'), true);
});

const browser = ({pages = [], closed = []} = {}) => ({
  tabs: {create: async () => ({id: 7}), remove: async id => {closed.push(id);}},
  scripting: {executeScript: async () => [{result: pages.shift() ?? null}]}
});

test('one reading opens the page out of the way, waits for the figure, and closes the tab', async () => {
  const closed = [];
  const api = browser({closed, pages: [{value: 0, address: '', url: ''}, {value: 3985700, address: '220 Riverside Blvd APT 11J, New York, NY 10069', url: HERE.href}]});
  let active = null;
  api.tabs.create = async options => {active = options; return {id: 7};};
  const reading = await readZestimate(HERE.href, {address: '220 Riverside Blvd, Apartment 11J, NY NY 10069', api, wait: async () => {}});
  assert.equal(reading.value, 3985700);
  assert.equal(active.active, false, 'behind whatever the owner is looking at');
  assert.deepEqual(closed, [7], 'and closed behind it');
});

test('a page for another house is refused rather than filed', async () => {
  const closed = [];
  const api = browser({closed, pages: [{value: 3985700, address: '220 Riverside Blvd APT 15J, New York, NY 10069', url: HERE.href}]});
  await assert.rejects(readZestimate(HERE.href, {address: '220 Riverside Blvd, Apartment 11J, NY NY 10069', api, wait: async () => {}}),
    /APT 15J/);
  assert.deepEqual(closed, [7], 'the tab goes whatever the reading came to');
});

test('a page that never gives up a figure says which kind of nothing it was', async () => {
  const closed = [];
  const checked = browser({closed, pages: Array.from({length: LOOKS}, () => ({value: 0, checked: true, address: '', url: ''}))});
  await assert.rejects(readZestimate(HERE.href, {api: checked, wait: async () => {}}), /prove it is a person/);

  const empty = browser({closed, pages: []});
  await assert.rejects(readZestimate(HERE.href, {api: empty, wait: async () => {}}), /No Zestimate was found/);

  await assert.rejects(readZestimate('https://www.redfin.com/123-Example-St', {api: empty, wait: async () => {}}), /no Zillow page saved/);
  assert.deepEqual(closed, [7, 7], 'the link that could not be opened opened no tab');
});
