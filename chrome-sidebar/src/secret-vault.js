// Protected values (card numbers) that the Worker must never be able to read.
//
// The key is derived from the WebAuthn PRF output of the user's passkey, so it
// exists only on devices holding that passkey and never reaches the cloud. The
// derivation is deliberately deterministic — a fixed PRF salt and HKDF label,
// no stored per-device state — because the same key must open a record on the
// iPhone and in the sidebar. Chrome M122+ lets an extension page claim the RP
// ID of a host it has permission for, so both hosts address one synced passkey.
//
// Losing every copy of that passkey makes protected values unreadable. The
// recovery code is the derived key itself, shown on request so it can be kept
// in a password manager; it is the only way back in, and the only fallback if a
// browser cannot produce PRF output.
import {IDLE_MS, idleSession} from './idle-session.js';
import {CLOUD_URL} from './cloud-storage.js';

export const VAULT_RP_ID = new URL(CLOUD_URL).hostname;
export const RECOVERY_PREFIX = 'EV1';
const PRF_SALT = new TextEncoder().encode('erics-tools/card-secrets/v1/prf-salt');
const HKDF_INFO = new TextEncoder().encode('erics-tools/card-secrets/v1');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const bytes = value => new TextEncoder().encode(value);
const random = length => crypto.getRandomValues(new Uint8Array(length));
export const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));

export function recoveryCode(raw) {
  let bits = 0, value = 0, out = '';
  for (const byte of new Uint8Array(raw)) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return `${RECOVERY_PREFIX}-${out.match(/.{1,13}/g).join('-')}`;
}
export function recoveryBytes(code) {
  const clean = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^EV1/, '')
    .replaceAll('I', '1').replaceAll('L', '1').replaceAll('O', '0');
  let bits = 0, value = 0; const out = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw Error('That recovery code contains characters we don’t recognize.');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  if (out.length !== 32) throw Error('That recovery code is incomplete. Enter all 52 characters.');
  return new Uint8Array(out);
}

async function keyFrom(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function stretch(seed) {
  const material = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt: PRF_SALT, info: HKDF_INFO}, material, 256));
}
// Bound to the record: an envelope moved to another entry fails to open.
const aad = id => bytes(`erics-tools/card-secrets/v1/${id}`);
export async function sealSecret(key, id, payload) {
  const iv = random(12);
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad(id)}, key, bytes(JSON.stringify(payload)));
  return JSON.stringify({v: 1, iv: encode(iv), ciphertext: encode(ciphertext)});
}
export async function openSecret(key, id, envelope) {
  let parsed;
  try { parsed = JSON.parse(envelope); } catch { throw Error('This protected value could not be read.'); }
  if (parsed?.v !== 1 || typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') throw Error('This protected value was saved in an unsupported format.');
  let plaintext;
  try { plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(parsed.iv), additionalData: aad(id)}, key, decode(parsed.ciphertext)); }
  catch { throw Error('This passkey cannot open this protected value. Unlock with the passkey that saved it, or use your recovery code.'); }
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export const isSealed = value => {
  if (!value) return false;
  try { const parsed = JSON.parse(value); return parsed?.v === 1 && typeof parsed.iv === 'string' && typeof parsed.ciphertext === 'string'; }
  catch { return false; }
};

// One vault per host. Every protected section shares it, so a single passkey
// prompt opens all of them and one idle window governs them together — an
// unlock in the ledger keeps the personal records open, and going idle closes
// both. The derived key is deterministic either way; what is shared here is the
// session, not the secret.
let shared=null;
export function sharedVault(options){
  if(!shared)shared=secretVault(options);
  return shared;
}

