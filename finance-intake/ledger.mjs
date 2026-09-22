#!/usr/bin/env node
// Reads and appends to the Finance ledger over the Worker API, so a statement
// can be turned into dated figures without retyping anything into the app.
//
// The ledger holds one amount per portfolio, asset class and date — not one
// record per account. A statement listing forty holdings is filed as the few
// class totals it adds up to, and the adding up is yours to do and to show,
// never this script's and never a model's.
//
// Three constraints shape this file, and they are the app's own:
//  - It cannot destroy anything. There is no delete, and a figure is only ever
//    written under its own portfolio, class and date.
//  - It never guesses where a figure belongs. A portfolio named ambiguously is
//    an error, not a choice.
//  - It writes nothing until asked twice. `save` previews by default; only
//    `--confirm` sends a request.
//
// The token and the request wrapper are `api.mjs`, shared with the other
// scripts here so the credential is resolved in one place.
import {die, money, api, ledger, readFigureFile, importNumber, fileImport, traceLine, describeImport} from './api.mjs';
import {ASSET_CLASSES,REGISTRATIONS,classById,classLabel,registrationLabel,markRef,portfolioRef,heldOn,matchKey,isDate,
  sameMoney,seenBefore,importOf,importTrail,importKindById,trailSubject,firmId}
  from '../chrome-sidebar/src/finance-data.js';

// A figure that moves this far in one step is usually a misread decimal or a
// column read off the wrong row, so the plan says so out loud before saving.
const JUMP = 0.4;
const CLASSES = ASSET_CLASSES.map(entry => entry.id).join(', ');

// Exact number, then exact name, then a unique substring. Several candidates is
// a stop, never a pick: the wrong portfolio is worse than no update.
function resolve(reference, portfolios) {
  const key = matchKey(reference);
  const found = portfolios.find(portfolio => `p${portfolio.number}` === reference || String(portfolio.number) === String(reference))
    || pick(portfolios.filter(portfolio => matchKey(portfolio.name) === key), reference)
    || pick(portfolios.filter(portfolio => key.length >= 3 && matchKey(portfolio.name).includes(key)), reference);
  if (!found) throw Error(`No portfolio matches “${reference}”. Run “list” to see the ledger, or add "create": true to make a new one.`);
  return found;
}
function pick(candidates, reference) {
  if (candidates.length > 1) throw Error(`“${reference}” matches ${candidates.length} portfolios: ${candidates.map(portfolio => portfolio.name).join(', ')}. Use its number instead.`);
  return candidates[0] || null;
}
const classOf = (value, where) => {
  const found = classById(String(value || '').toLowerCase());
  if (!found) throw Error(`${where}: "class" must be one of ${CLASSES}.`);
  return found;
};
const historyOf = (marks, portfolio, code) => marks
  .filter(mark => mark.portfolio === portfolio.number && mark.class === code)
  .sort((a, b) => b.asOf.localeCompare(a.asOf));
const firmed = mark => mark.firm ? ` @${firmId(mark.firm)}` : '';

async function listCommand(flags) {
  const {portfolios, marks} = await ledger();
  if (flags.has('--json')) return console.log(JSON.stringify({portfolios, marks}, null, 2));
  if (!portfolios.length) return console.log('The ledger is empty.');
  const live = heldOn(marks);
  for (const portfolio of portfolios) {
    const rows = live.filter(mark => mark.portfolio === portfolio.number);
    const total = rows.reduce((sum, mark) => sum + mark.amount, 0);
    console.log(`p${portfolio.number}  ${portfolio.name} — ${money(total, portfolio.currency)}  [${registrationLabel(portfolio.kind)}]`);
    for (const mark of rows.sort((a, b) => a.class - b.class)) {
      const dates = historyOf(marks, portfolio, mark.class).length;
      console.log(`  ${classLabel(mark.class).padEnd(16)} ${money(mark.amount, portfolio.currency).padStart(16)}  as of ${mark.asOf}  (${dates} date${dates === 1 ? '' : 's'})`);
    }
    console.log('');
  }
  console.log(`${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'}, ${marks.length} figure${marks.length === 1 ? '' : 's'}.`);
}

