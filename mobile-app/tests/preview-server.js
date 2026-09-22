// Local-only synthetic passkey/API fixture. Never copied into dist or deployed.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../../tools-api/src/index.js';
import {sendPush, base64url, fromBase64url} from '../../tools-api/src/web-push.js';
import {normalizePushSubscription, reminderDigest} from '../../tools-api/src/push.js';
const root = new URL('../dist/', import.meta.url);
const previewRevision=crypto.randomUUID();
const port = Number(process.env.PORT || 8791);
const token = 'synthetic-private-token-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
let records = [{id, name: 'Synthetic airline', category: 'Airline', traveler: 'Test traveler', number: '000123456', notes: 'Synthetic private note', expires: '', revision: 'first', updatedAt: new Date().toISOString()}];
// A wallet with money on it that the close of the quarter takes back: one
// credit read off an issuer's own tracker, one that still has to be enrolled
// in, and one too small to reach the home screen.
let rewards={entries:[
  {id:'61111111-1111-4111-8111-111111111111',kind:'benefit',name:'Dining credit',source:'Synthetic Gold',value:'$100 dining credit',remaining:'$62.50',cadence:'quarterly',state:'available',due:'',url:'',notes:'',secret:'',secretHint:'',card:'',updatedAt:new Date().toISOString()},
  {id:'61111111-1111-4111-8111-111111111112',kind:'benefit',name:'Hotel credit',source:'Synthetic Platinum',value:'$300 prepaid hotel credit',remaining:'',cadence:'',state:'activation',due:'2026-09-25',url:'',notes:'',secret:'',secretHint:'',card:'',updatedAt:new Date().toISOString()},
  {id:'61111111-1111-4111-8111-111111111113',kind:'benefit',name:'Ride credit',source:'Synthetic Platinum',value:'$15 ride credit',remaining:'',cadence:'monthly',state:'available',due:'',url:'',notes:'',secret:'',secretHint:'',card:'',updatedAt:new Date().toISOString()}
  ,{id:'61111111-1111-4111-8111-111111111114',kind:'card',name:'Synthetic Platinum',source:'Synthetic Bank',value:'5x flights',state:'available',due:'',url:'',notes:'',secret:'',secretHint:'',card:'',cadence:'',remaining:'',updatedAt:new Date().toISOString()},
  {id:'61111111-1111-4111-8111-111111111115',kind:'benefit',name:'Dell credit',source:'Synthetic Platinum',value:'$200 per year',remaining:'$150',cadence:'annual',state:'available',due:'',url:'',notes:'',secret:'',secretHint:'',card:'61111111-1111-4111-8111-111111111114',updatedAt:new Date().toISOString()}
],revision:null};
// Best card's cards, so the purchase advisor has rates to rank.
let cards=[
  {id:'71111111-1111-4111-8111-111111111111',name:'Synthetic Platinum',unit:'points',base:1,cpp:1.5,checked:'2026-09-20',source:'',notes:'',revision:'first',updatedAt:new Date().toISOString(),
    rules:JSON.stringify([{category:'Online shopping',channel:'Any',merchant:'',rate:3,remaining:null,active:true,end:'',condition:''}])},
  {id:'71111111-1111-4111-8111-111111111112',name:'Synthetic Everyday',unit:'cash',base:2,cpp:1,checked:'2026-06-01',source:'',notes:'',revision:'first',updatedAt:new Date().toISOString(),rules:'[]'}
];
const programOffers=[
  {key:'/offer/sixt',name:'SIXT',category:'Automotive',badge:'Limited-Time Offer',dates:'',summary:'For a limited time, save up to 20% off SIXT car rentals. Offer expires on 9/30/2026.',firstSeenAt:new Date().toISOString()},
  {key:'/offer/music_city_festival',name:'Music City Festival',category:'Events',badge:'New',dates:'November 16-18, 2026',summary:'An exclusive three-day, invite-only experience featuring curated showcases and behind-the-scenes access to a lineup of country artists in Nashville, Tennessee.',firstSeenAt:new Date().toISOString()},
  {key:'/offer/synthetic_appliances',name:'Synthetic Appliances',category:'Home',badge:'',dates:'',summary:'Upgrade your home with at least 10% off major appliances, plus free shipping and installation.',firstSeenAt:'2026-01-01T00:00:00.000Z'}
];
const programCatalog={id:'ms-reserved',programId:'ms-reserved',label:'Morgan Stanley Reserved',source:'Morgan Stanley Reserved Living & Giving',
  complete:true,offers:programOffers,readAt:new Date().toISOString(),listedAt:new Date().toISOString(),
  revision:'synthetic-catalog',updatedAt:new Date().toISOString()};
