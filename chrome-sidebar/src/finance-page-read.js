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
  // prints beside the accounts, and the market data it prints above them.
  const NOISE = /\b(disclosure|disclaimer|terms of use|privacy policy|member sipc|prospectus|advertisement)\b/i;
  // An index names itself, and the number under it is a quote rather than a
  // balance, so a figure is dropped when the lines just above it name one.
  const INDEX = /\b(djia|nasdaq|dow jones|s ?& ?p 500|russell \d|ftse|nikkei|indexes|indices)\b/i;
  // Whether the market is open is not a figure and not an index. E*TRADE
  // stamps "Market Closed Sep 18, 2026, 4:00 PM ET" across the foot of every
  // account card, and treating that the way an index name is treated threw
  // away the account's own balance for sitting near it.
  const STATUS = /\b(delayed|market (closed|open))\b|\bclosed\b(?=[^\n]*\bET\b)/i;
  // The labels on a chart's axis are not balances.
  const TICK = /^[$€£¥]\s?(0|\d{1,3}(\.\d)?\s?[kmbt])$/i;
  // A line that is nothing but a percentage is a move, a yield or a weight,
  // and never an amount of money. It reads as one here because a percentage
  // carries two decimals — "+1.42%" is the same shape as $1.42 — so a coin's
  // 24-hour move arrived as a figure of its own, under the coin's name.
  const PERCENT = /^[^\w$€£¥]*[-+]?\d+(\.\d+)?\s?%$/;
  // A balance and a change are printed in the same shape, and on an exchange's
  // home page the change carries no label to tell them apart: Coinbase sets
  // "↘ $185.01 (1.17%) 24H" directly under the portfolio total, with an arrow
  // and a colour doing all the work and neither surviving innerText. Read as a
  // figure it is $185 of somebody's money. A line that is only an amount, a
  // percentage in brackets and the window it was measured over is a change,
  // whichever way it points — and so is a broker's own "-$7,036.71 (-0.42%)",
  // which says the same thing under a label the reading is told to drop.
  const CHANGE = /^[^\w$€£¥]*[-+]?[$€£¥]?\s?[\d,]+(\.\d+)?\s*\(\s*[-+]?\d+(\.\d+)?\s*%\s*\)(\s*(1h|24h|1d|7d|30d|1w|1m|1y|ytd|all|today))?$/i;
  // The site's own furniture, sitting between an account's name and its
  // balance. E*TRADE prints "Show number" under "Traditional IRA -4144", so the
  // two lines above the figure were "Net Account Value" and "Show number" and
  // the account's name never travelled with its balance at all. The reading
  // then had nothing saying which balance was the IRA, and a retirement account
  // was folded into a joint taxable estate — which it cannot be.
  // An exchange puts a whole order ticket beside the balances — Quick buy, Max,
  // Convert, Review order — and every one of those sat directly above a figure,
  // where the page reader looks for the name of the account it belongs to.
  const CHROME = /^(show (number|more|less|all|details)|view (all|full|details|more)|hide|trade|buy|sell|transfer|deposit|withdraw|quick links|open orders|edit|manage|settings|help|learn more|more|details|quick buy|review order|place order|preview order|convert|max|continue|\u2026|\.{3})\b/i;
  // What a change calls itself. Dropping the change leaves its caption behind,
  // and a caption with no figure under it is the nearest line above the next
  // balance — which is how "Day's Gain" ended up labelling the IRA's value.
  // A line naming a change names the figure that was just refused, never the
  // one that follows it.
  const CHANGE_LABEL = /^(today's |day's |daily |total )?(gain|loss|change|return|performance|profit)( ?\/ ?loss)?\b|^(1h|24h|1d|7d|30d|1w|1m|1y|ytd|all|today)$/i;
  // No figure of its own, but it names the account or the date the figures
  // around it belong to.
  const CONTEXT = /\b(as of|updated|statement period|period ending|closing date|account (number|no\.?|#)|ending in)\b|\.{3}\s?\d{3}/i;
  // A line that names an account, kept for its own sake rather than only when
  // it happens to sit within two lines of a figure. Whether the name survives
  // cannot depend on how many links a card prints between the heading and the
  // numbers under it: at E*TRADE it did not, the reading had nothing saying
  // which balance was the IRA, and the account went into a joint taxable estate
  // twice over. A heading is short, names a kind of account, and states no
  // figure of its own — a sentence that merely contains the word is prose.
  const ACCOUNT = /\b(brokerage|ira|roth|401\s*\(?k\)?|403\s*\(?b\)?|457|529|hsa|stock plan|espp|rsu|checking|savings|money market|certificate|trust|custodial|utma|ugma|rollover|annuity|individual|joint|margin|cash management)\b/i;
  const names = line => line.length <= 60 && line.split(/\s+/).length <= 8 && ACCOUNT.test(line);
  // A price beside a coin's name is not a balance. An exchange prints its
  // watchlist, the day's movers and what is trending in the shape it prints
  // the owner's own money in — a name, a ticker, an amount — and the one line
  // that says which of the two a run of them is states no figure, so this
  // filter threw it away before anything else. What reached the reading was a
  // run of coin names with money under them, which is what a holding looks
  // like: a page stating $15,584.96 of coin was read as holding $18,161.
  const MARKET = /^(watchlist|trending|movers|top (movers|gainers|losers|stories)|gainers|losers|most (traded|popular)|popular|new listings|recently viewed|explore|discover|markets|prices|news|portfolio news|learn( ?& ?earn)?)( \(\d+\))?$/i;
  // Where such a run ends and the page is the owner's again: a line naming
  // what is held or what it comes to, one naming or dating an account, and the
  // furniture a card stamps under its own table — the market's hours, a link
  // to the full portfolio. A run only a heading could close would carry on
  // past a broker's movers table and take the account's own balance with it.
  const MINE = /^((your|my|total|net|current|account|available|portfolio) )*(assets|accounts?|balances?|holdings|positions|portfolio|wallets?|cash|crypto|value|worth)\b/i;
  const blocked = line => NOISE.test(line) || INDEX.test(line) || STATUS.test(line) || TICK.test(line) || CHANGE.test(line) || PERCENT.test(line);
  const wanted = line => !!line && line.length <= 200 && !blocked(line)
    && (MONEY.test(line) || CONTEXT.test(line) || (!MONEY.test(line) && names(line)));

  // Tables carry the balances on most account pages, and innerText alone
  // collapses their columns into an unreadable run. Rendering them row by row
  // keeps a label beside its figure; a table with no figure in it is furniture.
  //
  // Twelve is a limit on tables worth keeping, not on tables looked at. Applied
  // to the first twelve in the document it was spent on whatever the page lays
  // out first, and a bank that builds its promo panels out of tables, or a
  // broker that prints a grid of disclosures above the accounts, used all twelve
  // slots on furniture and dropped every table holding a balance before one of
  // them was read. So the rendering runs down the page and stops at the twelfth
  // table that actually carries figures. The walk is bounded in turn, well above
  // twelve, so a page built entirely of nested layout tables cannot cost the
  // reading a cell at a time all the way to the end of the document.
  const KEEP = 12, WALK = 100;
  const found = document.querySelectorAll('table');
  const tables = [];
  for (let index = 0; index < found.length && index < WALK && tables.length < KEEP; index++) {
    const rows = [...found[index].rows].slice(0, 200).map(row =>
      [...row.cells].map(cell => clean(cell.innerText)).filter(Boolean).join('  |  ')
    ).filter(Boolean);
    const figures = rows.filter(row => row.length <= 400 && !blocked(row) && (MONEY.test(row) || CONTEXT.test(row)));
    // The header row states what the columns mean, so it travels with them.
    if (figures.length) tables.push([...new Set([rows[0], ...figures])].join('\n'));
  }

  // A figure often sits on its own line under the name it belongs to, so a
  // kept figure brings the short line above it along as its label.
  const lines = (body.innerText || body.textContent || '').split('\n').map(clean);
  // Which lines are market data, settled once for the page: a run opens at a
  // heading naming a list of prices and closes at the first line that gives
  // the page back. The names inside a run go with the figures — a coin's name
  // is no more the label of the next balance than its price is a balance.
  const quotes = [];
  let quoting = false;
  lines.forEach((line, index) => {
    if (line) {
      if (MARKET.test(line)) quoting = true;
      else if (quoting && (MINE.test(line) || names(line) || STATUS.test(line) || CONTEXT.test(line) || CHROME.test(line))) quoting = false;
    }
    quotes[index] = quoting;
  });
  const seen = new Set(tables.join('\n').split('\n').map(line => line.toLowerCase()));
  const kept = [];
  const push = (line, names = false) => {
    const key = line.toLowerCase();
    // Identical long lines are the same row read twice, once out of the table
    // and once out of the surrounding text. Short ones can be two accounts
    // that genuinely read alike, so they are kept as they come.
    //
    // A line that names a figure is not a repeat of anything. Every account
    // card on a broker page says "Net Account Value" over its balance, and
    // suppressing the second one left a number under an account's name with
    // nothing saying what kind of number it was. Only figures are deduplicated;
    // a name repeated directly under itself is caught by `fresh` instead.
    if (!line || kept.length >= 400 || (!names && line.length >= 16 && seen.has(key))) return;
    if (!names) seen.add(key);
    kept.push(line);
  };
  // The three lines above a figure, ignoring the blank ones the layout leaves
  // behind: the nearest of them is usually the name the figure belongs to, and
  // any of them naming an index means the figure is a quote, not a balance.
  const above = (index, count) => {
    const previous = [];
    for (let step = index - 1; step >= 0 && previous.length < count; step--) if (lines[step] && !quotes[step]) previous.push(lines[step]);
    return previous;
  };
  // A figure with no words of its own: the large number on a tile, which says
  // nothing about what it counts. Only these are read for the name under them.
  const BARE = /^[^\p{L}]*$/u;
  // The nearest line under a figure. A card of tiles is laid out the other way
  // round from a table: the figure is the large thing and what it is sits under
  // it, which is how an issuer's own home page prints every one of its cards
  // and both of its reward balances. Read for the line above only, that page
  // gave up "13,674" with no program against it and lost "Reward Dollars"
  // altogether, because nothing follows the last figure on a page.
  const beneath = index => {
    for (let step = index + 1; step < lines.length; step++) if (lines[step] && !quotes[step]) return lines[step];
    return '';
  };
  // The nearest line above a figure is usually the name it belongs to — but a
  // page that groups accounts by who holds them puts the holder on the line
  // above that one, and at a bank holding a family's trusts, an LLC and a
  // child's account, that heading is the only thing saying whose balance this
  // is. So the nearest two come along, oldest first, and a line already just
  // kept is not repeated for the next figure under the same heading.
  //
  // The site's own controls are not names and never take one of those two
  // places. Counting them pushed the account's name out of the snapshot on
  // every broker page that puts a link beside the heading, which is all of them.
  //
  // The two places are not asked the same question, because the same words
  // mean different things in each. The nearest line says what the figure is —
  // "Net Account Value" is printed over every card on a broker page — so it
  // travels with each one and is dropped only when it is already the line
  // directly above; suppressing it across cards left an account with its name
  // and nothing saying what kind of number sat under it. The line above that
  // says who holds it, and a holder repeated down the accounts grouped under it
  // is one heading said four times, so that place keeps the wider test.
  const repeats = label => kept.length && kept[kept.length - 1].toLowerCase() === label.toLowerCase();
  const fresh = label => !kept.slice(-4).some(entry => entry.toLowerCase() === label.toLowerCase());
  lines.forEach((line, index) => {
    if (quotes[index] || !wanted(line)) return;
    // Five candidates for two places: a card can print a link, a tag and a
    // disclosure between the name and the number. Market data is still judged
    // on the three nearest lines, because an index named five lines up is on
    // the other side of the page, not over this figure.
    const previous = above(index, 5);
    if (previous.slice(0, 3).some(entry => INDEX.test(entry))) return;
    const labels = previous.filter(entry => entry.length <= 80 && !MONEY.test(entry) && !blocked(entry)
      && !CHROME.test(entry) && !CHANGE_LABEL.test(entry))
      .slice(0, 2).reverse();
    const [outer, inner] = labels.length > 1 ? labels : [null, labels[0]];
    if (outer && fresh(outer)) push(outer, true);
    if (inner && !repeats(inner)) push(inner, true);
    push(line);
    // And the name printed under it — but only for a line that is nothing but
    // a number, because a line carrying its own words has already said what it
    // is and what follows it is the next thing on the page rather than its
    // name. "IRA $412,880.17" names itself; "13,674" cannot. The name is taken
    // under the same test the lines above it pass, and not when it is one of
    // them said twice.
    const under = BARE.test(line) ? beneath(index) : '';
    if (under && under.length <= 80 && !MONEY.test(under) && !blocked(under)
      && !CHROME.test(under) && !CHANGE_LABEL.test(under) && fresh(under)) push(under, true);
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