// One unlocked session per browser, not per page. Finance and Personal each
// open in their own extension tab, so a key held only in one page's memory
// means a fresh passkey check for every navigation and a reload that throws
// the unlock away. The derived key is kept in `chrome.storage.session`: memory
// only, gone when the browser closes, and readable by this extension's own
// pages but never by a web page or content script. That is what makes one
// prompt cover the whole idle window, an unlock in one tab open the others,
// and Lock now close all of them at once. A page host without that area (the
// mobile app, where every tool already shares one page) simply gets no store.
export const SESSION_KEY='vault-session';
// Writing on every interaction would be pointless churn; the stored stamp only
// has to be fresh enough that a new page inherits a sane remainder.
const REFRESH_MS=60000;
export function vaultSessionStore(area=globalThis.chrome?.storage?.session,changes=globalThis.chrome?.storage?.onChanged){
  if(!area?.get)return null;
  return {
    async read(){try{return (await area.get(SESSION_KEY))[SESSION_KEY]||null;}catch{return null;}},
    write(value){try{return Promise.resolve(area.set({[SESSION_KEY]:value})).catch(()=>{});}catch{return Promise.resolve();}},
    clear(){try{return Promise.resolve(area.remove(SESSION_KEY)).catch(()=>{});}catch{return Promise.resolve();}},
    subscribe(callback){changes?.addListener?.((updates,name)=>{if(name==='session'&&updates[SESSION_KEY])callback(updates[SESSION_KEY].newValue||null);});}
  };
}

// Which passkey answered last. A request that names no credential leaves the
// browser to ask which one to use, and a chooser is the wrong thing to show a
// reader who has one passkey — more so when a synced copy or a repeated
// enrollment fills it with entries under the same name. Naming the credential
// that worked turns the routine unlock back into a plain biometric prompt. The
// ID identifies a passkey; it cannot use one, so it is kept in ordinary local
// storage rather than the session area that holds the key.
export const CREDENTIAL_KEY='vault-credential';
export function vaultCredentialStore(area=globalThis.chrome?.storage?.local,fallback=globalThis.localStorage){
  if(area?.get)return{
    async read(){try{return (await area.get(CREDENTIAL_KEY))[CREDENTIAL_KEY]||null;}catch{return null;}},
    async write(value){try{await area.set({[CREDENTIAL_KEY]:value});}catch{}},
    async clear(){try{await area.remove(CREDENTIAL_KEY);}catch{}}
  };
  if(!fallback?.getItem)return null;
  return {
    async read(){try{return fallback.getItem(CREDENTIAL_KEY)||null;}catch{return null;}},
    async write(value){try{fallback.setItem(CREDENTIAL_KEY,value);}catch{}},
    async clear(){try{fallback.removeItem(CREDENTIAL_KEY);}catch{}}
  };
}

