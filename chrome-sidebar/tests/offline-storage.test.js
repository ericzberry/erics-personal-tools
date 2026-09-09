import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptedDeviceStore} from '../src/offline-storage.js';
function memoryIDB(){
  const data=new Map();const database={createObjectStore(){},transaction(){
    const tx={objectStore:()=>({get:key=>({result:data.get(key)}),put:(value,key)=>{data.set(key,value);return {result:key};},delete:key=>{data.delete(key);return {};}})};
    queueMicrotask(()=>tx.oncomplete?.());return tx;
  }};
  return {data,indexedDB:{open(){const request={result:database};queueMicrotask(()=>{request.onupgradeneeded?.();request.onsuccess?.();});return request;}}};
}
test('private device data is encrypted, survives a new store instance, is token-scoped, and clears on disconnect',async()=>{
  const {data,indexedDB}=memoryIDB();const store=encryptedDeviceStore({indexedDB});
  const privateData={records:[{number:'000123456',notes:'Synthetic private note'}],pending:{save:'durable'}};
  await store.write('travel','synthetic-token',privateData);
  const envelope=[...data.values()][0];assert.ok(envelope.ciphertext instanceof ArrayBuffer);assert.ok(!new TextDecoder().decode(envelope.ciphertext).includes('000123456'));
  assert.deepEqual(await encryptedDeviceStore({indexedDB}).read('travel','synthetic-token'),privateData);
  assert.equal(await store.read('travel','another-token'),null);
  new Uint8Array(envelope.ciphertext)[0]^=1;await assert.rejects(store.read('travel','synthetic-token'),/could not be opened/);
  await store.remove('travel','synthetic-token');assert.equal(data.size,0);
});
