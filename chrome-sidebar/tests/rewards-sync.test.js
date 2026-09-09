import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRewards} from '../src/rewards-sync.js';
import {REWARDS_KEY,validateReward} from '../src/rewards-data.js';
const entry=validateReward({name:'Test',source:'Airline',value:'100 miles',kind:'balance',state:'available'});
function storage(){return {removed:false,async get(){return {[REWARDS_KEY]:[entry]};},async remove(){this.removed=true;}};}
test('migration uploads once and removes local records only after acknowledgement',async()=>{
 const s=storage();let cloud={entries:[],revision:null},writes=0;
 const request=async(action,value)=>{if(action==='rewards-list')return cloud;writes++;cloud={entries:value.entries,revision:'saved'};return cloud;};
 assert.equal((await loadRewards(s,request)).entries[0].id,entry.id);assert.equal(s.removed,true);assert.equal(writes,1);
 await loadRewards(storage(),request);assert.equal(writes,1);
});
test('failed migration and incomplete acknowledgement preserve local entries',async()=>{
 for(const mode of ['failure','incomplete']){const s=storage();await assert.rejects(loadRewards(s,async action=>{if(action==='rewards-list')return {entries:[],revision:null};if(mode==='failure')throw Error('Offline');return {entries:[],revision:'incomplete'};}));assert.equal(s.removed,false);}
});
