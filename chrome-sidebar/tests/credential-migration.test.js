import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateCredentials} from '../src/credential-migration.js';
const id='a5bb73f0-738b-4cf6-9862-41c6468cf40a';
function setup(){let records=[{id,name:'OpenAI',secret:'synthetic-key'}];return {get:async()=>({personalToolCredentials:structuredClone(records)}),set:async data=>{records=data.personalToolCredentials;}};}
test('migration uploads a legacy key and removes it only after D1 acknowledgement',async()=>{
 const storage=setup();let calls=0;
 const result=await migrateCredentials(storage,'token',async(token,path,options)=>{
   assert.equal((await storage.get()).personalToolCredentials.length,1);assert.equal(token,'token');assert.equal(path,`/v1/ai-connections/${id}`);
   assert.equal(options.value.apiKey,'synthetic-key');assert.equal(options.value.provider,'openai');assert.equal(options.value.revision,null);calls++;
   return {connection:{id,hasApiKey:true}};
 });
 assert.deepEqual(result,{moved:1,remaining:0});assert.equal(calls,1);
 await migrateCredentials(storage,'token',()=>assert.fail('Already migrated'));
});
test('network errors, conflicts and unconfirmed saves preserve the local key',async()=>{
 for(const request of [async()=>{throw Error('Offline');},async()=>{throw Error('Changed elsewhere');},async()=>({connection:{id,hasApiKey:false}})]){
 const storage=setup();await assert.rejects(migrateCredentials(storage,'token',request));assert.equal((await storage.get()).personalToolCredentials[0].secret,'synthetic-key');
 }
});
