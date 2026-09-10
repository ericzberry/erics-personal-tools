// Mobile-only local encryption. The inactivity gate lives in the shared
// idle-session module; this file owns only the passkey envelope.
// PRF unwraps the existing API credential; it is
// not a server login assertion. Neither the credential nor PRF output is saved.
export const VAULT_KEY = 'mobilePasskeyVault.v1';
export const LEGACY_KEY = 'travelAccessToken';
const bytes = value => new TextEncoder().encode(value);
export const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const random = length => crypto.getRandomValues(new Uint8Array(length));
const fingerprint = async token => encode(await crypto.subtle.digest('SHA-256', bytes(token)));
const aad = record => bytes(JSON.stringify([record.version, record.id, record.rpId, record.salt, record.fingerprint]));
async function wrappingKey(seed, salt) {
  const material = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: decode(salt), info: bytes('erics-tools/mobile/passkey-vault/v1')}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
export function passkeyVault({storage = globalThis.localStorage, credentials = globalThis.navigator?.credentials, origin = globalThis.location?.origin, rpId = globalThis.location?.hostname} = {}) {
  let pending = null;
  function record() {
    const value = storage.getItem(VAULT_KEY);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed.version !== 1 || parsed.rpId !== rpId || !['id','salt','iv','ciphertext','fingerprint'].every(key => typeof parsed[key] === 'string' && parsed[key].length)) throw Error();
      return parsed;
    } catch { throw Error('The saved mobile lock could not be read. Your cloud data has not been changed.'); }
  }
  async function evaluate(saved) {
    const challenge = random(32);
    const result = await credentials.get({publicKey: {
      // Enrollment requires a platform passkey. Keep unlocking on this device
      // too, so Safari need not offer external security-key transports.
      challenge, rpId, allowCredentials: [{type: 'public-key', id: decode(saved.id), transports: ['internal']}],
      userVerification: 'required', timeout: 60000,
      extensions: {prf: {eval: {first: decode(saved.salt)}}}
    }});
    if (!result || result.id !== saved.id) throw Error('Choose the passkey used to protect this device.');
    const client = JSON.parse(new TextDecoder().decode(result.response.clientDataJSON));
    const auth = new Uint8Array(result.response.authenticatorData);
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(rpId)));
    if (client.type !== 'webauthn.get' || client.origin !== origin || client.challenge !== encode(challenge) || client.crossOrigin === true || auth.length < 37 || (auth[32] & 5) !== 5 || !rpHash.every((value, i) => value === auth[i])) throw Error('Passkey verification failed. Try again.');
    const seed = result.getClientExtensionResults()?.prf?.results?.first;
    if (!seed || seed.byteLength !== 32) throw Error('This passkey provider cannot unlock encrypted offline data. Use Apple Passwords on iOS 18 or later, or another provider that supports passkey encryption.');
    try { return await wrappingKey(seed, saved.salt); }
    finally { new Uint8Array(seed).fill(0); }
  }
  return {
    record,
    legacyToken: () => storage.getItem(LEGACY_KEY) || '',
    async prepare(token) {
      pending = null;
      if (!token || token.length < 32 || token.length > 500) throw Error('Enter your original private access token.');
      const previous = record();
      const legacy = storage.getItem(LEGACY_KEY);
      if (!previous && legacy && legacy !== token) throw Error('Use this device’s existing token to preserve its offline records and pending changes.');
      if (previous && previous.fingerprint !== await fingerprint(token)) throw Error('Use the original access token so your saved offline records and pending changes remain accessible.');
      const salt = encode(random(32));
      const result = await credentials.create({publicKey: {
        challenge: random(32), rp: {id: rpId, name: 'Eric’s Tools'},
        user: {id: random(32), name: 'Eric’s Tools mobile', displayName: 'Eric’s Tools mobile'},
        pubKeyCredParams: [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -257}],
        authenticatorSelection: {authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required'},
        timeout: 60000, attestation: 'none', extensions: {prf: {eval: {first: decode(salt)}}}
      }});
      if (!result) throw Error('Passkey setup was canceled. Try again.');
      if (!result.getClientExtensionResults()?.prf?.enabled) throw Error('This passkey provider does not support encrypted offline unlocking. Use Apple Passwords on iOS 18 or later.');
      pending = {token, saved: {version: 1, id: result.id, rpId, salt, fingerprint: await fingerprint(token)}};
    },
    async finish({validate = async () => {}} = {}) {
      if (!pending) throw Error('Create a passkey first.');
      const {token, saved} = pending;
      const key = await evaluate(saved), iv = random(12);
      await validate(token);
      const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad(saved)}, key, bytes(token));
      const next = {...saved, iv: encode(iv), ciphertext: encode(ciphertext)};
      // Only replace a working envelope after the new passkey has been tested.
      storage.setItem(VAULT_KEY, JSON.stringify(next));
      storage.removeItem(LEGACY_KEY);
      pending = null;
      return token;
    },
    async unlock() {
      const saved = record();
      if (!saved) throw Error('Set up your mobile passkey first.');
      const key = await evaluate(saved);
      let token;
      try { token = new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(saved.iv), additionalData: aad(saved)}, key, decode(saved.ciphertext))); }
      catch { throw Error('This passkey could not open your saved connection. Try again, or recover with your original access token.'); }
      if (await fingerprint(token) !== saved.fingerprint) throw Error('The saved connection could not be verified.');
      storage.removeItem(LEGACY_KEY);
      return token;
    },
    cancel() { pending = null; },
    disconnect() { pending = null; storage.removeItem(VAULT_KEY); storage.removeItem(LEGACY_KEY); }
  };
}
