// Web Push by hand: payload encryption (RFC 8291, aes128gcm) and application
// server identification (RFC 8292, VAPID). Both are small enough to implement
// against the spec with WebCrypto alone, which is the point — a Worker gets no
// npm dependency it would have to trust and keep current for the one job of
// telling a phone that something is due.
//
// The push service never sees what a notification says. The payload is
// encrypted to the subscription's own public key, so Apple or Google forward an
// opaque record that only the device can open.
const encoder = new TextEncoder();
export const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function fromBase64url(value) {
  const padded = String(value).replaceAll('-','+').replaceAll('_','/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
// WebCrypto's HKDF is Extract-then-Expand in one call, which is exactly the
// shape both derivations in RFC 8291 need.
const hkdf = async (salt, ikm, info, bytes) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF', hash:'SHA-256', salt, info}, key, bytes * 8));
};

// The keys and salt are injectable so the encryption can be checked against a
// known answer rather than only against itself.
export async function encryptPayload(plaintext, {p256dh, auth}, {salt = crypto.getRandomValues(new Uint8Array(16)), keyPair} = {}) {
  if (p256dh.length !== 65 || p256dh[0] !== 4) throw {status:400, message:'A push subscription key must be an uncompressed P-256 point.'};
  if (auth.length !== 16) throw {status:400, message:'A push subscription secret must be 16 bytes.'};
  const client = await crypto.subtle.importKey('raw', p256dh, {name:'ECDH', namedCurve:'P-256'}, false, []);
  const pair = keyPair || await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveBits']);
  const server = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH', public: client}, pair.privateKey, 256));
  // The key is bound to both public keys, so a record cannot be replayed at a
  // different subscription even by the push service that carried it.
  const ikm = await hkdf(auth, shared, concat(encoder.encode('WebPush: info\0'), p256dh, server), 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record holds the whole message, so its padding delimiter is 0x02.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv:nonce}, key,
    concat(encoder.encode(plaintext), new Uint8Array([2]))));
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([server.length]), server, ciphertext);
}

// VAPID is the server saying who it is, signed, with a contact address the push
// service can use if this application starts misbehaving.
export async function vapidAuthorization(endpoint, {publicKey, privateKey, subject}, now = Date.now()) {
  const part = value => base64url(encoder.encode(JSON.stringify(value)));
  const token = [
    part({typ:'JWT', alg:'ES256'}),
    part({aud:new URL(endpoint).origin, exp:Math.floor(now/1000) + 12*3600, sub:subject})
  ].join('.');
  const key = await crypto.subtle.importKey('jwk', {
    kty:'EC', crv:'P-256', x:base64url(publicKey.slice(1,33)), y:base64url(publicKey.slice(33,65)), d:base64url(privateKey)
  }, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, key, encoder.encode(token)));
  return `vapid t=${token}.${base64url(signature)}, k=${base64url(publicKey)}`;
}

// 404 and 410 are the push service saying this subscription is gone for good;
// everything else is this attempt failing, and the subscription stays.
export const subscriptionGone = status => status === 404 || status === 410;
// A subscription carries its keys the way the browser reported them and the
// way they are stored: base64url text. Bytes are accepted too, so the
// encryption can be exercised directly.
const keyBytes = value => value instanceof Uint8Array ? value : fromBase64url(value);
export async function sendPush({endpoint, p256dh, auth}, payload, vapid, {ttl = 86400, urgency = 'normal', fetcher = fetch, timeoutMs = 15000, ...options} = {}) {
  const body = await encryptPayload(payload, {p256dh:keyBytes(p256dh), auth:keyBytes(auth)}, options);
  const response = await fetcher(endpoint, {
    method:'POST',
    headers:{
      Authorization: await vapidAuthorization(endpoint, vapid),
      'Content-Encoding':'aes128gcm',
      'Content-Type':'application/octet-stream',
      TTL:String(ttl), Urgency:urgency
    },
    body, signal:AbortSignal.timeout(timeoutMs)
  });
  return {ok:response.ok, status:response.status, gone:subscriptionGone(response.status)};
}
