// Reads the balances off whatever page the owner is already logged into.
//
// The tool never navigates, never signs in, and never touches a tab it did not
// find already open and in front: it takes one text snapshot of the page the
// owner is looking at, and only when they ask for it. Nothing about a session,
// a cookie, or a credential leaves the browser — only the figures on the page
// the owner is looking at.
export const MAX_PAGE_TEXT = 24000;

// Runs inside the page. Kept self-contained: an injected function carries no
// closure from this module.
//
// An account dashboard is mostly not accounts. Schwab's summary carries index
// quotes, a generative-AI explainer, nine article links and three screens of
// disclosure around three balances, and sending all of it buries the figures
// that matter in text nobody asked to have read. So the snapshot keeps the
// lines that state a figure, the lines that say which account or which date a
// figure belongs to, and nothing else.
export function readAccountPage() {
  const clean = value => (value || '').replace(/[ \t ]+/g, ' ').trim();
  const body = document.body;
  if (!body) return null;
  // A figure worth reading: a currency symbol against a digit, an amount with
  // cents, or a grouped thousand.
  const MONEY = /[$€£¥]\s?-?\d|-?\d[\d,]*\.\d{2}(?!\d)|-?\d{1,3}(?:,\d{3})+/;
  // Figures that are never the owner's: the legal furniture every broker
  // prints beside the accounts, and the market data it prints above them. An
  // index quote is usually a bare number under its name, so a line is read as
  // market data when the lines just above it are.
  const NOISE = /\b(disclosure|disclaimer|terms of use|privacy policy|member sipc|prospectus|advertisement)\b/i;
  const MARKET = /\b(djia|nasdaq|dow jones|s ?& ?p 500|russell \d|ftse|nikkei|indexes|indices|closed|delayed)\b/i;
  // The labels on a chart's axis are not balances.
  const TICK = /^[$€£¥]\s?(0|\d{1,3}(\.\d)?\s?[kmbt])$/i;
  // No figure of its own, but it names the account or the date the figures
  // around it belong to.
  const CONTEXT = /\b(as of|updated|statement period|period ending|closing date|account (number|no\.?|#)|ending in)\b|\.{3}\s?\d{3}/i;
  const blocked = line => NOISE.test(line) || MARKET.test(line) || TICK.test(line);
  const wanted = line => !!line && line.length <= 200 && !blocked(line) && (MONEY.test(line) || CONTEXT.test(line));

  // Tables carry the balances on most account pages, and innerText alone
  // collapses their columns into an unreadable run. Rendering them row by row
  // keeps a label beside its figure; a table with no figure in it is furniture.
  const tables = [...document.querySelectorAll('table')].slice(0, 12).map(table => {
    const rows = [...table.rows].slice(0, 200).map(row =>
      [...row.cells].map(cell => clean(cell.innerText)).filter(Boolean).join('  |  ')
    ).filter(Boolean);
    const figures = rows.filter(row => row.length <= 400 && !blocked(row) && (MONEY.test(row) || CONTEXT.test(row)));
    // The header row states what the columns mean, so it travels with them.
    return figures.length ? [...new Set([rows[0], ...figures])].join('\n') : '';
  }).filter(Boolean);

  // A figure often sits on its own line under the name it belongs to, so a
  // kept figure brings the short line above it along as its label.
  const lines = (body.innerText || body.textContent || '').split('\n').map(clean);
  const seen = new Set(tables.join('\n').split('\n').map(line => line.toLowerCase()));
  const kept = [];
  const push = line => {
    const key = line.toLowerCase();
    // Identical long lines are the same row read twice, once out of the table
    // and once out of the surrounding text. Short ones can be two accounts
    // that genuinely read alike, so they are kept as they come.
    if (!line || kept.length >= 400 || (line.length >= 16 && seen.has(key))) return;
    seen.add(key);
    kept.push(line);
  };
  // The three lines above a figure, ignoring the blank ones the layout leaves
  // behind: the nearest of them is usually the name the figure belongs to, and
  // any of them naming an index means the figure is a quote, not a balance.
  const above = index => {
    const previous = [];
    for (let step = index - 1; step >= 0 && previous.length < 3; step--) if (lines[step]) previous.push(lines[step]);
    return previous;
  };
  lines.forEach((line, index) => {
    if (!wanted(line)) return;
    const previous = above(index);
    if (previous.some(entry => MARKET.test(entry))) return;
    const [label] = previous;
    if (label && label.length <= 80 && !MONEY.test(label) && !blocked(label)) push(label);
    push(line);
  });

  const focused = kept.join('\n');
  const whole = (body.innerText || body.textContent || '').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // A page that states its balances in some way this filter does not recognize
  // must not be sent with its figures cut out, so narrowing applies only when
  // it actually found figures.
  const filtered = MONEY.test([tables.join('\n'), focused].join('\n'));
  return {
    url: location.href,
    host: location.host,
    title: clean(document.title),
    text: filtered ? focused : whole,
    filtered,
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
  if (!text.trim()) throw Error('No account figures were found on that page. Make sure it has finished loading, or drop a statement instead.');
  return {
    text,
    url: page.url,
    host: page.host,
    title: page.title,
    filtered: page.filtered,
    trimmed: Math.max(0, combined.length - text.length),
    tables: page.tables.length
  };
}
