// Reads what a property's own page says the house is worth.
//
// A Zestimate is unlike every other figure this tool reads: it is published
// rather than held. There is nothing to sign in to, nothing about the owner on
// the page, and the number is the same one any passer-by would see — so the
// rule the account pages follow, that the tool reads only what is already in
// front of the owner, is not what protects anything here. What is read is a
// public page, and the address it is read for is one the owner typed.
//
// It is read in a browser rather than fetched, because that is the only way it
// can be read at all: Zillow answers a plain request with a bot check, and a
// figure taken out of that page would be wrong rather than missing. So the page
// is opened in a tab behind whatever the owner is looking at, read once, and
// the tab is closed again.

import {zillowHome} from './finance-data.js';

// How long to let the page settle, and how many times to look. A home-details
// page states its Zestimate in the HTML it arrives as, so the first look
// usually has it; the rest are for a slow network, not a slow page.
export const SETTLE_MS = 700;
export const LOOKS = 10;

// What two ways of writing one address agree about. A street number, a postcode
// and a unit are the three parts written the same way whoever writes them —
// everything else is "Blvd" against "Boulevard" and "NY" against "New York" —
// and a reading is refused when one of the three disagrees, because the failure
// this guards against is filing the neighbour's Zestimate against this house.
// A part only one of them states settles nothing and is passed over.
const streetNumber = address => (/^\s*(\d+)\b/.exec(address || '') || [])[1] || '';
const postcode = address => (/\b(\d{5})(?:-\d{4})?\b\s*$/.exec((address || '').trim()) || [])[1] || '';
const unit = address => ((/\b(?:apt|apartment|unit|ste|suite|#)\s*([\da-z][\da-z-]*)\b/i.exec(address || '') || [])[1] || '').toLowerCase();
export function homesAgree(saved, read) {
  if (!saved || !read) return true;
  return [streetNumber, postcode, unit].every(part => {
    const mine = part(saved), theirs = part(read);
    return !mine || !theirs || mine === theirs;
  });
}

// Runs inside the page. Self-contained by necessity: an injected function
// carries no closure from this module.
//
// Three readings of the same number, in the order they can be trusted. The
// page labels the figure for its own scripts, which is the one place it cannot
// be confused with another; the data the page was built from states it again;
// and failing both, the line the owner would read it off themselves. A house
// for sale prints its asking price larger than its Zestimate and directly
// above it, so a reading that takes "the big number" takes the wrong one.
//
// The rent Zestimate is a different figure about the same house and is never
// what is wanted here.
export function readZillowValue() {
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  // A house costs at least four figures, and a Zestimate is whole dollars.
  const money = text => {
    const match = /\$\s?([\d,]{4,})|(?:^|\s)([\d,]{7,})(?:\s|$)/.exec(text || '');
    const digits = (match?.[1] || match?.[2] || '').replace(/,/g, '');
    const value = Number(digits);
    return Number.isFinite(value) && value >= 1000 ? value : 0;
  };
  const labelled = money(clean(document.querySelector('[data-testid="primary-zestimate"]')?.textContent));
  // What the page was built from, as the page itself carries it. `rentZestimate`
  // is the same word with a letter before it, so the character in front of it
  // is what tells the two apart.
  const stated = () => {
    for (const script of [...document.querySelectorAll('script')].slice(0, 40)) {
      const text = script.textContent || '';
      if (!/zestimate/i.test(text)) continue;
      const match = /[^a-z]zestimate\\?"\s*:\s*\\?"?(\d{4,})/i.exec(text);
      if (match) return Number(match[1]);
    }
    return 0;
  };
  // The line a person would read it off. A line naming the rent, or sitting
  // directly under one that does, is not it.
  const printed = () => {
    const lines = (document.body?.innerText || '').split('\n').map(clean);
    for (const [index, line] of lines.entries()) {
      if (!/zestimate/i.test(line) || /\brent\b/i.test(line) || /\/\s?mo\b/i.test(line)) continue;
      for (const candidate of [line, lines[index - 1], lines[index + 1]]) {
        if (candidate && !/\brent\b/i.test(candidate) && !/\/\s?mo\b/i.test(candidate)) {
          const value = money(candidate);
          if (value) return value;
        }
      }
    }
    return 0;
  };
  const value = labelled || stated() || printed();
  return {
    value,
    // The address the page is for, so the figure can be refused when it belongs
    // to another house.
    address: clean(document.querySelector('h1')?.textContent),
    url: location.href,
    // A bot check is a page that loaded and holds no house at all. Said apart
    // from "no figure found", because the answer to it is to open the page.
    checked: !value && /are you a human|press and hold|verify (you are|that you are) (a )?human|unusual traffic/i.test(document.body?.innerText || '')
  };
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// One reading: open the property's page out of the way, look until the figure
// is there, and close the tab whatever happened. The address is checked against
// the one the property is saved under before the figure is believed.
export async function readZestimate(link, {address = '', api = globalThis.chrome, wait = pause, looks = LOOKS, settle = SETTLE_MS} = {}) {
  const url = zillowHome(link);
  if (!url) throw Error('That property has no Zillow page saved, so there is nothing to read.');
  const tab = await api.tabs.create({url, active: false});
  try {
    let page = null;
    for (let look = 0; look < looks; look++) {
      await wait(settle);
      try {
        const [result] = await api.scripting.executeScript({target: {tabId: tab.id}, func: readZillowValue});
        page = result?.result || page;
      } catch {/* The page is still on its way; look again. */}
      if (page?.value) break;
    }
    if (!page?.value) {
      throw Error(page?.checked
        ? 'Zillow asked the browser to prove it is a person, so the Zestimate could not be read. Open the page yourself and file the value by hand.'
        : 'No Zestimate was found on that page. Open it and check it is the right home, or file the value by hand.');
    }
    if (!homesAgree(address, page.address)) throw Error(`That page is ${page.address}, not ${address}. Correct the Zillow link on the property.`);
    return {value: page.value, address: page.address, url: page.url};
  } finally {
    try {await api.tabs.remove(tab.id);} catch {/* A tab already gone is a tab closed. */}
  }
}
