import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {encryptPayload, vapidAuthorization, sendPush, base64url, fromBase64url} from '../src/web-push.js';
import {normalizePushSubscription, reminderDigest, zonedDate, zonedHour, deliverDueReminders} from '../src/push.js';
import {normalizeReminder} from '../../chrome-sidebar/src/reminder-data.js';

const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
// The receiving half, written from RFC 8291 rather than from the sending code,
// so a wrong salt, info string or order would not cancel out.
async function openRecord(record, privateKey, auth) {
  const salt=record.slice(0,16), keyLength=record[20];
  const server=record.slice(21,21+keyLength), ciphertext=record.slice(21+keyLength);
  const client=new Uint8Array(await crypto.subtle.exportKey('raw',privateKey.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await crypto.subtle.importKey('raw',server,{name:'ECDH',namedCurve:'P-256'},false,[])},privateKey.privateKey,256));
  const hkdf=async(salt,ikm,info,bytes)=>new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},
    await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']),bytes*8));
  const text=new TextEncoder();
  const ikm=await hkdf(auth,shared,concat(text.encode('WebPush: info\0'),client,server),32);
  const cek=await hkdf(salt,ikm,text.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(salt,ikm,text.encode('Content-Encoding: nonce\0'),12);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},
    await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),ciphertext));
  assert.equal(plain.at(-1),2,'a single record ends with the 0x02 delimiter');
  return new TextDecoder().decode(plain.slice(0,-1));
}
const subscriber=async()=>{
  const keyPair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  return {keyPair,p256dh:new Uint8Array(await crypto.subtle.exportKey('raw',keyPair.publicKey)),auth:crypto.getRandomValues(new Uint8Array(16))};
};

test('a push record opens with the subscription’s own key and nothing else',async()=>{
  const device=await subscriber();
  const record=await encryptPayload('Derek’s birthday is today',{p256dh:device.p256dh,auth:device.auth});
  // The header is the aes128gcm one: salt, record size, key length, key.
  assert.equal(new DataView(record.buffer,record.byteOffset).getUint32(16),4096);
  assert.equal(record[20],65);
  assert.equal(await openRecord(record,device.keyPair,device.auth),'Derek’s birthday is today');
  // Another device cannot open it, even knowing the record.
  const other=await subscriber();
  await assert.rejects(openRecord(record,other.keyPair,device.auth));
  await assert.rejects(openRecord(record,device.keyPair,other.auth));
  // And the plaintext never appears in what is sent.
  assert.equal(new TextDecoder().decode(record).includes('birthday'),false);
});

test('VAPID signs for the push service it is talking to, and no other',async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKey=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const privateKey=fromBase64url((await crypto.subtle.exportKey('jwk',pair.privateKey)).d);
  const header=await vapidAuthorization('https://web.push.apple.com/device/abc',{publicKey,privateKey,subject:'mailto:eric@example.com'},1789000000000);
  const [,token,key]=/^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(key,base64url(publicKey));
  const [head,body,signature]=token.split('.');
  const claims=JSON.parse(new TextDecoder().decode(fromBase64url(body)));
  assert.equal(claims.aud,'https://web.push.apple.com','the audience is the service, never the device path');
  assert.equal(claims.sub,'mailto:eric@example.com');
  assert.ok(claims.exp>1789000000&&claims.exp<=1789000000+12*3600);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromBase64url(head))),{typ:'JWT',alg:'ES256'});
  assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,fromBase64url(signature),new TextEncoder().encode(`${head}.${body}`)),true);
});

test('a subscription is checked before it is stored, and its endpoint never comes back in a listing',async()=>{
  const device=await subscriber();
  const value={endpoint:'https://web.push.apple.com/device/abc',p256dh:base64url(device.p256dh),auth:base64url(device.auth),timeZone:'America/New_York',hour:8};
  const saved=normalizePushSubscription(value);
  assert.equal(saved.lastSentOn,'','a device cannot tell the Worker it was already notified');
  assert.equal(normalizePushSubscription({...value,lastSentOn:'2026-09-11'}).lastSentOn,'');
  for(const change of [{endpoint:'http://web.push.apple.com/x'},{endpoint:'not a url'},{p256dh:base64url(new Uint8Array(32))},{auth:base64url(new Uint8Array(8))},{timeZone:'Mars/Olympus'},{hour:24},{hour:2.5}])
    assert.throws(()=>normalizePushSubscription({...value,...change}),undefined,JSON.stringify(change));
});

