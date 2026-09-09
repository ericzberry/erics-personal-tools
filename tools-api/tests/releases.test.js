import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
test('latest release is readable without credentials and returns only the version',async()=>{
 const env={DB:{prepare:sql=>{assert.match(sql,/SELECT version FROM app_releases/);return {bind:app=>{assert.equal(app,'chrome-sidebar');return {first:async()=>({version:'0.6.41'})};}};}}};
 const response=await worker.fetch(new Request('https://example.com/v1/releases/latest'),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{version:'0.6.41'});
 const denied=await worker.fetch(new Request('https://example.com/v1/ai-connections'),env);assert.equal(denied.status,401);
});
