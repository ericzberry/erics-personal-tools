// Pulls the text out of a PDF on the device, so a statement can be read without
// uploading the file anywhere.
//
// It is a small reader rather than a full PDF engine, but it reads what banks
// and brokers actually send: a digitally generated document, usually locked
// with an owner password, whose text is drawn inside form XObjects with
// subset fonts that only make sense through their own ToUnicode tables. Text
// is collected with the position it is painted at, so a statement's rows
// survive as rows instead of arriving as a column of loose words.
//
// It does not do OCR, so a page that is genuinely a picture has nothing to
// give it, and it will not guess at a password it was not given. Both cases
// are reported rather than passed off as text — `confidence` and `note` are
// what the caller shows the owner before anything is sent.
import {decryptor} from './pdf-crypt.js';
const LATIN1 = new TextDecoder('latin1');
export const MAX_TEXT = 200000;

const latin1 = bytes => LATIN1.decode(bytes);

async function inflate(bytes) {
  // PDF Flate streams are usually zlib-wrapped, but raw deflate appears in the
  // wild. Try the common case, then the other one, before giving up on a stream.
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* try the next format */ }
  }
  return null;
}

// ---------------------------------------------------------------- objects --
// Indirect objects are found by scanning rather than through the cross
// reference table: a statement that has been appended to, or whose xref is
// slightly wrong, still reads, and nothing here depends on byte offsets being
// trustworthy.
function indexObjects(source) {
  const objects = new Map();
  const pattern = /(?:^|[^0-9])(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = pattern.exec(source))) {
    const bodyStart = match.index + match[0].length;
    const endobj = source.indexOf('endobj', bodyStart);
    const limit = endobj < 0 ? source.length : endobj;
    const opener = /stream\r?\n/.exec(source.slice(bodyStart, limit));
    let dict = source.slice(bodyStart, limit), stream = null;
    if (opener) {
      dict = source.slice(bodyStart, bodyStart + opener.index);
      const begin = bodyStart + opener.index + opener[0].length;
      // /Length is authoritative when it is a direct integer. Otherwise fall
      // back to the endstream keyword and drop the EOL before it, which is not
      // part of the data and makes a strict inflater fail.
      const declared = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1]);
      let end = Number.isFinite(declared) && declared > 0 ? begin + declared : source.indexOf('endstream', begin);
      if (end < 0) end = source.length;
      if (!Number.isFinite(declared)) while (end > begin && '\r\n'.includes(source[end - 1])) end--;
      stream = {begin, end: Math.max(begin, end)};
    }
    objects.set(Number(match[1]), {number: Number(match[1]), generation: Number(match[2]), dict, stream});
  }
  return objects;
}

// A document is the object table plus the one thing that makes its streams
// readable. Everything below reads from this and caches what it decodes.
export async function openDocument(bytes, source, {password = ''} = {}) {
  const objects = indexObjects(source);
  const doc = {bytes, source, objects, decrypt: null, streams: new Map(), locked: '', needsPassword: false};
  try { doc.decrypt = await decryptor(source, number => objects.get(number)?.dict || '', {password}); }
  catch (error) { doc.locked = error.message; doc.needsPassword = !!error.needsPassword; }
  if (!doc.locked) await expandObjectStreams(doc);
  return doc;
}

async function streamOf(doc, number) {
  if (doc.streams.has(number)) return doc.streams.get(number);
  doc.streams.set(number, null);
  const object = doc.objects.get(number);
  if (!object?.stream) return null;
  let raw = doc.bytes.subarray(object.stream.begin, object.stream.end);
  if (doc.decrypt && !/\/Type\s*\/XRef/.test(object.dict)) {
    try { raw = await doc.decrypt(object.number, object.generation, raw); }
    catch { return null; }
  }
  if (/FlateDecode/.test(object.dict)) raw = await inflate(raw);
  else if (/\/Filter/.test(object.dict)) raw = null;
  const text = raw ? latin1(raw) : null;
  doc.streams.set(number, text);
  return text;
}

// Modern producers pack page, font and resource dictionaries into compressed
// object streams. Unpacking them is what lets the page tree be walked at all
// in those files; skipping it would leave the reader guessing from loose
// content streams.
async function expandObjectStreams(doc) {
  for (const object of [...doc.objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(object.dict)) continue;
    const body = await streamOf(doc, object.number);
    if (!body) continue;
    const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] || 0);
    const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] || 0);
    const header = body.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < count; i++) {
      const number = header[i * 2], offset = header[i * 2 + 1];
      if (!Number.isFinite(number) || !Number.isFinite(offset) || doc.objects.has(number)) continue;
      const end = i + 1 < count ? first + header[i * 2 + 3] : body.length;
      doc.objects.set(number, {number, generation: 0, dict: body.slice(first + offset, end), stream: null});
    }
  }
}

