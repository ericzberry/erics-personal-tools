import test from 'node:test';
import assert from 'node:assert/strict';
import {secretVault,vaultSessionStore,vaultCarriedStore,vaultStore,forgetCarriedSession,vaultCredentialStore,sealSecret,openSecret,isSealed,recoveryCode,recoveryBytes,encode,CREDENTIAL_KEY,SESSION_KEY,CARRY_KEY,CARRY_DB,SUSPECT,UNNAMED,VAULT_RP_ID} from '../src/secret-vault.js';
import {IDLE_MS} from '../src/idle-session.js';

const ORIGIN='chrome-extension://synthetic-extension-id';
// Credential IDs reach the page as base64url, the same encoding the vault has to
// turn back into bytes to name one.
const PASSKEY_A=encode(new TextEncoder().encode('passkey-one'));
const PASSKEY_B=encode(new TextEncoder().encode('passkey-two'));
function fixture({seed=new Uint8Array(32).fill(9),flags=5,prf=true,origin=ORIGIN,rpId=VAULT_RP_ID,store,credentialStore,clock,id=PASSKEY_A,known=[],finds=true}={}){
  let prompts=0,cancel=false;const asked=[];
  const credentials={async get({publicKey}){
    prompts++;
    asked.push(publicKey.allowCredentials?.map(entry=>encode(entry.id))||null);
    if(cancel)throw Object.assign(new Error('Canceled'),{name:'NotAllowedError'});
    // A named credential this authenticator does not hold is refused the same
    // way a dismissed prompt is: NotAllowedError, with nothing to tell them apart.
    // `finds:false` is the browser that holds the passkey but cannot match one
    // by ID — Chrome with a passkey in Apple Passwords — so every named check
    // is refused and only a discoverable one is answered.
    const named=publicKey.allowCredentials?.map(entry=>encode(entry.id));
    if(named&&(!finds||!named.some(value=>value===id||known.includes(value))))throw Object.assign(new Error('No such credential'),{name:'NotAllowedError'});
    const auth=new Uint8Array(37);
    auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rpId))));
    auth[32]=flags;
    return {id,response:{authenticatorData:auth,clientDataJSON:new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin,challenge:encode(publicKey.challenge)}))},
      getClientExtensionResults:()=>({prf:prf?{results:{first:seed.slice().buffer}}:{}})};
  }};
  let now=1000;
  const vault=secretVault({credentials,origin:ORIGIN,subtle:crypto.subtle,now:clock||(()=>now),store,credentialStore});
  return {vault,count:()=>prompts,asked:()=>asked,advance:ms=>{now+=ms;},cancelNext:()=>{cancel=true;}};
}
// Stands in for `chrome.storage.local`: the credential hint outlives the browser
// session that learned it.
function localArea(values=new Map()){
  return {values,area:{
    async get(key){return values.has(key)?{[key]:values.get(key)}:{};},
    async set(entry){for(const [key,value] of Object.entries(entry))values.set(key,value);},
    async remove(key){values.delete(key);}
  }};
}

test('one passkey derives the same key on every device, and an envelope stays bound to its record',async()=>{
  const phone=fixture(),sidebar=fixture();
  const sealed=await sealSecret(await phone.vault.key(),'entry-1',{number:'4111111111111111',expiry:'12/28'});
  assert.ok(isSealed(sealed));
  assert.equal(sealed.includes('4111'),false,'the envelope must not carry the digits');
  // A second device holding the same synced passkey opens it without any
  // exchanged key material.
  const opened=await openSecret(await sidebar.vault.key(),'entry-1',sealed);
  assert.deepEqual(opened,{number:'4111111111111111',expiry:'12/28'});
  await assert.rejects(async()=>openSecret(await sidebar.vault.key(),'entry-2',sealed),/cannot open this protected value/);
  const other=fixture({seed:new Uint8Array(32).fill(4)});
  await assert.rejects(async()=>openSecret(await other.vault.key(),'entry-1',sealed),/cannot open this protected value/);
});

test('the idle window is an hour',()=>{
  assert.equal(IDLE_MS,60*60*1000);
});

