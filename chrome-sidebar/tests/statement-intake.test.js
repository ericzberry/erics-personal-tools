import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pdfText, readableRatio} from '../src/pdf-text.js';
import {trimForReading, isImage, ACCEPTED, MAX_SEND} from '../src/statement-text.js';
import {readAccountPage, MAX_PAGE_TEXT} from '../src/finance-page-read.js';

// A real PDF, produced the way a statement is: text laid out and Flate
// compressed. Generated rather than committed so the test proves extraction
// from an actual file rather than from a fixture someone hand-tuned.
function statementPdf(body) {
  const directory = mkdtempSync(join(tmpdir(), 'finance-pdf-'));
  const source = join(directory, 'statement.txt');
  writeFileSync(source, body);
  const pdf = join(directory, 'statement.pdf');
  writeFileSync(pdf, execFileSync('cupsfilter', [source], {maxBuffer: 40e6, stdio: ['ignore', 'pipe', 'ignore']}));
  return new Uint8Array(readFileSync(pdf));
}

test('a generated statement PDF gives up its figures, dates and account names', async () => {
  const result = await pdfText(statementPdf([
    'MERIDIAN WEALTH PARTNERS',
    'Statement Period: April 1, 2026 - June 30, 2026',
    'Account: Berry Family Trust - Brokerage',
    'Ending Value: $1,284,300.55',
    'Account: Rollover IRA',
    'Ending Value: $412,880.17'
  ].join('\n')));
  assert.equal(result.confidence, 'good', result.note);
  assert.match(result.text, /MERIDIAN WEALTH PARTNERS/);
  assert.match(result.text, /Berry Family Trust - Brokerage/);
  assert.match(result.text, /1,284,300\.55/);
  assert.match(result.text, /412,880\.17/);
  assert.match(result.text, /June 30, 2026/);
  // Colour profiles and embedded fonts are Flate streams too. Picking one up
  // would put mojibake in front of the owner beside real figures.
  assert.ok(readableRatio(result.text) > 0.99, 'no binary leaked in among the text');
  assert.equal(result.note, '');
});

test('a PDF with no text in it says so instead of returning nothing quietly', async () => {
  // A structurally valid PDF whose only stream is not text content.
  const empty = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  const result = await pdfText(empty);
  assert.equal(result.confidence, 'none');
  assert.match(result.note, /no text in it/i);
  assert.match(result.note, /image|paste/i);
});

