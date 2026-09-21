import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCard,compareCards,parseClassification,parsePurchaseIntent,parseCardMatches,walletCards,cardProductName,cardDigits,merchantPerks,sameMerchant} from '../src/card-data.js';
import {cardsOffline} from '../src/cards-offline.js';
import {mountCards} from '../src/cards.js';
import {parseHTML} from 'linkedom';
const bonus=(extra={})=>({category:'Dining',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:'',...extra});
const card=(extra={})=>({id:'card',...normalizeCard({name:'Synthetic card',unit:'cash',base:1,cpp:1,rules:JSON.stringify([bonus()]),checked:'2026-09-09',...extra})});
const purchase={category:'Dining',channel:'Direct',amount:100};
test('cash and points compare in dollars with explicit valuation, caps, and ties',()=>{
  const rows=compareCards([card({name:'Cash'}),card({name:'Points',unit:'points',base:1,cpp:1.5,rules:JSON.stringify([bonus({rate:2})])})],purchase,'2026-09-09');
  assert.deepEqual(rows.map(r=>r.dollars),[3,3]);assert.equal(rows.find(r=>r.unit==='points').earned,200);
  assert.equal(compareCards([card({rules:JSON.stringify([bonus({rate:5,remaining:25})])})],purchase)[0].dollars,2);
  assert.equal(compareCards([card({rules:JSON.stringify([bonus({remaining:0})])})],purchase)[0].dollars,1);
});
test('bonuses never stack or count without activation, valid date, channel and confirmed requirements',()=>{
  for(const change of [{active:false},{end:'2026-09-08'},{channel:'Issuer portal'},{condition:'Only eligible US restaurants'}])assert.equal(compareCards([card({rules:JSON.stringify([bonus(change)])})],purchase,'2026-09-09')[0].dollars,1);
  const conditional=card({rules:JSON.stringify([bonus({condition:'Only eligible US restaurants'})])});
  assert.equal(compareCards([conditional],{...purchase,confirmed:['card:0']},'2026-09-09')[0].dollars,3);
  assert.equal(compareCards([card({rules:JSON.stringify([bonus(),bonus({rate:5})])})],purchase)[0].dollars,5);
  assert.equal(compareCards([{...card(),conflict:true},{...card(),deleting:true}],purchase).length,0);
});
test('rates, dates, source URLs and category output reject malformed values',()=>{
  for(const extra of [{name:''},{base:-1},{base:Infinity},{cpp:'invalid',unit:'points'},{source:'javascript:alert(1)'},{checked:'2026-02-30'},{rules:'{}'},{rules:JSON.stringify([bonus({remaining:-10})])}])assert.throws(()=>card(extra));
  for(const amount of [-1,0,Infinity,'not a number'])assert.throws(()=>compareCards([card()],{...purchase,amount}));
  assert.throws(()=>parseClassification({category:'Invented',confidence:'high',reason:''}));
  assert.equal(parseClassification({category:'Other',confidence:'low',reason:'Merchant uncertain'}).confidence,'low');
});
test('a free-text reading keeps merchant, method and amount but never invents them',()=>{
  const read=extra=>parsePurchaseIntent({category:'Dining',confidence:'high',reason:'Restaurant',...extra});
  assert.deepEqual(read({merchant:'Cote',channel:'In store',amount:'400'}),{category:'Dining',confidence:'high',reason:'Restaurant',merchant:'Cote',channel:'In store',amount:400});
  // A vague description yields no merchant, no amount, and the neutral method.
  assert.deepEqual(read({}),{category:'Dining',confidence:'high',reason:'Restaurant',merchant:'',channel:'Direct',amount:null});
  // A malformed extra is dropped rather than failing the whole reading.
  for(const extra of [{amount:'free'},{amount:-5},{amount:0},{channel:'Invented'}])assert.equal(read(extra).category,'Dining');
  assert.equal(read({amount:'free'}).amount,null);assert.equal(read({channel:'Invented'}).channel,'Direct');
  assert.throws(()=>parsePurchaseIntent({category:'Invented',confidence:'high',reason:''}));
});
test('a purchase with no stated amount is compared on effective rate',()=>{
  const rateOnly=compareCards([card({name:'Bonus'}),card({name:'Base',rules:'[]'})],{category:'Dining',channel:'Direct',amount:''},'2026-09-09');
  assert.deepEqual(rateOnly.map(row=>row.rate),[3,1]);
  assert.deepEqual(rateOnly.map(row=>row.estimated),[false,false]);
  // Without an amount a cap cannot be applied, so the bonus is scored in full and the cap disclosed.
  const capped=compareCards([card({rules:JSON.stringify([bonus({rate:5,remaining:25})])})],{category:'Dining',channel:'Direct'},'2026-09-09')[0];
  assert.equal(capped.rate,5);assert.ok(capped.warnings.some(w=>w.includes('$25')));
  // An exhausted bonus still falls back to the base rate.
  assert.equal(compareCards([card({rules:JSON.stringify([bonus({rate:5,remaining:0})])})],{category:'Dining',channel:'Direct'})[0].rate,1);
});
test('an ambiguous card name returns named alternatives, never a guess',()=>{
  const matches=parseCardMatches([{name:'Synthetic Preferred (United States)',note:'$95 annual fee'},{name:'Synthetic Reserve (United States)'}]);
  assert.deepEqual(matches.map(m=>m.name),['Synthetic Preferred (United States)','Synthetic Reserve (United States)']);
  assert.equal(matches[1].note,'');
  // One candidate is not a choice, and neither an empty list nor a long one is usable.
  for(const value of [[],[{name:'Only one'}],Array.from({length:7},()=>({name:'Card'})),'matches',null])assert.throws(()=>parseCardMatches(value));
  for(const value of [[{name:''},{name:'Card'}],[{name:'x'.repeat(121)},{name:'Card'}],[{name:'Card',note:'x'.repeat(201)},{name:'Other'}]])assert.throws(()=>parseCardMatches(value));
});
test('card queue survives cold offline reopen, reconciles writes and conflicts, and clears on disconnect',async()=>{
  let saved=null,connected=true,cloud=[],calls=0;
  const store={read:async()=>structuredClone(saved),write:async(_r,_t,value)=>{saved=structuredClone(value);},remove:async()=>{saved=null;}};
  const remote=async(_token,path,{method,value}={})=>{calls++;if(path.endsWith('/snapshot'))return {records:structuredClone(cloud)};
    const id=path.split('/').at(-1);if(method==='DELETE'){cloud=cloud.filter(r=>r.id!==id);return {};}
    const record={...value,id,revision:crypto.randomUUID()};cloud=[record];return {record};
  };
  const options={store,remote,online:()=>connected,locks:null};
  let adapter=cardsOffline(options);await adapter.request('synthetic','/v1/cards');
  connected=false;
  await adapter.request('synthetic','/v1/cards/id',{method:'PUT',value:card()});
  adapter=cardsOffline(options);const before=calls;
  const cached=await adapter.request('synthetic','/v1/cards');assert.equal(cached.records[0].name,'Synthetic card');assert.equal(calls,before);
  assert.equal((await adapter.request('synthetic','/v1/cards/id')).record.base,1);
  await assert.rejects(adapter.disconnect('synthetic'),/pending/);
  connected=true;await adapter.request('synthetic','/v1/cards');assert.equal(await adapter.hasPending('synthetic'),false);
  connected=false;await adapter.request('synthetic','/v1/cards/id',{method:'PUT',value:{...cloud[0],name:'Local'}});
  cloud[0]={...cloud[0],name:'Cloud',revision:'changed'};connected=true;
  const conflict=await adapter.request('synthetic','/v1/cards');assert.equal(conflict.records[0].conflict,true);
  await adapter.resolve('synthetic','id','local');assert.equal(cloud[0].name,'Local');
  await adapter.disconnect('synthetic');assert.equal(saved,null);
});

