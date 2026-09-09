import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
test('latest release is readable without credentials and returns only the version',async()=>{
 const env={DB:{prepare:sql=>{assert.match(sql,/SELECT version FROM app_releases/);return {bind:app=>{assert.equal(app,'chrome-sidebar');return {first:async()=>({version:'0.6.41'})};}};}}};
 const response=await worker.fetch(new Request('https://example.com/v1/releases/latest'),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{version:'0.6.41'});
 const denied=await worker.fetch(new Request('https://example.com/v1/ai-connections'),env);assert.equal(denied.status,401);
});
test('mobile release is independent and unknown app names are rejected',async()=>{
 const env={DB:{prepare:()=>({bind:app=>{assert.equal(app,'mobile-app');return {first:async()=>({version:'0.1.0'})};}})}};
 const response=await worker.fetch(new Request('https://example.com/v1/releases/latest?app=mobile-app'),env);assert.deepEqual(await response.json(),{version:'0.1.0'});
 assert.equal((await worker.fetch(new Request('https://example.com/v1/releases/latest?app=unknown'),env)).status,400);
});
test('public app assets retain their body, security headers and API authorization',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('<h1>Eric’s Tools</h1>',{headers:{'Content-Type':'text/html'}})}};
 const page=await worker.fetch(new Request('https://example.com/app/'),env);assert.match(await page.text(),/Eric’s Tools/);assert.match(page.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 const frame=await worker.fetch(new Request('https://example.com/app/unlocked.html'),env);assert.match(frame.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);assert.match(frame.headers.get('Content-Security-Policy'),/form-action 'none'/);
 assert.equal((await worker.fetch(new Request('https://example.com/app'),env)).status,308);
 assert.equal((await worker.fetch(new Request('https://example.com/v1/ai-connections'),env)).status,401);
});
