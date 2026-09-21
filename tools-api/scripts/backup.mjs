#!/usr/bin/env node
// The quarterly backup from a terminal: what it last did, what is in the
// folder, one taken now, a downloaded file checked, and a restore — which
// previews until it is told --confirm. See docs/BACKUPS.md.
//
//   node tools-api/scripts/backup.mjs status
//   node tools-api/scripts/backup.mjs list
//   node tools-api/scripts/backup.mjs run
//   node tools-api/scripts/backup.mjs verify <downloaded-backup.json>
//   node tools-api/scripts/backup.mjs restore <drive-file-id> --tables finance [--confirm]
//
// `verify` needs nothing but the file: no token, no network. Everything else
// goes through the Worker with the API token, resolved as the Finance intake
// scripts resolve it.
import {readFileSync} from 'node:fs';
import {api, die} from '../../finance-intake/api.mjs';
import {verifyBackup, BACKUP_VERSION} from '../src/backup-format.js';

const [command, target, ...rest] = process.argv.slice(2);
const flag = name => rest.includes(`--${name}`) || target === `--${name}`;
const option = name => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : undefined;
};
const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const described = backup => backup ? `${backup.name}  (${backup.tables} tables, ${backup.rows} rows, ${size(backup.bytes)}, ${backup.createdAt})` : 'none yet';

async function status() {
  const state = await api('/v1/backup');
  console.log(`Folder:     ${state.folder.url}`);
  console.log(`Google:     ${state.google.connected ? state.google.account || 'connected' : 'NOT CONNECTED — no backup can be written'}`);
  console.log(`Format:     ${state.version}`);
  console.log(`This quarter (${state.quarter}): ${state.quarterly?.quarter === state.quarter ? described(state.quarterly) : 'not yet taken'}`);
  if (state.quarterly && state.quarterly.quarter !== state.quarter) console.log(`Last quarterly (${state.quarterly.quarter}): ${described(state.quarterly)}`);
  if (state.last && state.last.id !== state.quarterly?.id) console.log(`Latest:     ${described(state.last)} [${state.last.kind}]`);
  if (state.failure) console.log(`FAILING:    ${state.failure.days} day(s) for ${state.failure.quarter}: ${state.failure.error}`);
  if (state.restore) console.log(`Last restore: ${state.restore.at} from ${state.restore.file.name} (${state.restore.tables.join(', ')}), ${state.restore.verified ? 'verified' : 'NOT verified'}; undo with ${state.restore.safety.name} (${state.restore.safety.id})`);
}

async function list() {
  const {folder, files} = await api('/v1/backup/files');
  console.log(folder.url);
  if (!files.length) return console.log('No backups in the folder yet.');
  for (const file of files)
    console.log(`${file.id}  ${file.name}  ${size(file.bytes)}  format ${file.version}${file.version > BACKUP_VERSION ? ' (newer than this checkout reads)' : ''}`);
}

async function run() {
  const {backup} = await api('/v1/backup/run', {method: 'POST'});
  console.log(`Wrote ${described(backup)}`);
  console.log(`Drive confirmed it by ${backup.checked}: ${backup.link}`);
}

async function verify() {
  if (!target) die('Name the downloaded backup file: backup.mjs verify <file.json>');
  let file;
  try { file = JSON.parse(readFileSync(target, 'utf8')); } catch (error) { die(`${target} is not readable JSON: ${error.message}`); }
  const check = await verifyBackup(file);
  if (!check.readable) die(check.problems[0]);
  console.log(`${file.format}, format ${file.version}, ${file.kind}, ${file.quarter}, taken ${file.createdAt}`);
  if (Object.keys(file.apps || {}).length) console.log(`Apps then: ${Object.entries(file.apps).map(([app, version]) => `${app} ${version}`).join(', ')}`);
  console.log(`Sealed with the Worker key whose check is ${file.encryption?.keyCheck || '(none)'}`);
  for (const table of check.tables) console.log(`  ${table.whole ? 'ok     ' : 'DAMAGED'}  ${table.name}  ${table.rows} rows`);
  if (check.problems.length) die(`\n${check.problems.join('\n')}`);
  console.log(`\nWhole: every table matches its digest, and the file matches its own.`);
}

async function restore() {
  if (!target) die('Name the backup by its Drive file id (see `list`): backup.mjs restore <id> --tables finance');
  const tables = (option('tables') || '').split(',').map(name => name.trim()).filter(Boolean);
  if (!tables.length) die('Name the tables to restore with --tables, e.g. --tables finance or --tables finance_marks,finance_portfolios');
  const confirm = flag('confirm');
  const result = await api('/v1/backup/restore', {method: 'POST', body: {fileId: target, tables, confirm}});
  console.log(`From ${result.file.name} (format ${result.file.version}, ${result.file.kind}, taken ${result.file.createdAt})`);
  for (const table of result.tables) {
    const change = table.restored || table.removed ? `puts back ${table.restored}, removes ${table.removed}` : 'already matches';
    const notes = [table.schemaChanged ? 'schema changed since' : '', table.columnsGone.length ? `columns gone: ${table.columnsGone.join(', ')}` : '',
      table.columnsNew.length ? `new columns take defaults: ${table.columnsNew.join(', ')}` : ''].filter(Boolean).join('; ');
    console.log(`  ${table.table}: ${table.backupRows} rows in the backup, ${table.currentRows} now — ${change}${notes ? ` (${notes})` : ''}`);
  }
  if (result.damaged?.length) console.log(`Damaged in this file, and not restorable from it: ${result.damaged.join(', ')}`);
  if (!confirm) return console.log('\nPreview only. Nothing was changed. Run again with --confirm to restore.');
  if (!result.restored) return console.log(`\n${result.note}`);
  console.log(`\nRestored${result.verified ? ', and read back identical to the backup' : ' — BUT the read-back did not match; check it now'}.`);
  console.log(`What was replaced is saved as ${result.safety.name} (${result.safety.id}). Restoring from it undoes this.`);
  console.log('Open the app on each device so it refreshes from the restored records.');
}

const commands = {status, list, run, verify, restore};
if (!commands[command]) die('Usage: backup.mjs status | list | run | verify <file.json> | restore <drive-file-id> --tables finance [--confirm]');
try { await commands[command](); } catch (error) { die(error.message); }