test('the passkey is requested once, then not again until the idle window passes',async()=>{
  const f=fixture();
  await f.vault.key();
  assert.equal(f.count(),1);
  f.advance(IDLE_MS-1000);
  await f.vault.key();
  assert.equal(f.count(),1,'work inside the window must not re-prompt');
  f.advance(IDLE_MS-1000);
  await f.vault.key();
  assert.equal(f.count(),1,'activity extends the window');
  f.advance(IDLE_MS);
  assert.equal(f.vault.unlocked(),false,'an idle vault locks itself');
  await f.vault.key();
  assert.equal(f.count(),2,'a fresh passkey check is required after idling');
});

test('a locked vault stops exposing the key, and a backwards clock counts as expiry',async()=>{
  const f=fixture();
  await f.vault.key();
  f.vault.lock();
  assert.equal(f.vault.unlocked(),false);
  assert.throws(()=>f.vault.recoveryCode(),/Unlock with your passkey/);
  await f.vault.key();
  assert.equal(f.count(),2);
  f.advance(-5000);
  assert.equal(f.vault.unlocked(),false);
});

test('verification refuses a missing user check, a foreign origin, and a provider without PRF',async()=>{
  await assert.rejects(()=>fixture({flags:1}).vault.key(),/Passkey verification failed/);
  await assert.rejects(()=>fixture({origin:'https://evil.example'}).vault.key(),/Passkey verification failed/);
  await assert.rejects(()=>fixture({rpId:'evil.example'}).vault.key(),/Passkey verification failed/);
  await assert.rejects(()=>fixture({prf:false}).vault.key(),/cannot derive encryption keys/);
});

test('the recovery code reproduces the key when the passkey cannot be used',async()=>{
  const f=fixture();
  const sealed=await sealSecret(await f.vault.key(),'entry-1',{number:'378282246310005',expiry:''});
  const code=f.vault.recoveryCode();
  assert.match(code,/^EV1-/);
  const recovered=secretVault({credentials:{get:async()=>{throw Error('no passkey here');}},origin:ORIGIN,subtle:crypto.subtle});
  await recovered.unlockWithRecoveryCode(code.toLowerCase().replaceAll('-',' '));
  assert.deepEqual(await openSecret(await recovered.key(),'entry-1',sealed),{number:'378282246310005',expiry:''});
  assert.deepEqual(recoveryBytes(recoveryCode(new Uint8Array(32).fill(7))),new Uint8Array(32).fill(7));
  assert.throws(()=>recoveryBytes('EV1-TOOSHORT'),/incomplete/);
  assert.throws(()=>recoveryBytes(`EV1-${'!'.repeat(52)}`),/incomplete/);
});

test('malformed and tampered envelopes are refused rather than returning partial data',async()=>{
  const f=fixture(),key=await f.vault.key();
  const sealed=JSON.parse(await sealSecret(key,'entry-1',{number:'4111111111111111',expiry:''}));
  assert.equal(isSealed('not json'),false);
  assert.equal(isSealed(JSON.stringify({v:2,iv:'a',ciphertext:'b'})),false);
  await assert.rejects(()=>openSecret(key,'entry-1',JSON.stringify({...sealed,ciphertext:encode(new Uint8Array(40))})),/cannot open this protected value/);
  await assert.rejects(()=>openSecret(key,'entry-1','{}'),/unsupported format/);
});