// Each figure with where it came from: the import that last wrote it.
async function showCommand([reference]) {
  if (!reference) die('Usage: ledger.mjs show <portfolio number or name>');
  const {records, portfolios, marks} = await ledger();
  const portfolio = resolve(reference, portfolios);
  console.log(`p${portfolio.number}  ${portfolio.name}  [${registrationLabel(portfolio.kind)} · ${portfolio.currency}]\n`);
  for (const code of [...new Set(marks.filter(mark => mark.portfolio === portfolio.number).map(mark => mark.class))].sort((a, b) => a - b)) {
    console.log(classLabel(code));
    for (const mark of historyOf(marks, portfolio, code))
      console.log(`  ${mark.asOf}  ${money(mark.amount, portfolio.currency).padStart(16)}${firmed(mark).padEnd(12)}  ← ${describeImport(importOf(records, mark.importId))}`);
  }
}

// The imports, newest first, and what became of each figure they saved. With a
// portfolio, only the lines that touch it — the answer to "how did this
// portfolio's figures get here, and what did each correction overwrite".
async function trailCommand([reference], flags) {
  const {records, portfolios} = await ledger();
  const portfolio = reference ? resolve(reference, portfolios) : null;
  const touches = line => !portfolio || (/^\d/.test(line.ref) && line.ref.split('-')[0] === String(portfolio.number));
  const trail = importTrail(records).map(entry => ({...entry, lines: entry.lines.filter(touches)})).filter(entry => entry.lines.length);
  if (flags.has('--json')) return console.log(JSON.stringify(trail, null, 2));
  if (!trail.length) return console.log(portfolio ? `Nothing traced for ${portfolio.name}.` : 'No imports yet.');
  for (const entry of trail) {
    console.log(`${`i${entry.number}`.padEnd(15)} ${describeImport(entry)}${entry.firm ? ` @${firmId(entry.firm)}` : ''}${entry.print ? `  print ${entry.print}` : ''}`);
    for (const line of entry.lines) {
      const subject = trailSubject(line.ref, records, {firmName: firmId});
      const state = line.state === 'current' ? '' : line.state === 'removed' ? '  (since removed)'
        : `  (since replaced by ${line.by ? `i${line.by.number}` : 'an untraced write'})`;
      console.log(`    ${subject.asOf}  ${subject.what}  ${money(line.amount)}${state}`);
      if (line.read !== undefined) console.log(`        read as ${money(line.read)}`);
      if (line.was !== undefined) console.log(`        replaced ${money(line.was)}${line.wasImport ? ` from i${line.wasImport}` : ''}`);
      if (line.from?.length) console.log(`        from: ${line.from.join(' · ')}`);
    }
    if (entry.note) console.log(`    note: ${entry.note}`);
    console.log('');
  }
}

function plan(entries, {portfolios, marks, records}, {firm = 0} = {}) {
  const made = [];
  return entries.map((entry, index) => {
    const where = `entry ${index + 1}${entry.portfolio ? ` (${entry.portfolio})` : ''}`;
    if (!Number.isFinite(Number(entry.amount)) || Number(entry.amount) < 0) throw Error(`${where}: "amount" must be a positive number with no symbols or separators.`);
    if (!isDate(entry.asOf || '')) throw Error(`${where}: "asOf" must be a YYYY-MM-DD date read from the source. Never assume today for a dated document.`);
    const amount = Math.round(Number(entry.amount) * 100) / 100;
    const code = classOf(entry.class, where).code;
    let portfolio;
    if (entry.create) {
      if (!entry.name || !entry.registration) throw Error(`${where}: a new portfolio needs "name" and "registration" (${REGISTRATIONS.map(item => item.id).join(', ')}).`);
      const kind = REGISTRATIONS.find(item => item.id === entry.registration);
      if (!kind) throw Error(`${where}: "registration" must be one of ${REGISTRATIONS.map(item => item.id).join(', ')}.`);
      portfolio = made.find(item => matchKey(item.name) === matchKey(entry.name))
        || {number: Math.max(0, ...portfolios.map(item => item.number), ...made.map(item => item.number)) + 1,
            name: entry.name, kind: kind.code, currency: (entry.currency || 'USD').toUpperCase(), isNew: true};
      if (!made.includes(portfolio)) made.push(portfolio);
    } else portfolio = resolve(entry.portfolio, portfolios);
    const history = portfolio.isNew ? [] : historyOf(marks, portfolio, code);
    // Only a figure at the same firm is the one this would write over: another
    // firm's figure for the same date is another pile of money, and its own row.
    const replaced = history.find(mark => mark.asOf === entry.asOf && (mark.firm || 0) === firm) || null;
    const previous = history[0] || null;
    const jump = previous && previous.amount > 0 ? Math.abs(amount - previous.amount) / previous.amount : 0;
    const twin = portfolio.isNew ? null : sameMoney({portfolio: portfolio.number, class: code, firm, asOf: entry.asOf, amount}, records);
    const from = (Array.isArray(entry.from) ? entry.from : []).filter(item => typeof item === 'string');
    return {entry, amount, code, portfolio, replaced, previous, twin, from, jumped: jump > JUMP};
  });
}

