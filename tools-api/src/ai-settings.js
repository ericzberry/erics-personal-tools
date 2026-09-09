import {providerFor} from '../../chrome-sidebar/src/ai-providers.js';
import {providerConfig} from './providers.js';
const fail = (status, message) => {throw {status, message};};
async function encryptionKey(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.SETTINGS_ENCRYPTION_KEY || '')) fail(503, 'Settings encryption is not configured.');
  const bytes = Uint8Array.from(env.SETTINGS_ENCRYPTION_KEY.match(/../g), hex => parseInt(hex, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function encryptSettings(value, id, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(id)}, await encryptionKey(env), new TextEncoder().encode(JSON.stringify(value)));
  return JSON.stringify({v:1, iv:encode(iv), ciphertext:encode(ciphertext)});
}
async function decryptSettings(value, id, env) {
  const envelope = JSON.parse(value);
  if (envelope.v !== 1) fail(503, 'Unrecognized settings format.');
  const plaintext = await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(envelope.iv), additionalData:new TextEncoder().encode(id)}, await encryptionKey(env), decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
function field(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `Check ${label}.`);
  return value.trim();
}
function normalize(input, previous) {
  if (!providerFor(input.provider)) fail(400, 'Choose a supported provider.');
  const baseUrl = field(input.baseUrl ?? '', 'the API URL', 2048);
  if (baseUrl) {
    let url; try {url = new URL(baseUrl);} catch {fail(400, 'Enter a valid HTTPS API URL.');}
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail(400, 'Use an HTTPS API URL without credentials, query parameters or a fragment.');
  }
  const apiFormat=input.provider==='custom'?(input.apiFormat||'chat'):providerFor(input.provider).format;
  // Empty custom endpoints can be saved as drafts, but cannot make requests.
  if(baseUrl||input.provider!=='custom')providerConfig({provider:input.provider,baseUrl,apiFormat});
  if(!['chat','responses','anthropic'].includes(apiFormat))fail(400,'Choose a supported API format.');
  let apiKey = previous?.apiKey || '';
  if (input.apiKey !== undefined) apiKey = field(input.apiKey, 'the API key', 4096);
  // Changing destinations must never silently carry over another provider’s key.
  if (previous && (previous.provider !== input.provider || previous.baseUrl !== baseUrl || (previous.apiFormat||providerFor(previous.provider)?.format)!==apiFormat) && input.apiKey === undefined) apiKey = '';
  return {name:field(input.name, 'the connection name', 100, true), provider:input.provider,
    model:field(input.model ?? '', 'the model', 240), baseUrl, apiFormat, apiKey};
}
export async function savedConnection(id,env) {
  const row=await env.DB.prepare('SELECT value FROM ai_connections WHERE id = ?').bind(id).first();
  if(!row)fail(404,'Connection not found.');
  return decryptSettings(row.value,id,env);
}
async function publicRecord(row, env) {
  const {apiKey, ...value} = await decryptSettings(row.value, row.id, env);
  return {...value, id:row.id, hasApiKey:!!apiKey, revision:row.revision, updatedAt:row.updated_at};
}
export async function aiSettings(request, env, readValue, json) {
  const path = new URL(request.url).pathname;
  if (path === '/v1/ai-connections' && request.method === 'GET') {
    await encryptionKey(env);
    const {results} = await env.DB.prepare('SELECT id, value, revision, updated_at FROM ai_connections ORDER BY updated_at DESC').all();
    return json({connections:await Promise.all(results.map(row => publicRecord(row, env)))});
  }
  const match = /^\/v1\/ai-connections\/([a-f0-9-]{36})$/.exec(path);
  if (!match) return json({error:'Not found.'}, 404);
  const id = match[1];
  if (!['PUT', 'DELETE'].includes(request.method)) return json({error:'Method not allowed.'}, 405);
  const input = JSON.parse(await readValue(request));
  const previous = await env.DB.prepare('SELECT id, value, revision, updated_at FROM ai_connections WHERE id = ?').bind(id).first();
  if ((previous?.revision ?? null) !== (input.revision ?? null)) fail(409, 'This connection changed elsewhere. Reload connections before editing.');
  if (request.method === 'DELETE') {
    if (!previous) return json({ok:true});
    const result = await env.DB.prepare('DELETE FROM ai_connections WHERE id = ? AND revision = ?').bind(id, previous.revision).run();
    if (!result.meta.changes) fail(409, 'This connection changed elsewhere. Reload connections before editing.');
    return json({ok:true});
  }
  const value = normalize(input, previous ? await decryptSettings(previous.value, id, env) : null);
  const row = {id, value:await encryptSettings(value, id, env), revision:crypto.randomUUID(), updated_at:new Date().toISOString()};
  const result = previous
    ? await env.DB.prepare('UPDATE ai_connections SET value = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(row.value, row.revision, row.updated_at, id, previous.revision).run()
    : await env.DB.prepare('INSERT INTO ai_connections (id, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, row.value, row.revision, row.updated_at).run();
  if (!result.meta.changes) fail(409, 'This connection changed elsewhere. Reload connections before editing.');
  return json({connection:await publicRecord(row, env)});
}
