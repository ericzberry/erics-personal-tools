// Opens a PDF that was locked before it was sent. Banks do this routinely: the
// file carries an owner password that forbids printing or copying, while the
// user password is empty, so any reader may open it without being asked for
// anything. Chase statements are exactly this. Without the standard security
// handler every stream in such a file is unreadable noise, and a statement
// full of text looks to a reader like a scan.
//
// Only the empty user password is attempted, because that is the case where
// the owner is entitled to the contents and no one has to be asked for a
// secret. A file that genuinely needs a password says so and is not guessed at.
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

// Algorithm 2: the file key from the empty user password. Everything a stream
// needs afterwards is derived from it and the object it belongs to.
function fileKey({revision, ownerEntry, permissions, id, length, encryptMetadata}) {
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, permissions, true);
  const extra = revision >= 4 && !encryptMetadata ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array();
  let key = md5(bytesOf(PAD, ownerEntry, p, id, extra));
  const size = revision === 2 ? 5 : length;
  if (revision >= 3) for (let i = 0; i < 50; i++) key = md5(key.slice(0, size));
  return key.slice(0, size);
}

// Algorithms 4 and 5: does the empty password actually open this file? A wrong
// answer here would hand the extractor noise and call it a scan, so it is
// checked rather than assumed.
function opensWithEmptyPassword({revision, key, userEntry, id}) {
  if (revision === 2) return rc4(key, PAD).every((byte, i) => byte === userEntry[i]);
  let digest = md5(bytesOf(PAD, id));
  let out = rc4(key, digest);
  for (let i = 1; i <= 19; i++) out = rc4(key.map(byte => byte ^ i), out);
  return out.every((byte, i) => byte === userEntry[i]);
}

async function aesDecrypt(key, data) {
  if (data.length <= 16) return new Uint8Array();
  const material = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({name: 'AES-CBC', iv: data.slice(0, 16)}, material, data.slice(16));
  return new Uint8Array(plain);
}

// Returns a function that turns one object's stored bytes back into its real
// ones, or null when the file is not encrypted. Throws when the file needs a
// password this reader is not entitled to guess, or uses a scheme it cannot
// open — both of which the caller reports rather than mistaking for a scan.
export function decryptor(source, dictOf) {
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
  // V5 is AES-256 with its own password algorithm. It is rare outside PDF 2.0
  // producers, and guessing at it would be worse than saying plainly that this
  // file has to come out of its viewer as a fresh PDF first.
  if (version >= 5) throw Error('This PDF uses AES-256 encryption this reader cannot open. Print or export it to a new PDF, then drop that.');
  if (!ownerEntry || !userEntry) throw Error('This PDF is encrypted and its lock could not be read. Print or export it to a new PDF, then drop that.');
  const method = version >= 4
    ? (/\/CFM\s*\/(\w+)/.exec(dict)?.[1] || 'V2')
    : 'V2';
  if (!['V2', 'AESV2', 'None'].includes(method)) throw Error('This PDF uses an encryption method this reader cannot open. Print or export it to a new PDF, then drop that.');
  const encryptMetadata = !/\/EncryptMetadata\s+false/.test(dict);
  const key = fileKey({revision, ownerEntry, permissions, id, length, encryptMetadata});
  if (!opensWithEmptyPassword({revision, key, userEntry, id})) throw Error('This PDF needs a password to open. Open it in a PDF reader, then print or export it to an unlocked PDF.');
  if (method === 'None') return (number, generation, data) => data;
  // Algorithm 1: every object gets its own key, made from the file key and the
  // object's own number, so one object's bytes never decrypt another's.
  return (number, generation, data) => {
    const salt = method === 'AESV2' ? new Uint8Array([0x73, 0x41, 0x6C, 0x54]) : new Uint8Array();
    const objectKey = md5(bytesOf(key, new Uint8Array([number & 255, (number >> 8) & 255, (number >> 16) & 255, generation & 255, (generation >> 8) & 255]), salt))
      .slice(0, Math.min(key.length + 5, 16));
    return method === 'AESV2' ? aesDecrypt(objectKey, data) : rc4(objectKey, data);
  };
}
