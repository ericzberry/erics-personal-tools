import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardsOffline} from '../src/rewards-offline.js';
import {validateReward} from '../src/rewards-data.js';
const a=validateReward({id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',kind:'balance',name:'Test airline',source:'Test',value:'400 miles',state:'available'});
function fixture(){
 let online=true,lose=false,writes=0,wallet={entries:[a],revision:'first'};const db=new Map();
 const store={read:async k=>structuredClone(db.get(k)),write:async(k,t,v)=>{db.set(k,structuredClone(v));},remove:async k=>db.delete(k)};
 const remote=async(t,path,options={})=>{if(!online)throw Error('Offline');if(options.method){assert.equal(options.value.revision,wallet.revision);wallet={...structuredClone(options.value),revision:crypto.randomUUID()};writes++;if(lose){lose=false;throw Error('Lost response');}}return structuredClone(wallet);};
 return {create:()=>rewardsOffline({store,remote,online:()=>online,locks:null}),offline:()=>online=false,online:()=>online=true,lose:()=>lose=true,get wallet(){return wallet;},writes:()=>writes};
}
test('rewards survive cold offline reopen and merge unrelated cloud changes',async()=>{
 const f=fixture();let adapter=f.create();const original=(await adapter.request('token','/v1/rewards')).records[0];f.offline();
 await adapter.request('token',`/v1/rewards/${a.id}`,{method:'PUT',value:{...original,value:'500 miles'}});
 adapter=f.create();assert.equal((await adapter.request('token','/v1/rewards')).records[0].value,'500 miles');
 await assert.rejects(adapter.disconnect('token'),/pending/);
 f.wallet.entries.push({...a,id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Other device reward'});f.online();
 const result=await adapter.request('token','/v1/rewards');assert.equal(result.records.length,2);assert.equal(f.wallet.entries.find(e=>e.id===a.id).value,'500 miles');assert.equal(await adapter.hasPending('token'),false);
});
test('rewards reconcile lost success without duplicate writes and preserve same-record conflicts',async()=>{
 const f=fixture(),adapter=f.create();let entry=(await adapter.request('token','/v1/rewards')).records[0];f.lose();
 await adapter.request('token',`/v1/rewards/${a.id}`,{method:'PUT',value:{...entry,value:'600 miles'}});
 assert.equal(await adapter.hasPending('token'),true);entry=(await adapter.request('token','/v1/rewards')).records[0];assert.equal(f.writes(),1);assert.equal(await adapter.hasPending('token'),false);
 f.offline();await adapter.request('token',`/v1/rewards/${a.id}`,{method:'DELETE',value:entry});f.wallet.entries[0].value='700 miles';f.online();
 assert.equal((await adapter.request('token','/v1/rewards')).records[0].conflict,true);
 await adapter.resolve('token',a.id,'cloud');assert.equal(f.wallet.entries[0].value,'700 miles');assert.equal(await adapter.hasPending('token'),false);
 await adapter.disconnect('token');f.offline();await assert.rejects(adapter.request('token','/v1/rewards'),/once|offline/i);
});

test('a benefit keeps the card it belongs to and the period it resets on all the way to the cloud',async()=>{
 const f=fixture(),adapter=f.create();
 const card=validateReward({id:'cccccccc-cccc-cccc-cccc-cccccccccccc',kind:'card',name:'Test card',source:'Test bank',value:'5x flights',state:'available'});
 const benefit=validateReward({id:'dddddddd-dddd-dddd-dddd-dddddddddddd',kind:'benefit',name:'Ride credit',source:card.name,value:'$15 per month',state:'activation',cadence:'monthly',card:card.id});
 await adapter.request('token','/v1/rewards');
 await adapter.request('token',`/v1/rewards/${card.id}`,{method:'PUT',value:{...card,revision:null}});
 await adapter.request('token',`/v1/rewards/${benefit.id}`,{method:'PUT',value:{...benefit,revision:null}});
 // A field the sync layer does not carry is a field the wallet silently loses,
 // which would unfile every researched benefit from its card.
 const stored=f.wallet.entries.find(entry=>entry.id===benefit.id);
 assert.equal(stored.card,card.id);
 assert.equal(stored.cadence,'monthly');
 const reloaded=(await f.create().request('token','/v1/rewards')).records.find(entry=>entry.id===benefit.id);
 assert.equal(reloaded.card,card.id);
 assert.equal(reloaded.cadence,'monthly');
});
