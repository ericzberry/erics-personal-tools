// Local-only synthetic passkey/API fixture. Never copied into dist or deployed.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../../tools-api/src/index.js';
const root = new URL('../dist/', import.meta.url);
const previewRevision=crypto.randomUUID();
const port = Number(process.env.PORT || 8791);
const token = 'synthetic-private-token-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
let records = [{id, name: 'Synthetic airline', category: 'Airline', traveler: 'Test traveler', number: '000123456', notes: 'Synthetic private note', expires: '', revision: 'first', updatedAt: new Date().toISOString()}];
let rewards={entries:[],revision:null};let cards=[];
let finance=[];let personal=[];
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
    // The secret vault asks without allowCredentials (a discoverable passkey);
    // its seed must stay stable so every device derives the same key.
    const handle=publicKey.allowCredentials?.[0]?.id||new TextEncoder().encode('synthetic-discoverable-passkey');
    const seed=await crypto.subtle.digest('SHA-256',handle);
    return {id:fixtureEncode(handle),response:{authenticatorData:auth,clientDataJSON:new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin:location.origin,challenge:fixtureEncode(publicKey.challenge)}))},getClientExtensionResults:()=>({prf:unsupported?{}:{results:{first:seed}}})};
  }
}});
if (!window.PublicKeyCredential) window.PublicKeyCredential=function(){};
window.addEventListener('message',event=>{if(event.data?.type==='fixture-idle')offset+=event.data.ms;});
window.addEventListener('DOMContentLoaded',()=>{
  if(parent!==window)return;
  const panel=document.createElement('section'); panel.setAttribute('aria-label','Synthetic test controls'); panel.style.cssText='margin:24px;padding:16px;border:1px dashed #777';
  const title=document.createElement('h2');title.textContent='Synthetic test controls';panel.append(title);
  for(const [label,action] of [
    ['Simulate 15 minutes idle',()=>{offset+=900001;for(const f of document.querySelectorAll('iframe'))f.contentWindow.postMessage({type:'fixture-idle',ms:900001},location.origin);}],
    ['Cancel next passkey',()=>{canceled=true;}],
    ['Disable passkey encryption',()=>{unsupported=true;}],
    ['Go offline',()=>{localStorage.setItem('fixture-offline','yes');window.dispatchEvent(new Event('offline'));for(const f of document.querySelectorAll('iframe'))f.contentWindow.dispatchEvent(new Event('offline'));}],
    ['Go online',()=>{localStorage.removeItem('fixture-offline');window.dispatchEvent(new Event('online'));for(const f of document.querySelectorAll('iframe'))f.contentWindow.dispatchEvent(new Event('online'));}]
  ]){const button=document.createElement('button');button.textContent=label;button.onclick=action;panel.append(button);}
  document.body.append(panel);
});
`;
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png'};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:8791');
    if (url.pathname === '/app/fixture.js') {res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
    if (url.pathname === '/fixture-count') {res.end(JSON.stringify({apiCalls}));return;}
    if (url.pathname.startsWith('/app/')) {
      const response = await worker.fetch(new Request(url), {ASSETS:{fetch:async () => {
        const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
        let value = await readFile(new URL('.' + path, root));
        if (path.endsWith('.html')) value = value.toString().replace('<head>', '<head><script src="/app/fixture.js"></script>');
        if (path.endsWith('/sw.js')) {
          const revision=createHash('sha256').update(previewRevision).update(await readFile(new URL('app/restaurants.js',root))).update(await readFile(new URL('app/shared/components/restaurant-views.js',root))).digest('hex').slice(0,8);
          value=value.toString().replace(/(const CACHE = '[^']+)/,`$1-preview-${revision}`).replace('const SHELL = [',"const SHELL = ['/app/fixture.js', ");
        }
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
    if (url.pathname === '/v1/ai-connections') {res.end(JSON.stringify({connections:[{id,name:'Synthetic research connection',provider:'openai',hasApiKey:true}]}));return;}
    if (url.pathname === `/v1/ai-connections/${id}/restaurants`) {
      let text='';for await(const data of req)text+=data;const {search}=JSON.parse(text);
      if(search.query==='failure'){res.statusCode=502;res.end('{"error":"Synthetic research failure"}');return;}
      res.end(JSON.stringify({summary:'Synthetic source-backed matches for the selected criteria.',clarification:'Review the restaurant address before booking.',researchedAt:new Date().toISOString(),restaurants:[{id:'1',name:'Example Bistro with a deliberately long restaurant name',address:'100 Example Avenue',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',travel:'included',reason:'Synthetic candidate for layout and offline testing.',evidence:[{url:'https://example.com/review',title:'Synthetic restaurant review',detail:'Two stars in the synthetic guide.',published:'2026'}],booking:[{url:'https://resy.com/cities/new-york-ny/venues/example-bistro',provider:'Resy'},{url:'https://www.opentable.com/r/example-bistro',provider:'OpenTable'}]}]}));return;
    }
    if(url.pathname==='/v1/rewards'){
      if(req.method==='PUT'){let text='';for await(const data of req)text+=data;const value=JSON.parse(text);if(value.revision!==rewards.revision){res.statusCode=409;res.end('{}');return;}rewards={entries:value.entries,revision:crypto.randomUUID()};}
      res.end(JSON.stringify(rewards));return;
    }
    if(url.pathname==='/v1/cards/snapshot'){res.end(JSON.stringify({records:cards}));return;}
    if(url.pathname.startsWith('/v1/cards/')){
      const id=url.pathname.split('/').at(-1);let text='';for await(const data of req)text+=data;const value=JSON.parse(text||'{}');const previous=cards.find(c=>c.id===id);
      if((previous?.revision??null)!==(value.revision??null)){res.statusCode=409;res.end('{}');return;}
      cards=cards.filter(c=>c.id!==id);if(req.method==='PUT'){const record={...value,id,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};cards.push(record);res.end(JSON.stringify({record}));return;}res.end('{}');return;
    }
    for(const [name,list,set] of [['finance',()=>finance,value=>{finance=value;}],['personal',()=>personal,value=>{personal=value;}]]){
      if(url.pathname===`/v1/${name}/snapshot`){res.end(JSON.stringify({records:list()}));return;}
      if(url.pathname.startsWith(`/v1/${name}/`)){
        const recordId=url.pathname.split('/').at(-1);let text='';for await(const data of req)text+=data;const value=JSON.parse(text||'{}');
        const previous=list().find(record=>record.id===recordId);
        if((previous?.revision??null)!==(value.revision??null)){res.statusCode=409;res.end('{}');return;}
        set(list().filter(record=>record.id!==recordId));
        if(req.method==='PUT'){const record={...value,id:recordId,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};set([...list(),record]);res.end(JSON.stringify({record}));return;}
        res.end('{}');return;
      }
    }
    if(url.pathname===`/v1/ai-connections/${id}/finance-intake`){
      let text='';for await(const data of req)text+=data;const {text:input}=JSON.parse(text);
      if(String(input).includes('failure')){res.statusCode=502;res.end('{"error":"Synthetic reading failure"}');return;}
      res.end(JSON.stringify({updates:[
        {name:'Synthetic brokerage',institution:'Synthetic Broker',owner:'',kind:'brokerage',currency:'USD',value:412350,asOf:'2026-09-05',confidence:'high',reason:'The text states a balance and a date.'},
        {name:'Synthetic private fund II',institution:'',owner:'Family trust',kind:'private',currency:'USD',value:250000,asOf:'2026-08-31',confidence:'low',reason:'The sponsor and the valuation date should be confirmed.'}
      ],unread:'One line mentioned a wire with no amount, so it was left out.'}));return;
    }
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