// A bank's statement is not a plain page of text. Its rows are drawn inside
// form XObjects that carry no resources of their own, through a subset font
// whose bytes mean nothing without its ToUnicode table, and the whole file is
// usually locked with an owner password. This builds one the same way, so the
// reader is proved against the shape a statement actually arrives in.
function builtStatement(rows, {locked = false, password = false} = {}) {
  const codes = new Map();
  const encode = text => [...text].map(character => {
    if (!codes.has(character)) codes.set(character, 0x80 + codes.size);
    return codes.get(character).toString(16).padStart(2, '0');
  }).join('');
  const drawn = rows.map(([left, right], index) =>
    `BT /F1 10 Tf 1 0 0 1 0 ${200 - index * 14} Tm <${encode(left)}> Tj 1 0 0 1 90 ${200 - index * 14} Tm <${encode(right)}> Tj ET`).join('\n');
  const cmap = [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '1 begincodespacerange <00> <FF> endcodespacerange',
    `${codes.size} beginbfchar`,
    ...[...codes].map(([character, code]) => `<${code.toString(16)}> <${character.charCodeAt(0).toString(16).padStart(4, '0')}>`),
    'endbfchar', 'endcmap end end'
  ].join('\n');

  const pad = Buffer.from([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,
    0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);
  const owner = Buffer.alloc(32, 0x5a), id = Buffer.alloc(16, 0x11);
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-12, 0);
  const key = createHash('md5').update(Buffer.concat([pad, owner, permissions, id])).digest().subarray(0, 5);
  const rc4 = (secret, data) => {
    const box = Uint8Array.from({length: 256}, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + box[i] + secret[i % secret.length]) & 255; [box[i], box[j]] = [box[j], box[i]]; }
    const out = Buffer.alloc(data.length);
    let i = 0;
    j = 0;
    for (let at = 0; at < data.length; at++) {
      i = (i + 1) & 255;
      j = (j + box[i]) & 255;
      [box[i], box[j]] = [box[j], box[i]];
      out[at] = data[at] ^ box[(box[i] + box[j]) & 255];
    }
    return out;
  };
  const user = rc4(key, pad);
  if (password) user[0] ^= 0xff;
  const lock = number => body => {
    if (!locked) return Buffer.from(body, 'latin1');
    const objectKey = createHash('md5')
      .update(Buffer.concat([key, Buffer.from([number & 255, (number >> 8) & 255, (number >> 16) & 255, 0, 0])]))
      .digest().subarray(0, 10);
    return rc4(objectKey, Buffer.from(body, 'latin1'));
  };
  const stream = (number, body) => {
    const bytes = lock(number)(body);
    return Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`, 'latin1'), bytes, Buffer.from('\nendstream', 'latin1')]);
  };
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /X1 5 0 R >> /Font << /F1 6 0 R >> >> >>', 'latin1'),
    stream(4, 'q 1 0 0 1 72 400 cm /X1 Do Q'),
    // Deliberately no /Resources: a form inherits the page's, and a reader that
    // forgets that loses whole columns of the statement.
    Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Form /BBox [0 0 500 300] ', 'latin1'), stream(5, drawn)]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /AAAAAA+Statement /FirstChar 128 /LastChar 255 /ToUnicode 7 0 R >>', 'latin1'),
    stream(7, cmap),
    Buffer.from(`<< /Filter /Standard /V 1 /R 2 /Length 40 /P -12 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> >>`, 'latin1')
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let at = parts[0].length;
  objects.forEach((body, index) => {
    // The form's dictionary and its stream were built separately; join them.
    const opening = Buffer.from(`${index + 1} 0 obj\n`, 'latin1');
    const closing = Buffer.from('\nendobj\n', 'latin1');
    const piece = Buffer.concat([opening, body, closing]);
    offsets.push(at);
    parts.push(piece);
    at += piece.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${locked ? ` /Encrypt 8 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>]` : ''} >>\nstartxref\n${at}\n%%EOF`;
  return new Uint8Array(Buffer.concat([...parts, Buffer.from(xref + trailer, 'latin1')]));
}

const ROWS = [['08/18', 'AUTOMATIC PAYMENT - THANK YOU  -17,496.69'], ['07/25', 'APPLE.COM/BILL 866-712-7753 CA  4.30']];

test('a statement drawn in form XObjects through a subset font reads as its own rows', async () => {
  const result = await pdfText(builtStatement(ROWS));
  assert.equal(result.confidence, 'good', result.note);
  // Both columns, on one line, in the order they are printed in.
  assert.match(result.text, /08\/18\s+AUTOMATIC PAYMENT - THANK YOU\s+-17,496\.69/);
  assert.match(result.text, /07\/25\s+APPLE\.COM\/BILL 866-712-7753 CA\s+4\.30/);
  assert.ok(result.text.indexOf('08/18') < result.text.indexOf('07/25'), 'rows keep the order they are drawn in');
});

// Banks ship statements locked with an owner password and an empty user
// password: any reader may open them. Before this, every stream failed to
// decompress and a statement full of figures was reported as a scan.
test('a statement locked with an owner password opens and reads', async () => {
  const result = await pdfText(builtStatement(ROWS, {locked: true}));
  assert.equal(result.confidence, 'good', result.note);
  assert.match(result.text, /AUTOMATIC PAYMENT - THANK YOU/);
  assert.match(result.text, /4\.30/);
});

test('a PDF that genuinely needs a password says so rather than calling itself a scan', async () => {
  const result = await pdfText(builtStatement(ROWS, {locked: true, password: true}));
  assert.equal(result.confidence, 'none');
  assert.match(result.note, /password/i);
  assert.doesNotMatch(result.note, /scan/i);
  assert.equal(result.text, '');
});

