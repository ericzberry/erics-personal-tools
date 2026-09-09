import {latestRelease} from './releases.js';
import {aiSettings,savedConnection} from './ai-settings.js';
import {generate,listModels} from './providers.js';
const MAX_BYTES = 64 * 1024;
const json = (value, status = 200) => Response.json(value, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
});

async function authorized(request, token) {
  if (typeof token !== 'string' || token.length < 32) return false;
  const supplied = request.headers.get('Authorization') || '';
  if (supplied.length > 512) return false;
  const digest = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(supplied), digest(`Bearer ${token}`)]);
  let difference = 0;
  const left = new Uint8Array(a), right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function readValue(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw {status: 415, message: 'Use application/json.'};
  }
  const reader = request.body?.getReader();
  if (!reader) throw {status: 400, message: 'A JSON object is required.'};
  const decoder = new TextDecoder();
  let size = 0, text = '';
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw {status: 413, message: 'Settings exceed 64 KB.'};
    }
    text += decoder.decode(value, {stream: true});
  }
  text += decoder.decode();
  let value;
  try { value = JSON.parse(text); } catch { throw {status: 400, message: 'Invalid JSON.'}; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw {status: 400, message: 'A JSON object is required.'};
  }
  return JSON.stringify(value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/app') return Response.redirect(`${url.origin}/app/`, 308);
    if (url.pathname.startsWith('/app/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'Method not allowed.'}, 405);
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('Cache-Control', 'no-cache');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      return response;
    }
    if(new URL(request.url).pathname==='/v1/releases/latest'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      const app = url.searchParams.get('app') || 'chrome-sidebar';
      if (!['chrome-sidebar', 'mobile-app'].includes(app)) return json({error:'Unknown app.'},400);
      try{return await latestRelease(env, app);}catch{return json({error:'Release unavailable.'},503);}
    }
    // Extension pages use their host permission. No cross-origin website access is granted.
    if (!await authorized(request, env.API_TOKEN)) return json({error: 'Unauthorized.'}, 401);
    const path = new URL(request.url).pathname;
    try {
      if (path === '/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT id FROM ai_connections LIMIT 1').all();
        return json({ok: true, service: 'erics-tools-api', version: 2});
      }
      const operation=/^\/v1\/ai-connections\/([a-f0-9-]{36})\/(models|test|generate)$/.exec(path);
      if(operation){
        const [,id,action]=operation;
        if(request.method!==(action==='models'?'GET':'POST'))return json({error:'Method not allowed.'},405);
        const connection=await savedConnection(id,env);
        if(action==='models')return json(await listModels(connection));
        const input=JSON.parse(await readValue(request));
        return json(await generate(connection,action==='test'?{model:input.model,messages:[{role:'user',content:'Reply with just OK.'}],maxTokens:256}:input));
      }
      return await aiSettings(request, env, readValue, json);
    } catch (error) {
      return json({error: error.status ? error.message : 'Storage unavailable. Check the D1 binding and schema.'}, error.status || 503);
    }
  }
};
