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
  querySelectorAll: selector => /table|grid/.test(selector) ? tables : [],
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

// A card issuer lays its home page out the other way round from a table: the
// figure is the large thing on the tile and what it counts sits under it. Read
// for the line above only, that page gave up "13,674" with no program against
// it and lost "Reward Dollars" altogether, because nothing follows the last
// figure on a page.
test('a tile that prints its figure over its name keeps the name under it', () => {
  const page = inPage(pageOf({text: [
    'Accounts',
    'Total Balance', '$4,403.54', 'Morgan Stanley Platinum Card®', '••••61007', 'Payment not required at this time',
    'Total Balance', '$242.03', 'Blue Cash Preferred® ••••72005', 'Payment not required at this time',
    '13,674', 'Membership Rewards® Points', '2 Accounts',
    '$125.49', 'Reward Dollars', 'Blue Cash Preferred® ••••72005'
  ].join('\n')}), HERE);
  assert.match(page.text, /\$4,403\.54\nMorgan Stanley Platinum Card®/, 'the card is named under its own balance');
  assert.match(page.text, /\$242\.03\nBlue Cash Preferred® ••••72005/);
  assert.match(page.text, /13,674\nMembership Rewards® Points/, 'the points balance carries its program');
  assert.match(page.text, /\$125\.49\nReward Dollars/, 'and the last figure on the page is not left nameless');
});