export function secretVault({
  credentials = globalThis.navigator?.credentials,
  origin = globalThis.location?.origin,
  // A web page may only claim its own domain, and in production that domain is
  // already the API host. Only an extension page has to name it explicitly.
  rpId = globalThis.location?.protocol === 'chrome-extension:' ? VAULT_RP_ID : (globalThis.location?.hostname || VAULT_RP_ID),
  subtle = globalThis.crypto?.subtle,
  now, onLock = () => {},
  store = vaultSessionStore(),
  credentialStore = vaultCredentialStore()
} = {}) {
  const clock = now || Date.now;
  let key = null, raw = null, pending = null, stamp = 0;
  const session = idleSession({now, onLock: reason => { key = null; if (raw) { raw.fill(0); raw = null; } stamp = 0; store?.clear(); onLock(reason); }});
  // A remembered credential is named directly, and named as a passkey held on
  // this device, so the browser goes straight to the biometric check. With none
  // remembered the request stays discoverable: the passkey is synced, so any
  // device holding a copy can answer without its ID being known here.
  function allowList(remembered) {
    if (!remembered) return null;
    try { return [{type: 'public-key', id: decode(remembered), transports: ['internal']}]; }
    catch { return null; }
  }
  async function assertPasskey(remembered) {
    const challenge = random(32);
    const allowCredentials = allowList(remembered);
    const assertion = await credentials.get({publicKey: {
      challenge, rpId, userVerification: 'required', timeout: 60000,
      ...(allowCredentials ? {allowCredentials} : {}),
      extensions: {prf: {eval: {first: PRF_SALT}}}
    }});
    if (!assertion) throw Error('Passkey verification was canceled.');
    const client = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
    const auth = new Uint8Array(assertion.response.authenticatorData);
    const rpHash = new Uint8Array(await subtle.digest('SHA-256', bytes(rpId)));
    if (client.type !== 'webauthn.get' || client.origin !== origin || client.challenge !== encode(challenge) || client.crossOrigin === true) throw Error('Passkey verification failed. Try again.');
    // User presence and user verification must both be set: a protected value
    // may only appear after a fresh biometric or passcode check.
    if (auth.length < 37 || (auth[32] & 5) !== 5 || !rpHash.every((value, index) => value === auth[index])) throw Error('Passkey verification failed. Try again.');
    const seed = assertion.getClientExtensionResults()?.prf?.results?.first;
    if (!seed || seed.byteLength !== 32) throw Error('This browser or passkey provider cannot derive encryption keys (PRF). Unlock with your recovery code, or use Apple Passwords on iOS 18 / macOS 15 or later.');
    if (typeof assertion.id === 'string' && assertion.id) await credentialStore?.write(assertion.id);
    try { return await stretch(seed); } finally { new Uint8Array(seed).fill(0); }
  }
  async function fromPasskey() {
    const remembered = await credentialStore?.read();
    try { return await assertPasskey(remembered); }
    catch (error) {
      // A remembered passkey that cannot answer here — deleted, or never on
      // this device — must not become a dead end. Forgetting it puts the choice
      // back in front of the reader on the next attempt.
      if (remembered) await credentialStore?.clear();
      throw error;
    }
  }
  async function adopt(next, {at = clock(), persist = true} = {}) {
    if (raw) raw.fill(0);
    raw = next;
    key = await keyFrom(raw);
    session.start(at);
    stamp = at;
    if (persist) store?.write({key: encode(raw), at});
    return key;
  }
  // A stored session is adopted, never trusted blindly: an expired or damaged
  // record is cleared rather than opening the sections it was meant to guard.
  async function restore(saved) {
    if (!saved || typeof saved.at !== 'number' || typeof saved.key !== 'string') return false;
    if (clock() < saved.at || clock() - saved.at >= IDLE_MS) { store?.clear(); return false; }
    let bytes;
    try { bytes = decode(saved.key); } catch { store?.clear(); return false; }
    if (bytes.length !== 32) { store?.clear(); return false; }
    await adopt(bytes, {at: saved.at, persist: false});
    return true;
  }
  // Reading the stored session is asynchronous, so every entry point settles it
  // first. Without that a page would prompt for a passkey it already holds.
  const ready = (async () => {
    if (!store) return;
    await restore(await store.read());
    store.subscribe(async value => {
      if (!value) { if (session.check()) { key = null; if (raw) { raw.fill(0); raw = null; } stamp = 0; session.lock('remote'); } return; }
      if (key && raw && value.key === encode(raw)) { if (value.at > stamp) { session.start(value.at); stamp = value.at; } return; }
      await restore(value);
    });
  })();
  return {
    idleMs: IDLE_MS,
    // Settles once any session stored by another page has been adopted.
    ready,
    available: () => !!(globalThis.isSecureContext && globalThis.PublicKeyCredential && credentials?.get),
    // True while the key is held and the session has not gone idle.
    unlocked: () => session.check() && !!key,
    touch() { session.touch(); if (key && clock() - stamp >= REFRESH_MS) { stamp = clock(); store?.write({key: encode(raw), at: stamp}); } },
    lock: () => session.lock(),
    // Returns the live key, prompting for the passkey only when the session is
    // locked or has been idle past its window. Concurrent callers — two gated
    // sections opening at once — share one prompt rather than stacking two.
    async key() {
      await ready;
      if (session.check() && key) { this.touch(); return key; }
      if (!pending) pending = (async () => adopt(await fromPasskey()))().finally(() => { pending = null; });
      return pending;
    },
    // Opening a sealed value is also the only test of whether the passkey that
    // answered is the one that sealed it: two passkeys for this site derive two
    // different keys, and an assertion succeeds either way. A value that will
    // not open is that test failing, so the remembered credential is forgotten
    // and the next unlock asks again rather than going straight back to it.
    async open(id, envelope) {
      const current = await this.key();
      try { return await openSecret(current, id, envelope); }
      catch (error) { await credentialStore?.clear(); throw error; }
    },
    async unlockWithRecoveryCode(code) { await credentialStore?.clear(); return adopt(recoveryBytes(code)); },
    recoveryCode() {
      if (!session.check() || !raw) throw Error('Unlock with your passkey before showing the recovery code.');
      session.touch();
      return recoveryCode(raw);
    }
  };
}
