#!/usr/bin/env node
// Reads and appends to the Finance ledger over the Worker API, so a statement
// can be turned into dated snapshots without retyping anything into the app.
//
// Three constraints shape this file, and they are the same ones the app itself
// enforces (see docs/PROTECTED_SECTIONS.md):
//  - It cannot destroy anything. There is no delete, and a snapshot is only
//    ever appended under its as-of date. Existing history is never rewritten.
//  - It never guesses which record a figure belongs to. A name that matches
//    more than one record is an error, not a choice.
//  - It writes nothing until asked twice. `save` previews by default; only
//    `--confirm` sends a request. Arithmetic and totals stay in the app.
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.TOOLS_API_URL || 'https://erics-tools-api.ezberry.workers.dev').replace(/\/$/, '');
const KEYCHAIN = {service: 'erics-tools-api', account: 'API_TOKEN'};
const TOKEN_FILE = join(HERE, 'credentials', 'api-token');
// A figure that moves this far in one step is usually a misread decimal or a
// column read off the wrong row, so the plan says so out loud before saving.
const JUMP = 0.4;

const die = message => { console.error(message); process.exit(1); };
const matchKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', {style: 'currency', currency, maximumFractionDigits: 2}).format(value); }
  catch { return `${Number(value).toLocaleString('en-US')} ${currency}`; }
};

// The bearer token is the root credential for the whole API — it is what
// protects the encrypted D1 records, so it cannot itself live in D1. The login
// keychain is the right home for it: encrypted at rest by macOS, readable
// without a prompt by the tool that stored it, and nowhere in the repository.
// The file is a fallback for a machine without a keychain, and says so.
function keychainToken() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN.service, '-a', KEYCHAIN.account, '-w'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch { return ''; }
}
function token() {
  const found = process.env.TOOLS_API_TOKEN?.trim()
    || keychainToken()
    || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
  if (!found) die(`No API token found. In Terminal, store it in the login keychain:\n\n  security add-generic-password -s ${KEYCHAIN.service} -a ${KEYCHAIN.account} -U -w\n\n-w must come last: it then prompts twice for the token instead of taking a\nvalue, so nothing lands in shell history. Nothing echoes as you paste.\nSee README.md for the alternatives.`);
  if (found.length < 32) die('The stored API token is under 32 characters, so the API will reject it. Store the full token.');
  return found;
}

