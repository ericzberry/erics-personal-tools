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

test('the page reader takes visible text and table rows, and nothing else', () => {
  // A stand-in for the page: only what readAccountPage actually touches.
  const cell = text => ({innerText: text});
  const row = cells => ({cells: cells.map(cell)});
  const table = {rows: [row(['Account', 'Balance']), row(['Brokerage', '$1,284,300.55'])]};
  const document = {
    querySelectorAll: selector => selector === 'table' ? [table] : [],
    title: '  Positions  ',
    body: {innerText: 'Brokerage $1,284,300.55\n\n\n\nCash $12.00'}
  };
  const location = {href: 'https://broker.example/positions', host: 'broker.example'};
  // Injected into the page by Chrome, so it must work from its source text
  // alone with no closure over this module.
  const page = Function('document', 'location', `return (${readAccountPage.toString()})()`)(document, location);
  assert.equal(page.host, 'broker.example');
  assert.equal(page.title, 'Positions');
  assert.equal(page.tables.length, 1);
  assert.match(page.tables[0], /Brokerage {2}\| {2}\$1,284,300\.55/);
  assert.ok(!/\n{3,}/.test(page.text), 'runs of blank lines are collapsed');
  assert.ok(MAX_PAGE_TEXT > 0);
});
