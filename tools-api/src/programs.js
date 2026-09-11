import {encryptSettings, decryptSettings} from './ai-settings.js';
import {validateProgramCatalog, mergeCatalog, programById, MAX_CATALOG_BYTES} from '../../chrome-sidebar/src/program-data.js';

// A reward program's published catalogue of offers. One document per program,
// replaced by whichever device last read the program's site.
//
// The merge happens here rather than on the device. Two browsers reading the
// same program within a moment of each other would otherwise race, and the
// loser would take an offer's "first seen" date — the only thing that makes
// "new" mean new to the owner — back to today. Merging on the one copy that
// both of them write removes the race instead of narrowing it.
const LABEL = 'programs';
const stored = async (id, env) => {
  const row = await env.DB.prepare('SELECT id, value, revision, updated_at FROM program_catalogs WHERE id = ?').bind(id).first();
  return row ? {row, catalog: await decryptSettings(row.value, `${LABEL}:${id}`, env)} : null;
};

export async function rewardPrograms(request, env, readValue, json) {
  const path = new URL(request.url).pathname;
  // The collection and its snapshot answer alike: a catalogue is small enough
  // that there is no lighter summary of one worth having.
  if (path === '/v1/rewards/programs' || path === '/v1/rewards/programs/snapshot') {
    if (request.method !== 'GET') return json({error: 'Method not allowed.'}, 405);
    const {results} = await env.DB.prepare('SELECT id, value, revision, updated_at FROM program_catalogs ORDER BY updated_at DESC').all();
    return json({records: await Promise.all(results.map(async row => ({
      ...await decryptSettings(row.value, `${LABEL}:${row.id}`, env),
      id: row.id, revision: row.revision, updatedAt: row.updated_at
    })))});
  }
  const match = /^\/v1\/rewards\/programs\/([a-z0-9-]{1,40})$/.exec(path);
  if (!match) return json({error: 'Not found.'}, 404);
  const id = match[1];
  if (!programById(id)) throw {status: 404, message: 'That reward program is not one this tool knows how to read.'};
  if (!['GET', 'PUT'].includes(request.method)) return json({error: 'Method not allowed.'}, 405);
  const previous = await stored(id, env);
  if (request.method === 'GET') {
    return json({catalog: previous ? {...previous.catalog, id, revision: previous.row.revision, updatedAt: previous.row.updated_at} : null});
  }
  const input = JSON.parse(await readValue(request, MAX_CATALOG_BYTES));
  if (input.programId !== id) throw {status: 400, message: 'The catalogue does not belong to that program.'};
  // The validator is the device's, and speaks in plain errors. A catalogue this
  // one refuses is a bad request, not a storage failure.
  let catalog;
  try {catalog = mergeCatalog(previous?.catalog || null, validateProgramCatalog(input));}
  catch (error) {throw {status: 400, message: error.message};}
  const revision = crypto.randomUUID(), updatedAt = new Date().toISOString();
  const value = await encryptSettings(catalog, `${LABEL}:${id}`, env);
  const result = previous
    ? await env.DB.prepare('UPDATE program_catalogs SET value = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(value, revision, updatedAt, id, previous.row.revision).run()
    : await env.DB.prepare('INSERT INTO program_catalogs (id, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, value, revision, updatedAt).run();
  // Another device finished its own reading in between. Both readings hold the
  // same published offers, so the one already saved is the answer, not an error
  // for the owner to resolve.
  if (!result.meta.changes) {
    const current = await stored(id, env);
    if (current) return json({catalog: {...current.catalog, id, revision: current.row.revision, updatedAt: current.row.updated_at}});
    throw {status: 409, message: 'This catalogue changed while it was being saved. It will be read again on the next visit.'};
  }
  return json({catalog: {...catalog, id, revision, updatedAt}});
}
