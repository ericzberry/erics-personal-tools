import test from 'node:test';
import assert from 'node:assert/strict';
import {secretVault,vaultSessionStore,vaultCredentialStore,sealSecret,openSecret,isSealed,recoveryCode,recoveryBytes,encode,CREDENTIAL_KEY,VAULT_RP_ID} from '../src/secret-vault.js';
import {IDLE_MS} from '../src/idle-session.js';

const ORIGIN='chrome-extension://synthetic-extension-id';
// Credential IDs reach the page as base64url, the same encoding the vault has to
// turn back into bytes to name one.
const PASSKEY_A=encode(new TextEncoder().encode('passkey-one'));
const PASSKEY_B=encode(new TextEncoder().encode('passkey-two'));
function fixture({seed=new Uint8Array(32).fill(9),flags=5,prf=true,origin=ORIGIN,rpId=VAULT_RP_ID,store,credentialStore,clock,id=PASSKEY_A,known=[]}={}){
  let prompts=0,cancel=false;const asked=[];
  const credentials={async get({publicKey}){
    prompts++;
    asked.push(publicKey.allowCredentials?.map(entry=>encode(entry.id))||null);
    if(cancel)throw Object.assign(new Error('Canceled'),{name:'NotAllowedError'});
    // A named credential this authenticator does not hold is refused the same
    // way a dismissed prompt is: NotAllowedError, with nothing to tell them apart.
    const named=publicKey.allowCredentials?.map(entry=>encode(entry.id));
    if(named&&!named.some(value=>value===id||known.includes(value)))throw Object.assign(new Error('No such credential'),{name:'NotAllowedError'});
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
  assert.equal(local.values.get(CREDENTIAL_KEY),undefined);
  const again=fixture({credentialStore:vaultCredentialStore(local.area),id:PASSKEY_B});
  await again.vault.key();
  assert.deepEqual(again.asked(),[null]);
  assert.equal(local.values.get(CREDENTIAL_KEY),PASSKEY_B);
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
