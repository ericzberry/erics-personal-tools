// Local-only synthetic passkey/API fixture. Never copied into dist or deployed.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import worker from '../../tools-api/src/index.js';
const root = new URL('../dist/', import.meta.url);
const port = Number(process.env.PORT || 8791);
const token = 'synthetic-private-token-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
let records = [{id, name: 'Synthetic airline', category: 'Airline', traveler: 'Test traveler', number: '000123456', notes: 'Synthetic private note', expires: '', revision: 'first', updatedAt: new Date().toISOString()}];
let apiCalls = 0;
const fixture = `
const fixtureEncode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
let canceled = false, unsupported = false, offset = 0;
const clock = Date.now.bind(Date); Date.now = () => clock() + offset;
Object.defineProperty(navigator, 'onLine', {get: () => localStorage.getItem('fixture-offline') !== 'yes'});
const originalFetch = window.fetch.bind(window);
window.fetch = (...args) => {
  const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url, location.href);
  if (!navigator.onLine && (url.pathname.startsWith('/v1/') || url.pathname === '/health')) return Promise.reject(Error('Synthetic offline mode'));
  return originalFetch(...args);
};
Object.defineProperty(navigator, 'credentials', {value: {
  async create() {return {id: fixtureEncode(crypto.getRandomValues(new Uint8Array(16))), getClientExtensionResults: () => ({prf:{enabled: !unsupported}})};},
  async get({publicKey}) {
    if (canceled) {canceled=false;throw new DOMException('Synthetic cancellation','NotAllowedError');}
    const auth=new Uint8Array(37);auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(location.hostname))));auth[32]=5;
    const seed=await crypto.subtle.digest('SHA-256',publicKey.allowCredentials[0].id);
    return {id:fixtureEncode(publicKey.allowCredentials[0].id),response:{authenticatorData:auth,clientDataJSON:new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin:location.origin,challenge:fixtureEncode(publicKey.challenge)}))},getClientExtensionResults:()=>({prf:unsupported?{}:{results:{first:seed}}})};
  }
}});
if (!window.PublicKeyCredential) window.PublicKeyCredential=function(){};
window.addEventListener('DOMContentLoaded',()=>{
  if(parent!==window)return;
  const panel=document.createElement('section'); panel.setAttribute('aria-label','Synthetic test controls'); panel.style.cssText='margin:24px;padding:16px;border:1px dashed #777';
  const title=document.createElement('h2');title.textContent='Synthetic test controls';panel.append(title);
  for(const [label,action] of [
    ['Simulate 15 minutes idle',()=>{offset+=900001;}],
    ['Cancel next passkey',()=>{canceled=true;}],
    ['Disable passkey encryption',()=>{unsupported=true;}],
    ['Go offline',()=>{localStorage.setItem('fixture-offline','yes');window.dispatchEvent(new Event('offline'));}],
    ['Go online',()=>{localStorage.removeItem('fixture-offline');window.dispatchEvent(new Event('online'));for(const f of document.querySelectorAll('iframe'))f.contentWindow.dispatchEvent(new Event('online'));}]
  ]){const button=document.createElement('button');button.textContent=label;button.onclick=action;panel.append(button);}
  document.body.append(panel);
});
`;
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png'};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:8791');
    if (url.pathname === '/fixture.js') {res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
    if (url.pathname === '/fixture-count') {res.end(JSON.stringify({apiCalls}));return;}
    if (url.pathname.startsWith('/app/')) {
      const response = await worker.fetch(new Request(url), {ASSETS:{fetch:async () => {
        const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
        let value = await readFile(new URL('.' + path, root));
        if (path.endsWith('.html')) value = value.toString().replace('<head>', '<head><script src="/fixture.js"></script>');
        const type=Object.entries(types).find(([extension])=>path.endsWith(extension))?.[1] || 'application/octet-stream';
        return new Response(value,{headers:{'Content-Type':type}});
      }}});
      res.writeHead(response.status, Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    apiCalls++;
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if (url.pathname === '/v1/releases/latest') {res.end(JSON.stringify({version:'0.1.2'}));return;}
    if (req.headers.authorization !== 'Bearer ' + token) {res.statusCode=401;res.end('{}');return;}
    if (url.pathname === '/health') {res.end('{"ok":true}');return;}
    if (url.pathname === '/v1/ai-connections') {res.end('{"connections":[]}');return;}
    if (url.pathname === '/v1/travel/snapshot') {res.end(JSON.stringify({records}));return;}
    if (url.pathname.startsWith('/v1/travel/')) {
      const recordId=url.pathname.split('/').at(-1);let text='';for await(const data of req)text+=data;const value=JSON.parse(text||'{}');
      const previous=records.find(record=>record.id===recordId);
      if ((previous?.revision??null)!==(value.revision??null)){res.statusCode=409;res.end('{}');return;}
      records=records.filter(record=>record.id!==recordId);
      if(req.method==='PUT'){const record={...previous,...value,id:recordId,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};records.push(record);res.end(JSON.stringify({record}));return;}
      res.end('{}');return;
    }
    res.statusCode=404;res.end('{}');
  } catch {res.statusCode=500;res.end('Preview unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic mobile preview: http://localhost:${port}/app/`));