test('the wallet says which cards the owner holds, whatever an issuer page calls them',()=>{
  const entries=[
    {id:'a',kind:'card',name:'The Platinum Card® from American Express',secretHint:'1005'},
    // The same card, named by the page a credit was read off. One card, once.
    {id:'b',kind:'benefit',name:'$200 Airline Fee Credit',source:'Platinum Card® (-61007)'},
    {id:'c',kind:'benefit',name:'$7 Monthly Dining Credit',source:'Blue Cash Preferred® Card (-31002)'},
    // A program is not a card, and neither is a balance.
    {id:'d',kind:'balance',name:'Membership Rewards',source:'American Express',value:'42,000 points'},
    {id:'e',kind:'membership',name:'Priority Pass Select',source:'American Express'},
    {id:'f',kind:'card',name:'Deleted card',deleting:true}
  ];
  const held=walletCards(entries,[{id:'x',name:'The Platinum Card® from American Express (United States)'}]);
  assert.deepEqual(held.map(row=>row.product),['The Platinum Card® from American Express','Blue Cash Preferred® Card']);
  // A card already saved here with its rates is linked, not offered again.
  assert.equal(held[0].card.id,'x');
  assert.equal(held[1].card,null);
  // The account an issuer prints beside a card stays out of the product name.
  assert.deepEqual(held.map(row=>row.digits),['1005','1002']);
  for(const [name,product,digits] of [
    ['Morgan Stanley Platinum Card® (-61007)','Morgan Stanley Platinum Card®','1007'],
    ['Sapphire Reserve (...4321)','Sapphire Reserve','4321'],
    ['Blue Cash Everyday ending in 1009','Blue Cash Everyday','1009'],
    ['Amex Gold ••••1002','Amex Gold','1002'],
    // A product name that simply contains a number keeps it.
    ['my citi 2% card','my citi 2% card','']
  ]){assert.equal(cardProductName(name),product);assert.equal(cardDigits(name),digits);}
  // A name that fits two saved cards equally is left alone: adding it again
  // would put a second copy of one of them into the comparison.
  const twins=[{id:'p',name:'Blue Cash Preferred'},{id:'e',name:'Blue Cash Everyday'}];
  assert.equal(walletCards([{id:'g',kind:'card',name:'Blue Cash (-31002)'}],twins)[0].ambiguous,true);
  // A card is only the one it names in full. Two cards of the same family share
  // every word but the one that tells them apart, and taking one for the other
  // is how a card the owner holds never gets offered at all.
  const reserve=walletCards([{id:'h',kind:'card',name:'Chase Sapphire Reserve (-4321)'}],[{id:'s',name:'Chase Sapphire Preferred Card'}])[0];
  assert.equal(reserve.card,null);assert.equal(reserve.ambiguous,false);
  assert.equal(walletCards([{id:'h',kind:'card',name:'Chase Sapphire Reserve (-4321)'}],[{id:'s',name:'Chase Sapphire Reserve Card (United States)'}])[0].card.id,'s');
  assert.deepEqual(walletCards([],[]),[]);
});

