import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';

const token='synthetic-programs-token-'.repeat(3);
// Sized like a real catalogue entry, so the large fixture is genuinely past the
// limit an ordinary record is held to rather than merely numerous.
const offers=count=>Array.from({length:count},(_,index)=>({key:`/offer/synthetic_partner_${index}`,name:`Synthetic Partner ${index}`,category:'TRAVEL',badge:'NEW',summary:`Synthetic offer ${index}. `.padEnd(180,'Terms apply to this synthetic offer. ').slice(0,180)}));

async function worker(){
  const {outputFiles}=await build({entryPoints:[new URL('../src/index.js',import.meta.url).pathname],bundle:true,format:'esm',write:false,platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text,d1Databases:['DB'],bindings:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'cd'.repeat(32)}}));
  const db=await mf.getD1Database('DB');
  await db.exec(await readFile(new URL('../programs-schema.sql',import.meta.url),'utf8').then(text=>text.replace(/\n/g,' ')));
  const call=(path='',method='GET',value,auth=token)=>mf.dispatchFetch(`http://localhost/v1/rewards/programs${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});
  return {mf,db,call};
}

test('a program catalogue is stored encrypted, merged on write, and shared with every device',async()=>{
  const {mf,db,call}=await worker();
  try{
    assert.equal((await call('','GET',undefined,'wrong')).status,401,'the catalogue is behind the same bearer as everything else');
    assert.deepEqual((await (await call()).json()).records,[],'nothing read yet is an empty list, not an error');
    assert.equal((await (await call('/ms-reserved')).json()).catalog,null);

    const first=await (await call('/ms-reserved','PUT',{programId:'ms-reserved',complete:true,
      offers:[{key:'/offer/sixt',name:'SIXT',category:'TRAVEL',summary:'Save on car rentals.'},{key:'/offer/lg',name:'LG',category:'HOME'}]})).json();
    assert.equal(first.catalog.offers.length,2);
    assert.equal(first.catalog.offers[0].category,'Travel','the stored catalogue is normalized here too');
    assert.ok(first.catalog.revision);
    assert.equal(first.catalog.listedAt,first.catalog.readAt);

    const row=await db.prepare('SELECT value FROM program_catalogs WHERE id = ?').bind('ms-reserved').first();
    assert.ok(!row.value.includes('SIXT'),'the row holds ciphertext, not the catalogue');

    // A second reading taken on one offer's page may not empty the catalogue.
    const partial=await (await call('/ms-reserved','PUT',{programId:'ms-reserved',complete:false,
      offers:[{key:'/offer/sixt',name:'SIXT Rent',category:'AUTOMOTIVE'}]})).json();
    assert.deepEqual(partial.catalog.offers.map(offer=>offer.key),['/offer/sixt','/offer/lg']);
    assert.equal(partial.catalog.offers[0].name,'SIXT Rent');
    assert.equal(partial.catalog.offers[0].firstSeenAt,first.catalog.offers[0].firstSeenAt,'the fold keeps how long the owner has had an offer');

    const list=await (await call()).json();
    assert.equal(list.records.length,1);
    assert.equal(list.records[0].id,'ms-reserved');
    assert.equal(list.records[0].offers.length,2,'the collection carries the offers themselves');
    const snapshot=await (await call('/snapshot')).json();
    assert.deepEqual(snapshot.records,list.records,'the offline snapshot is the same answer');
  }finally{await mf.dispose();}
});

test('a catalogue is refused unless it belongs to a program this tool reads',async()=>{
  const {mf,call}=await worker();
  try{
    assert.equal((await call('/made-up','PUT',{programId:'made-up',offers:[]})).status,404);
    assert.equal((await call('/ms-reserved','PUT',{programId:'somewhere-else',offers:[]})).status,400,'the body must match the address');
    assert.equal((await call('/ms-reserved','DELETE',{programId:'ms-reserved'})).status,405);
    assert.equal((await call('','PUT',{programId:'ms-reserved',offers:[]})).status,405,'the collection is read-only');
    assert.equal((await call('/ms-reserved/extra')).status,404);
  }finally{await mf.dispose();}
});

test('a catalogue larger than an ordinary record is allowed through, and an unbounded one is not',async()=>{
  const {mf,call}=await worker();
  try{
    const large={programId:'ms-reserved',complete:true,offers:offers(400)};
    assert.ok(JSON.stringify(large).length>64*1024,'the fixture is past the ordinary 64 KB record limit');
    const response=await call('/ms-reserved','PUT',large);
    assert.equal(response.status,200,await response.clone().text());
    const saved=await response.json();
    assert.equal(saved.catalog.offers.length,400);
    assert.equal((await call('/ms-reserved','PUT',{programId:'ms-reserved',complete:true,offers:offers(501)})).status,400);
  }finally{await mf.dispose();}
});
