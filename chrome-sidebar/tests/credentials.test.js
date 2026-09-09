import test from 'node:test';
import assert from 'node:assert/strict';
import {credentialStore} from '../src/credentials.js';
test('credentials remain local and metadata never exposes saved secrets',async()=>{
 let data={},trusted=false;const store=credentialStore({get:async()=>structuredClone(data),setAccessLevel:async options=>{assert.equal(options.accessLevel,'TRUSTED_CONTEXTS');trusted=true;},set:async value=>{assert.equal(trusted,true);data=structuredClone(value);}});
 await store.save({name:'Example',secret:'test-secret'});const [record]=await store.list();assert.equal(record.name,'Example');assert.equal('secret' in record,false);
 await store.save({name:'example',secret:'replacement'});assert.equal((await store.list()).length,1);
 assert.equal(data.personalToolCredentials[0].secret,'replacement');
 await assert.rejects(store.save({name:'',secret:'secret'}));
 await store.remove(record.id);assert.deepEqual(await store.list(),[]);
});
