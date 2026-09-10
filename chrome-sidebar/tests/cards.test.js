import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCard,compareCards,parseClassification,parsePurchaseIntent} from '../src/card-data.js';
import {cardsOffline} from '../src/cards-offline.js';
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
