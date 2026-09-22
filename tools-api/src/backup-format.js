// The backup file: what it holds, how it proves it arrived whole, and which
// versions of it this code can read.
//
// Pure — no D1, no Drive — because the Worker writes it and a laptop has to be
// able to check it with nothing but Node (tools-api/scripts/backup.mjs).
//
// A backup is every table's rows exactly as D1 stores them. Nothing is
// decrypted on the way out: a record the Worker seals with
// SETTINGS_ENCRYPTION_KEY is still sealed in the file, and a value the device
// sealed with the passkey is sealed twice, exactly as it is in the database.
// So the file says nothing D1 itself does not, and restoring it needs the same
// Worker secret the rows were written under — which is why the file carries a
// fingerprint of that key, and a restore refuses a file whose fingerprint is
// not the running Worker's.
//
// Two versions are in play and they are different things. `version` below is
// the shape of this file; each table also carries the CREATE TABLE it was read
// from, so a restore into a later schema maps columns by name and can say what
// changed. Neither is an app release version.
export const BACKUP_FORMAT = 'erics-tools-backup';
// Raise this whenever the file's shape changes, and add the step that turns
// the previous version into the new one to UPGRADES, so every file ever written
// can still be read. A reader refuses a version newer than its own.
export const BACKUP_VERSION = 1;
const UPGRADES = {};

// Never written into a backup: SQLite's and Cloudflare's own bookkeeping, and
// the fifteen-minute Drive tickets, which are expired before anyone could need
// them back.
export const SKIPPED_TABLES = ['drive_tickets'];
export const skippedTable = name => /^(sqlite_|_cf_|d1_)/.test(String(name)) || SKIPPED_TABLES.includes(name);

// A cell is null, a number or a string, which JSON carries as-is. Two things it
// cannot carry are written as small objects instead: bytes, as base64, and a
// REAL SQLite can hold but JSON cannot spell. No table stores either today;
// the encoding is here so a backup never quietly turns one into null.
const toBase64 = bytes => {
  let text = '';
  for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(text);
};
export function encodeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : {real: String(value)};
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : {integer: String(value)};
  if (value instanceof ArrayBuffer) return {base64: toBase64(new Uint8Array(value))};
  if (ArrayBuffer.isView(value)) return {base64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))};
  if (Array.isArray(value)) return {base64: toBase64(Uint8Array.from(value))};
  throw Error(`A ${typeof value} cannot be written into a backup.`);
}
// Only plain cells are restored through JSON; a table holding an encoded one
// needs a reader that decodes it, which no table has needed yet.
export const plainCell = cell => cell === null || typeof cell === 'number' || typeof cell === 'string';

const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', typeof text === 'string' ? new TextEncoder().encode(text) : text));

// Which key the sealed rows need, without saying what it is: a hash of a
// 256-bit random key tells nobody anything about it, and it is enough to know
// that a file and a Worker agree before a restore writes rows nobody could open.
export const keyCheck = async key => /^[a-f0-9]{64}$/i.test(String(key || ''))
  ? (await sha256(`${BACKUP_FORMAT}/key-check:${String(key).toLowerCase()}`)).slice(0, 16)
  : '';

// A table proves itself with its own digest, so one damaged table does not
// condemn the others, and the file proves itself with a digest over its header
// and those table digests. Both are computed over arrays built here, never over
// a re-serialized object, so key order cannot change the answer.
const tableDigest = table => sha256(JSON.stringify([table.name, table.schema, table.columns, table.rows]));
const HEADER = ['format', 'version', 'kind', 'createdAt', 'quarter', 'database', 'scope', 'apps', 'encryption'];
const fileDigest = file => sha256(JSON.stringify([...HEADER.map(key => file[key] ?? null),
  file.tables.map(table => [table.name, table.count, table.sha256])]));

// The quarter a moment falls in, in UTC: the scheduled backup is one per
// quarter and this is the name of the quarter it stands for.
export const quarterOf = (when = new Date()) => `${when.getUTCFullYear()}-Q${Math.floor(when.getUTCMonth() / 3) + 1}`;
export const BACKUP_KINDS = ['quarterly', 'manual', 'before-restore', 'daily-health'];
// Sortable, unique to the minute, and says what it is before it is opened.
export const backupName = (when, kind) => {
  const stamp = when.toISOString();
  return `erics-tools-backup-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}${stamp.slice(14, 16)}Z-${kind}.json`;
};

export async function buildBackup({kind, createdAt, database, scope = 'full', apps = {}, key = '', tables}) {
  if (!BACKUP_KINDS.includes(kind)) throw Error('Unknown backup kind.');
  const when = new Date(createdAt);
  const file = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, kind, createdAt: when.toISOString(), quarter: quarterOf(when),
    database, scope, apps,
    encryption: {envelope: 1, cipher: 'AES-256-GCM', secret: 'SETTINGS_ENCRYPTION_KEY', additionalData: 'record id', keyCheck: await keyCheck(key)},
    tables: []
  };
  for (const table of tables) {
    const entry = {name: table.name, schema: table.schema || '', columns: table.columns, count: table.rows.length, rows: table.rows};
    file.tables.push({...entry, sha256: await tableDigest(entry)});
  }
  file.sha256 = await fileDigest(file);
  return file;
}

// Everything that is wrong with a file. `readable` says this code understands
// it at all; `whole` says its header and the list of table digests are intact;
// each table then says for itself whether its rows match its digest, so one
// damaged table does not stop the others being restored. An empty `problems`
// is the only answer that means the whole file is good. This reads a file in
// the version it was written in, before any upgrade, because the digests were
// computed over what was written.
export async function verifyBackup(file) {
  const refuse = (problem, extra = {}) => ({readable: false, whole: false, problems: [problem], tables: [], ...extra});
  if (!file || typeof file !== 'object' || Array.isArray(file)) return refuse('This is not a backup file.');
  if (file.format !== BACKUP_FORMAT) return refuse('This is not an Eric’s Tools backup.');
  if (!Number.isInteger(file.version) || file.version < 1) return refuse('This backup names no format version.');
  if (file.version > BACKUP_VERSION) return refuse(`This backup is format ${file.version}; this code reads up to format ${BACKUP_VERSION}. Use a newer copy of tools-api to read it.`, {newer: true});
  if (!Array.isArray(file.tables)) return refuse('This backup holds no tables.');
  const problems = [], tables = [];
  for (const table of file.tables) {
    const name = String(table?.name ?? '');
    const shaped = !!name && Array.isArray(table.columns) && Array.isArray(table.rows)
      && table.rows.every(row => Array.isArray(row) && row.length === table.columns.length);
    const whole = shaped && table.count === table.rows.length && table.sha256 === await tableDigest(table);
    if (!whole) problems.push(`Table ${name || '(unnamed)'} does not match its digest.`);
    tables.push({name, rows: Array.isArray(table?.rows) ? table.rows.length : 0, whole});
  }
  const whole = file.sha256 === await fileDigest(file);
  if (!whole) problems.unshift('The file does not match its own digest.');
  return {readable: true, whole, problems, tables};
}

// A file brought up to the version this code writes, one step at a time. It
// refuses what it cannot read rather than guessing at it.
export function upgradeBackup(file) {
  let current = file;
  while (current.version < BACKUP_VERSION) {
    const step = UPGRADES[current.version];
    if (!step) throw Error(`No upgrade from backup format ${current.version}.`);
    current = step(current);
  }
  return current;
}
