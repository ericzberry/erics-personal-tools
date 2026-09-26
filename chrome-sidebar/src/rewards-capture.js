import {rewardProgram, READ_TEXT, parseOfferReading, validateProgramCatalog} from './program-data.js';
import {loyaltySite, loyaltySitePrograms} from './loyalty-sites.js';

// A travel pass may encounter issuer offers without visiting the Rewards tool.
// The caller supplies its existing registered balance-intake operation and
// catalogue write. Credentials and navigation stay outside this adapter.
export function createRewardsCapture({read, save, maxReads = 6}) {
  const seen = new Set();
  let attempts = 0;
  const limit = Number.isFinite(maxReads) ? Math.max(0, Math.min(12, Math.floor(maxReads))) : 6;
  return async function onObservation(page = {}) {
    const program = rewardProgram(page.url), site = loyaltySite(page.url);
    const text = String(page.text || '').trim();
    if (page.attention || !site || program?.reading !== READ_TEXT || !text ||
        !/\boffers?\b|statement credits?|complimentary|benefits?/i.test(text)) return {status: 'skipped', count: 0};
    const signature = `${page.url}\n${text}`;
    if (seen.has(signature)) return {status: 'skipped', count: 0};
    if (attempts >= limit) return {status: 'limit', count: 0, programId: program.id};
    attempts++;
    const result = await read({text, source: site.source, program: site.label, unit: site.unit,
      programs: loyaltySitePrograms(site).map(entry => ({program: entry.label, source: entry.source, unit: entry.unit}))});
    if (result?.warning || result?.error) throw Error(String(result.warning || result.error));
    const offers = parseOfferReading(result, program.id, {path: page.url});
    if (offers.length) await save(program.id, validateProgramCatalog({programId: program.id, complete: false, offers}));
    // Failed writes remain retryable; identical successfully read pages do not
    // spend another model call. Empty means this snapshot, never the account.
    seen.add(signature);
    return {status: offers.length ? 'saved' : 'empty', count: offers.length, programId: program.id};
  };
}
