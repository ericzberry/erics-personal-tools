#!/usr/bin/env node
// Reads and appends the properties in the Finance ledger, so a Zestimate can
// reach the app without being retyped into it.
//
// A property is not a figure. A figure is a portfolio, an asset class, a date
// and an amount; a house is an address, and what it is worth is only half of
// what is worth knowing about it — the other half is what is still owed. So the
// ledger keeps a property row and one dated valuation per reading, and this
// script writes those two rather than the one `ledger.mjs` writes.
//
// The same three constraints shape it, and they are the app's own:
//  - It cannot destroy anything. There is no delete, and a valuation is only
//    ever written under its own property and date.
//  - It never guesses which house or whose. An ambiguous name is an error.
//  - It writes nothing until asked twice. `save` previews by default; only
//    `--confirm` sends a request.
import {readFileSync} from 'node:fs';
import {die, money, api, ledger} from './api.mjs';
import {VALUE_SOURCES,valueSourceById,valueSourceLabel,registrationLabel,
  propertyRef,valuationRef,propertiesOn,matchKey,isDate}
  from '../chrome-sidebar/src/finance-data.js';

// A Zestimate that moves this far in a month is a misread figure or the wrong
// house, so the plan says so out loud before saving.
const JUMP = 0.25;
const SOURCES = VALUE_SOURCES.map(entry => entry.id).join(', ');

// Exact number, then exact name, then a unique substring. Several candidates is
// a stop, never a pick: two houses on the same street are two houses.
function pick(candidates, reference, what) {
  if (candidates.length > 1) throw Error(`“${reference}” matches ${candidates.length} ${what}: ${candidates.map(entry => entry.name).join(' · ')}. Use its number instead.`);
  return candidates[0] || null;
}
function resolve(reference, list, {prefix, what}) {
  const key = matchKey(reference);
  const found = list.find(entry => `${prefix}${entry.number}` === reference || String(entry.number) === String(reference))
    || pick(list.filter(entry => matchKey(entry.name) === key), reference, what)
    || pick(list.filter(entry => key.length >= 3 && matchKey(entry.name).includes(key)), reference, what);
  if (!found) throw Error(`No ${what.replace(/s$/, '')} matches “${reference}”. Run “list” to see what is there.`);
  return found;
}

async function listCommand(flags) {
  const current = await ledger();
  if (flags.has('--json')) return console.log(JSON.stringify({properties: current.properties, valuations: current.valuations}, null, 2));
  if (!current.properties.length) return console.log('No properties in the ledger.');
  const held = propertiesOn([...current.properties, ...current.valuations]);
  for (const entry of held) {
    const portfolio = current.portfolios.find(item => item.number === entry.property.portfolio);
    const currency = portfolio?.currency || 'USD';
    console.log(`r${entry.property.number}  ${entry.property.name}`);
    console.log(`      ${portfolio ? `${portfolio.name} [${registrationLabel(portfolio.kind)}]` : 'no portfolio'}`);
    if (!entry.current) console.log('      not valued yet');
    else {
      console.log(`      ${money(entry.value, currency)}  ${valueSourceLabel(entry.source)}  as of ${entry.current.asOf}  (${entry.history.length} reading${entry.history.length === 1 ? '' : 's'})`);
      if (entry.debt) console.log(`      owed ${money(entry.debt, currency)}   equity ${money(entry.equity, currency)}`);
    }
    if (entry.property.link) console.log(`      ${entry.property.link}`);
    console.log('');
  }
  const total = held.reduce((sum, entry) => sum + entry.equity, 0);
  console.log(`${held.length} propert${held.length === 1 ? 'y' : 'ies'}, ${money(total)} of equity.`);
}

