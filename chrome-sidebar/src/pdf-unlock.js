// Writes out an unlocked copy of an encrypted PDF, on the device.
//
// Reading a locked document is not the same as filing one. A tax return that
// arrives needing a password is a file that, five years from now, opens to a
// prompt nobody remembers the answer to — so once the owner has supplied the
// password, what goes to Drive is the document with the lock taken off rather
// than the document as it arrived.
//
// Nothing is decompressed and re-encoded: each object's stored bytes are
// decrypted and written back exactly as they were before the lock was applied,
// so a Flate stream stays a Flate stream. What changes is that /Encrypt is
// gone, the cross-reference table is rebuilt, and the containers that only
// existed to hold other objects are unpacked.
//
// The rewrite is checked before it is offered. A copy that does not read back
// as well as the original is discarded and said so, because filing a quietly
// corrupted return would be worse than filing a locked one.
import {openDocument, pdfText} from './pdf-text.js';

const LATIN1 = new TextDecoder('latin1');
const latin1 = bytes => LATIN1.decode(bytes);
const encode = text => Uint8Array.from(text, character => character.charCodeAt(0) & 255);
const hex = bytes => `<${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}>`;
const hexBytes = text => Uint8Array.from((text.replace(/[^0-9a-fA-F]/g, '').match(/.{1,2}/g) || []),
  pair => parseInt(pair.padEnd(2, '0'), 16));

// A literal string, returned as its bytes and the offset just past its closing
// parenthesis. The same escapes the reader's own string parser handles.
function readLiteral(text, start) {
  const out = [];
  let depth = 1, i = start;
  while (i < text.length) {
    const character = text[i];
    if (character === '\\') {
      const octal = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4));
      if (octal) { out.push(parseInt(octal[0], 8)); i += 1 + octal[0].length; continue; }
      const escaped = {n: 10, r: 13, t: 9, b: 8, f: 12}[text[i + 1]];
      if (escaped !== undefined) out.push(escaped);
      else if (text[i + 1] !== '\n') out.push(text.charCodeAt(i + 1));
      i += 2;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')' && !--depth) { i++; break; }
    out.push(text.charCodeAt(i) & 255);
    i++;
  }
  return {bytes: new Uint8Array(out), end: i};
}

// Strings in a dictionary are encrypted object by object, just as streams are —
// a title, a form field's value, a date. Every one is rewritten as a hex
// string, which needs no escaping and so cannot be malformed by this pass.
async function decryptStrings(dict, object, decrypt) {
  let out = '', i = 0;
  while (i < dict.length) {
    const character = dict[i];
    if (character === '<' && dict[i + 1] === '<') { out += '<<'; i += 2; continue; }
    if (character === '>' && dict[i + 1] === '>') { out += '>>'; i += 2; continue; }
    if (character === '%') {
      const line = dict.indexOf('\n', i);
      const stop = line < 0 ? dict.length : line + 1;
      out += dict.slice(i, stop);
      i = stop;
      continue;
    }
    if (character === '(') {
      const {bytes, end} = readLiteral(dict, i + 1);
      out += hex(await decrypt(object.number, object.generation, bytes));
      i = end;
      continue;
    }
    if (character === '<') {
      const close = dict.indexOf('>', i + 1);
      if (close < 0) { out += dict.slice(i); break; }
      out += hex(await decrypt(object.number, object.generation, hexBytes(dict.slice(i + 1, close))));
      i = close + 1;
      continue;
    }
    out += character;
    i++;
  }
  return out;
}

// /Length has to describe the bytes actually written, and in a locked file it
// is often an indirect reference to an object that is about to hold a stale
// number. Either way it becomes the real length, written directly.
function setLength(dict, length) {
  if (/\/Length\s+\d+\s+\d+\s+R/.test(dict)) return dict.replace(/\/Length\s+\d+\s+\d+\s+R/, `/Length ${length}`);
  if (/\/Length\s+\d+/.test(dict)) return dict.replace(/\/Length\s+\d+/, `/Length ${length}`);
  const close = dict.lastIndexOf('>>');
  return close < 0 ? dict : `${dict.slice(0, close)} /Length ${length} ${dict.slice(close)}`;
}

// The objects worth writing: everything except the lock itself, the containers
// whose contents have already been unpacked into objects of their own, and the
// two dictionaries that describe where things used to be in a file that is
// about to be laid out differently.
const REWRITTEN = /\/Type\s*\/(?:ObjStm|XRef)\b/;
function objectsToKeep(doc, source) {
  const lock = Number(/\/Encrypt\s+(\d+)\s+\d+\s+R/.exec(source)?.[1] || 0);
  return [...doc.objects.values()]
    .filter(object => object.number !== lock && object.number > 0
      && !REWRITTEN.test(object.dict) && !/\/Linearized\b/.test(object.dict))
    .sort((left, right) => left.number - right.number);
}

