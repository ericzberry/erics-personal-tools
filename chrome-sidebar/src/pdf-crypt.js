// Opens a PDF that was locked before it was sent. Two different locks arrive
// here and they are not the same problem.
//
// Banks lock a statement with an owner password while leaving the user
// password empty, so any reader may open it without being asked for anything.
// Chase statements are exactly this. Without the standard security handler
// every stream in such a file is unreadable noise, and a statement full of
// text looks to a reader like a scan.
//
// A tax document is often locked the other way: it genuinely needs a password,
// which the owner has and this code does not. Nothing here guesses at one. A
// password is used only when it is handed in, and a file that needs one and was
// given none says so — `needsPassword` on the error — so the caller can ask
// rather than report a broken file.
const PAD = new Uint8Array([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,
  0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);

const SHIFTS = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22, 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
  4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23, 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const SINE = Uint32Array.from({length: 64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));

// MD5 is here for one reason: the standard security handler is defined in terms
// of it. WebCrypto refuses MD5, rightly, so the handler's own hash lives here
// and is used for nothing else.
export function md5(input) {
  const padded = new Uint8Array((((input.length + 8) >> 6) + 1) << 6);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (input.length << 3) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(input.length / 536870912), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      f = (f + a + SINE[i] + view.getUint32(chunk + g * 4, true)) >>> 0;
      [a, d, c] = [d, c, b];
      b = (b + ((f << SHIFTS[i]) | (f >>> (32 - SHIFTS[i])))) >>> 0;
    }
    [a0, b0, c0, d0] = [(a0 + a) >>> 0, (b0 + b) >>> 0, (c0 + c) >>> 0, (d0 + d) >>> 0];
  }
  const out = new Uint8Array(16);
  new DataView(out.buffer).setUint32(0, a0, true);
  new DataView(out.buffer).setUint32(4, b0, true);
  new DataView(out.buffer).setUint32(8, c0, true);
  new DataView(out.buffer).setUint32(12, d0, true);
  return out;
}

export function rc4(key, data) {
  const box = new Uint8Array(256).map((_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + box[i] + key[i % key.length]) & 255;
    [box[i], box[j]] = [box[j], box[i]];
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let at = 0; at < data.length; at++) {
    i = (i + 1) & 255;
    j = (j + box[i]) & 255;
    [box[i], box[j]] = [box[j], box[i]];
    out[at] = data[at] ^ box[(box[i] + box[j]) & 255];
  }
  return out;
}

// A PDF literal string, which is where the /O and /U entries live. Shared with
// the extractor's own reader in spirit, kept here so this module stands alone.
function literal(source, start) {
  const out = [];
  let depth = 1, i = start;
  while (i < source.length) {
    const character = source[i];
    if (character === '\\') {
      const octal = /^[0-7]{1,3}/.exec(source.slice(i + 1, i + 4));
      if (octal) { out.push(parseInt(octal[0], 8)); i += 1 + octal[0].length; continue; }
      const escaped = {n: 10, r: 13, t: 9, b: 8, f: 12}[source[i + 1]];
      if (escaped !== undefined) out.push(escaped);
      else if (source[i + 1] !== '\n') out.push(source.charCodeAt(i + 1));
      i += 2;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')' && !--depth) break;
    out.push(source.charCodeAt(i) & 255);
    i++;
  }
  return new Uint8Array(out);
}

const hexString = text => new Uint8Array((text.replace(/[^0-9a-fA-F]/g, '').match(/.{1,2}/g) || []).map(pair => parseInt(pair.padEnd(2, '0'), 16)));

// /O and /U are byte strings that may be written either way round.
function stringEntry(dict, key) {
  const at = dict.indexOf(key);
  if (at < 0) return null;
  const rest = dict.slice(at + key.length);
  const opener = /^\s*(\(|<)/.exec(rest);
  if (!opener) return null;
  const start = at + key.length + opener.index + opener[0].length;
  if (opener[1] === '(') return literal(dict, start);
  return hexString(dict.slice(start, dict.indexOf('>', start)));
}

const bytesOf = (...parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};

// A password the owner typed is refused, not thrown away: the caller shows the
// message and asks again, so the two cases are told apart on the error itself.
const locked = (message, extra = {}) => Object.assign(Error(message), {needsPassword: true, ...extra});

// Up to revision 4 a password is padded out to 32 bytes with a constant the
// specification fixes; from revision 5 it is UTF-8 and used as it is.
const latin1Bytes = text => Uint8Array.from([...String(text ?? '')].map(character => character.charCodeAt(0) & 255));
function padPassword(password) {
  const bytes = latin1Bytes(password);
  const out = new Uint8Array(32);
  const taken = Math.min(bytes.length, 32);
  out.set(bytes.subarray(0, taken));
  out.set(PAD.subarray(0, 32 - taken), taken);
  return out;
}
const utf8Password = password => new TextEncoder().encode(String(password ?? '')).slice(0, 127);

// Algorithm 2: the file key from a padded password. Everything a stream needs
// afterwards is derived from it and the object it belongs to.
function fileKey({revision, padded, ownerEntry, permissions, id, length, encryptMetadata}) {
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, permissions, true);
  const extra = revision >= 4 && !encryptMetadata ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array();
  let key = md5(bytesOf(padded, ownerEntry, p, id, extra));
  const size = revision === 2 ? 5 : length;
  if (revision >= 3) for (let i = 0; i < 50; i++) key = md5(key.slice(0, size));
  return key.slice(0, size);
}