// ------------------------------------------------------------ dictionaries --
// Enough dictionary reading to follow a page to its content and its fonts.
// Values are either inline or an indirect reference; both are resolved here so
// nothing above has to care which a producer chose.
function innerDict(text, at) {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text.startsWith('<<', i)) { if (!depth++) at = i + 2; i++; continue; }
    if (text.startsWith('>>', i)) { if (!--depth) return text.slice(at, i); i++; continue; }
  }
  return '';
}
function entry(doc, dict, key) {
  const pattern = new RegExp(`${key}\\s*(?=<<|\\d+\\s+\\d+\\s+R|\\[|/)`);
  const match = pattern.exec(dict);
  if (!match) return '';
  const rest = dict.slice(match.index + match[0].length);
  const reference = /^(\d+)\s+\d+\s+R/.exec(rest);
  if (reference) return doc.objects.get(Number(reference[1]))?.dict || '';
  if (rest.startsWith('<<')) return innerDict(dict, match.index + match[0].length);
  return rest;
}
const references = text => Object.fromEntries([...text.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)].map(match => [match[1], Number(match[2])]));

// -------------------------------------------------------------- characters --
// A subset font's byte is not a letter; the font's ToUnicode table is what says
// which letter it stands for. Statements from banks lean on these heavily —
// without the table their text extracts as mojibake, which is how a readable
// statement comes to look like a scan.
function toUnicode(doc, fontNumber, text) {
  const map = new Map();
  if (!text) return map;
  const code = hex => parseInt(hex, 16);
  const characters = hex => String.fromCharCode(...(hex.match(/.{1,4}/g) || []).map(part => parseInt(part.padEnd(4, '0'), 16)));
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(code(pair[1]), characters(pair[2]));
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const [low, high, start] = [code(range[1]), code(range[2]), code(range[3])];
      for (let c = low; c <= high && c - low < 65536; c++) map.set(c, String.fromCharCode(start + (c - low)));
    }
    for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g)) {
      const low = code(range[1]);
      [...range[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((item, index) => map.set(low + index, characters(item[1])));
    }
  }
  return map;
}

async function fontOf(doc, number) {
  if (doc.streams.has(`font:${number}`)) return doc.streams.get(`font:${number}`);
  const dict = doc.objects.get(number)?.dict || '';
  const unicodeRef = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(dict);
  const font = {
    map: toUnicode(doc, number, unicodeRef ? await streamOf(doc, Number(unicodeRef[1])) : null),
    bytesPerCode: /\/Subtype\s*\/Type0/.test(dict) ? 2 : 1,
    widths: widthsOf(doc, dict),
    first: Number(/\/FirstChar\s+(\d+)/.exec(dict)?.[1] || 0),
    scale: Number(/\/FontMatrix\s*\[\s*([\d.eE+-]+)/.exec(dict)?.[1] || 0.001)
  };
  doc.streams.set(`font:${number}`, font);
  return font;
}
function widthsOf(doc, dict) {
  const reference = /\/Widths\s+(\d+)\s+\d+\s+R/.exec(dict);
  const array = reference ? doc.objects.get(Number(reference[1]))?.dict : /\/Widths\s*\[([^\]]*)\]/.exec(dict)?.[1];
  const numbers = (array || '').match(/-?[\d.]+/g);
  return numbers ? numbers.map(Number) : null;
}

// ----------------------------------------------------------------- content --
// Content is a little program: it moves a cursor and shows text. Reading it
// means running it far enough to know what each run says and where it sits.
// What a byte means when nothing says: a plain Latin-1 letter at a common
// width. Better than dropping the run, which would quietly lose a column.
const UNKNOWN_FONT = {map: new Map(), bytesPerCode: 1, widths: null, first: 0, scale: 0.001};
const concat = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]
];