// The name under a figure is only ever read for a figure that cannot name
// itself. A row carrying its own words has already said what it is, and what
// follows it is the next thing on the page.
test('a figure with words of its own takes no name from the line under it', () => {
  const page = inPage(pageOf({text: [
    'IRA', 'IRA $412,880.17', 'Checking', 'Checking $8,420.11'
  ].join('\n')}), HERE);
  assert.equal(/IRA \$412,880\.17\nChecking\nChecking/.test(page.text), false,
    'the next account is not read as this one’s name');
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

// Chase lists what one password reaches in two sortable tables, and the whole
// answer is in the first column: eleven investment accounts and nine deposit
// accounts, each titled to a different trust, child or company. A row read
// without its own name and number is a balance belonging to nobody, and four
// trusts' money then adds up into one heap called Investment accounts.
test('a bank table keeps each account\u2019s name and number against its own balance', () => {
  const investments = {rows: [
    cells(['Account', 'Type/Strategy', 'Day change', 'Account value']),
    cells(['BERRY 2020 IRREV FAM TR (...5007)', 'Asset', '$0.00 (0.00%)', '$4,775,770.50']),
    cells(['BERRY 20 DESC\' IRR TR (...3004)', 'JPM 1-10 Year Municipal Ladder', '$0.00 (0.00%)', '$1,818,646.70']),
    cells(['CELSIE LLC (...2006)', 'Asset', '$0.00 (0.00%)', '$0.00'])
  ]};
  const deposits = {rows: [
    cells(['Account', 'Type', 'Day change', 'Present balance', 'Available balance']),
    cells(['Joint checking (...0823)', 'Checking', '\u2212$244.06', '$136,724.37', '$136,480.31']),
    cells(['BEDFORD BRIDGE CAPITAL, LLC (...4918)', 'Business Checking', '$0.00', '$0.00', '$0.00'])
  ]};
  const page = inPage(pageOf({tables: [investments, deposits], text: 'Investment accounts\nBank accounts'}), HERE);
  assert.equal(page.tables.length, 2);
  const read = page.tables.join('\n');
  for (const [account, value] of [
    ['BERRY 2020 IRREV FAM TR \\(\\.\\.\\.5007\\)', '\\$4,775,770\\.50'],
    ['BERRY 20 DESC\' IRR TR \\(\\.\\.\\.3004\\)', '\\$1,818,646\\.70'],
    ['Joint checking \\(\\.\\.\\.0823\\)', '\\$136,724\\.37']
  ]) assert.match(read, new RegExp(`${account}[^\\n]*${value}`), `${account} travels with its own figure`);
  // Which column is which, so that the present balance can be told from the
  // available one and a day's change from a balance.
  assert.match(read, /Account {2}\| {2}Type {2}\| {2}Day change {2}\| {2}Present balance {2}\| {2}Available balance/);
  // A row whose only figures are zero still says the account is there: an
  // account that vanishes from a reading looks exactly like one that closed.
  assert.match(read, /CELSIE LLC \(\.\.\.2006\)/);
  assert.match(read, /BEDFORD BRIDGE CAPITAL, LLC \(\.\.\.4918\)/);
});

// A bank lays out its dashboard in tables — a promo panel, a rail of quick
// links, a card of tabs — long before it gets to the accounts, and a cap taken
// as "the first twelve tables in the document" spent every slot on that
// furniture. The twelve tables worth keeping are the point; the ones ahead of
// them cost a slot only if they carry a figure.
test('layout tables ahead of the accounts do not use up the table limit', () => {
  const furniture = Array.from({length: 12}, (_, panel) => ({rows: [
    cells([`Quick links ${panel}`]),
    cells(['Open an account', 'Learn how'])
  ]}));
  const accounts = {rows: [
    cells(['Account', 'Balance']),
    cells(['Roth IRA (...4144)', '$412,880.17']),
    cells(['Joint checking (...0823)', '$136,724.37'])
  ]};
  const page = inPage(pageOf({tables: [...furniture, accounts], text: 'Accounts'}), HERE);
  assert.equal(page.tables.length, 1, 'a table with no figure in it takes no slot');
  assert.match(page.tables[0], /Roth IRA \(\.\.\.4144\) {2}\| {2}\$412,880\.17/);
  assert.match(page.tables[0], /Joint checking \(\.\.\.0823\) {2}\| {2}\$136,724\.37/);
  // And the cap itself still holds, counted in tables that carry figures.
  const many = Array.from({length: 20}, (_, account) => ({rows: [
    cells([`Account ${account}`, `$${account + 1},000.00`])
  ]}));
  assert.equal(inPage(pageOf({tables: many, text: 'Accounts'}), HERE).tables.length, 12);
});

// The same account list, built the way a bank actually builds one. Chase's
// overview lays its accounts out in divs carrying the roles that say what they
// are — role="table" over role="row" over role="cell" — and never a <table>
// element. To innerText that is one line per cell, so an account's name, its
// type, its day's change and its balance arrive as four unrelated lines; put
// back together by the lines-above rule they come out crossed, a figure under a
// repeat of the name above it and a name under the wrong column. A page holding
// twenty accounts then offers up its summary panel, because the panel is the
// only part of it still legible — which is exactly what a reading of it
// returned: three totals by kind and not one account.
const cellOf = text => ({innerText: text, closest: () => null});
const gridOf = rows => {
  const made = rows.map(list => {
    const cells = list.map(cellOf);
    const row = {querySelectorAll: selector => /cell|columnheader|rowheader/.test(selector) ? cells : []};
    cells.forEach(cell => {cell.closest = selector => /row/.test(selector) ? row : null;});
    return row;
  });
  const grid = {querySelectorAll: selector => /row/.test(selector) ? made : []};
  made.forEach(row => {row.closest = selector => /table|grid/.test(selector) ? grid : null;});
  return grid;
};
test('a grid of divs that says it is a table is read as one', () => {
  const page = inPage(pageOf({
    tables: [
      gridOf([
        ['Account', 'Type/Strategy', 'Day change', 'Account value'],
        ['BERRY 2020 IRREV FAM TR (...5007)', 'Asset', '$0.00 (0.00%)', '$4,775,770.50'],
        ["BERRY 20 DESC' IRR TR (...3004)", 'JPM 1-10 Year Municipal Ladder', '$0.00 (0.00%)', '$1,818,646.70']
      ]),
      gridOf([
        ['Account', 'Type', 'Day change', 'Present balance', 'Available balance'],
        ['Joint Savings (...8917)', 'Savings', '$0.00', '$880,033.77', '$880,033.77']
      ])
    ],
    // What the page states around them: a summary panel of totals by kind, which
    // is all a reading of this page used to come back with.
    text: ['Overview', '$16,369,841.07', 'Assets', 'Bank accounts', '$2,101,804.48',
      'Investment accounts', '$14,268,036.59'].join('\n')
  }), HERE);
  assert.equal(page.tables.length, 2, 'both grids are read, though neither is a <table>');
  const read = page.tables.join('\n');
  for (const [account, value] of [
    ['BERRY 2020 IRREV FAM TR \\(\\.\\.\\.5007\\)', '\\$4,775,770\\.50'],
    ["BERRY 20 DESC' IRR TR \\(\\.\\.\\.3004\\)", '\\$1,818,646\\.70'],
    ['Joint Savings \\(\\.\\.\\.8917\\)', '\\$880,033\\.77']
  ]) assert.match(read, new RegExp(`${account}[^\\n]*${value}`), `${account} travels with its own figure`);
  assert.match(read, /Account {2}\| {2}Type {2}\| {2}Day change {2}\| {2}Present balance/,
    'and the header says which column the figure fell out of');
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

// What the exchange prints under the balances: ten coins, each with a price
// and a move, none of them held. The heading over them is the only thing that
// says so, and it states no figure — so the run arrived as coin names with
// money under them, and ether nobody owns was added to the crypto that is.
test('a watchlist is a list of prices, and none of them reach the reading as balances', () => {
  const page = inPage(pageOf({text: [
    'Crypto',
    '$15,584.96',
    'Cash',
    '$0.06',
    'Watchlist',
    'Bitcoin', 'BTC', '$88,412.30', '+1.42%',
    'Ethereum', 'ETH', '$2,576.04', '-0.86%',
    'Solana', 'SOL', '$184.22', '+3.10%'
  ].join('\n')}), HERE);
  assert.match(page.text, /Crypto\n\$15,584\.96/, 'what is held is still read');
  assert.match(page.text, /Cash\n\$0\.06/);
  assert.equal(page.text.includes('2,576.04'), false, 'a price under a coin\u2019s name is not a holding');
  assert.equal(page.text.includes('88,412.30'), false);
  assert.equal(page.text.includes('Ethereum'), false, 'and its name is not the label of anything');
  assert.equal(page.text.includes('1.42%'), false, 'a line that is only a percentage is not a figure');
});

// A broker prints the same list under its own name, in the middle of the page,
// with the account it belongs to directly underneath. The run has to end where
// the card does, or the movers table takes the balance below it with it.
test("a movers table is dropped and the account printed under it keeps its balance", () => {
  const page = inPage(pageOf({text: [
    'Top Movers (3)',
    'Symbol', 'Change %', 'Last Price $', "Day's Gain $",
    'WSTRN ALLIANCE PH...', '-0.01%', '$99.97', '-$1.40',
    'Market Closed Sep 18, 2026, 4:00 PM ET',
    'Traditional IRA -4144',
    'Net Account Value',
    '$122,666.62'
  ].join('\n')}), HERE);
  assert.equal(page.text.includes('99.97'), false, 'a last price is market data, whoever prints it');
  assert.match(page.text, /Traditional IRA -4144\nNet Account Value\n\$122,666\.62/);
});

// A site names its market pages in the header of every page it serves, the
// owner's included. A word in a nav bar cannot swallow the balances under it.
test('a market word in the navigation does not take the balances below it', () => {
  const page = inPage(pageOf({text: ['Prices', 'Explore', 'Total balance', '$15,585.02'].join('\n')}), HERE);
  assert.match(page.text, /Total balance\n\$15,585\.02/);
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

// A wealth manager's dashboard is a grid, not a stack of cards: one row per
// account, grouped under the trust or the joint title that holds it, with
// three money columns against every row — what it holds, the cash inside it,
// and the day's move. The rows carry all of that already, and the text pass
// then said every figure over again as a bare line under a repeat of the
// account's name, with nothing saying which of the three columns it fell out
// of. Twenty-eight accounts arrived as eighty-four figures, the reading ran
// past what it was allowed to say, and a page stating $26.9M came back as
// nothing at all.
test('a grid of accounts is read once, from its rows, and the day’s move is not a balance', () => {
  const group = (name, total) => [name, total, '$1,000.00', '-$500.00', '-0.10%'];
  const row = (number, label, value) => [number, label, value, '$2,000.00', '-$300.00', '-0.07%'];
  const grid = [
    ['Joint Accounts', '$16,976,026.12'],
    ['Descendants Tst', '$4,048,694.16']
  ];
  const holdings = [
    ['Y1 60033', 'Brokerage', '$8,454,037.54'],
    ['Y1 60184', 'Core Munis', '$4,020,675.81'],
    ['Y1 60187', 'Brokerage', '$965,857.19']
  ];
  const text = [
    'Accounts', 'Investment Accounts', 'Total value', '$26,925,388.90', 'Cash Available', '$211,621.55',
    'Change In Value', '-$27,467.55', '-0.10%',
    ...grid.flatMap(([name, total]) => group(name, total)),
    ...holdings.flatMap(([number, label, value]) => row(number, label, value))
  ].join('\n');
  const table = {rows: [
    cells(['', '', 'Total value', 'Cash Available', 'Change In Value']),
    cells(['Investment Accounts', '$26,925,388.90', '$211,621.55', '-$27,467.55 -0.10%']),
    ...grid.map(([name, total]) => cells([name, total, '$1,000.00', '-$500.00 -0.10%'])),
    ...holdings.map(([number, label, value]) => cells([number, label, value, '$2,000.00', '-$300.00 -0.07%']))
  ]};
  const page = inPage(pageOf({tables: [table], text}), HERE);

  // Every account is still there, in the row that names it and says which
  // column each figure came out of.
  assert.match(page.tables[0], /Total value {2}\| {2}Cash Available {2}\| {2}Change In Value/);
  for (const [number, label, value] of holdings)
    assert.ok(page.tables[0].includes(`${number}  |  ${label}  |  ${value}`),
      `${number} keeps its label and its total value`);
  assert.match(page.tables[0], /Joint Accounts {2}\| {2}\$16,976,026\.12/, 'the title a group of accounts is held under states its own total');

  // And said once. A figure the row already carried is not repeated loose.
  for (const figure of ['$8,454,037.54', '$4,020,675.81', '$965,857.19', '$16,976,026.12', '$26,925,388.90'])
    assert.equal(page.text.includes(figure), false, `${figure} is already in its row`);
  // The day's move is not money the owner has, whichever side of the page
  // writes the percentage on a line of its own.
  assert.equal(page.text.includes('-$27,467.55'), false, 'a change printed above its own percentage is a move, not a balance');
  assert.ok(page.text.length < 400, `the text beside the rows narrowed to ${page.text.length} characters`);
});
// A card's own rewards page states what the card earns, and none of it is
// money. "8x on Chase Travel" carries no currency symbol, no cents and no
// grouped thousand, so it was dropped before the reading saw it; "4x on flights
// and hotels booked direct" survived only by the accident of a comma in the
// points printed beside it. The one line saying what the card earns reached the
// reading by luck or not at all.
test('a rewards page keeps the line that states an earning rate', () => {
  const page = inPage(pageOf({text: [
    'J.P. Morgan Reserve (...4411)',
    'Ultimate Rewards',
    '204,812 pts',
    '8x on Chase Travel',
    '0 pts',
    '4x on flights and hotels booked direct',
    '3x on dining',
    'All other earnings',
    '1x',
    'View rewards activity'
  ].join('\n')}), HERE);
  assert.equal(page.filtered, true);
  assert.match(page.text, /8x on Chase Travel/);
  assert.match(page.text, /4x on flights and hotels booked direct/);
  assert.match(page.text, /3x on dining/);
  assert.match(page.text, /^1x$/m, 'and the base rate, which is a number and a letter');
  assert.match(page.text, /204,812 pts/, 'the points balance still comes with it');
  assert.equal(page.text.includes('View rewards activity'), false, 'the site’s own links are still furniture');
  // One program name over a run of rates is a heading said once, not once per
  // rate under it.
  assert.equal(page.text.match(/Ultimate Rewards/g).length, 1);
});

test('a cash back page keeps a percent back, and a bare percentage is still a move', () => {
  const page = inPage(pageOf({text: [
    'Blue Cash Preferred', 'Reward Dollars', '$125.49',
    '6% cash back at U.S. supermarkets',
    '3% back at U.S. gas stations',
    '1 point per dollar on everything else'
  ].join('\n')}), HERE);
  assert.match(page.text, /6% cash back at U\.S\. supermarkets/);
  assert.match(page.text, /3% back at U\.S\. gas stations/);
  assert.match(page.text, /1 point per dollar on everything else/);
  assert.equal(page.text.match(/6% cash back/g).length, 1,
    'a rate kept as the name under a balance is not kept a second time as itself');
});

// The rate test earns its place on the same terms a figure does. A finance page
// has no rates on it, so it must send exactly what it sent before: a broker
// dashboard narrowed to its accounts is the case the whole filter exists for.
test('a rate test does not widen what a finance page sends', () => {
  const dashboard = () => inPage(pageOf({text: [
    'Summary', 'Updated: 03:57:45 AM ET, 09/19/2026',
    'IRA', 'Account number ending in 306', 'IRA $412,880.17 $0.00 0.00%',
    'Checking', 'Account number ending in 638', 'Checking $8,420.11 $0.00 0.00%',
    'Portfolio Insights is a snapshot of your portfolio’s performance.',
    'DJIA', 'Closed', '', '51,682.64', '0.00 (0.00%)',
    '$0', '$1M', '$2M',
    'Up to 10x more research than the last platform you used'
  ].join('\n')}), HERE);
  const page = dashboard();
  assert.match(page.text, /IRA \$412,880\.17/);
  assert.match(page.text, /Checking \$8,420\.11/);
  assert.equal(page.text.includes('51,682.64'), false, 'an index quote is still not a balance');
  assert.equal(page.text.includes('Portfolio Insights'), false);
  assert.equal(/^\$1M$/m.test(page.text), false, 'a chart axis is still not a balance');
  // Marketing prose is not an earning rate. "Up to 10x more research than the
  // last platform you used" states the same shape of figure as "4x on flights
  // and hotels booked direct", and only the second of them is the subject of
  // its line, so only the second is kept.
  assert.equal(page.text.includes('10x more research'), false, 'a sentence with a multiplier in it is still prose');
  assert.ok(page.text.length < 300, `narrowed to ${page.text.length} characters`);
});