// Algorithms 4 and 5: does this key actually open the file? A wrong answer here
// would hand the extractor noise and call it a scan, so it is checked rather
// than assumed.
function keyOpens({revision, key, userEntry, id}) {
  if (revision === 2) return rc4(key, PAD).every((byte, i) => byte === userEntry[i]);
  let out = rc4(key, md5(bytesOf(PAD, id)));
  for (let i = 1; i <= 19; i++) out = rc4(key.map(byte => byte ^ i), out);
  return out.every((byte, i) => byte === userEntry[i]);
}

// Algorithm 7: an owner password does not open the file directly — it unwraps
// the user password held in /O, which then does. Someone who knows the owner
// password is entitled to the contents, so both are accepted.
function userPasswordFromOwner({revision, password, ownerEntry, length}) {
  let key = md5(padPassword(password));
  if (revision >= 3) for (let i = 0; i < 50; i++) key = md5(key);
  key = key.slice(0, revision === 2 ? 5 : length);
  if (revision === 2) return rc4(key, ownerEntry);
  let out = ownerEntry;
  for (let i = 19; i >= 0; i--) out = rc4(key.map(byte => byte ^ i), out);
  return out;
}

// ------------------------------------------------------------ AES-256 (V5) --
// Revisions 5 and 6 drop MD5 and RC4 entirely: the password is hashed to a key
// that unwraps the real file key, and every stream is AES-256 with that one key
// rather than a key per object.
const zeroIv = () => new Uint8Array(16);
const sha = async (bits, bytes) => new Uint8Array(await crypto.subtle.digest(`SHA-${bits}`, bytes));

// CBC without padding, both ways. WebCrypto always pads, so encryption drops
// the block it added, and decryption is handed one extra block built to
// decrypt to exactly the padding WebCrypto insists on finding.
async function aesEncryptNoPad(key, iv, data) {
  const material = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  const out = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv}, material, data));
  return out.slice(0, data.length);
}
async function aesDecryptNoPad(key, iv, data) {
  if (!data.length) return new Uint8Array();
  const material = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt', 'decrypt']);
  const last = data.slice(data.length - 16);
  const filler = Uint8Array.from(last, byte => byte ^ 16);
  const tail = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv: zeroIv()}, material, filler)).slice(0, 16);
  return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv}, material, bytesOf(data, tail)));
}

const repeat = (bytes, times) => {
  const out = new Uint8Array(bytes.length * times);
  for (let i = 0; i < times; i++) out.set(bytes, i * bytes.length);
  return out;
};

// Algorithm 2.B. Revision 5 is the single SHA-256 Adobe shipped before the
// standard settled; revision 6 is the hardened loop that replaced it.
export async function hash2B(revision, password, salt, extra = new Uint8Array()) {
  let key = await sha(256, bytesOf(password, salt, extra));
  if (revision < 6) return key;
  let rounds = 0, block;
  do {
    block = await aesEncryptNoPad(key.slice(0, 16), key.slice(16, 32),
      repeat(bytesOf(password, key, extra), 64));
    const pick = block.slice(0, 16).reduce((sum, byte) => sum + byte, 0) % 3;
    key = await sha([256, 384, 512][pick], block);
    rounds++;
  } while (rounds < 64 || block[block.length - 1] > rounds - 32);
  return key.slice(0, 32);
}

// Which of the two passwords was given, and the file key it unwraps. Both are
// tried, because a document sent with only an owner password set is opened by
// that password and by an empty user password alike.
async function aes256Key({revision, password, ownerEntry, userEntry, ownerKeyEntry, userKeyEntry}) {
  const bytes = utf8Password(password);
  if (userEntry.length < 48 || ownerEntry.length < 48) throw locked('This PDF is encrypted and its lock could not be read.');
  const user = userEntry.slice(0, 48);
  if ((await hash2B(revision, bytes, userEntry.slice(32, 40))).slice(0, 32)
    .every((byte, i) => byte === userEntry[i])) {
    const intermediate = await hash2B(revision, bytes, userEntry.slice(40, 48));
    return aesDecryptNoPad(intermediate, zeroIv(), userKeyEntry);
  }
  if ((await hash2B(revision, bytes, ownerEntry.slice(32, 40), user)).slice(0, 32)
    .every((byte, i) => byte === ownerEntry[i])) {
    const intermediate = await hash2B(revision, bytes, ownerEntry.slice(40, 48), user);
    return aesDecryptNoPad(intermediate, zeroIv(), ownerKeyEntry);
  }
  return null;
}

