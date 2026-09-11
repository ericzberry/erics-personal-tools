// Reads a reward program's catalogue off the program's own pages.
//
// The rule is the one Finance already follows for an account site: the tool
// never signs in, never navigates, and never opens a tab of its own. It reads
// the page the owner has already opened, in the page, and only the part of it
// every member sees — the list of offers. No session, cookie, or credential
// leaves the browser, and nothing about the owner's account is read.
//
// The one thing it does beyond reading what is on screen: when the owner is on
// the program's site but not on the page that lists every offer, the reading
// asks that page for itself, from inside the tab, over the session already
// there. That is what makes "all the offers" true from any page on the site
// instead of only from the index.
import {rewardProgram, validateProgramCatalog, MAX_CATALOG_BYTES} from './program-data.js';
import {CONNECTION_KEY, cloudRequest} from './cloud-storage.js';

export const FETCH_MS = 15000;
// Enough for a catalogue page several times the size of today's; a program that
// outgrows it reads the page in front of the owner instead of the whole list.
export const MAX_HTML = 4_000_000;
// One reading per program per half hour, so moving around the site does not
// re-read it on every page. Arriving on the catalogue page itself is exempt:
// its offers are already on screen, so reading them costs nothing.
export const READ_MS = 30 * 60 * 1000;
export const READ_STATE_KEY = 'rewardProgramReads';

// Runs inside the page. Self-contained by necessity: an injected function
// carries no closure from this module, so everything it needs arrives in
// `options` and everything it uses is the page's own.
export async function readProgramCards({catalogPath, maxHtml, timeoutMs}) {
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const cards = source => [...source.querySelectorAll('a.card')].map(card => {
    let path = '';
    try {path = new URL(card.getAttribute('href'), location.href).pathname;} catch {return null;}
    const heading = card.querySelector('.h6');
    // A heading is either the category on its own, or the category and the
    // offer's dates as separate elements.
    const parts = heading ? [...heading.children].map(child => clean(child.textContent)).filter(Boolean) : [];
    return {
      key: path,
      name: clean(card.querySelector('.h4')?.textContent),
      category: parts[0] || clean(heading?.textContent),
      dates: parts.slice(1).join(' ') || '',
      summary: clean(card.querySelector('.p')?.textContent),
      badge: clean(card.querySelector('.card-badge')?.textContent)
    };
  }).filter(offer => offer && offer.name && offer.key.startsWith('/offer/'));

  const here = cards(document);
  if (location.pathname === catalogPath) return {complete: true, offers: here, path: location.pathname};
  try {
    const response = await fetch(catalogPath, {credentials: 'same-origin', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs)});
    if (!response.ok) throw Error('unavailable');
    const html = (await response.text()).slice(0, maxHtml);
    const listed = cards(new DOMParser().parseFromString(html, 'text/html'));
    // Only a listing that actually produced offers is treated as the whole
    // catalogue; an error page that happens to return 200 is not.
    if (listed.length) return {complete: true, offers: [...listed, ...here], path: location.pathname};
  } catch {/* The page in front of the owner is still worth reading. */}
  return {complete: false, offers: here, path: location.pathname};
}

// True when this page is worth reading now: either the reading is due, or the
// owner is standing on the full listing, where reading costs nothing extra.
export function shouldRead(program, url, state = {}, now = Date.now()) {
  let path = '';
  try {path = new URL(url).pathname;} catch {return false;}
  if (path === program.catalog) return true;
  // A program never read is due whatever the clock says, and so is one whose
  // last reading is in the future because the clock moved.
  const last = state[program.id]?.at;
  return !Number.isFinite(last) || now - last >= READ_MS || last > now;
}

const token = async (api) => (await api.storage.local.get(CONNECTION_KEY))[CONNECTION_KEY]?.token || '';

// One reading, from the tab the owner already has open, folded into what is
// stored and saved. Returns the saved catalogue, or null when there was nothing
// to do — no program, not due, not connected, or the page would not be read.
export async function readProgramFromTab(tab, {api = globalThis.chrome, request = cloudRequest, now = () => Date.now()} = {}) {
  const program = rewardProgram(tab?.url);
  if (!program || tab.id === undefined) return null;
  const {[READ_STATE_KEY]: state = {}} = await api.storage.local.get(READ_STATE_KEY);
  if (!shouldRead(program, tab.url, state, now())) return null;
  const access = await token(api);
  if (!access) return null;
  // Recorded before the reading, not after: a page that cannot be read must not
  // be retried on every load.
  await api.storage.local.set({[READ_STATE_KEY]: {...state, [program.id]: {at: now()}}});
  let page;
  try {
    const [result] = await api.scripting.executeScript({
      target: {tabId: tab.id},
      func: readProgramCards,
      args: [{catalogPath: program.catalog, maxHtml: MAX_HTML, timeoutMs: FETCH_MS}]
    });
    page = result?.result;
  } catch {return null;}
  if (!page?.offers?.length) return null;
  // The reading goes up as it was read. Folding it into what is already stored
  // is the API's job, because that is the one copy every device writes and so
  // the only place the fold cannot lose a race.
  const value = validateProgramCatalog({programId: program.id, complete: page.complete, offers: page.offers});
  const saved = await request(access, `/v1/rewards/programs/${program.id}`, {method: 'PUT', value, maxBytes: MAX_CATALOG_BYTES});
  return saved.catalog;
}

// Clears when each program was last read. A device that has been disconnected
// should read afresh when it is connected again rather than wait out a throttle
// that belongs to a connection it no longer has.
export async function forgetProgramReads(api = globalThis.chrome) {
  try {await api?.storage?.local?.remove(READ_STATE_KEY);} catch {/* Nothing stored is nothing to clear. */}
}

// Watches the tabs the owner opens and reads a program's catalogue when one of
// them is a program's site. Registered by the extension's service worker, so a
// visit is picked up whether or not the side panel is open.
export function watchRewardPrograms(api = globalThis.chrome, {read = readProgramFromTab, onRead = () => {}} = {}) {
  let queue = Promise.resolve();
  const consider = tab => {
    if (!rewardProgram(tab?.url)) return;
    queue = queue.then(() => read(tab)).then(catalog => {if (catalog) onRead(catalog);}, () => {});
  };
  api.tabs.onUpdated.addListener((id, change, tab) => {if (change.status === 'complete') consider(tab);});
  api.tabs.onActivated.addListener(async ({tabId}) => {
    try {consider(await api.tabs.get(tabId));} catch {/* A tab that closed is not a failure. */}
  });
  return {consider};
}
