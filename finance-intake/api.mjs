// The one way in to the Finance ledger from this directory: where the bearer
// token comes from, and how a request is made with it. Both scripts here answer
// to this file, so the token is resolved in exactly one place.
//
// The token is the root credential for the whole API — it is what protects the
// encrypted D1 records, so it cannot itself live in D1. The login keychain is
// its home: encrypted at rest by macOS, readable without a prompt by the tool
// that stored it, and nowhere in the repository. The file is a fallback for a
// machine without a keychain, and says so.
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fingerprint, firmCode, importRef, importName} from '../chrome-sidebar/src/finance-data.js';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.TOOLS_API_URL || 'https://erics-tools-api.ezberry.workers.dev').replace(/\/$/, '');
const KEYCHAIN = {service: 'erics-tools-api', account: 'API_TOKEN'};
const TOKEN_FILE = join(HERE, 'credentials', 'api-token');

export const die = message => { console.error(message); process.exit(1); };
export const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', {style: 'currency', currency, maximumFractionDigits: 2}).format(value); }
  catch { return `${Number(value).toLocaleString('en-US')} ${currency}`; }
};

function keychainToken() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN.service, '-a', KEYCHAIN.account, '-w'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch { return ''; }
}
export function token() {
  const found = process.env.TOOLS_API_TOKEN?.trim()
    || keychainToken()
    || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
  if (!found) die(`No API token found. In Terminal, store it in the login keychain:\n\n  security add-generic-password -s ${KEYCHAIN.service} -a ${KEYCHAIN.account} -U -w\n\n-w must come last: it then prompts twice for the token instead of taking a\nvalue, so nothing lands in shell history. Nothing echoes as you paste.\nSee README.md for the alternatives.`);
  if (found.length < 32) die('The stored API token is under 32 characters, so the API will reject it. Store the full token.');
  return found;
}

export async function api(path, {method = 'GET', body} = {}) {
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

// The ledger arrives as one record stream: a handful of portfolios, the figures
// filed into them, and the two things that do not reduce to a figure — a
// private investment with its capital accounts, and a property with its dated
// valuations. Splitting it here keeps every script reading the same lists.
const byName = (a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base', numeric: true});
export const ledger = async () => {
  const {records} = await api('/v1/finance');
  const of = row => records.filter(record => record.row === row);
  return {
    records,
    portfolios: of('portfolio').sort(byName),
    marks: of('mark'),
    properties: of('property').sort(byName),
    valuations: of('valuation'),
    imports: of('import').sort((a, b) => b.number - a.number)
  };
};

// A figure file is the array of entries it always was, or the same array under
// "figures" beside what it was read from: {"source": "Schwab Q2 2026.pdf",
// "file": "/path/to/it.pdf", "firm": "schwab", "figures": [...]}. The source
// names the import every figure is saved under; the file, when given, is
// fingerprinted so the same statement filed twice is recognized; the firm is the
// site id the statement is from, for a figure that should stand beside that
// site's own page readings rather than as a typed one.
export async function readFigureFile(file) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { die(`Could not read ${file}: ${error.message}`); }
  const wrapped = parsed && !Array.isArray(parsed) && typeof parsed === 'object';
  const entries = wrapped ? parsed.figures : parsed;
  if (!Array.isArray(entries) || !entries.length) die('The file must hold a non-empty JSON array of figures, or an object with one under "figures".');
  const source = wrapped ? parsed : {};
  let print = '';
  if (source.file) {
    if (!existsSync(source.file)) die(`"file" names ${source.file}, which is not there.`);
    print = await fingerprint(readFileSync(source.file));
  }
  const firm = source.firm ? firmCode(source.firm) : 0;
  if (source.firm && !firm) die(`"firm" must be a site id such as schwab or etrade; "${source.firm}" is not one.`);
  return {entries, source: {name: String(source.source || '').slice(0, 160), print, firm}};
}

// The import a save leaves behind, written last so it lists only what landed.
// Its number is the millisecond it was accepted, moved on past any number the
// ledger already holds.
export function importNumber(imports) {
  const taken = new Set(imports.map(entry => entry.number));
  let number = Date.now();
  while (taken.has(number)) number++;
  return number;
}
export async function fileImport(number, trail) {
  if (!trail.lines.length) return null;
  const {record} = await api(`/v1/finance/${importRef(number)}`, {method: 'PUT', body: {row: 'import', number, ...trail, revision: null}});
  return record;
}
// Before a line is saved: what the row held until now, and which import put it there.
export const traceLine = (ref, amount, before, extra = {}) => ({ref, amount, ...extra,
  ...(before ? {was: before.amount ?? before.value, ...(before.importId ? {wasImport: before.importId} : {})} : {})});
// "where did this come from", for a script: the import's own name or its kind,
// and when it was accepted.
export const describeImport = entry => entry
  ? `${importName(entry)}, ${new Date(entry.number).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'untraced';
