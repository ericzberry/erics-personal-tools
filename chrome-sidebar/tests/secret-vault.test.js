import test from 'node:test';
import assert from 'node:assert/strict';
import {secretVault,sealSecret,openSecret,isSealed,recoveryCode,recoveryBytes,encode,VAULT_RP_ID} from '../src/secret-vault.js';
import {IDLE_MS} from '../src/idle-session.js';

const ORIGIN='chrome-extension://synthetic-extension-id';
function fixture({seed=new Uint8Array(32).fill(9),flags=5,prf=true,origin=ORIGIN,rpId=VAULT_RP_ID}={}){
  let prompts=0,cancel=false;
  const credentials={async get({publicKey}){
    prompts++;
    if(cancel)throw Object.assign(new Error('Canceled'),{name:'NotAllowedError'});
    const auth=new Uint8Array(37);
    auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rpId))));
    auth[32]=flags;
    return {response:{authenticatorData:auth,clientDataJSON:new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin,challenge:encode(publicKey.challenge)}))},
      getClientExtensionResults:()=>({prf:prf?{results:{first:seed.slice().buffer}}:{}})};
  }};
  let now=1000;
  const vault=secretVault({credentials,origin:ORIGIN,subtle:crypto.subtle,now:()=>now});
  return {vault,count:()=>prompts,advance:ms=>{now+=ms;},cancelNext:()=>{cancel=true;}};
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
