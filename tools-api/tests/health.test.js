import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {normalizeHealth} from '../../chrome-sidebar/src/health-data.js';

// A device-sealed envelope as the vault writes it. The Worker never holds the
// key, so what is inside it is beside the point here.
const sealed=text=>JSON.stringify({v:1,iv:'c3ludGhldGljLWl2',ciphertext:Buffer.from(text).toString('base64url')});

test('the health route stores only sealed envelopes, checks revisions atomically, and answers a replayed write with the record',async()=>{
  const {outputFiles}=await build({entryPoints:[new URL('../src/index.js',import.meta.url).pathname],bundle:true,format:'esm',write:false,platform:'browser'});
  const token='synthetic-health-token-'.repeat(3);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text,d1Databases:['DB'],bindings:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'ab'.repeat(32)}}));
  try{
    const db=await mf.getD1Database('DB');
    await db.exec((await readFile(new URL('../health-schema.sql',import.meta.url),'utf8')).replace(/--[^\n]*\n/g,' ').replace(/\n/g,' '));
    const id='11111111-1111-4111-8111-111111111111',operation='22222222-2222-4222-8222-222222222222';
    const call=(path='',method='GET',value,auth=token)=>mf.dispatchFetch(`http://localhost/v1/health${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});
    assert.equal((await call('','GET',undefined,'wrong')).status,401);
    // Plaintext is refused whatever else the write carries.
    const refused=await call(`/${id}`,'PUT',{secret:'My dad had Parkinson’s',revision:null});
    assert.equal(refused.status,400);
    assert.match((await refused.json()).error,/encrypted on your device/);
    assert.equal((await call(`/${id}`,'PUT',{note:'My dad had Parkinson’s',type:'Condition',revision:null})).status,400);
    const envelope=sealed('synthetic sealed health record');
    const saved=await (await call(`/${id}`,'PUT',{secret:envelope,revision:null,operation})).json();
    assert.equal(saved.record.revision,operation,'the write is named by its operation');
    assert.equal(saved.record.secret,envelope);
    assert.equal(saved.record.note,undefined,'nothing but the envelope comes back');
    // A retry of the same operation finds its own name and is answered, not refused.
    assert.equal((await call(`/${id}`,'PUT',{secret:envelope,revision:null,operation})).status,200);
    // A stale base revision is a conflict.
    assert.equal((await call(`/${id}`,'PUT',{secret:sealed('later'),revision:null})).status,409);
    const snapshot=await (await call('/snapshot')).json();
    assert.deepEqual(Object.keys(snapshot.records[0]).sort(),['id','revision','secret','updatedAt','v']);
    const row=await db.prepare('SELECT value FROM health_records WHERE id = ?').bind(id).first();
    assert.equal(row.value.includes(envelope),false,'the Worker seals the envelope again at rest');
    assert.equal(row.value.includes('sealed health record'),false);
    const next=await (await call(`/${id}`,'PUT',{secret:sealed('second'),revision:operation})).json();
    assert.notEqual(next.record.revision,operation);
    assert.equal((await call(`/${id}`,'DELETE',{revision:operation})).status,409,'a delete names the revision it deletes');
    assert.equal((await call(`/${id}`,'DELETE',{revision:next.record.revision})).status,200);
    assert.equal((await (await call('/snapshot')).json()).records.length,0);
    // A stale edit of a deleted record cannot bring it back.
    assert.equal((await call(`/${id}`,'PUT',{secret:sealed('ghost'),revision:next.record.revision})).status,409);
  }finally{await mf.dispose();}
});

test('the shared validator keeps the envelope and nothing else',()=>{
  const envelope=sealed('x');
  assert.deepEqual(normalizeHealth({secret:envelope,note:'plain',relative:'Dad'}),{v:1,secret:envelope});
  assert.deepEqual(normalizeHealth({},{v:1,secret:envelope}),{v:1,secret:envelope},'a write naming no secret keeps what is stored');
  assert.throws(()=>normalizeHealth({secret:'x'.repeat(70*1024)}),/too large/);
});
