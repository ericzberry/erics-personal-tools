import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {readCapture} from '../src/capture.js';
const connection={provider:'openai',apiKey:'synthetic-key'};
const reply=value=>async(url,options)=>url.endsWith('/models')
  ?Response.json({data:[{id:'gpt-5-nano'}]})
  :Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:typeof value==='string'?value:JSON.stringify(value)}]}]});

test('a typed note becomes a record the tool would have accepted anyway',async()=>{
  const reading=await readCapture(connection,{note:'I got the Outback serviced today',today:'2026-09-11'},
    reply({capability:'reminders',record:{kind:'Service',title:'Oil change',subject:'Outback',date:'2026-09-11',every:6,notice:14,notes:''}}));
  assert.equal(reading.capability,'reminders');
  assert.equal(reading.path,'/v1/reminders');
  assert.equal(reading.record.date,'2026-09-11');
  // The line read back is built from the stored record, never from the model's
  // own account of what it did.
  assert.equal(reading.summary,'Oil change · Outback · Every 6 months · last done 2026-09-11 · In 181 days');
});

test('a note that names no date comes back as the owner’s problem, not a server error',async()=>{
  await assert.rejects(readCapture(connection,{note:'buy milk'},reply({error:'That does not name a date to remember.'})),
    error=>error.status===422&&/does not name a date/.test(error.message));
  // A reading that would not validate is refused rather than half-stored.
  await assert.rejects(readCapture(connection,{note:'x'},reply({capability:'reminders',record:{kind:'Whenever',title:'x',date:'2026-01-01'}})),error=>error.status===502);
  await assert.rejects(readCapture(connection,{note:'   '},reply({})),error=>error.status===400);
  await assert.rejects(readCapture(connection,{note:'x'.repeat(601)},reply({})),error=>error.status===400);
});

test('reminders store and validate through the shared record route',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../reminders-schema.sql',import.meta.url),'utf8'));
  const token='synthetic-token-at-least-32-characters';
  const env={API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),DB:{
    prepare(query){
      const statement=sql.prepare(query);let args=[];
      return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
        async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};
    }
  }};
  const path='/v1/reminders/22222222-2222-4222-8222-222222222222';
  const call=(url,method='GET',value,auth=token)=>worker.fetch(new Request(`https://example.com${url}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);
  const record={kind:'Birthday',title:'Derek’s birthday',date:'1985-03-04',every:12,since:'1985',notice:14,notes:''};
  assert.equal((await call(path,'PUT',record,'bad')).status,401);
  assert.equal((await call(path,'PUT',{...record,every:900})).status,400);
  const saved=(await (await call(path,'PUT',record)).json()).record;
  assert.equal(saved.title,'Derek’s birthday');
  // The stored row is an encrypted envelope, not the birthday in the clear.
  assert.equal(sql.prepare('SELECT value FROM reminder_records').get().value.includes('Derek'),false);
  const snapshot=await (await call('/v1/reminders/snapshot')).json();
  assert.equal(snapshot.records[0].since,'1985');
  assert.equal((await call(path,'PUT',record)).status,409,'a stale revision cannot overwrite');
  assert.equal((await call(path,'DELETE',{revision:saved.revision})).status,200);
});