// Stands in for `chrome.storage.session`: memory only, and every page — the
// writer included — hears each change, as Chrome delivers them.
function sessionArea(){
  const values=new Map(),listeners=[];
  const announce=(key,newValue)=>{for(const listener of [...listeners])listener({[key]:{newValue}},'session');};
  return {
    area:{
      async get(key){return values.has(key)?{[key]:values.get(key)}:{};},
      async set(entry){for(const [key,value] of Object.entries(entry)){values.set(key,value);announce(key,value);}},
      async remove(key){values.delete(key);announce(key,undefined);}
    },
    changes:{addListener:listener=>listeners.push(listener)},
    stored:key=>values.get(key)
  };
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

test('an unlock belongs to the browser, not to one page: another page adopts it, and locking closes both',async()=>{
  const session=sessionArea();
  let now=1000;
  const clock=()=>now;
  const first=fixture({store:vaultSessionStore(session.area,session.changes),clock});
  await first.vault.key();
  assert.equal(first.count(),1);

  // Opening Finance in its own tab must not mean a second passkey check.
  const second=fixture({store:vaultSessionStore(session.area,session.changes),clock});
  await second.vault.ready;
  assert.equal(second.vault.unlocked(),true,'a page opened inside the window inherits the session');
  const sealed=await sealSecret(await first.vault.key(),'entry-1',{number:'4111111111111111',expiry:'12/28'});
  assert.deepEqual(await openSecret(await second.vault.key(),'entry-1',sealed),{number:'4111111111111111',expiry:'12/28'});
  assert.equal(second.count(),0,'the second page asked for nothing');

  // Lock now is not a per-tab setting.
  first.vault.lock();
  await tick();
  assert.equal(second.vault.unlocked(),false);
  assert.equal(session.stored('vault-session'),undefined,'locking clears the stored session');

  // The window the unlock started with is the window a later page inherits:
  // a stored session past its idle time opens nothing.
  await second.vault.key();
  await tick();
  now+=IDLE_MS;
  const third=fixture({store:vaultSessionStore(session.area,session.changes),clock});
  await third.vault.ready;
  assert.equal(third.vault.unlocked(),false,'an idle session is not adopted');
  assert.equal(third.count(),0);
  assert.equal(session.stored('vault-session'),undefined,'and it is cleared rather than left behind');
});

test('the passkey that answered is named on the next check, so the browser stops asking which one to use',async()=>{
  const local=localArea();
  const first=fixture({credentialStore:vaultCredentialStore(local.area),id:PASSKEY_A});
  await first.vault.key();
  assert.deepEqual(first.asked(),[null],'nothing is remembered yet, so the request stays discoverable');
  assert.equal(local.values.get(CREDENTIAL_KEY),PASSKEY_A,'the passkey that answered is remembered');

  const later=fixture({credentialStore:vaultCredentialStore(local.area),id:PASSKEY_A});
  await later.vault.key();
  assert.deepEqual(later.asked(),[[PASSKEY_A]],'the remembered passkey is named, so no chooser appears');

  // A remembered passkey that is gone from this device must not lock the reader
  // out: it is forgotten, and the next attempt asks the way the first one did.
  const replaced=fixture({credentialStore:vaultCredentialStore(local.area),id:PASSKEY_B});
  await assert.rejects(()=>replaced.vault.key(),/No such credential/);
  assert.equal(local.values.get(CREDENTIAL_KEY),SUSPECT+PASSKEY_A,'the passkey that could not answer is left as the suspect, not named again');
  const again=fixture({credentialStore:vaultCredentialStore(local.area),id:PASSKEY_B});
  await again.vault.key();
  assert.deepEqual(again.asked(),[null]);
  assert.equal(local.values.get(CREDENTIAL_KEY),PASSKEY_B);
});

test('a browser that cannot find the passkey by ID stops naming it, so only one check dead-ends',async()=>{
  const local=localArea();
  const store=()=>vaultCredentialStore(local.area);
  // Chrome answers a discoverable check with a passkey held in Apple Passwords
  // and reports "No passkeys available" for the same passkey named by ID, so
  // the first section opened in a session failed and the next one worked.
  const first=fixture({credentialStore:store(),id:PASSKEY_A,finds:false});
  await first.vault.key();
  assert.equal(local.values.get(CREDENTIAL_KEY),PASSKEY_A);

  const refused=fixture({credentialStore:store(),id:PASSKEY_A,finds:false});
  await assert.rejects(()=>refused.vault.key(),/No such credential/);
  assert.equal(local.values.get(CREDENTIAL_KEY),SUSPECT+PASSKEY_A);

  const answered=fixture({credentialStore:store(),id:PASSKEY_A,finds:false});
  await answered.vault.key();
  assert.deepEqual(answered.asked(),[null],'the suspect leaves the check discoverable');
  assert.equal(local.values.get(CREDENTIAL_KEY),UNNAMED,'the passkey that answered is the one just refused by name, so naming stops');

  const later=fixture({credentialStore:store(),id:PASSKEY_A,finds:false});
  await later.vault.key();
  assert.deepEqual(later.asked(),[null],'and no check after it is named');
  assert.equal(local.values.get(CREDENTIAL_KEY),UNNAMED);
});

test('a host with nowhere to remember a credential still unlocks',async()=>{
  assert.equal(vaultCredentialStore(undefined,undefined),null);
  const f=fixture({credentialStore:null});
  await f.vault.key();
  assert.equal(f.vault.unlocked(),true);
  assert.deepEqual(f.asked(),[null]);
});

test('the twin that cannot open a sealed value is forgotten, so the next check offers the choice again',async()=>{
  const local=localArea();
  // Two passkeys for this site derive two different keys, and an assertion
  // succeeds under either. Opening a value is the only test of which one sealed
  // it, so a value that will not open must not leave the wrong twin remembered.
  const sealing=fixture({seed:new Uint8Array(32).fill(1),id:PASSKEY_A});
  const sealed=await sealSecret(await sealing.vault.key(),'entry-1',{number:'4111111111111111',expiry:''});

  const twin=fixture({credentialStore:vaultCredentialStore(local.area),seed:new Uint8Array(32).fill(2),id:PASSKEY_B});
  await assert.rejects(()=>twin.vault.open('entry-1',sealed),/cannot open this protected value/);
  assert.equal(local.values.get(CREDENTIAL_KEY),undefined,'the passkey that could not open it is not the one to go straight to');

  const right=fixture({credentialStore:vaultCredentialStore(local.area),seed:new Uint8Array(32).fill(1),id:PASSKEY_A});
  assert.deepEqual(await right.vault.open('entry-1',sealed),{number:'4111111111111111',expiry:''});
  assert.deepEqual(right.asked(),[null],'the forgotten twin left the request discoverable');
  assert.equal(local.values.get(CREDENTIAL_KEY),PASSKEY_A,'and the one that opened it is what gets remembered');

  // Falling back to the recovery code says the same thing about the passkey.
  const recovering=fixture({credentialStore:vaultCredentialStore(local.area),id:PASSKEY_A});
  await recovering.vault.unlockWithRecoveryCode(recoveryCode(new Uint8Array(32).fill(1)));
  assert.equal(local.values.get(CREDENTIAL_KEY),undefined);
});

test('a page that cannot raise the passkey sheet adopts the session another page opens for it',async()=>{
  // The side panel: Chrome sends its request and never shows the sheet, so the
  // check runs in a window of the extension's own and the panel reads the result.
  const session=sessionArea();
  let now=1000,asked=0,delegated=0,failNext=null,storeNothing=false;
  const clock=()=>now;
  const elsewhere=fixture({store:vaultSessionStore(session.area,session.changes),clock});
  // No change notifications at all, so the panel has to read the stored session
  // back rather than count on hearing about it first.
  const panel=secretVault({credentials:{async get(){asked++;return new Promise(()=>{});}},origin:ORIGIN,subtle:crypto.subtle,now:clock,
    store:vaultSessionStore(session.area,{addListener(){}}),credentialStore:null,
    unlockElsewhere:async()=>{
      delegated++;
      if(failNext){const error=failNext;failNext=null;throw error;}
      if(!storeNothing)await elsewhere.vault.key();
    }});

  failNext=Object.assign(Error('Canceled'),{name:'NotAllowedError'});
  await assert.rejects(()=>panel.key(),error=>error.name==='NotAllowedError','a dismissed sheet is reported as dismissed');
  assert.equal(panel.unlocked(),false);

  storeNothing=true;
  await assert.rejects(()=>panel.key(),/could not be unlocked/,'success with no session stored opens nothing');
  storeNothing=false;

  const [first,second]=await Promise.all([panel.key(),panel.key()]);
  assert.equal(first,second);
  assert.equal(delegated,3,'two sections opening at once share one window');
  assert.equal(asked,0,'the panel never sends a passkey request of its own');
  assert.equal(elsewhere.count(),1);
  assert.equal(panel.unlocked(),true);
  const sealed=await sealSecret(await elsewhere.vault.key(),'entry-1',{number:'4111111111111111'});
  assert.deepEqual(await panel.open('entry-1',sealed),{number:'4111111111111111'});
  await panel.key();
  assert.equal(delegated,3,'an open session asks nothing more');
});

test('a key borrowed from the host’s own lock opens the records and is marked as borrowed',async()=>{
  // The mobile app's lock evaluates PRF_SALT beside its own and hands the result
  // over, so the vault opens without a check of its own — and says so, because a
  // section must not offer to lock what another lock governs.
  const sealed=await sealSecret(await fixture().vault.key(),'entry-1',{number:'4111111111111111'});
  const borrowed=fixture();
  assert.equal(borrowed.vault.borrowed(),false);
  // The seed the lock's assertion returned for the record vault's salt.
  await borrowed.vault.unlockWithPasskeySeed(new Uint8Array(32).fill(9));
  assert.equal(borrowed.count(),0,'no passkey check of its own');
  assert.equal(borrowed.vault.unlocked(),true);
  assert.equal(borrowed.vault.borrowed(),true);
  assert.deepEqual(await borrowed.vault.open('entry-1',sealed),{number:'4111111111111111'});
  // Its own check is not borrowed, and neither is a recovery code.
  borrowed.vault.lock();
  assert.equal(borrowed.vault.borrowed(),false);
  await borrowed.vault.key();
  assert.equal(borrowed.vault.borrowed(),false);
});

// Stands in for the browser's IndexedDB, where the sealing key lives. Requests
// settle asynchronously and a transaction completes only after every request
// made inside it, including one queued from another's handler.
function fakeIndexedDB(){
  const databases=new Map();
  const later=run=>setTimeout(run,0);
  return {
    databases,
    open(name){
      const opening={result:null,onsuccess:null,onerror:null,onblocked:null,onupgradeneeded:null};
      later(()=>{
        const fresh=!databases.has(name);
        if(fresh)databases.set(name,new Map());
        const stores=databases.get(name);
        opening.result={
          close(){},
          createObjectStore(name){stores.set(name,new Map());},
          transaction(name){
            const data=stores.get(name),queue=[];
            const store={
              get(key){const query={result:undefined,onsuccess:null,onerror:null};queue.push(()=>{query.result=data.get(key);query.onsuccess?.();});return query;},
              put(value,key){const query={onsuccess:null,onerror:null};queue.push(()=>{data.set(key,value);query.onsuccess?.();});return query;}
            };
            const transaction={error:null,oncomplete:null,onerror:null,onabort:null,objectStore:()=>store};
            const drain=()=>{if(!queue.length)return transaction.oncomplete?.();queue.shift()();later(drain);};
            later(drain);
            return transaction;
          }
        };
        if(fresh)opening.onupgradeneeded?.();
        opening.onsuccess?.();
      });
      return opening;
    },
    deleteDatabase(name){
      const deleting={onsuccess:null,onerror:null,onblocked:null};
      later(()=>{databases.delete(name);deleting.onsuccess?.();});
      return deleting;
    }
  };
}
// A browser: one disk, one IndexedDB, and a session area that Chrome empties
// every time the extension is unloaded.
function browser(){
  const disk=localArea(),indexedDB=fakeIndexedDB();
  let session=sessionArea();
  return {
    disk,indexedDB,
    reload(){session=sessionArea();},
    session:()=>session,
    store:()=>vaultStore(vaultSessionStore(session.area,session.changes),vaultCarriedStore(disk.area,{indexedDB,subtle:crypto.subtle}))
  };
}

test('an unlock survives the extension being reloaded, with the window it already had',async()=>{
  const chrome=browser();
  let now=1000;
  const clock=()=>now;
  const before=fixture({store:chrome.store(),clock});
  await before.vault.key();
  assert.equal(before.count(),1);
  await tick();
  assert.ok(chrome.disk.values.get(CARRY_KEY),'the unlock is carried somewhere a reload cannot reach');

  // Updating the extension empties `chrome.storage.session` and nothing else.
  now+=5*60*1000;
  chrome.reload();
  const after=fixture({store:chrome.store(),clock});
  await after.vault.ready;
  assert.equal(after.vault.unlocked(),true,'the reloaded extension is still unlocked');
  assert.equal(after.count(),0,'and asked for no passkey');
  assert.ok(chrome.session().stored(SESSION_KEY),'what it unsealed is back in session memory');

  // The carried record keeps the original stamp, so the window runs out when it
  // was always going to rather than starting again.
  now+=IDLE_MS-5*60*1000;
  assert.equal(after.vault.unlocked(),false,'a carried session expires on the one idle window');
  chrome.reload();
  const idle=fixture({store:chrome.store(),clock});
  await idle.vault.ready;
  assert.equal(idle.vault.unlocked(),false,'and is not adopted afterwards');
  assert.equal(chrome.disk.values.get(CARRY_KEY),undefined,'an expired record is cleared rather than left behind');
});

test('what is carried is sealed, not the key written down',async()=>{
  const chrome=browser();
  const f=fixture({store:chrome.store()});
  await f.vault.key();
  await tick();
  const carried=chrome.disk.values.get(CARRY_KEY);
  const live=chrome.session().stored(SESSION_KEY);
  assert.ok(live.key,'the session area holds the key itself');
  assert.equal(JSON.stringify(carried).includes(live.key),false,'the carried copy does not');
  assert.equal(carried.key,undefined);

  // The sealing key never leaves the browser: it is generated non-extractable.
  const seal=chrome.indexedDB.databases.get(CARRY_DB).get('seal').get('session-seal');
  assert.equal(seal.extractable,false);
  await assert.rejects(()=>crypto.subtle.exportKey('raw',seal));

  // And the sealed record alone opens nothing.
  chrome.reload();
  chrome.indexedDB.databases.delete(CARRY_DB);
  const without=fixture({store:chrome.store()});
  await without.vault.ready;
  assert.equal(without.vault.unlocked(),false);
});

test('locking closes the carried session, and so does the browser starting up',async()=>{
  const chrome=browser();
  const f=fixture({store:chrome.store()});
  await f.vault.key();
  await tick();
  f.vault.lock();
  await tick();
  assert.equal(chrome.disk.values.get(CARRY_KEY),undefined,'Lock now reaches the carried copy too');
  chrome.reload();
  const locked=fixture({store:chrome.store()});
  await locked.vault.ready;
  assert.equal(locked.vault.unlocked(),false);

  // A new browser session is not the same session. The service worker's
  // onStartup throws the carried copy away, sealing key and all.
  await locked.vault.key();
  await tick();
  assert.ok(chrome.disk.values.get(CARRY_KEY));
  await forgetCarriedSession({storage:chrome.disk.area,indexedDB:chrome.indexedDB});
  assert.equal(chrome.disk.values.get(CARRY_KEY),undefined);
  assert.equal(chrome.indexedDB.databases.has(CARRY_DB),false,'the sealing key goes with it');
  chrome.reload();
  const restarted=fixture({store:chrome.store()});
  await restarted.vault.ready;
  assert.equal(restarted.vault.unlocked(),false,'a browser that has just started asks for the passkey');
});

test('a host with nowhere to carry an unlock keeps the session store it had',async()=>{
  const session=sessionArea();
  const live=vaultSessionStore(session.area,session.changes);
  assert.equal(vaultStore(live,null),live,'no IndexedDB, no carried copy — and nothing else changes');
  assert.equal(vaultStore(null,null),null,'the mobile app has neither and needs neither');
  assert.equal(vaultCarriedStore(undefined,{indexedDB:fakeIndexedDB(),subtle:crypto.subtle}),null);
  assert.equal(vaultCarriedStore(localArea().area,{indexedDB:undefined,subtle:crypto.subtle}),null);
});

test('a reloaded extension is one session again, not a page holding its own key',async()=>{
  // The first page back puts what it unsealed into session memory, because that
  // is how the others hear about a lock: Chrome announces nothing when a key
  // that was not there is removed.
  const chrome=browser();
  const before=fixture({store:chrome.store()});
  await before.vault.key();
  await tick();
  chrome.reload();

  const first=fixture({store:chrome.store()});
  await first.vault.ready;
  const beside=fixture({store:chrome.store()});
  await beside.vault.ready;
  assert.equal(first.vault.unlocked(),true);
  assert.equal(beside.vault.unlocked(),true);
  assert.equal(beside.count(),0,'the second page back asked for nothing either');

  beside.vault.lock();
  await tick();
  assert.equal(first.vault.unlocked(),false,'Lock now in one page still closes the others');
  assert.equal(chrome.disk.values.get(CARRY_KEY),undefined,'and the carried copy with them');
});