// The tool itself, mounted over a synthetic wallet: a card the owner already
// told this app about once is not something to type in again.
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the card tool to settle.');
};
function harness(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  return {document,window,restore:()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor)};
}
// The shared formatted select keeps a hidden native select as its data source,
// which this DOM does not give a working value of its own.
function shim(document,values){
  for(const [id,initial] of Object.entries(values)){
    let value=initial;
    Object.defineProperty(document.getElementById(id),'value',{configurable:true,get:()=>value,set:next=>{value=next;}});
  }
}
test('a card the wallet holds is listed here, researched by its product name, and linked once saved',async()=>{
  const h=harness();
  // Read off an issuer's own benefits page: the credit names the card, and the
  // card names the account it belongs to.
  const entries=[{id:'b',kind:'benefit',name:'$200 Airline Fee Credit',source:'Platinum Card® (-61007)',state:'available',value:'$200'}];
  const saved=[];const researched=[];
  const offline={request:async(_token,path,options)=>{
    if(options?.method==='PUT'){saved.push({...options.value,id:path.split('/').at(-1),revision:'one'});return {records:[...saved],syncMessage:''};}
    return {records:[...saved],syncMessage:''};
  }};
  const remote=async(_token,path,options)=>{
    if(path==='/v1/ai-connections')return {connections:[{id:'ai',hasApiKey:true,provider:'openai'}]};
    if(path.endsWith('/card-research')){researched.push(options.value.name);
      return {card:{name:'The Platinum Card® from American Express (United States)',unit:'points',base:1,cpp:2,rules:'[]',source:'https://www.americanexpress.com/terms',checked:'2026-09-20',notes:''}};}
    throw Error(`unexpected request: ${path}`);
  };
  const tool=mountCards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},offline,remote,
    wallet:{saved:async()=>entries,request:async()=>({records:entries})}});
  shim(h.document,{'cards-category':'','cards-channel':'Direct','cards-unit':'cash'});
  await tool.ready;
  const $=id=>h.document.getElementById(id);
  // The first refresh downloads the cards and then reloads for the connection
  // it arrived with, so the tool is idle only once its controls come back.
  const idle=()=>settle(()=>!$('cards-compare').disabled);
  await idle();
  const rows=()=>[...h.document.querySelectorAll('#cards-known .record-row')];
  assert.deepEqual(rows().map(row=>row.querySelector('strong').textContent),['Platinum Card®']);
  assert.match(rows()[0].textContent,/Card ending 1007/);
  // A recommendation made without a card the owner holds says so.
  $('cards-category').value='Dining';$('cards-category').dispatchEvent(new h.window.Event('change',{bubbles:true}));
  $('cards-purchase-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  await settle(()=>$('cards-results').textContent);
  assert.match($('cards-results').textContent,/1 card in your wallet has no rates yet/);
  // One press researches the product, never the account printed beside it.
  await idle();
  rows()[0].querySelector('button[aria-label^="Find the rewards"]').click();
  await settle(()=>researched.length===1);
  assert.deepEqual(researched,['Platinum Card®']);
  assert.equal($('cards-name').value,'The Platinum Card® from American Express (United States)');
  await idle();
  $('cards-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  await settle(()=>saved.length===1);
  assert.equal(saved[0].name,'The Platinum Card® from American Express (United States)');
  // Saved, it is this tool's card: the wallet no longer offers it.
  assert.deepEqual(rows(),[]);
  h.restore();
});
test('no wallet, or one that cannot be read, leaves the saved cards exactly as they are',async()=>{
  const h=harness();
  const card=normalizeCard({name:'Synthetic card',unit:'cash',base:1,cpp:1,rules:'[]',checked:'2026-09-20'});
  const offline={request:async()=>({records:[{...card,id:'one',revision:'one'}],syncMessage:''})};
  const remote=async()=>({connections:[]});
  for(const wallet of [null,{saved:async()=>{throw Error('Wallet unavailable');},request:async()=>{throw Error('Wallet unavailable');}}]){
    const tool=mountCards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},offline,remote,wallet});
    shim(h.document,{'cards-unit':'cash'});
    await tool.ready;
    await settle(()=>!h.document.getElementById('cards-compare').disabled);
    assert.equal(h.document.getElementById('cards-known').childNodes.length,0);
    assert.match(h.document.getElementById('cards-list').textContent,/Synthetic card/);
  }
  h.restore();
});

