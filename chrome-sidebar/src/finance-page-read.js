// Reads the balances off whatever page the owner is already logged into.
//
// The tool never navigates, never signs in, and never touches a tab it did not
// find already open and in front: it takes one text snapshot of the page the
// owner is looking at, and only when they ask for it. Nothing about a session,
// a cookie, or a credential leaves the browser — only the visible text the
// owner then reviews before any of it is read.
export const MAX_PAGE_TEXT = 24000;

// Runs inside the page. Kept self-contained: an injected function carries no
// closure from this module.
export function readAccountPage() {
  const clean = value => (value || '').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const body = document.body;
  if (!body) return null;
  // Tables carry the balances on most account pages, and innerText alone
  // collapses their columns into an unreadable run. Rendering them row by row
  // keeps a label beside its figure.
  const tables = [...document.querySelectorAll('table')].slice(0, 12).map(table =>
    [...table.rows].slice(0, 200).map(row =>
      [...row.cells].map(cell => clean(cell.innerText)).filter(Boolean).join('  |  ')
    ).filter(Boolean).join('\n')
  ).filter(Boolean);
  return {
    url: location.href,
    host: location.host,
    title: clean(document.title),
    text: clean(body.innerText || body.textContent || ''),
    tables
  };
}

const EXTENSION = /^(chrome|edge|about|chrome-extension|moz-extension|devtools|view-source):/i;

// Finds the page the owner is actually looking at. In the sidebar that is the
// active tab of this window, sitting right beside the panel. Opened as a full
// tab instead, the active tab is this tool itself, so the search falls through
// to the active tab of another ordinary window.
const readable=tab=>!!tab?.url&&!EXTENSION.test(tab.url)&&tab.id!==undefined;
export async function activeAccountTab(api = globalThis.chrome) {
  const [beside] = await api.tabs.query({active: true, currentWindow: true});
  if (readable(beside)) return beside;
  const elsewhere = (await api.tabs.query({active: true, windowType: 'normal'})).filter(readable);
  if (!elsewhere.length) throw Error('No ordinary web page is open. Open the account page you want read, leave it in front, then come back.');
  return elsewhere[0];
}

export async function readOpenAccountPage(api = globalThis.chrome) {
  const tab = await activeAccountTab(api);
  let results;
  try {
    results = await api.scripting.executeScript({target: {tabId: tab.id}, func: readAccountPage});
  } catch {
    throw Error(`Chrome would not let this read ${new URL(tab.url).host}. Some pages, such as the Chrome Web Store, are closed to extensions.`);
  }
  const page = results?.[0]?.result;
  if (!page) throw Error('That page could not be read. Make sure it has finished loading.');
  const combined = [page.tables.join('\n\n'), page.text].filter(Boolean).join('\n\n');
  const text = combined.slice(0, MAX_PAGE_TEXT);
  if (!text.trim()) throw Error('That page has no readable text on it yet.');
  return {
    text,
    host: page.host,
    title: page.title,
    trimmed: Math.max(0, combined.length - text.length),
    tables: page.tables.length
  };
}
