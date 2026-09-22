import {encryptSettings, decryptSettings} from './ai-settings.js';
const fail = (status, message) => { throw {status, message}; };
export {normalizeTravel} from '../../chrome-sidebar/src/travel-data.js';
import {normalizeTravel} from '../../chrome-sidebar/src/travel-data.js';
const OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const metadata = (row, value) => ({id:row.id, revision:row.revision, updatedAt:row.updated_at, name:value.name, category:value.category, traveler:value.traveler, expires:value.expires, hasNotes:!!value.notes});
export async function travel(request, env, readValue, json, config={resource:'travel',table:'travel_records',normalize:normalizeTravel,metadata}) {
  const {resource,table,normalize,metadata:describe}=config;
  const path = new URL(request.url).pathname;
  if (path === `/v1/${resource}` || path === `/v1/${resource}/snapshot`) {
    if (request.method !== 'GET') return json({error:'Method not allowed.'},405);
    const {results} = await env.DB.prepare(`SELECT id, value, revision, updated_at FROM ${table} ORDER BY updated_at DESC`).all();
    return json({records:await Promise.all(results.map(async row => {
      const value=await decryptSettings(row.value,`${resource}:${row.id}`,env);
      return {...describe(row,value),...(path.endsWith('/snapshot')?value:{})};
    }))});
  }
  const match = new RegExp(`^/v1/${resource}/([a-f0-9-]{36})$`).exec(path);
  if (!match) return json({error:'Not found.'},404);
  const id = match[1];
  if (!['GET','PUT','DELETE'].includes(request.method)) return json({error:'Method not allowed.'},405);
  const previous = await env.DB.prepare(`SELECT id, value, revision, updated_at FROM ${table} WHERE id = ?`).bind(id).first();
  if (request.method === 'GET') {
    if (!previous) fail(404,'Record not found. Refresh your records.');
    const value=await decryptSettings(previous.value,`${resource}:${id}`,env);
    return json({record:{...describe(previous,value),...value}});
  }
  const input = JSON.parse(await readValue(request));
  // A device names each write it queues, and the name becomes the revision the
  // write produces. A retry of a write that already landed then finds its own
  // name on the record and is answered with the record, not a conflict. A name
  // equal to the base revision would leave a changed record on its old
  // revision, so it is no name at all.
  const operation = request.method === 'PUT' && OPERATION.test(input.operation ?? '') && input.operation !== input.revision ? input.operation : null;
  if (operation && previous?.revision === operation) return json({record:describe(previous,await decryptSettings(previous.value,`${resource}:${id}`,env))});
  if ((previous?.revision ?? null) !== (input.revision ?? null)) fail(409,'This record changed on another device. Cancel your edits and refresh before trying again.');
  if (request.method === 'DELETE') {
    if (!previous) return json({ok:true});
    const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND revision = ?`).bind(id,previous.revision).run();
    if (!result.meta.changes) fail(409,'This record changed. Refresh before deleting.');
    return json({ok:true});
  }
  const value = normalize(input,previous ? await decryptSettings(previous.value,`${resource}:${id}`,env) : {});
  const row = {id, value:await encryptSettings(value,`${resource}:${id}`,env), revision:operation ?? crypto.randomUUID(), updated_at:new Date().toISOString()};
  const result = previous
    ? await env.DB.prepare(`UPDATE ${table} SET value = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?`).bind(row.value,row.revision,row.updated_at,id,previous.revision).run()
    : await env.DB.prepare(`INSERT INTO ${table} (id, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(id,row.value,row.revision,row.updated_at).run();
  if (!result.meta.changes) fail(409,'This record changed. Refresh before saving.');
  return json({record:describe(row,value)});
}
