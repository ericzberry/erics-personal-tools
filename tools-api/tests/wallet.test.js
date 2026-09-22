import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';

// The wallet's own records — a binding, a valuation, a resolution — through
// the generic encrypted store: typed on the way in, sealed at rest, revisioned.
test('wallet records are validated, encrypted and revisioned like every other record',async()=>{
  const {outputFiles}=await build({entryPoints:[new URL('../src/index.js',import.meta.url).pathname],bundle:true,format:'esm',write:false,platform:'browser'});
  const token='synthetic-wallet-token-'.repeat(3);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text,d1Databases:['DB'],bindings:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'ef'.repeat(32)}}));
  try{
    const db=await mf.getD1Database('DB');
    await db.exec(await readFile(new URL('../wallet-schema.sql',import.meta.url),'utf8').then(text=>text.replace(/--[^\n]*\n/g,' ').replace(/\n/g,' ')));
    const call=(path='',method='GET',value,auth=token)=>mf.dispatchFetch(`http://localhost/v1/wallet${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});
    assert.equal((await call('/capabilities','GET',undefined,'wrong')).status,401);
    const capabilities=await (await call('/capabilities')).json();
    assert.equal(capabilities.schemaVersion,2);
    assert.deepEqual(capabilities.kinds,['binding','resolution','valuation','goal']);
    const id='11111111-1111-4111-8111-111111111111',account='22222222-2222-4222-8222-222222222222';
    const saved=await (await call(`/${id}`,'PUT',{kind:'binding',adapter:'amex',key:'platinum card',accountId:account,label:'Platinum',revision:null})).json();
    assert.ok(saved.record.revision);
    assert.equal(saved.record.accountId,account);
    const row=await db.prepare('SELECT value FROM wallet_records WHERE id = ?').bind(id).first();
    assert.ok(!row.value.includes(account),'the row holds ciphertext');
    assert.equal((await call(`/${id}`,'PUT',{kind:'binding',adapter:'amex',key:'x',accountId:account,revision:null})).status,409);
    assert.equal((await call(`/${id}`,'PUT',{kind:'valuation',key:'ur',cents:0,revision:saved.record.revision})).status,400,'a bad record is refused, not stored');
    const snapshot=await (await call('/snapshot')).json();
    assert.deepEqual(snapshot.records.map(record=>[record.kind,record.key,record.accountId]),[['binding','platinum card',account]]);
    assert.equal((await call(`/${id}`,'DELETE',{revision:saved.record.revision})).status,200);
    assert.equal((await (await call()).json()).records.length,0);
  }finally{await mf.dispose();}
});
