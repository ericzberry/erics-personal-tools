import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
test('people migration preserves old data; writes are encrypted, authenticated and revision guarded',async()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE old_records (value TEXT); INSERT INTO old_records VALUES (\'preserve me\');');
  const schema=readFileSync(new URL('../people-schema.sql',import.meta.url),'utf8');sql.exec(schema);sql.exec(schema);
  assert.equal(sql.prepare('SELECT value FROM old_records').get().value,'preserve me');
  const token='synthetic-token-at-least-32-characters';
  const env={API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),DB:{prepare(query){
    const s=sql.prepare(query);let args=[];
    return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return {meta:{changes:Number(s.run(...args).changes)}};}};}}};
  const path='/v1/people/22222222-2222-4222-8222-222222222222';
  const call=(url,method='GET',value,auth=token)=>worker.fetch(new Request(`https://example.com${url}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);
  const value={schemaVersion:1,name:'Private test person',role:'Child',age:7,ageYear:2026};
  assert.equal((await call(path,'PUT',value,'wrong')).status,401);
  assert.equal((await call(path,'PUT',{...value,schemaVersion:2})).status,400);
  const response=await call(path,'PUT',value);assert.equal(response.status,200);
  const saved=(await response.json()).record;
  assert.equal(sql.prepare('SELECT value FROM people_records').get().value.includes('Private test'),false);
  const snapshot=await call('/v1/people/snapshot');assert.match(snapshot.headers.get('cache-control'),/no-store/);
  assert.equal((await snapshot.json()).records[0].age,value.age);
  assert.equal((await call(path,'PUT',value)).status,409);
  assert.equal((await call(path,'DELETE',{revision:saved.revision})).status,200);
  assert.equal((await (await call('/v1/people')).json()).records.length,0);
});