async function aesDecrypt(key, data) {
  if (data.length <= 16) return new Uint8Array();
  const material = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({name: 'AES-CBC', iv: data.slice(0, 16)}, material, data.slice(16));
  return new Uint8Array(plain);
}

// Returns a function that turns one object's stored bytes back into its real
// ones, or null when the file is not encrypted. The function carries what the
// rewriter needs to know about the lock it came from. Throws when the file
// needs a password that was not given or was wrong — both carry
// `needsPassword`, so the caller asks instead of reporting a broken file — and
// when the scheme is one this reader cannot open at all.
export async function decryptor(source, dictOf, {password = ''} = {}) {
  const reference = /\/Encrypt\s+(\d+)\s+\d+\s+R/.exec(source);
  if (!reference && !/\/Encrypt\s*<</.test(source)) return null;
  const dict = reference ? dictOf(Number(reference[1])) : '';
  if (!dict) throw Error('This PDF is encrypted and its lock could not be read. Print or export it to a new PDF, then drop that.');
  if (!/\/Filter\s*\/Standard/.test(dict)) throw Error('This PDF uses a custom security handler this reader cannot open. Print or export it to a new PDF, then drop that.');
  const version = Number(/\/V\s+(\d+)/.exec(dict)?.[1] || 0);
  const revision = Number(/\/R\s+(\d+)/.exec(dict)?.[1] || 2);
  const permissions = Number(/\/P\s+(-?\d+)/.exec(dict)?.[1] || 0);
  const length = Number(/\/Length\s+(\d+)/.exec(dict)?.[1] || 40) / 8;
  const ownerEntry = stringEntry(dict, '/O');
  const userEntry = stringEntry(dict, '/U');
  const idHex = /\/ID\s*\[\s*<([0-9a-fA-F]*)>/.exec(source)?.[1] || '';
  const id = hexString(idHex);
  if (version > 5) throw Error('This PDF uses an encryption scheme this reader cannot open. Print or export it to a new PDF, then drop that.');
  if (!ownerEntry || !userEntry) throw Error('This PDF is encrypted and its lock could not be read. Print or export it to a new PDF, then drop that.');
  const encryptMetadata = !/\/EncryptMetadata\s+false/.test(dict);
  const given = String(password ?? '');
  const wrong = () => given
    ? locked('That password did not open this PDF.', {wrongPassword: true})
    : locked('This PDF needs a password to open.');

  if (version === 5) {
    const key = await aes256Key({revision, password: given, ownerEntry, userEntry,
      ownerKeyEntry: stringEntry(dict, '/OE') || new Uint8Array(),
      userKeyEntry: stringEntry(dict, '/UE') || new Uint8Array()});
    if (!key) throw wrong();
    const decrypt = (number, generation, data) => aesDecrypt(key, data);
    return Object.assign(decrypt, {method: 'AESV3', version, revision, encryptMetadata});
  }

  const method = version >= 4 ? (/\/CFM\s*\/(\w+)/.exec(dict)?.[1] || 'V2') : 'V2';
  if (!['V2', 'AESV2', 'None'].includes(method)) throw Error('This PDF uses an encryption method this reader cannot open. Print or export it to a new PDF, then drop that.');
  const settings = {revision, ownerEntry, permissions, id, length, encryptMetadata};
  // The empty user password first, because that is the bank's lock and asks
  // nobody for anything; then what was typed, as a user password and as an
  // owner password.
  const candidates = [PAD, ...(given ? [padPassword(given),
    userPasswordFromOwner({revision, password: given, ownerEntry, length})] : [])];
  const key = candidates.map(padded => fileKey({...settings, padded}))
    .find(candidate => keyOpens({revision, key: candidate, userEntry, id}));
  if (!key) throw wrong();
  if (method === 'None') return Object.assign((number, generation, data) => data, {method, version, revision, encryptMetadata});
  // Algorithm 1: every object gets its own key, made from the file key and the
  // object's own number, so one object's bytes never decrypt another's.
  const decrypt = (number, generation, data) => {
    const salt = method === 'AESV2' ? new Uint8Array([0x73, 0x41, 0x6C, 0x54]) : new Uint8Array();
    const objectKey = md5(bytesOf(key, new Uint8Array([number & 255, (number >> 8) & 255, (number >> 16) & 255, generation & 255, (generation >> 8) & 255]), salt))
      .slice(0, Math.min(key.length + 5, 16));
    return method === 'AESV2' ? aesDecrypt(objectKey, data) : rc4(objectKey, data);
  };
  return Object.assign(decrypt, {method, version, revision, encryptMetadata});
}
