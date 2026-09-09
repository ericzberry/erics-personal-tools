import {encryptSettings, decryptSettings} from './ai-settings.js';
const fail = (status, message) => { throw {status, message}; };
const categories = ['Airline','Hotel','Rental car','Trusted traveler','Passport','Visa','Other'];
export function normalizeTravel(input, previous = {}) {
  const field = (key, max, required = false) => {
    const value = input[key] ?? previous[key] ?? '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `Check ${key} (up to ${max} characters).`);
    return value.trim();
  };
  const category = field('category', 30, true);
  if (!categories.includes(category)) fail(400, 'Choose a travel category.');
  const expires = field('expires', 10);
  if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || !Number.isFinite(Date.parse(expires)) || new Date(expires).toISOString().slice(0,10) !== expires)) fail(400, 'Enter a valid expiration date.');
  return {category, name:field('name',100,true), traveler:field('traveler',100), number:field('number',200,true), notes:field('notes',2000), expires};
}
const metadata = (row, value) => ({id:row.id, revision:row.revision, updatedAt:row.updated_at, name:value.name, category:value.category, traveler:value.traveler, expires:value.expires, hasNotes:!!value.notes});
export async function travel(request, env, readValue, json) {
  const path = new URL(request.url).pathname;
  if (path === '/v1/travel') {
    if (request.method !== 'GET') return json({error:'Method not allowed.'},405);
    const {results} = await env.DB.prepare('SELECT id, value, revision, updated_at FROM travel_records ORDER BY updated_at DESC').all();
    return json({records:await Promise.all(results.map(async row => metadata(row,await decryptSettings(row.value,`travel:${row.id}`,env))))});
  }
  const match = /^\/v1\/travel\/([a-f0-9-]{36})$/.exec(path);
  if (!match) return json({error:'Not found.'},404);
  const id = match[1];
  if (!['GET','PUT','DELETE'].includes(request.method)) return json({error:'Method not allowed.'},405);
  const previous = await env.DB.prepare('SELECT id, value, revision, updated_at FROM travel_records WHERE id = ?').bind(id).first();
  if (request.method === 'GET') {
    if (!previous) fail(404,'Travel record not found. Refresh your records.');
    return json({record:{...metadata(previous,await decryptSettings(previous.value,`travel:${id}`,env)),...await decryptSettings(previous.value,`travel:${id}`,env)}});
  }
  const input = JSON.parse(await readValue(request));
  if ((previous?.revision ?? null) !== (input.revision ?? null)) fail(409,'This record changed on another device. Cancel your edits and refresh before trying again.');
  if (request.method === 'DELETE') {
    if (!previous) return json({ok:true});
    const result = await env.DB.prepare('DELETE FROM travel_records WHERE id = ? AND revision = ?').bind(id,previous.revision).run();
    if (!result.meta.changes) fail(409,'This record changed. Refresh before deleting.');
    return json({ok:true});
  }
  const value = normalizeTravel(input,previous ? await decryptSettings(previous.value,`travel:${id}`,env) : {});
  const row = {id, value:await encryptSettings(value,`travel:${id}`,env), revision:crypto.randomUUID(), updated_at:new Date().toISOString()};
  const result = previous
    ? await env.DB.prepare('UPDATE travel_records SET value = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(row.value,row.revision,row.updated_at,id,previous.revision).run()
    : await env.DB.prepare('INSERT INTO travel_records (id, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id,row.value,row.revision,row.updated_at).run();
  if (!result.meta.changes) fail(409,'This record changed. Refresh before saving.');
  return json({record:metadata(row,value)});
}