test('a file that is not a PDF is refused rather than parsed as one', async () => {
  await assert.rejects(pdfText(new TextEncoder().encode('PK not a pdf')), /not a PDF/);
});

test('text past the reading limit is trimmed and the amount cut is reported', () => {
  const long = 'x'.repeat(MAX_SEND + 500);
  const {text, trimmed} = trimForReading(long);
  assert.equal(text.length, MAX_SEND);
  assert.equal(trimmed, 500);
  assert.deepEqual(trimForReading('short'), {text: 'short', trimmed: 0});
});

test('images are routed by extension, and only formats a provider accepts', () => {
  assert.ok(isImage('scan.PNG') && isImage('photo.jpeg'));
  assert.ok(!isImage('statement.pdf') && !isImage('holdings.xlsx'));
  // HEIC is deliberately absent: Chrome cannot decode it, and accepting it
  // would fail at the canvas with a worse message than "use these formats".
  assert.ok(!ACCEPTED.includes('.heic'));
});

const inPage = (document, location) =>
  // Injected into the page by Chrome, so it must work from its source text
  // alone with no closure over this module.
  Function('document', 'location', `return (${readAccountPage.toString()})()`)(document, location);
const pageOf = ({text, tables = []}) => ({
  querySelectorAll: selector => selector === 'table' ? tables : [],
  title: '  Positions  ',
  body: {innerText: text}
});
const cells = list => ({cells: list.map(text => ({innerText: text}))});
const HERE = {href: 'https://broker.example/positions', host: 'broker.example'};

test('the page reader takes the figures and the lines that name them, and nothing else', () => {
  const table = {rows: [cells(['Account', 'Balance']), cells(['Brokerage', '$1,284,300.55']), cells(['Open an account', 'Learn how'])]};
  const page = inPage(pageOf({
    tables: [table],
    text: 'Brokerage $1,284,300.55\n\n\n\nCash $12.00'
  }), HERE);
  assert.equal(page.host, 'broker.example');
  assert.equal(page.title, 'Positions');
  assert.equal(page.filtered, true);
  assert.equal(page.tables.length, 1);
  assert.match(page.tables[0], /Brokerage {2}\| {2}\$1,284,300\.55/);
  assert.match(page.tables[0], /Account {2}\| {2}Balance/, 'the header says what the columns are');
  assert.equal(page.tables[0].includes('Open an account'), false, 'a row with no figure in it is furniture');
  assert.match(page.text, /Cash \$12\.00/);
  assert.ok(!/\n{3,}/.test(page.text), 'runs of blank lines are collapsed');
  assert.ok(MAX_PAGE_TEXT > 0);
});

// The dashboard a balance sits on is mostly not balances. Schwab's summary
// wraps three account rows in index quotes, a generative-AI explainer, article
// links and screens of disclosure, and reading all of that is what buried the
// accounts the owner asked about.
test('a dashboard is narrowed to the accounts, their numbers and their dates', () => {
  const page = inPage(pageOf({text: [
    'Summary',
    'Updated: 03:57:45 AM ET, 09/19/2026',
    'IRA',
    'Account number ending in 306',
    'IRA $412,880.17 $0.00 0.00%',
    'Checking',
    'Account number ending in 638',
    'Checking $8,420.11 $0.00 0.00%',
    'Portfolio Insights is a snapshot of your portfolio’s performance, with market context and news tied to the investments you own—all in one place, so you can quickly understand what has changed and why.',
    '12 Tax-Smart Charitable Giving Tips for 2025',
    'DJIA',
    'Closed',
    '',
    '51,682.64',
    '0.00 (0.00%)',
    'U.S. indexes are displayed in real time. All other indexes are delayed by at least 15 minutes.',
    '$0',
    '$1M',
    '$2M'
  ].join('\n')}), HERE);
  assert.equal(page.filtered, true);
  assert.match(page.text, /IRA \$412,880\.17/);
  assert.match(page.text, /Account number ending in 306/);
  assert.match(page.text, /^IRA$/m, 'the name above a figure comes with it');
  assert.match(page.text, /Checking \$8,420\.11/);
  assert.match(page.text, /09\/19\/2026/, 'the date the page states is kept');
  assert.equal(page.text.includes('51,682.64'), false, 'an index quote is not one of the owner’s accounts');
  assert.equal(page.text.includes('Portfolio Insights'), false);
  assert.equal(page.text.includes('Charitable Giving'), false);
  assert.equal(/^\$1M$/m.test(page.text), false, 'a chart axis is not a balance');
  assert.ok(page.text.length < 300, `narrowed to ${page.text.length} characters`);
});

