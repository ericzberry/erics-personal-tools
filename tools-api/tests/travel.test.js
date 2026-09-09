import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {normalizeTravel} from '../src/travel.js';
test('travel validates required fields, categories, and actual dates',()=>{
  const base={name:'Synthetic airline',number:'001234',category:'Airline'};
  assert.equal(normalizeTravel(base).number,'001234');
  for(const change of [{number:''},{name:' '},{category:'Unknown'},{expires:'2026-02-30'},{notes:'x'.repeat(2001)}])assert.throws(()=>normalizeTravel({...base,...change}));
  assert.equal(normalizeTravel({name:'Updated'},base).number,'001234');
});
test('authenticated encrypted travel CRUD shares records and rejects stale writes',async()=>{
  const {outputFiles}=await build({entryPoints:[new URL('../src/index.js',import.meta.url).pathname],bundle:true,format:'esm',write:false,platform:'browser'});
  const token='synthetic-travel-token-'.repeat(3);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text,d1Databases:['DB'],bindings:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'ab'.repeat(32)}}));
  try{
    const db=await mf.getD1Database('DB');await db.exec(await readFile(new URL('../travel-schema.sql',import.meta.url),'utf8').then(s=>s.replace(/\n/g,' ')));
    const id='11111111-1111-4111-8111-111111111111';
    const call=(path='',method='GET',value,auth=token)=>mf.dispatchFetch(`http://localhost/v1/travel${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});
    assert.equal((await call('','GET',undefined,'wrong')).status,401);
    const value={name:'Synthetic airline',category:'Airline',number:'00123456789',notes:'Private synthetic notes',revision:null};
    const saved=await (await call(`/${id}`,'PUT',value)).json();assert.ok(saved.record.revision);assert.equal(saved.record.number,undefined);
    const list=await (await call()).json();assert.equal(list.records.length,1);assert.equal(list.records[0].notes,undefined);
    const snapshot=await (await call('/snapshot')).json();assert.equal(snapshot.records[0].number,value.number);assert.equal(snapshot.records[0].notes,value.notes);
    assert.equal((await call('/snapshot','GET',undefined,'wrong')).status,401);
    const row=await db.prepare('SELECT value FROM travel_records WHERE id = ?').bind(id).first();assert.ok(!row.value.includes(value.number));assert.ok(!row.value.includes(value.notes));
    const detail=await (await call(`/${id}`)).json();assert.equal(detail.record.number,value.number);
    assert.equal((await call(`/${id}`,'PUT',value)).status,409);
    const next=await (await call(`/${id}`,'PUT',{name:'Renamed',revision:saved.record.revision})).json();
    assert.equal((await (await call(`/${id}`)).json()).record.number,value.number);
    assert.equal((await call(`/${id}`,'DELETE',{revision:saved.record.revision})).status,409);
    assert.equal((await call(`/${id}`,'DELETE',{revision:next.record.revision})).status,200);
    assert.equal((await (await call()).json()).records.length,0);
  }finally{await mf.dispose();}
});