function tokenize(content) {
  const tokens = [];
  let i = 0;
  while (i < content.length) {
    const character = content[i];
    if (character === '%') { i = content.indexOf('\n', i); if (i < 0) break; continue; }
    if (/\s/.test(character)) { i++; continue; }
    if (character === '(') {
      let depth = 1, out = '', at = i + 1;
      while (at < content.length) {
        const c = content[at];
        if (c === '\\') {
          const octal = /^[0-7]{1,3}/.exec(content.slice(at + 1, at + 4));
          if (octal) { out += String.fromCharCode(parseInt(octal[0], 8)); at += 1 + octal[0].length; continue; }
          out += {n: '\n', r: '\r', t: '\t', b: '\b', f: '\f'}[content[at + 1]] ?? (content[at + 1] === '\n' ? '' : content[at + 1]);
          at += 2;
          continue;
        }
        if (c === '(') depth++;
        if (c === ')' && !--depth) { at++; break; }
        out += c;
        at++;
      }
      tokens.push({string: out});
      i = at;
      continue;
    }
    if (character === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      const digits = content.slice(i + 1, end < 0 ? content.length : end).replace(/[^0-9a-fA-F]/g, '');
      tokens.push({string: (digits.match(/.{1,2}/g) || []).map(pair => String.fromCharCode(parseInt(pair.padEnd(2, '0'), 16))).join('')});
      i = (end < 0 ? content.length : end) + 1;
      continue;
    }
    if (content.startsWith('<<', i) || content.startsWith('>>', i)) { i += 2; continue; }
    if (character === '/') {
      const name = /^\/([^\s/<>[\]()]*)/.exec(content.slice(i))[1];
      tokens.push({name});
      i += name.length + 1;
      continue;
    }
    const number = /^[-+.\d][\d.eE+-]*/.exec(content.slice(i));
    if (number && !isNaN(Number(number[0]))) { tokens.push({number: Number(number[0])}); i += number[0].length; continue; }
    // Array brackets are punctuation around a TJ's operands, not operators:
    // treating them as operators would clear the very operands TJ is about to
    // show, which silently drops every kerned run on the page.
    if (character === '[' || character === ']') { i++; continue; }
    const operator = /^[A-Za-z'"*]+\*?/.exec(content.slice(i));
    if (!operator) { i++; continue; }
    // An inline image carries raw bytes that must not be read as operators.
    if (operator[0] === 'BI') {
      const end = content.indexOf('EI', content.indexOf('ID', i));
      i = end < 0 ? content.length : end + 2;
      continue;
    }
    tokens.push({operator: operator[0]});
    i += operator[0].length;
  }
  return tokens;
}

// A form without resources of its own uses the page's, so names are looked up
// in the form first and in what it was drawn inside second. Losing that
// inheritance loses whole columns of a statement — the dates beside its rows.
async function paint(doc, content, resources, matrix, runs, depth, inherited = {fonts: {}, xobjects: {}}) {
  if (depth > 8 || runs.length > 20000) return;
  const fonts = {...inherited.fonts, ...references(entry(doc, resources, '/Font'))};
  const xobjects = {...inherited.xobjects, ...references(entry(doc, resources, '/XObject'))};
  const tokens = tokenize(content);
  const stack = [];
  let ctm = matrix, operands = [], font = null, size = 12, leading = 0;
  let text = null, line = null;
  const show = async parts => {
    if (!text) return;
    font = font || UNKNOWN_FONT;
    const advance = [];
    let out = '';
    for (const part of parts) {
      if (typeof part === 'number') { if (part < -180) out += ' '; advance.push(-part / 1000 * size); continue; }
      for (let i = 0; i < part.length; i += font.bytesPerCode) {
        const code = font.bytesPerCode === 2 ? (part.charCodeAt(i) << 8) + (part.charCodeAt(i + 1) || 0) : part.charCodeAt(i);
        const mapped = font.map.get(code);
        out += mapped ?? (code >= 32 && code < 127 ? part[i] : code === 9 ? ' ' : '');
        const width = font.widths?.[code - font.first];
        advance.push((Number.isFinite(width) ? width * font.scale : 0.5) * size);
      }
    }
    const placed = concat(text, ctm);
    const width = advance.reduce((sum, value) => sum + value, 0) * Math.abs(ctm[0] || 1);
    if (out.trim()) runs.push({x: placed[4], y: placed[5], end: placed[4] + width, size: size * Math.abs(ctm[3] || 1), text: out});
    text = concat([1, 0, 0, 1, advance.reduce((sum, value) => sum + value, 0), 0], text);
  };
  for (const token of tokens) {
    if (!token.operator) { operands.push(token); continue; }
    const numbers = operands.filter(operand => operand.number !== undefined).map(operand => operand.number);
    switch (token.operator) {
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() || ctm; break;
      case 'cm': if (numbers.length >= 6) ctm = concat(numbers.slice(-6), ctm); break;
      case 'BT': text = line = [1, 0, 0, 1, 0, 0]; break;
      case 'ET': text = line = null; break;
      case 'Tf': {
        const name = operands.filter(operand => operand.name !== undefined).at(-1)?.name;
        if (name !== undefined && fonts[name] !== undefined) font = await fontOf(doc, fonts[name]);
        size = numbers.at(-1) ?? size;
        break;
      }
      case 'TL': leading = numbers.at(-1) ?? leading; break;
      case 'Td': case 'TD': {
        if (token.operator === 'TD') leading = -(numbers.at(-1) ?? 0);
        line = concat([1, 0, 0, 1, numbers.at(-2) ?? 0, numbers.at(-1) ?? 0], line || [1, 0, 0, 1, 0, 0]);
        text = line;
        break;
      }
      case 'Tm': if (numbers.length >= 6) text = line = numbers.slice(-6); break;
      case 'T*': line = concat([1, 0, 0, 1, 0, -leading], line || [1, 0, 0, 1, 0, 0]); text = line; break;
      case 'Tj': await show(operands.filter(operand => operand.string !== undefined).map(operand => operand.string)); break;
      case "'": case '"':
        line = concat([1, 0, 0, 1, 0, -leading], line || [1, 0, 0, 1, 0, 0]);
        text = line;
        await show(operands.filter(operand => operand.string !== undefined).map(operand => operand.string));
        break;
      case 'TJ': await show(operands.map(operand => operand.string ?? operand.number).filter(part => part !== undefined)); break;
      case 'Do': {
        const name = operands.filter(operand => operand.name !== undefined).at(-1)?.name;
        const number = name === undefined ? undefined : xobjects[name];
        const child = number === undefined ? null : doc.objects.get(number);
        if (child && /\/Subtype\s*\/Form/.test(child.dict)) {
          const body = await streamOf(doc, number);
          const own = /\/Matrix\s*\[([^\]]*)\]/.exec(child.dict)?.[1].trim().split(/\s+/).map(Number);
          if (body) await paint(doc, body, entry(doc, child.dict, '/Resources'), own?.length === 6 ? concat(own, ctm) : ctm, runs, depth + 1, {fonts, xobjects});
        }
        break;
      }
      default: break;
    }
    operands = [];
  }
}

