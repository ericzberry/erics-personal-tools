import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
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

test('a PDF with no text layer says so instead of returning nothing quietly', async () => {
  // A structurally valid PDF whose only stream is not text content.
  const empty = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  const result = await pdfText(empty);
  assert.equal(result.confidence, 'none');
  assert.match(result.note, /scan|no text layer/i);
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

test('a page whose figures this filter cannot see is sent whole rather than gutted', () => {
  const page = inPage(pageOf({text: 'Balance\nabout a thousand pounds\nSettings'}), HERE);
  assert.equal(page.filtered, false);
  assert.match(page.text, /about a thousand pounds/);
});