test('a device is told at its own morning hour, once a day, and only when something is due',async()=>{
  const morning=new Date('2026-09-11T12:00:00Z');
  assert.equal(zonedHour('America/New_York',morning),8);
  assert.equal(zonedDate('America/New_York',morning),'2026-09-11');
  assert.equal(zonedHour('Europe/London',morning),13,'the same instant is a different hour elsewhere');
  const reminders=[
    normalizeReminder({kind:'Birthday',title:'Derek’s birthday',date:'2026-09-11',every:12}),
    normalizeReminder({kind:'Service',title:'Oil change',subject:'Outback',date:'2026-02-28',every:6}),
    normalizeReminder({kind:'Renewal',title:'Passport',date:'2027-12-01',every:0,notice:90})
  ];
  const one=reminderDigest([reminders[0]],'2026-09-11');
  assert.deepEqual([one.title,one.body],['Derek’s birthday','Today']);
  const many=reminderDigest(reminders,'2026-09-11');
  assert.equal(many.count,2,'what is months away is not news this morning');
  assert.match(many.title,/^2 reminders$/);
  assert.equal(reminderDigest(reminders,'2026-06-01'),null,'nothing due sends nothing at all');
});

test('the hourly run reaches each device once, drops the ones that are gone, and keeps the rest',async()=>{
  const sql=new DatabaseSync(':memory:');
  for(const file of ['push-schema.sql','reminders-schema.sql'])sql.exec(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'));
  const env={API_TOKEN:'synthetic-token-at-least-32-characters',SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),
    VAPID_PUBLIC_KEY:base64url(new Uint8Array(await crypto.subtle.exportKey('raw',(await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])).publicKey))),
    VAPID_SUBJECT:'mailto:eric@example.com',DB:{
    prepare(query){const statement=sql.prepare(query);let args=[];
      return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
        async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};}
  }};
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  env.VAPID_PUBLIC_KEY=base64url(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)));
  env.VAPID_PRIVATE_KEY=(await crypto.subtle.exportKey('jwk',pair.privateKey)).d;
  const call=(url,method='GET',value)=>worker.fetch(new Request(`https://example.com${url}`,{method,
    headers:{Authorization:`Bearer ${env.API_TOKEN}`,'Content-Type':'application/json'},
    body:value===undefined?undefined:JSON.stringify(value)}),env);
  // The public key is the one push route a device may read before it can
  // authenticate, because it needs it to subscribe at all.
  const open=await worker.fetch(new Request('https://example.com/v1/push/key'),env);
  assert.equal((await open.json()).key,env.VAPID_PUBLIC_KEY);

  const phone=await subscriber(),tablet=await subscriber();
  const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  await call(`/v1/push/subscriptions/${ids[0]}`,'PUT',{endpoint:'https://push.example/phone',p256dh:base64url(phone.p256dh),auth:base64url(phone.auth),timeZone:'America/New_York',hour:8,revision:null});
  await call(`/v1/push/subscriptions/${ids[1]}`,'PUT',{endpoint:'https://push.example/tablet',p256dh:base64url(tablet.p256dh),auth:base64url(tablet.auth),timeZone:'Europe/London',hour:8,revision:null});
  const listed=(await (await call('/v1/push/subscriptions')).json()).records;
  assert.equal(listed.length,2);
  assert.equal(listed.every(record=>!('endpoint' in record)),true,'the capability URL stays in the database');
  assert.equal(listed[0].host,'push.example');
  await call('/v1/reminders/cccccccc-cccc-4ccc-8ccc-cccccccccccc','PUT',{kind:'Birthday',title:'Derek’s birthday',date:'2026-09-11',every:12,notice:14,revision:null});

  const sent=[];
  const fetcher=async(url,options)=>{sent.push({url,options});return new Response('',{status:url.endsWith('/tablet')?410:201});};
  const morning=new Date('2026-09-11T12:00:00Z');
  // 8am in New York, 1pm in London: only the phone is told.
  const first=await deliverDueReminders(env,{now:morning,fetcher});
  assert.deepEqual([first.sent,sent.length],[1,1]);
  assert.equal(sent[0].url,'https://push.example/phone');
  assert.match(sent[0].options.headers.Authorization,/^vapid t=/);
  assert.equal(sent[0].options.headers['Content-Encoding'],'aes128gcm');
  assert.equal(await openRecord(new Uint8Array(sent[0].options.body),phone.keyPair,phone.auth),
    JSON.stringify({title:'Derek’s birthday',body:'Today',count:1,url:'/app/',tag:'reminders'}));
  // The same morning again sends nothing: the day is already spoken for.
  assert.equal((await deliverDueReminders(env,{now:new Date('2026-09-11T12:59:00Z'),fetcher})).sent,0);
  assert.equal(sent.length,1);
  // London's 8am comes later, and its push service says the device is gone.
  const later=await deliverDueReminders(env,{now:new Date('2026-09-11T07:00:00Z'),fetcher});
  assert.deepEqual([later.sent,sent.length],[0,2]);
  assert.equal(sent[1].url,'https://push.example/tablet');
  assert.equal((await (await call('/v1/push/subscriptions')).json()).records.length,1,'a gone device is forgotten');
});