// Runs come back in painting order, which is not reading order. A statement's
// meaning is in its rows — a date beside a merchant beside an amount — so runs
// are gathered into lines by where they sit, and a gap between them becomes
// the separation a reader would see.
function layout(runs) {
  const ordered = runs.map((run, index) => ({...run, index}))
    .sort((a, b) => Math.abs(b.y - a.y) > Math.max(2, Math.min(a.size, b.size) * 0.3) ? b.y - a.y : a.x - b.x || a.index - b.index);
  const lines = [];
  let current = null;
  for (const run of ordered) {
    if (!current || Math.abs(run.y - current.y) > Math.max(2, Math.min(run.size, current.size) * 0.3)) {
      current = {y: run.y, size: run.size, end: run.end, text: run.text};
      lines.push(current);
      continue;
    }
    const gap = run.x - current.end;
    // Statements bold a heading by drawing it twice a hair apart. Keeping both
    // copies doubles every title and glues the words together.
    if (gap < 0 && current.text.endsWith(run.text)) continue;
    current.text += (gap > run.size * 0.8 ? '  ' : gap > run.size * 0.08 || gap < -run.size * 0.5 ? ' ' : '') + run.text;
    current.end = run.end;
    current.size = run.size;
  }
  return lines.map(line => line.text.replace(/[ \t]+/g, match => match.length > 1 ? '  ' : ' ').trimEnd());
}

// Printable ratio is the honest signal that a font defeated us: real statement
// text is overwhelmingly ASCII, and an undecodable subset font is not.
export function readableRatio(text) {
  const stripped = text.replace(/\s/g, '');
  return stripped ? (stripped.match(/[\x20-\x7E]/g) || []).length / stripped.length : 0;
}
const READABLE = 0.8;