async function api(path, {method = 'GET', body} = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {Authorization: `Bearer ${token()}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {error: text.slice(0, 300)}; }
  if (!response.ok) throw Object.assign(Error(parsed.error || `${response.status} ${response.statusText}`), {status: response.status});
  return parsed;
}

const records = async () => (await api('/v1/finance')).records
  .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base', numeric: true}));

const history = record => { try { return JSON.parse(record.history || '[]'); } catch { return []; } };

// Exact id, then exact name, then a unique substring. Several candidates is a
// stop, never a pick: the wrong account is worse than no update.
function resolve(reference, list) {
  const key = matchKey(reference);
  const found = list.find(record => record.id === reference)
    || pick(list.filter(record => matchKey(record.name) === key), reference)
    || pick(list.filter(record => key.length >= 4 && (matchKey(record.name).includes(key) || matchKey(`${record.name} ${record.institution || ''}`).includes(key))), reference);
  if (!found) throw Error(`No record matches “${reference}”. Run “list” to see the ledger, or add "create": true to make a new record.`);
  return found;
}
function pick(candidates, reference) {
  if (candidates.length > 1) throw Error(`“${reference}” matches ${candidates.length} records: ${candidates.map(record => `${record.name}${record.institution ? ` (${record.institution})` : ''}`).join(', ')}. Use the record id instead.`);
  return candidates[0] || null;
}

async function listCommand(flags) {
  const list = await records();
  if (flags.has('--json')) return console.log(JSON.stringify(list, null, 2));
  if (!list.length) return console.log('The ledger is empty.');
  for (const record of list) {
    const detail = [record.institution, record.owner, `${history(record).length} snapshot${history(record).length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    console.log(`${record.id}\n  ${record.name} — ${money(record.value, record.currency)} as of ${record.asOf}  [${record.kind}]\n  ${detail}\n`);
  }
  console.log(`${list.length} record${list.length === 1 ? '' : 's'}.`);
}

async function showCommand([reference]) {
  if (!reference) die('Usage: ledger.mjs show <record id or name>');
  const record = resolve(reference, await records());
  const {history: raw, secret, ...rest} = record;
  console.log(JSON.stringify(rest, null, 2));
  console.log('\nHistory (newest first):');
  for (const entry of history(record)) console.log(`  ${entry.asOf}  ${money(entry.value, record.currency)}${entry.source ? `  · ${entry.source}` : ''}`);
}

// Fields a new record may set. Everything else the app owns (history, the
// current value, and the sealed account details, which need the passkey).
const NEW_FIELDS = ['kind', 'name', 'institution', 'owner', 'currency', 'ownership', 'liquidity', 'rate', 'commitment', 'unfunded', 'tags', 'notes'];

function plan(entries, list) {
  return entries.map((entry, index) => {
    const where = `entry ${index + 1}${entry.name || entry.match ? ` (${entry.match || entry.name})` : ''}`;
    if (!Number.isFinite(Number(entry.value)) || Number(entry.value) < 0) throw Error(`${where}: "value" must be a positive number with no symbols or separators.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.asOf || '')) throw Error(`${where}: "asOf" must be a YYYY-MM-DD date read from the source. Never assume today for a dated document.`);
    const value = Math.round(Number(entry.value) * 100) / 100;
    if (entry.create) {
      if (!entry.name || !entry.kind) throw Error(`${where}: a new record needs "name" and "kind".`);
      return {entry, value, create: true, body: {...Object.fromEntries(NEW_FIELDS.filter(key => entry[key] !== undefined).map(key => [key, entry[key]])), value, asOf: entry.asOf, source: entry.source || '', revision: null}};
    }
    const record = resolve(entry.match || entry.name || entry.id, list);
    const replaced = history(record).find(snapshot => snapshot.asOf === entry.asOf) || null;
    const previous = history(record)[0] || null;
    const jump = previous && previous.value > 0 ? Math.abs(value - previous.value) / previous.value : 0;
    return {entry, value, record, replaced, previous, jumped: jump > JUMP, body: {value, asOf: entry.asOf, source: entry.source || '', revision: record.revision}};
  });
}

function describe(step) {
  const indent = lines => lines.filter(Boolean).map(line => `       ${line}`).join('\n');
  if (step.create) return `NEW    ${step.entry.name} [${step.entry.kind}]\n${indent([
    `${money(step.value, step.entry.currency || 'USD')} as of ${step.entry.asOf}${step.entry.source ? `  · ${step.entry.source}` : ''}`,
    [step.entry.institution, step.entry.owner].filter(Boolean).join(' · ')
  ])}`;
  const move = step.previous ? `${money(step.previous.value, step.record.currency)} (${step.previous.asOf})  →  ` : '';
  return `${(step.replaced ? 'AMEND' : 'APPEND').padEnd(6)}  ${step.record.name}${step.record.institution ? ` — ${step.record.institution}` : ''}\n${indent([
    `${move}${money(step.value, step.record.currency)} as of ${step.entry.asOf}${step.entry.source ? `  · ${step.entry.source}` : ''}`,
    step.replaced ? `REPLACES the existing ${step.replaced.asOf} snapshot of ${money(step.replaced.value, step.record.currency)}.` : '',
    step.jumped ? `CHECK: a ${Math.round(Math.abs(step.value - step.previous.value) / step.previous.value * 100)}% move from the last snapshot. Confirm the figure before saving.` : ''
  ])}`;
}

async function saveCommand([file], flags) {
  if (!file) die('Usage: ledger.mjs save <snapshots.json> [--confirm]');
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { die(`Could not read ${file}: ${error.message}`); }
  const entries = Array.isArray(parsed) ? parsed : parsed.snapshots;
  if (!Array.isArray(entries) || !entries.length) die('The file must hold a JSON array of snapshots, or {"snapshots": [...]}.');

  let list = await records();
  let steps;
  try { steps = plan(entries, list); } catch (error) { die(error.message); }
  for (const step of steps) console.log(describe(step));
  if (!flags.has('--confirm')) return console.log(`\nNothing was saved. Re-run with --confirm to write ${steps.length} snapshot${steps.length === 1 ? '' : 's'}.`);

  console.log('');
  let saved = 0;
  for (const step of steps) {
    const id = step.create ? crypto.randomUUID() : step.record.id;
    const label = step.create ? step.entry.name : step.record.name;
    try {
      try {
        await api(`/v1/finance/${id}`, {method: 'PUT', body: {...step.body, id}});
      } catch (error) {
        // A revision conflict means another device saved first. Re-read that
        // record and re-plan this one entry rather than forcing the write.
        if (error.status !== 409 || step.create) throw error;
        list = await records();
        const [fresh] = plan([step.entry], list);
        await api(`/v1/finance/${id}`, {method: 'PUT', body: {...fresh.body, id}});
      }
      saved++;
      console.log(`saved  ${label} · ${step.entry.asOf}`);
    } catch (error) {
      console.error(`FAILED ${label} · ${step.entry.asOf} — ${error.message}`);
    }
  }
  console.log(`\n${saved} of ${steps.length} saved.`);
  if (saved !== steps.length) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter(argument => argument.startsWith('--')));
const args = rest.filter(argument => !argument.startsWith('--'));
const commands = {list: () => listCommand(flags), show: () => showCommand(args), save: () => saveCommand(args, flags)};
if (!Object.hasOwn(commands, command || '')) die('Usage: ledger.mjs list [--json] | show <id or name> | save <snapshots.json> [--confirm]');
try { await commands[command](); }
catch (error) { die(error.message); }