// A bank that holds a family's whole structure lists the accounts under the
// title that holds each one. The nickname on the tile is not the answer —
// "Total Checking" belongs to somebody — so the heading has to travel with the
// balance or nothing downstream can tell one holder's money from another's.
test('the heading an account is grouped under travels with its balance', () => {
  const page = inPage(pageOf({text: [
    'Berry 2020 Descendants’ Irrevocable Trust',
    'CHASE TOTAL CHECKING (...4421)',
    '$250,000.00',
    'CHASE SAVINGS (...4422)',
    '$18,004.10',
    'Celsie LLC',
    'BUSINESS COMPLETE BANKING (...9912)',
    '$41,000.00'
  ].join('\n')}), HERE);
  assert.match(page.text, /Berry 2020 Descendants’ Irrevocable Trust\nCHASE TOTAL CHECKING \(\.\.\.4421\)\n\$250,000\.00/);
  assert.match(page.text, /Celsie LLC\nBUSINESS COMPLETE BANKING \(\.\.\.9912\)\n\$41,000\.00/);
  assert.equal(page.text.split('Celsie LLC').length - 1, 1, 'a heading already just kept is not repeated for the next figure under it');
});

// E*TRADE's complete view, as it is actually laid out: every account card puts
// a "Show number" link between the account's name and its balances, and a
// "Show more" under them. Counting those as the two lines that name a figure
// pushed the account's name out of the snapshot entirely, so the reading had
// nothing saying which balance was the IRA — and a retirement account, which by
// law is one person's, was folded into a joint taxable estate.
test("a card's own links do not stand in for the name of the account", () => {
  const page = inPage(pageOf({text: [
    'Individual Brokerage -4049',
    'Show number',
    'Net Account Value',
    '$1,668,402.54',
    "Day's Gain",
    '-$7,036.71 (-0.42%)',
    'Show more',
    'Traditional IRA -4144',
    'Show number',
    'Net Account Value',
    '$122,666.62',
    'Show more',
    'Stock Plan (DSP) -7605',
    'Show number',
    'Current Account Value',
    '$0.00',
    'Potential Benefit Value',
    '$248,422.68'
  ].join('\n')}), HERE);
  for (const [account, figure] of [
    ['Individual Brokerage -4049', '\\$1,668,402\\.54'],
    ['Traditional IRA -4144', '\\$122,666\\.62']
  ]) assert.match(page.text, new RegExp(`${account.replace(/[-*]/g, '\\$&')}\nNet Account Value\n${figure}`),
    `${account} travels with its own balance`);
  // The stock plan states two figures under one name, and the second keeps the
  // label that says which of the two it is.
  assert.match(page.text, /Stock Plan \(DSP\) -7605\nCurrent Account Value\n\$0\.00/);
  assert.match(page.text, /Potential Benefit Value\n\$248,422\.68/);
  assert.equal(page.text.includes('Show number'), false, 'a link is not a label');
  assert.equal(page.text.includes('Show more'), false);
});

