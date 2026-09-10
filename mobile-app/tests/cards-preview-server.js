// Local-only synthetic passkey/API fixture. Never copied into dist or deployed.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import worker from '../../tools-api/src/index.js';
const root = new URL('../dist/', import.meta.url);
const port = Number(process.env.PORT || 8793);
const token = 'synthetic-private-token-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
let records = [{id, name: 'Synthetic airline', category: 'Airline', traveler: 'Test traveler', number: '000123456', notes: 'Synthetic private note', expires: '', revision: 'first', updatedAt: new Date().toISOString()}];
let apiCalls = 0;
let rewards={entries:[
  {id:'55555555-5555-4555-8555-555555555555',kind:'benefit',name:'Synthetic dining credit',source:'Synthetic Card',value:'$50 credit',due:'2026-10-15',state:'available',url:'',notes:'Synthetic terms for testing only.',secret:'',secretHint:'',updatedAt:new Date().toISOString()},
  {id:'66666666-6666-4666-8666-666666666666',kind:'balance',name:'Synthetic airline miles',source:'Synthetic Airline',value:'42,000 miles',due:'',state:'available',url:'',notes:'',secret:'',secretHint:'',updatedAt:new Date().toISOString()}
],revision:'first'};
let cards=[{id:'22222222-2222-4222-8222-222222222222',name:'Synthetic Everyday Cash',unit:'cash',base:2,cpp:1,rules:'[]',checked:'2026-09-09',source:'https://example.com/terms',notes:'Synthetic terms for testing only.',revision:'first'}, {id:'33333333-3333-4333-8333-333333333333',name:'Synthetic Dining Points',unit:'points',base:1,cpp:1.5,rules:JSON.stringify([{category:'Dining',channel:'Any',rate:3,remaining:50,active:true,end:'',condition:'Eligible restaurant purchase'}]),checked:'2026-09-09',source:'',notes:'',revision:'first'}, {id:'44444444-4444-4444-8444-444444444444',name:'Synthetic Everyday Points',unit:'points',base:1,cpp:1.2,rules:JSON.stringify([{category:'Gas',channel:'Any',rate:4,remaining:null,active:true,end:'',condition:''},{category:'Department stores',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:''}]),checked:'2026-09-09',source:'',notes:'',revision:'first'}];
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
    const url = new URL(req.url, 'http://localhost:8793');
    if (url.pathname === '/app/fixture.js') {res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
    if(url.pathname==='/cards-preview'){
      res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/app/fixture.js"></script><link rel="stylesheet" href="/app/shared/components/travel.css"><link rel="stylesheet" href="/app/shared/components/capabilities.css"><link rel="stylesheet" href="/app/shared/components/cards.css"></head><body><div id="navigation"></div><main id="root"></main><script type="module" src="/cards-fixture.js"></script></body></html>`);return;
    }
    if(url.pathname==='/cards-fixture.js'){
      res.setHeader('Content-Type','text/javascript');res.end(`import {mountCards} from '/app/shared/cards.js';import {cardsOffline} from '/app/shared/cards-offline.js';import {CapabilityPicker} from '/app/shared/components/capabilities.js';const token='${token}';const remote=async(_t,path,options={})=>{const response=await fetch(path,{method:options.method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:options.value?JSON.stringify(options.value):undefined});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'Synthetic failure'),{status:response.status});return value;};document.getElementById('navigation').replaceChildren(CapabilityPicker());mountCards(document.getElementById('root'),{credentials:{get:async()=>token},offline:cardsOffline({remote}),remote});`);return;
    }
    if(url.pathname==='/rewards-preview'){
      res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/app/fixture.js"></script><link rel="stylesheet" href="/app/styles.css"><link rel="stylesheet" href="/app/shared/components/travel.css"><link rel="stylesheet" href="/app/shared/components/capabilities.css"></head><body class="shell unlocked-tools"><main id="root"></main><script type="module" src="/rewards-fixture.js"></script></body></html>`);return;
    }
    if(url.pathname==='/rewards-fixture.js'){
      res.setHeader('Content-Type','text/javascript');res.end(`import {mountRewards} from '/app/shared/rewards-tool.js';import {rewardsOffline} from '/app/shared/rewards-offline.js';const token='${token}';const remote=async(_t,path,options={})=>{const response=await fetch(path,{method:options.method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:options.value?JSON.stringify(options.value):undefined});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'Synthetic failure'),{status:response.status});return value;};const tool=mountRewards(document.getElementById('root'),{credentials:{get:async()=>token},offline:rewardsOffline({remote})});window.previewTool=tool;tool.refresh();`);return;
    }
    if (url.pathname === '/fixture-count') {res.end(JSON.stringify({apiCalls}));return;}
    if (url.pathname.startsWith('/app/')) {
      const response = await worker.fetch(new Request(url), {ASSETS:{fetch:async () => {
        const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
        let value = await readFile(new URL('.' + path, root));
        if (path.endsWith('.html')) value = value.toString().replace('<head>', '<head><script src="/app/fixture.js"></script>');
        if(path.endsWith('/sw.js'))value=value.toString().replace('const SHELL = [',"const SHELL = ['/app/fixture.js', ");
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
    if (url.pathname === '/v1/ai-connections') {res.end(JSON.stringify({connections:[{id,name:'Synthetic AI',provider:'openai',hasApiKey:true}]}));return;}
    if(url.pathname.endsWith('/card-category')){
      let text='';for await(const data of req)text+=data;const description=JSON.parse(text).purchase.toLowerCase();
      const match=[['gas','Gas','Gas station'],['pharmacy','Drugstores','Pharmacy'],['saks','Department stores','Saks Fifth Avenue'],['amazon','Online shopping','Amazon'],['cote','Dining','Cote'],['dinner','Dining','Restaurant'],['restaurant','Dining','Restaurant']].find(([term])=>description.includes(term));
      const amount=Number(((description.match(/\$\s*([\d,.]+)/)||[])[1]||'').replace(/,/g,''))||null;
      res.end(JSON.stringify({merchant:match?.[2]||'',category:match?.[1]||'Other',channel:/amazon|online/.test(description)?'Online':'Direct',amount,confidence:description.includes('uncertain')?'low':'high',reason:'Synthetic reading of the description.'}));return;
    }
    if(url.pathname.endsWith('/card-research')){
      let text='';for await(const data of req)text+=data;const name=JSON.parse(text||'{}').name||'';
      // A loose name answers with the synthetic products it could be; an exact one ingests.
      if(/^\s*synthetic\s*$/i.test(name)){res.end(JSON.stringify({matches:[{name:'Synthetic Cash Card (United States)',note:'No annual fee · 2% back'},{name:'Synthetic Points Card (United States)',note:'$95 annual fee · 3x dining'}]}));return;}
      res.end(JSON.stringify({card:{...(/points/i.test(name)?cards[2]:cards[0]),name:`Researched ${name}`}}));return;
    }
    if(url.pathname==='/v1/cards/snapshot'){res.end(JSON.stringify({records:cards}));return;}
    if(url.pathname.startsWith('/v1/cards/')){
      const cardId=url.pathname.split('/').at(-1);let text='';for await(const data of req)text+=data;const value=JSON.parse(text||'{}');const previous=cards.find(c=>c.id===cardId);
      if((previous?.revision??null)!==(value.revision??null)){res.statusCode=409;res.end(JSON.stringify({error:'Changed elsewhere'}));return;}
      cards=cards.filter(c=>c.id!==cardId);if(req.method==='PUT'){const record={...value,id:cardId,revision:crypto.randomUUID()};cards.push(record);res.end(JSON.stringify({record}));return;}res.end('{}');return;
    }
    if(url.pathname==='/v1/rewards'){
      if(req.method==='PUT'){let text='';for await(const data of req)text+=data;const value=JSON.parse(text);if(value.revision!==rewards.revision){res.statusCode=409;res.end('{}');return;}rewards={entries:value.entries,revision:crypto.randomUUID()};}
      res.end(JSON.stringify(rewards));return;
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