// A reward good at one shop rather than across a kind of shop.
test('a rebate at a named merchant is compared where that merchant is, and nowhere else',()=>{
  const rules=JSON.stringify([
    {category:'Dining',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:'',merchant:''},
    {category:'Department stores',channel:'Any',rate:10,remaining:null,active:true,end:'',condition:'',merchant:'Saks Fifth Avenue'}
  ]);
  const saved=card({name:'Merchant card',rules});
  const at=(merchant,category='Online shopping')=>compareCards([saved],{category,channel:'Direct',amount:100,merchant},'2026-09-09')[0];
  // The merchant decides, not the category the reading happened to choose.
  assert.equal(at('Saks').dollars,10);
  assert.equal(at('Saks Fifth Avenue','Department stores').dollars,10);
  assert.equal(at('Saks').matched.merchant,'Saks Fifth Avenue');
  // Another shop of the same kind gets the base rate, and so does a purchase
  // that names no merchant at all.
  assert.equal(at('Nordstrom').dollars,1);
  assert.equal(at('').dollars,1);
  // A rule with no merchant is still a category rule.
  assert.equal(compareCards([saved],{category:'Dining',channel:'Direct',amount:100},'2026-09-09')[0].dollars,3);
  // One name inside the other is the same merchant; nothing else is.
  for(const [a,b] of [['Uber','Uber Eats'],['Saks Fifth Avenue','saks'],['Amazon','amazon.com']])assert.equal(sameMerchant(a,b),true,`${a} / ${b}`);
  for(const [a,b] of [['Uber','Lyft'],['Saks','Sak'],['',''],['Amazon','']])assert.equal(sameMerchant(a,b),false,`${a} / ${b}`);
  // A merchant rule survives a card being saved again: it is a stored field,
  // not something the comparison works out.
  assert.equal(JSON.parse(normalizeCard({...saved,rules}).rules)[1].merchant,'Saks Fifth Avenue');
});

test('what the wallet gives at that merchant is said beside the card, never added to it',()=>{
  const entries=[
    {id:'w1',kind:'card',name:'The Platinum Card'},
    {id:'p1',kind:'benefit',name:'Uber Cash',value:'$15 per month',card:'w1',state:'available',remaining:'$15'},
    {id:'p2',kind:'benefit',name:'Airline fee credit',value:'$200 a year',card:'w1',state:'available'},
    {id:'p3',kind:'membership',name:'Walmart+ membership',value:'Included',card:'w1',state:'used'},
    {id:'p4',kind:'benefit',name:'Dining credit',value:'$10 monthly',card:'w1',state:'activation',notes:'Good at Grubhub and Seamless'},
    {id:'p5',kind:'benefit',name:'Uber Cash',value:'$15 per month',card:'w2',state:'available'}
  ];
  // Found by a word of the merchant's name, because a benefit is not named
  // after the merchant the way a rule is.
  assert.deepEqual(merchantPerks(entries,'w1','Uber Eats').map(perk=>[perk.name,perk.remaining]),[['Uber Cash','$15']]);
  // The note beside a benefit counts, and so does what needs activating.
  assert.deepEqual(merchantPerks(entries,'w1','Grubhub').map(perk=>[perk.name,perk.state]),[['Dining credit','activation']]);
  // A used perk is not offered, another card's is not this card's, and a
  // merchant nothing mentions has none.
  for(const [id,merchant] of [['w1','Walmart'],['w1','Nordstrom'],['','Uber'],['w1','']])
    assert.deepEqual(merchantPerks(entries,id,merchant),[]);
});
