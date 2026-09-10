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

export function secretVault({
  credentials = globalThis.navigator?.credentials,
  origin = globalThis.location?.origin,
  // A web page may only claim its own domain, and in production that domain is
  // already the API host. Only an extension page has to name it explicitly.
  rpId = globalThis.location?.protocol === 'chrome-extension:' ? VAULT_RP_ID : (globalThis.location?.hostname || VAULT_RP_ID),
  subtle = globalThis.crypto?.subtle,
  now, onLock = () => {}
} = {}) {
  let key = null, raw = null;
  const session = idleSession({now, onLock: reason => { key = null; if (raw) { raw.fill(0); raw = null; } onLock(reason); }});
  async function fromPasskey() {
    const challenge = random(32);
    const assertion = await credentials.get({publicKey: {
      // No allowCredentials: the passkey is discoverable, so whichever device
      // holds the synced copy can answer without knowing its credential ID.
      challenge, rpId, userVerification: 'required', timeout: 60000,
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
    try { return await stretch(seed); } finally { new Uint8Array(seed).fill(0); }
  }
  async function adopt(next) {
    if (raw) raw.fill(0);
    raw = next;
    key = await keyFrom(raw);
    session.start();
    return key;
  }
  return {
    idleMs: IDLE_MS,
    available: () => !!(globalThis.isSecureContext && globalThis.PublicKeyCredential && credentials?.get),
    // True while the key is held and the session has not gone idle.
    unlocked: () => session.check() && !!key,
    touch: () => session.touch(),
    lock: () => session.lock(),
    // Returns the live key, prompting for the passkey only when the session is
    // locked or has been idle past its window.
    async key() {
      if (session.check() && key) { session.touch(); return key; }
      return adopt(await fromPasskey());
    },
    async unlockWithRecoveryCode(code) { return adopt(recoveryBytes(code)); },
    recoveryCode() {
      if (!session.check() || !raw) throw Error('Unlock with your passkey before showing the recovery code.');
      session.touch();
      return recoveryCode(raw);
    }
  };
}
