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
    portfolios: of('portfolio').sort(byName),
    marks: of('mark'),
    properties: of('property').sort(byName),
    valuations: of('valuation')
  };
};
