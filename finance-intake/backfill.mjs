#!/usr/bin/env node
// The one-time retrofit: the record-per-account ledger becomes portfolios and
// dated figures. It reads the old table through the Worker, which is the only
// thing that can decrypt it, and writes the new one.
//
// It previews by default and writes only with --confirm, like every other
// script here. It is re-runnable: every write is keyed by portfolio, class and
// date, so confirming twice reaches the same ledger. It deletes nothing —
// dropping the old table is a separate decision, made after this one has been
// looked at.
import {die, money, api} from './api.mjs';
import {classLabel, registrationLabel} from '../chrome-sidebar/src/finance-data.js';

const confirm = process.argv.includes('--confirm');
let report;
try { report = await api('/v1/finance/backfill', confirm ? {method: 'POST', body: {}} : {}); }
catch (error) { die(`The backfill could not run: ${error.message}`); }

if (!report.moved.length) {
  console.log(report.note || 'Nothing to migrate: the record-per-account table is empty.');
  process.exit(0);
}
console.log(`${report.legacy} record${report.legacy === 1 ? '' : 's'} in the old ledger\n`);
for (const move of report.moved) {
  console.log(`  ${move.from}${move.institution ? ` (${move.institution})` : ''} [${move.legacyKind}]`);
  console.log(`    -> ${move.portfolio} · ${move.registration} · ${move.class}   ${move.dates} dated figure${move.dates === 1 ? '' : 's'}`);
}
console.log('\nPortfolios');
for (const portfolio of report.portfolios) {
  console.log(`  p${portfolio.number}  ${portfolio.name} · ${registrationLabel(portfolio.kind)} · ${portfolio.currency}${portfolio.exists ? '   (already exists — figures are added to it)' : ''}`);
}
console.log(`\n${report.marks} figure${report.marks === 1 ? '' : 's'}, ${money(report.cents / 100)} in total across every portfolio, class and date.`);
console.log(confirm
  ? '\nWritten. Open Finance to check it, then drop the old finance_records table when you are satisfied.'
  : '\nNothing was written. Re-run with --confirm to migrate.');