async function saveCommand([file], flags) {
  if (!file) die('Usage: ledger.mjs save <file.json> [--confirm]');
  const {entries, source} = await readFigureFile(file);
  const current = await ledger();
  let steps;
  try { steps = plan(entries, current, {firm: source.firm}); } catch (error) { die(error.message); }
  const seen = seenBefore(current.records, source.print);
  if (seen) console.log(`ALREADY IMPORTED  this file was filed as i${seen.number} (${describeImport(seen)}). Confirming files it again.\n`);
  for (const step of steps) {
    const currency = step.portfolio.currency;
    const mark = `${step.portfolio.isNew ? 'NEW PORTFOLIO' : `p${step.portfolio.number}`}  ${step.portfolio.name} · ${classLabel(step.code)}`;
    const verb = step.replaced ? 'AMEND' : 'APPEND';
    console.log(`${verb.padEnd(7)} ${mark}\n        ${step.entry.asOf}  ${money(step.amount, currency)}${step.replaced ? `   (replaces ${money(step.replaced.amount, currency)})` : ''}${step.previous ? `   last: ${step.previous.asOf} ${money(step.previous.amount, currency)}` : ''}`);
    if (step.jumped) console.log('        CHECK   this moves more than 40% from the last figure — re-read the source before confirming.');
    if (step.twin) console.log(`        DUPLICATE?  the same amount is already filed${step.twin.firm ? ` @${firmId(step.twin.firm)}` : ''} as of ${step.twin.asOf}, from ${describeImport(importOf(current.records, step.twin.importId))} — the same money read twice is counted twice.`);
  }
  if (!flags.has('--confirm')) return console.log(`\n${steps.length} figure${steps.length === 1 ? '' : 's'} planned. Nothing was written. Re-run with --confirm to save.`);
  // Every figure is saved under one import, written last so it lists only
  // what landed — including a run that stops half-way on an error.
  const number = importNumber(current.imports);
  const trail = {kind: importKindById('intake').code, firm: source.firm, print: source.print, name: source.name, lines: [], made: []};
  const made = new Set();
  try {
    for (const step of steps) {
      if (step.portfolio.isNew && !made.has(step.portfolio.number)) {
        await api(`/v1/finance/p${step.portfolio.number}`, {method: 'PUT', body: {row: 'portfolio', number: step.portfolio.number,
          name: step.portfolio.name, kind: step.portfolio.kind, currency: step.portfolio.currency, revision: null}});
        made.add(step.portfolio.number);trail.made.push(portfolioRef(step.portfolio.number));
      }
      const value = {row: 'mark', portfolio: step.portfolio.number, class: step.code, firm: source.firm, asOf: step.entry.asOf, amount: step.amount};
      const line = traceLine(markRef(value), step.amount, step.replaced, step.from.length ? {from: step.from} : {});
      await api(`/v1/finance/${markRef(value)}`, {method: 'PUT', body: {...value, importId: number, revision: step.replaced ? String(Math.round(step.replaced.amount * 100)) : null}});
      trail.lines.push(line);
      console.log(`saved   ${step.portfolio.name} · ${classLabel(step.code)} · ${step.entry.asOf}`);
    }
  } finally {
    const filed = await fileImport(number, trail);
    if (filed) console.log(`\ntraced  i${filed.number}${source.name ? ` — ${source.name}` : ''}`);
  }
  console.log(`\n${steps.length} figure${steps.length === 1 ? '' : 's'} saved.`);
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter(argument => argument.startsWith('--')));
const args = rest.filter(argument => !argument.startsWith('--'));
const commands = {list: listCommand, show: showCommand, save: saveCommand, trail: trailCommand};
if (!commands[command]) die('Usage: ledger.mjs <list|show|trail|save> [arguments] [--json] [--confirm]');
try { await (command === 'list' ? listCommand(flags) : commands[command](args, flags)); }
catch (error) { die(error.message); }
