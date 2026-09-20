// Real locked PDFs, built rather than committed, so the reader is proved
// against files that were actually encrypted the way the specification says
// rather than against a fixture shaped to suit it. Two locks are built: the
// RC4 one a bank or an older preparer applies, and the AES-256 one current
// software writes.
//
// Nothing here uses a Node built-in, because the synthetic preview loads the
// same builder in a browser to show the state a locked document puts the tool
// into. `md5`, `rc4` and `hash2B` are imported from the handler rather than
// written twice: what that leaves untested is those three, and what it does
// test is everything around them — the layout of /U, /O, /UE and /OE, the key
// unwrapping, and the encrypted streams themselves.
import {md5, rc4, hash2B} from '../../src/pdf-crypt.js';

const PAD = new Uint8Array([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,
  0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);
const joined = (...parts) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const latin1 = text => Uint8Array.from(text, character => character.charCodeAt(0) & 255);
const utf8 = text => new TextEncoder().encode(text);
const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const filled = (length, value) => new Uint8Array(length).fill(value);
const random = length => crypto.getRandomValues(new Uint8Array(length));
const int32 = value => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value, true);
  return out;
};
const pad = password => joined(latin1(password), PAD).slice(0, 32);

// CBC without padding: WebCrypto always adds a block, so it is dropped again.
async function aesNoPad(key, iv, data) {
  const material = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv}, material, data)).slice(0, data.length);
}
// A PDF stream: a random initialisation vector, then the PKCS padded bytes —
// which is exactly what WebCrypto writes.
async function aesStream(key, data) {
  const iv = random(16);
  const material = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  return joined(iv, new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv}, material, data)));
}

export const RETURN_LINE = '2025 Form 1040 Adjusted gross income 812,455.00 Total tax 241,207.00';
const CONTENT = `BT /F1 12 Tf 72 700 Td (${RETURN_LINE}) Tj ET`;

const stream = body => joined(latin1(`<< /Length ${body.length} >>\nstream\n`), body, latin1('\nendstream'));
const page = contents => [
  latin1('<< /Type /Catalog /Pages 2 0 R >>'),
  latin1('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
  latin1('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'),
  contents,
  latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
];

// Assembles the objects into a file with a classic cross-reference table.
// `encrypt` is the lock dictionary reference, or '' for a document with no lock.
function assemble(objects, {encrypt = '', id}) {
  const parts = [latin1('%PDF-1.7\n')];
  const offsets = [];
  let at = parts[0].length;
  objects.forEach((body, index) => {
    const piece = joined(latin1(`${index + 1} 0 obj\n`), body, latin1('\nendobj\n'));
    offsets.push(at);
    parts.push(piece);
    at += piece.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R${encrypt} /ID [<${id}> <${id}>] >>\nstartxref\n${at}\n%%EOF`;
  return joined(...parts, latin1(xref + trailer));
}

// Revision 2, 40-bit RC4: the lock a bank applies, and the one an older tax
// package applies when it is given a password. An empty `userPassword` is the
// bank's case, where the document opens for anyone.
export function rc4Locked({userPassword = 'taxes-2025', ownerPassword = 'owner-secret'} = {}) {
  const id = filled(16, 0x11);
  const owner = rc4(md5(pad(ownerPassword)).slice(0, 5), pad(userPassword));
  const key = md5(joined(pad(userPassword), owner, int32(-12), id)).slice(0, 5);
  const user = rc4(key, PAD);
  const objectKey = number => md5(joined(key, new Uint8Array([number & 255, (number >> 8) & 255, (number >> 16) & 255, 0, 0]))).slice(0, 10);
  return assemble([
    ...page(stream(rc4(objectKey(4), latin1(CONTENT)))),
    latin1(`<< /Title <${hex(rc4(objectKey(6), latin1('2025 federal return')))}> >>`),
    latin1(`<< /Filter /Standard /V 1 /R 2 /Length 40 /P -12 /O <${hex(owner)}> /U <${hex(user)}> >>`)
  ], {encrypt: ' /Encrypt 7 0 R', id: hex(id)});
}

// Revision 6, AES-256: what current software writes. The password no longer
// derives the file key directly — it unwraps a random one held in /UE or /OE,
// which is what this has to get right.
export async function aes256Locked({userPassword = 'taxes-2025', ownerPassword = 'owner-secret'} = {}) {
  const id = filled(16, 0x22);
  const fileKey = random(32);
  const salts = random(32);
  const [userValidation, userKeySalt, ownerValidation, ownerKeySalt] =
    [salts.slice(0, 8), salts.slice(8, 16), salts.slice(16, 24), salts.slice(24, 32)];
  const hash = (password, salt, extra = new Uint8Array()) => hash2B(6, utf8(password), salt, extra);
  const user = joined(await hash(userPassword, userValidation), userValidation, userKeySalt);
  const userKey = await aesNoPad(await hash(userPassword, userKeySalt), filled(16, 0), fileKey);
  const owner = joined(await hash(ownerPassword, ownerValidation, user), ownerValidation, ownerKeySalt);
  const ownerKey = await aesNoPad(await hash(ownerPassword, ownerKeySalt, user), filled(16, 0), fileKey);
  // /Perms is the permissions block a real revision 6 file carries, encrypted
  // with the file key. Nothing here reads it, but a reader that checks it must
  // still meet a file that has one.
  const perms = await aesNoPad(fileKey, filled(16, 0), joined(int32(-12), latin1('\xff\xff\xff\xffTadb'), filled(4, 0)));
  return assemble([
    ...page(stream(await aesStream(fileKey, latin1(CONTENT)))),
    latin1(`<< /Title <${hex(await aesStream(fileKey, latin1('2025 federal return')))}> >>`),
    latin1(`<< /Filter /Standard /V 5 /R 6 /Length 256 /P -12 /EncryptMetadata true`
      + ` /CF << /StdCF << /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> /StmF /StdCF /StrF /StdCF`
      + ` /U <${hex(user)}> /UE <${hex(userKey)}>`
      + ` /O <${hex(owner)}> /OE <${hex(ownerKey)}>`
      + ` /Perms <${hex(perms)}> >>`)
  ], {encrypt: ' /Encrypt 7 0 R', id: hex(id)});
}

export const plainPdf = () => assemble([
  ...page(stream(latin1(CONTENT))),
  latin1('<< /Title (2025 federal return) >>')
], {id: '33'.repeat(16)});