// E*TRADE's own IRA card, in the order the page reads it. The account is named
// in one column and its balance sits in another, with a contribution banner,
// three rows of links and a table of holdings between the two — so the name is
// nowhere near the figure and cannot travel to it as a label. It has to be kept
// for its own sake, or nothing downstream says which balance is the IRA, and a
// retirement account ends up inside a joint taxable estate.
test('a line that names an account is kept however far it sits from the figures', () => {
  const page = inPage(pageOf({text: [
    'Traditional IRA -4144',
    'Show number',
    'You can make a 2026 contribution until 4/15/2027*.',
    'Contribute now.',
    'Portfolio snapshot', 'Open orders (0)', 'Quick links',
    'Top Movers (3)', 'Portfolio News',
    'Symbol', 'Change %', 'Last Price $', "Day's Gain $",
    'WSTRN ALLIANCE PH...', '-0.01%', '$99.97', '-$1.40',
    '3 Total', 'View full portfolio',
    // Stamped across the foot of every card, and not an index quote.
    'Market Closed Sep 18, 2026, 4:00 PM ET',
    'Net Account Value',
    '$122,666.62'
  ].join('\n')}), HERE);
  assert.match(page.text, /^Traditional IRA -4144$/m, 'the account names itself once, in place');
  assert.match(page.text, /Net Account Value\n\$122,666\.62/, 'and its balance survives the line about the market');
  assert.equal(page.text.includes('Market Closed'), false, 'whether the market is open is not a figure');
  assert.equal(page.text.includes('contribution until'), false, 'nor is what the site is inviting you to do');
});

// The market being shut is not an index quote. Both used to be caught by the
// same pattern, and a balance printed under "Market Closed Sep 18, 2026" was
// thrown away as market data.
test('an index quote is dropped and a market-status line takes no balance with it', () => {
  const page = inPage(pageOf({text: [
    'DJIA', 'Closed', '', '51,682.64',
    'Market Closed Sep 18, 2026, 4:00 PM ET',
    'Net Account Value', '$1,668,402.54'
  ].join('\n')}), HERE);
  assert.equal(page.text.includes('51,682.64'), false, 'an index quote is not one of the owner\u2019s accounts');
  assert.match(page.text, /Net Account Value\n\$1,668,402\.54/);
});

// Coinbase's home page, in the order it reads: the portfolio total with its
// day's move directly under it, the buy panel beside it, two promotional cards,
// and the two balances that are the whole point of the page. The move carries
// no label at all — an arrow and a colour say it is a change, and neither
// survives innerText — so read as a figure it is $185 of somebody's money.
test('an exchange home page keeps the balances and drops the move printed under them', () => {
  const page = inPage(pageOf({text: [
    'Home',
    '$15,576.31',
    '↘ $185.01 (1.17%) 24H',
    'Earn 3.75%',
    'Buy', 'Sell', 'Convert',
    'Quick buy',
    '0 USD',
    'Max',
    '0 BTC',
    'Pay with',
    'Cash (USD)',
    '$0.06',
    'Available',
    'Review order',
    'Crypto',
    '$15,576.25',
    'Cash',
    '$0.06'
  ].join('\n')}), HERE);
  assert.equal(page.filtered, true);
  assert.match(page.text, /Crypto\n\$15,576\.25/, 'what is in coin travels with the word for it');
  assert.match(page.text, /Cash\n\$0\.06/);
  assert.match(page.text, /^\$15,576\.31$/m, 'the portfolio total is kept');
  assert.equal(page.text.includes('185.01'), false, 'a move with no label is still a move, not a balance');
  assert.equal(page.text.includes('Review order'), false, 'the buy panel is a control, not an account');
});

// The same line under a label, which is how a broker prints it. Dropping the
// figure must not leave its caption behind to be read as the name of whatever
// balance comes next.
test("a change's own caption does not become the label of the balance below it", () => {
  const page = inPage(pageOf({text: [
    'Individual Brokerage -4049',
    'Net Account Value',
    '$1,668,402.54',
    "Day's Gain",
    '-$7,036.71 (-0.42%)',
    'Traditional IRA -4144',
    'Net Account Value',
    '$122,666.62'
  ].join('\n')}), HERE);
  assert.equal(page.text.includes('7,036.71'), false);
  assert.equal(page.text.includes("Day's Gain"), false, 'a caption with nothing under it names nothing');
  assert.match(page.text, /Traditional IRA -4144\nNet Account Value\n\$122,666\.62/);
});

test('a page whose figures this filter cannot see is sent whole rather than gutted', () => {
  const page = inPage(pageOf({text: 'Balance\nabout a thousand pounds\nSettings'}), HERE);
  assert.equal(page.filtered, false);
  assert.match(page.text, /about a thousand pounds/);
});