async function rebuild(doc, source) {
  const root = [...source.matchAll(/\/Root\s+(\d+)\s+(\d+)\s+R/g)].at(-1);
  if (!root) throw Error('This PDF has no catalogue to rebuild from.');
  const info = [...source.matchAll(/\/Info\s+(\d+)\s+(\d+)\s+R/g)].at(-1);
  const keep = objectsToKeep(doc, source);
  if (!keep.length) throw Error('This PDF has no objects to rewrite.');
  const header = source.slice(0, Math.max(source.indexOf('\n'), 8));
  const parts = [];
  let at = 0;
  const push = chunk => { parts.push(chunk); at += chunk.length; };
  push(encode(`${header}\n`));
  // The four high bytes every producer writes, which tell anything copying the
  // file that it is binary and must not be translated as text.
  push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

  const offsets = new Map();
  for (const object of keep) {
    let dict = object.dict, body = null;
    if (object.stream) {
      const stored = doc.bytes.subarray(object.stream.begin, object.stream.end);
      // Metadata is left in the clear when the file says so, and decrypting it
      // again would turn readable XML into noise.
      const clear = /\/Type\s*\/Metadata\b/.test(dict) && doc.decrypt.encryptMetadata === false;
      body = clear ? stored : await doc.decrypt(object.number, object.generation, stored);
      dict = setLength(dict, body.length);
    }
    dict = await decryptStrings(dict, object, doc.decrypt);
    offsets.set(object.number, {offset: at, generation: object.generation});
    push(encode(`${object.number} ${object.generation} obj\n`));
    push(encode(dict));
    if (body) { push(encode('\nstream\n')); push(body); push(encode('\nendstream')); }
    push(encode('\nendobj\n'));
  }

  const size = keep[keep.length - 1].number + 1;
  const startxref = at;
  const rows = ['0000000000 65535 f \n'];
  for (let number = 1; number < size; number++) {
    const entry = offsets.get(number);
    rows.push(entry
      ? `${String(entry.offset).padStart(10, '0')} ${String(entry.generation).padStart(5, '0')} n \n`
      : '0000000000 65535 f \n');
  }
  push(encode(`xref\n0 ${size}\n${rows.join('')}`));
  push(encode(`trailer\n<< /Size ${size} /Root ${root[1]} ${root[2]} R${
    info && offsets.has(Number(info[1])) ? ` /Info ${info[1]} ${info[2]} R` : ''} >>\nstartxref\n${startxref}\n%%EOF\n`));

  const out = new Uint8Array(at);
  let written = 0;
  for (const chunk of parts) { out.set(chunk, written); written += chunk.length; }
  return {bytes: out, objects: keep.map(object => object.number)};
}

// The whole errand in one call: read the document with the password the owner
// gave, and hand back an unlocked copy of it along with the text that was read.
//
// Throws with `needsPassword` when a password is needed and none was given, or
// when the one given is wrong — the caller asks again. Everything else comes
// back as an answer: `unlocked` says whether the bytes are a new copy or the
// ones that were handed in, and `note` says why when they are not.
export async function unlockPdf(bytes, {password = ''} = {}) {
  const source = latin1(bytes);
  if (!source.startsWith('%PDF-')) throw Error('That is not a PDF file.');
  const read = await pdfText(bytes, {password});
  if (read.needsPassword) throw Object.assign(Error(read.note), {needsPassword: true});
  if (!read.encrypted) return {encrypted: false, unlocked: false, bytes, ...read, note: read.note};

  let rewritten;
  try { rewritten = await rebuild(await openDocument(bytes, source, {password}), source); }
  catch (error) {
    return {encrypted: true, unlocked: false, bytes, ...read,
      note: 'The unlocked copy could not be written, so this files as it arrived and still needs its password.'};
  }

  // Read the copy back before offering it. Every object that was written has to
  // be findable, nothing may still be encrypted, and a document that had text
  // must still have it.
  const check = await pdfText(rewritten.bytes);
  const reopened = await openDocument(rewritten.bytes, latin1(rewritten.bytes));
  const intact = !check.encrypted && !reopened.locked
    && rewritten.objects.every(number => reopened.objects.has(number))
    && check.text.length >= Math.floor(read.text.length * 0.95);
  if (!intact) {
    return {encrypted: true, unlocked: false, bytes, ...read,
      note: 'The unlocked copy did not read back the same, so this files as it arrived and still needs its password.'};
  }
  return {encrypted: true, unlocked: true, bytes: rewritten.bytes, ...check,
    note: 'Unlocked on this device. The copy filed opens without a password.'};
}