function confidenceOf(text, {locked, dropped, pictures}) {
  const stripped = text.replace(/\s/g, '');
  if (locked) return {confidence: 'none', note: locked};
  if (!stripped) return {
    confidence: 'none',
    note: dropped
      ? 'Text was found but none of it could be decoded, which usually means embedded subset fonts. Paste the figures instead, or drop a screenshot of the page.'
      : pictures
        ? 'This PDF is a picture of a page with no text in it — probably a scan. Drop it as an image instead, or paste the figures.'
        : 'This PDF has no text in it. Drop it as an image instead, or paste the figures.'
  };
  if (!/\d/.test(stripped)) return {confidence: 'low', note: 'Text was extracted but contains no numbers, so this may not be the page the figures are on.'};
  if (dropped) return {confidence: 'partial', note: `${dropped} page${dropped === 1 ? '' : 's'} of this PDF had no readable text on ${dropped === 1 ? 'it' : 'them'} — a picture, a scan or a barcode. Check that the figures you need are below before reading.`};
  return {confidence: 'good', note: ''};
}

// An image drawn on the page is what separates a scan from a blank sheet, and
// the difference decides what the owner is told to do next.
function hasPicture(doc, resources) {
  return Object.values(references(entry(doc, resources, '/XObject')))
    .some(number => /\/Subtype\s*\/Image/.test(doc.objects.get(number)?.dict || ''));
}

// Pages in the order they are bound, following the tree rather than the order
// objects happen to appear in the file, and carrying down the resources a page
// inherits from its parent.
function pageList(doc, number, inherited = '', seen = new Set()) {
  if (number === undefined) {
    const catalog = [...doc.objects.values()].find(object => /\/Type\s*\/Catalog/.test(object.dict));
    const root = catalog && /\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalog.dict);
    if (!root) return [...doc.objects.values()].filter(object => /\/Type\s*\/Page\b/.test(object.dict)).map(object => ({dict: object.dict, inherited: ''}));
    return pageList(doc, Number(root[1]), '', seen);
  }
  if (seen.has(number)) return [];
  seen.add(number);
  const dict = doc.objects.get(number)?.dict || '';
  const resources = entry(doc, dict, '/Resources') || inherited;
  if (/\/Type\s*\/Page\b/.test(dict)) return [{dict, inherited: resources}];
  const kids = /\/Kids\s*\[([^\]]*)\]/.exec(dict);
  if (!kids) return [];
  return [...kids[1].matchAll(/(\d+)\s+\d+\s+R/g)].flatMap(match => pageList(doc, Number(match[1]), resources, seen));
}

// Returns {text, pages, confidence, note}. Never throws on a malformed object:
// one unreadable page should not lose the rest of a statement.
export async function pdfText(bytes, {password = ''} = {}) {
  const source = latin1(bytes);
  if (!source.startsWith('%PDF-')) throw Error('That is not a PDF file.');
  const doc = await openDocument(bytes, source, {password});
  const parts = [];
  let pages = 0, dropped = 0, pictures = 0;
  for (const page of doc.locked ? [] : pageList(doc)) {
    const resources = entry(doc, page.dict, '/Resources') || page.inherited;
    const contents = /\/Contents\s*(?:(\d+)\s+\d+\s+R|\[([^\]]*)\])/.exec(page.dict);
    const streams = !contents ? [] : contents[1] ? [Number(contents[1])] : [...contents[2].matchAll(/(\d+)\s+\d+\s+R/g)].map(match => Number(match[1]));
    const runs = [];
    let content = '';
    for (const number of streams) {
      const body = await streamOf(doc, number);
      if (!body) continue;
      content += body;
      await paint(doc, body, resources, [1, 0, 0, 1, 0, 0], runs, 0);
    }
    const text = layout(runs).join('\n').trim();
    if (!text) {
      // A page that drew no text at all and holds a picture is a scan. One that
      // drew nothing whatsoever is simply blank, and a blank page in a
      // statement is not a failure worth warning the owner about.
      const picture = hasPicture(doc, resources) || /\bBI\b[\s\S]{0,400}?\bID\b/.test(content);
      if (picture) { pictures++; dropped++; }
      else if (runs.length) dropped++;
      continue;
    }
    if (readableRatio(text) < READABLE) { dropped++; continue; }
    parts.push(text);
    pages++;
    if (parts.join('').length > MAX_TEXT) break;
  }
  const text = parts.join('\n\n')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
  // `needsPassword` is the one failure the owner can do something about, so it
  // is reported as its own answer rather than folded into a note about a scan.
  return {text, pages, encrypted: !!doc.decrypt || !!doc.locked, needsPassword: doc.needsPassword,
    ...confidenceOf(text, {locked: doc.locked, dropped: parts.length ? dropped : 0, pictures})};
}