// An issuer's offers are per card: one on the card with the lower rate, so the
// advisor has something to weigh against the rate.
const issuerCatalog={id:'amex-offers',programId:'amex-offers',label:'Amex Offers',source:'American Express',complete:false,
  offers:[{key:'synthetic-everyday-dell',name:'Dell',category:'Electronics',badge:'',dates:'Expires 10/31/2026',card:'Synthetic Everyday (-72005)',path:'/offers/eligible?account_key=synthetic',
    summary:'Spend $1,500 or more, get $300 back.',firstSeenAt:new Date().toISOString()}],
  readAt:new Date().toISOString(),listedAt:'',revision:'synthetic-issuer',updatedAt:new Date().toISOString()};
let finance=[];let personal=[];let health=[];let subscriptions=[];
// Dated commitments, as the phone receives them: one overdue service, one
// birthday inside its notice, one renewal with months of warning.
let reminders=[
  {id:'21111111-1111-4111-8111-111111111111',kind:'Service',title:'Oil change and tire rotation',subject:'Subaru Outback',date:'2026-02-28',every:6,since:'',notice:14,completed:'',notes:'Tire pressure was low at the last visit.',revision:'first',updatedAt:new Date().toISOString()},
  {id:'21111111-1111-4111-8111-111111111112',kind:'Birthday',title:'Maisie’s birthday',subject:'',date:'2016-09-20',every:12,since:'2016',notice:14,completed:'',notes:'',revision:'first',updatedAt:new Date().toISOString()},
  {id:'21111111-1111-4111-8111-111111111113',kind:'Renewal',title:'Passport renewal',subject:'Eric',date:'2026-12-01',every:0,since:'',notice:90,completed:'',notes:'',revision:'first',updatedAt:new Date().toISOString()}
];
let gifts=[
  {id:'41111111-1111-4111-8111-111111111111',person:'Ariana',idea:'Cast iron skillet, the 12 inch one',status:'Idea',link:'https://example.com/skillet',revision:'first',updatedAt:new Date().toISOString()},
  {id:'41111111-1111-4111-8111-111111111112',person:'Celeste',idea:'Roller skates, size 3',status:'Bought',link:'',revision:'first',updatedAt:new Date().toISOString()}
];
// The replacement drawer: a shop, a page, a note, and a bare variant.
let replacements=[
  {id:'61111111-1111-4111-8111-111111111111',item:'Bedroom paint',variant:'Benjamin Moore Hale Navy HC-154, Regal Select eggshell',where:'Home Depot',note:'Two gallons does the room',revision:'first',updatedAt:new Date().toISOString()},
  {id:'61111111-1111-4111-8111-111111111112',item:'Pillow',variant:'Coop Sleep Goods Original Adjustable, queen',where:'https://www.coopsleepgoods.com/products/the-original-pillow',note:'',revision:'first',updatedAt:new Date().toISOString()},
  {id:'61111111-1111-4111-8111-111111111113',item:'Running shoes',variant:'Brooks Ghost 16, men’s 10.5 D, black/black/ebony',where:'Fleet Feet',note:'Every 400 miles',revision:'first',updatedAt:new Date().toISOString()},
  {id:'61111111-1111-4111-8111-111111111114',item:'Printer ink',variant:'HP 67XL black, 3YM57AN',where:'',note:'',revision:'first',updatedAt:new Date().toISOString()}
];
// Sizes as the phone receives them: measurements with no brand, then brands.
let sizes=[
  {id:'51111111-1111-4111-8111-111111111111',brand:'',item:'Waist',size:'33 in',fit:'Measured in March',revision:'first',updatedAt:new Date().toISOString()},
  {id:'51111111-1111-4111-8111-111111111112',brand:'',item:'Inseam',size:'32 in',fit:'',revision:'first',updatedAt:new Date().toISOString()},
  {id:'51111111-1111-4111-8111-111111111113',brand:'Lululemon',item:'ABC joggers',size:'M',fit:'Runs slim through the thigh',revision:'first',updatedAt:new Date().toISOString()},
  {id:'51111111-1111-4111-8111-111111111114',brand:'Brooks Brothers',item:'Dress shirt',size:'15.5 / 34',fit:'Regent fit',revision:'first',updatedAt:new Date().toISOString()},
  {id:'51111111-1111-4111-8111-111111111115',brand:'Loro Piana',item:'Sweaters',size:'S',fit:'',revision:'first',updatedAt:new Date().toISOString()}
];
let apiCalls = 0;
// A throwaway application-server identity, so the preview can subscribe to the
// real push service and receive a real, really-encrypted notification. The
// sending path is the Worker's own; only the keys and the store are synthetic.
const vapidPair = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify']);
const vapid = {
  publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey)),
  privateKey: fromBase64url((await crypto.subtle.exportKey('jwk', vapidPair.privateKey)).d),
  subject: 'mailto:preview@example.invalid'
};
let pushSubscriptions = [];
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
    // One passkey, one answer per salt — the property the app lock relies on
    // when it evaluates the record vault's salt beside its own. Deriving from
    // the salt rather than the credential is what makes the lock's second
    // result equal the seed the vault gets when it asks for that salt itself.
    const prfSeed=async salt=>crypto.subtle.digest('SHA-256',new Uint8Array([...new TextEncoder().encode('synthetic-prf/'),...new Uint8Array(salt)]));
    const ask=publicKey.extensions?.prf?.eval||{};
    const results={first:await prfSeed(ask.first),...(ask.second?{second:await prfSeed(ask.second)}:{})};
    return {id:fixtureEncode(handle),response:{authenticatorData:auth,clientDataJSON:new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin:location.origin,challenge:fixtureEncode(publicKey.challenge)}))},getClientExtensionResults:()=>({prf:unsupported?{}:{results}})};
  }
}});
if (!window.PublicKeyCredential) window.PublicKeyCredential=function(){};
window.addEventListener('message',event=>{if(event.data?.type==='fixture-idle')offset+=event.data.ms;});
window.addEventListener('DOMContentLoaded',()=>{
  if(parent!==window)return;
  const panel=document.createElement('section'); panel.setAttribute('aria-label','Synthetic test controls'); panel.style.cssText='margin:24px;padding:16px;border:1px dashed #777';
  const title=document.createElement('h2');title.textContent='Synthetic test controls';panel.append(title);
  for(const [label,action] of [
    ['Simulate an hour idle',()=>{offset+=3600001;for(const f of document.querySelectorAll('iframe'))f.contentWindow.postMessage({type:'fixture-idle',ms:3600001},location.origin);}],
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
    // Public, exactly as on the Worker: a device needs it before it can subscribe.
    if (url.pathname === '/v1/push/key') {res.end(JSON.stringify({key: base64url(vapid.publicKey)}));return;}
    if (req.headers.authorization !== 'Bearer ' + token) {res.statusCode=401;res.end('{}');return;}
    if (url.pathname === '/health') {res.end('{"ok":true}');return;}
    // A synthetic day in the Worker's own forecast shape: a cool morning, and
    // rain likely through the middle of the afternoon.
    if (url.pathname === '/v1/weather') {res.end(JSON.stringify({date:new Date().toISOString().slice(0,10),place:'Synthetic Heights',hour:8,low:52,high:64,
      hours:Array.from({length:24},(unused,hour)=>({hour,temperature:52+Math.round(12*Math.sin(Math.PI*Math.max(0,hour-6)/18)),feelsLike:50+Math.round(12*Math.sin(Math.PI*Math.max(0,hour-6)/18)),chance:hour>=14&&hour<17?70:10,snow:false,code:hour>=14&&hour<17?61:hour<12?3:2}))}));return;}
    if (url.pathname === '/v1/ai-connections') {res.end(JSON.stringify({connections:[{id,name:'Synthetic research connection',provider:'openai',hasApiKey:true}]}));return;}
    // A purchase description read the way the Worker reads one, without a
    // model: the merchant it names, an amount if it states one.
    if (url.pathname === `/v1/ai-connections/${id}/card-category`) {
      let text='';for await(const data of req)text+=data;const purchase=String(JSON.parse(text||'{}').purchase||'');
      const amount=/\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(purchase);const merchant=/\b(dell|uber|saks|amazon)\b/i.exec(purchase);
      res.end(JSON.stringify({merchant:merchant?merchant[1][0].toUpperCase()+merchant[1].slice(1).toLowerCase():'',category:/uber|ride/i.test(purchase)?'Transit':'Online shopping',
        channel:'Online',amount:amount?Number(amount[1].replace(/,/g,'')):null,confidence:'high',reason:'Synthetic reading of the description.'}));return;
    }
    if (url.pathname === `/v1/ai-connections/${id}/restaurants`) {
      let text='';for await(const data of req)text+=data;const {search}=JSON.parse(text);
      if(search.query==='failure'){res.statusCode=502;res.end('{"error":"Synthetic research failure"}');return;}
      res.end(JSON.stringify({summary:'Synthetic source-backed matches for the selected criteria.',clarification:'Review the restaurant address before booking.',researchedAt:new Date().toISOString(),restaurants:[{id:'1',name:'Example Bistro with a deliberately long restaurant name',address:'100 Example Avenue',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',travel:'included',reason:'Synthetic candidate for layout and offline testing.',evidence:[{url:'https://example.com/review',title:'Synthetic restaurant review',detail:'Two stars in the synthetic guide.',published:'2026'}],booking:[{url:'https://resy.com/cities/new-york-ny/venues/example-bistro',provider:'Resy'},{url:'https://www.opentable.com/r/example-bistro',provider:'OpenTable'}]}]}));return;
    }
    // A program's published offers, as the phone receives them. Nothing on the
    // phone writes one: the reading needs the browser that is on the program's
    // site, so this answers reads only.
    if(url.pathname==='/v1/rewards/programs'||url.pathname==='/v1/rewards/programs/snapshot'){res.end(JSON.stringify({records:[programCatalog,issuerCatalog]}));return;}
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
    for(const [name,list,set] of [['subscriptions',()=>subscriptions,value=>{subscriptions=value;}],['finance',()=>finance,value=>{finance=value;}],['personal',()=>personal,value=>{personal=value;}],['health',()=>health,value=>{health=value;}],['reminders',()=>reminders,value=>{reminders=value;}],['gifts',()=>gifts,value=>{gifts=value;}],['sizes',()=>sizes,value=>{sizes=value;}],['replacements',()=>replacements,value=>{replacements=value;}]]){
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
    // What a typed note reads back as, so quick add can be operated without a
    // model call. The note itself decides only whether it fails.
    if(url.pathname===`/v1/ai-connections/${id}/capture`){
      let text='';for await(const data of req)text+=data;const {note,today}=JSON.parse(text);
      if(String(note).includes('failure')){res.statusCode=422;res.end('{"error":"That does not name anything to keep."}');return;}
      if(/gift|would like|wants/i.test(String(note))){
        res.end(JSON.stringify({capability:'gifts',path:'/v1/gifts',
          record:{person:'Celeste',idea:'Butterfly net',link:'',status:'Idea'},
          summary:'Butterfly net · for Celeste'}));return;
      }
      if(/paint|pillow|cable|cartridge|again/i.test(String(note))){
        res.end(JSON.stringify({capability:'replacements',path:'/v1/replacements',
          record:{item:'Kitchen bulbs',variant:'Philips Ultra Definition BR30, 2700K',where:'',note:''},
          summary:'Kitchen bulbs · Philips Ultra Definition BR30, 2700K'}));return;
      }
      if(/size|medium|large|small|inseam|waist|chest|wear/i.test(String(note))){
        res.end(JSON.stringify({capability:'sizes',path:'/v1/sizes',
          record:{brand:'Patagonia',item:'Better Sweater',size:'M',fit:''},
          summary:'Better Sweater · M · Patagonia'}));return;
      }
      res.end(JSON.stringify({capability:'reminders',path:'/v1/reminders',
        record:{kind:'Birthday',title:'Derek’s birthday',subject:'',date:today,every:12,since:'',notice:14,completed:'',notes:''},
        summary:'Derek’s birthday · Every year · Today'}));return;
    }
    if(url.pathname===`/v1/ai-connections/${id}/finance-intake`){
      let text='';for await(const data of req)text+=data;const {text:input}=JSON.parse(text);
      if(String(input).includes('failure')){res.statusCode=502;res.end('{"error":"Synthetic reading failure"}');return;}
      // Labelled readings, which the device folds into figures. The two
      // holdings do not add up to the account total above them, which is the
      // case worth being able to see: the total is kept whole rather than
      // replaced by a partial list of what is inside it.
      res.end(JSON.stringify({readings:[
        {account:'Synthetic brokerage',label:'Net Account Value',class:'unclassified',registration:'',scope:'account',value:412350,asOf:'2026-09-05',confidence:'high',reason:'The text states a balance and a date.'},
        {account:'Synthetic brokerage',label:'SYNTHETIC BANK CD 4.05% 10/30/2026',class:'bonds',registration:'',scope:'holding',value:99.97,asOf:'2026-09-05',confidence:'high',reason:'One holding inside the account.'},
        {account:'Synthetic retirement account',label:'Total value',class:'unclassified',registration:'ira',scope:'account',value:250000,asOf:'2026-08-31',confidence:'low',reason:'The valuation date should be confirmed.'}
      ],unread:'One line mentioned a wire with no amount, so it was left out.'}));return;
    }
    if (url.pathname === '/v1/push/subscriptions') {res.end(JSON.stringify({records:pushSubscriptions.map(({id,revision,timeZone,hour})=>({id,revision,timeZone,hour,host:'preview'}))}));return;}
    if (url.pathname.startsWith('/v1/push/subscriptions/')) {
      const id=url.pathname.split('/').at(-1);let text='';for await(const data of req)text+=data;const value=JSON.parse(text||'{}');
      const previous=pushSubscriptions.find(record=>record.id===id);
      if((previous?.revision??null)!==(value.revision??null)){res.statusCode=409;res.end('{}');return;}
      pushSubscriptions=pushSubscriptions.filter(record=>record.id!==id);
      if(req.method==='PUT'){
        const record={...normalizePushSubscription(value,previous||{}),id,revision:crypto.randomUUID()};
        pushSubscriptions.push(record);res.end(JSON.stringify({record:{id,revision:record.revision}}));return;
      }
      res.end('{}');return;
    }
    // The real sending path against the real push service, so the encryption is
    // exercised end to end rather than only against itself.
    if (url.pathname === '/v1/push/test') {
      if(!pushSubscriptions.length){res.statusCode=400;res.end('{"error":"No device is subscribed yet."}');return;}
      const digest=reminderDigest(reminders,new Date().toISOString().slice(0,10))||{title:'Eric’s Tools',body:'Reminders are working on this device.'};
      const results=[];
      for(const subscription of pushSubscriptions){
        try{results.push(await sendPush(subscription,JSON.stringify({...digest,url:'/app/',tag:'test'}),vapid));}
        catch(error){results.push({ok:false,status:0,error:String(error?.message||error)});}
      }
      res.end(JSON.stringify({results}));return;
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