function plan(entries, current) {
  const held = propertiesOn([...current.properties, ...current.valuations]);
  const made = [];
  return entries.map((entry, index) => {
    const where = `entry ${index + 1}${entry.property || entry.address ? ` (${entry.property || entry.address})` : ''}`;
    if (!isDate(entry.asOf || '')) throw Error(`${where}: "asOf" must be a YYYY-MM-DD date read from the source. Never assume today for a dated reading.`);
    for (const key of ['value', 'debt']) {
      if (entry[key] === undefined) continue;
      if (!Number.isFinite(Number(entry[key])) || Number(entry[key]) < 0) throw Error(`${where}: "${key}" must be a positive number with no symbols or separators.`);
    }
    if (entry.value === undefined) throw Error(`${where}: "value" is what the property is worth on that date.`);
    const source = valueSourceById(String(entry.source || 'zestimate').toLowerCase());
    if (!source) throw Error(`${where}: "source" must be one of ${SOURCES}.`);
    const value = Math.round(Number(entry.value) * 100) / 100;
    let property, portfolio, history = [];
    if (entry.create) {
      if (!entry.address || !entry.portfolio) throw Error(`${where}: a new property needs "address" and "portfolio".`);
      portfolio = resolve(entry.portfolio, current.portfolios, {prefix: 'p', what: 'portfolios'});
      property = made.find(item => matchKey(item.name) === matchKey(entry.address))
        || {number: Math.max(0, ...current.properties.map(item => item.number), ...made.map(item => item.number)) + 1,
            name: entry.address, portfolio: portfolio.number, link: entry.link || '', isNew: true};
      if (!made.includes(property)) made.push(property);
    } else {
      property = resolve(entry.property, current.properties, {prefix: 'r', what: 'properties'});
      portfolio = current.portfolios.find(item => item.number === property.portfolio);
      history = held.find(item => item.property.number === property.number)?.history || [];
    }
    const replaced = history.find(reading => reading.asOf === entry.asOf) || null;
    const previous = history.find(reading => reading.asOf < entry.asOf) || null;
    // A mortgage the reading did not restate has not been paid off. A refresh
    // that knows the new Zestimate and nothing about the loan carries the last
    // known balance forward and says on the row that it did — filing 0 instead
    // would erase a mortgage, and nothing afterwards would show that it had.
    const carried = entry.debt === undefined && !!previous?.debt;
    const debt = entry.debt === undefined
      ? (previous?.debt ?? 0)
      : Math.round(Number(entry.debt) * 100) / 100;
    const jump = previous && previous.value > 0 ? Math.abs(value - previous.value) / previous.value : 0;
    return {entry, property, portfolio, value, debt, source, replaced, previous, carried, jumped: jump > JUMP};
  });
}

async function saveCommand([file], flags) {
  if (!file) die('Usage: property.mjs save <file.json> [--confirm]');
  let entries;
  try { entries = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { die(`Could not read ${file}: ${error.message}`); }
  if (!Array.isArray(entries) || !entries.length) die('The file must hold a non-empty JSON array of valuations.');
  const current = await ledger();
  let steps;
  try { steps = plan(entries, current); } catch (error) { die(error.message); }
  for (const step of steps) {
    const currency = step.portfolio?.currency || 'USD';
    const head = `${step.property.isNew ? 'NEW PROPERTY' : `r${step.property.number}`}  ${step.property.name}`;
    console.log(`${(step.replaced ? 'AMEND' : 'APPEND').padEnd(7)} ${head}`);
    console.log(`        ${step.portfolio?.name || 'no portfolio'} · ${step.source.label}`);
    console.log(`        ${step.entry.asOf}  ${money(step.value, currency)}${step.debt ? `   owed ${money(step.debt, currency)}   equity ${money(step.value - step.debt, currency)}` : ''}`);
    if (step.replaced) console.log(`        replaces ${money(step.replaced.value, currency)}${step.replaced.debt ? ` / owed ${money(step.replaced.debt, currency)}` : ''}`);
    else if (step.previous) console.log(`        last: ${step.previous.asOf} ${money(step.previous.value, currency)}`);
    if (step.carried) console.log(`        carried the ${money(step.previous.debt, currency)} owed from ${step.previous.asOf} — give "debt" to change it.`);
    if (step.jumped) console.log('        CHECK   this moves more than 25% from the last reading — make sure it is the same house before confirming.');
  }
  if (!flags.has('--confirm')) return console.log(`\n${steps.length} valuation${steps.length === 1 ? '' : 's'} planned. Nothing was written. Re-run with --confirm to save.`);
  const made = new Set();
  for (const step of steps) {
    if (step.property.isNew && !made.has(step.property.number)) {
      await api(`/v1/finance/${propertyRef(step.property.number)}`, {method: 'PUT', body: {row: 'property',
        number: step.property.number, portfolio: step.property.portfolio, name: step.property.name,
        link: step.property.link, revision: null}});
      made.add(step.property.number);
    }
    const value = {row: 'valuation', property: step.property.number, asOf: step.entry.asOf,
      value: step.value, debt: step.debt, source: step.source.code};
    await api(`/v1/finance/${valuationRef(value)}`, {method: 'PUT', body: {...value, revision: step.replaced?.revision ?? null}});
    console.log(`saved   ${step.property.name} · ${step.entry.asOf}`);
  }
  console.log(`\n${steps.length} valuation${steps.length === 1 ? '' : 's'} saved.`);
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter(argument => argument.startsWith('--')));
const args = rest.filter(argument => !argument.startsWith('--'));
const commands = {list: listCommand, save: saveCommand};
if (!commands[command]) die('Usage: property.mjs <list|save> [arguments] [--json] [--confirm]');
try { await (command === 'list' ? listCommand(flags) : commands[command](args, flags)); }
catch (error) { die(error.message); }
