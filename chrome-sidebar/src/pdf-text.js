// Pulls the text layer out of a PDF on the device, so a statement can be read
// without uploading the file anywhere.
//
// This is deliberately a small extractor rather than a full PDF engine. It
// handles what a bank or broker actually sends: a digitally generated document
// whose text is stored as Flate-compressed content streams in standard
// encodings. It does not do OCR, so a scanned page has nothing to give it, and
// it does not resolve embedded subset font encodings, so an unusual producer
// can yield mojibake. Both cases are reported rather than passed off as text —
// `confidence` is what the caller shows the owner before anything is sent.
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

// A PDF literal string: parenthesis-nested, backslash-escaped, with octal
// escapes. Returns the decoded text and the index just past the closing paren.
function literal(source, start) {
  let out = '', depth = 1, i = start;
  while (i < source.length) {
    const character = source[i];
    if (character === '\\') {
      const next = source[i + 1];
      const octal = /^[0-7]{1,3}/.exec(source.slice(i + 1, i + 4));
      if (octal) { out += String.fromCharCode(parseInt(octal[0], 8)); i += 1 + octal[0].length; continue; }
      out += {n: '\n', r: '\r', t: '\t', b: '\b', f: '\f'}[next] ?? (next === '\n' ? '' : next);
      i += 2;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')' && !--depth) return [out, i + 1];
    out += character;
    i++;
  }
  return [out, i];
}
function hex(source, start) {
  const end = source.indexOf('>', start);
  const digits = source.slice(start, end < 0 ? source.length : end).replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i < digits.length; i += 2) out += String.fromCharCode(parseInt(digits.slice(i, i + 2).padEnd(2, '0'), 16));
  return [out, (end < 0 ? source.length : end) + 1];
}

// Walks one content stream, collecting only what the text-showing operators
// actually paint. Positioning operators become line breaks so the extracted
// text keeps the row structure a statement relies on, and a wide negative
// kern inside a TJ array becomes a space, which is how columns stay apart.
function paint(content) {
  let out = '', pending = [], i = 0;
  while (i < content.length) {
    const character = content[i];
    if (character === '(') { const [text, next] = literal(content, i + 1); pending.push(text); i = next; continue; }
    if (character === '<' && content[i + 1] !== '<') { const [text, next] = hex(content, i + 1); pending.push(text); i = next; continue; }
    if (character === '-' || character === '.' || (character >= '0' && character <= '9')) {
      const number = /^-?[\d.]+/.exec(content.slice(i))?.[0] ?? character;
      if (Number(number) < -180) pending.push(' ');
      i += number.length;
      continue;
    }
    const operator = /^(?:T\*|Tj|TJ|TD|Td|ET|'|")/.exec(content.slice(i));
    if (operator) {
      if (['Tj', 'TJ', "'", '"'].includes(operator[0])) { out += pending.join(''); pending = []; }
      if (["'", '"'].includes(operator[0]) || ['T*', 'TD', 'Td', 'ET'].includes(operator[0])) out += '\n';
      if (!['Tj', 'TJ', "'", '"'].includes(operator[0])) pending = [];
      i += operator[0].length;
      continue;
    }
    i++;
  }
  return out;
}

// Printable ratio is the honest signal that a font encoding defeated us: real
// statement text is overwhelmingly ASCII, and a subset-encoded stream is not.
// Judged per stream, because one undecodable font object should not condemn a
// statement that otherwise read cleanly — nor be pasted in among its figures.
export function readableRatio(text) {
  const stripped = text.replace(/\s/g, '');
  return stripped ? (stripped.match(/[\x20-\x7E]/g) || []).length / stripped.length : 0;
}
const READABLE = 0.8;

function confidenceOf(text, dropped) {
  const stripped = text.replace(/\s/g, '');
  if (!stripped) return {
    confidence: 'none',
    note: dropped
      ? 'Text was found but none of it could be decoded, which usually means embedded subset fonts. Paste the figures instead, or drop a screenshot of the page.'
      : 'This PDF has no text layer — it is probably a scan. Drop it as an image instead, or paste the figures.'
  };
  if (!/\d/.test(stripped)) return {confidence: 'low', note: 'Text was extracted but contains no numbers, so this may not be the page the figures are on.'};
  if (dropped) return {confidence: 'partial', note: `${dropped} section${dropped === 1 ? '' : 's'} of this PDF could not be decoded and ${dropped === 1 ? 'was' : 'were'} left out. Check that the figures you need are below before reading.`};
  return {confidence: 'good', note: ''};
}

// Returns {text, pages, confidence, note}. Never throws on a malformed stream:
// one unreadable object should not lose the rest of a statement.
export async function pdfText(bytes) {
  const source = latin1(bytes);
  if (!source.startsWith('%PDF-')) throw Error('That is not a PDF file.');
  const parts = [];
  let pages = 0, dropped = 0;
  // Dictionaries nest and objects run together, so rather than trying to
  // balance `<<`/`>>` this reads the header region immediately before each
  // stream — which is where the filter and the length actually sit.
  const pattern = /stream\r?\n/g;
  let match;
  while ((match = pattern.exec(source))) {
    const header = source.slice(Math.max(0, match.index - 1200), match.index);
    const begin = match.index + match[0].length;
    // Images, fonts and metadata are streams too; only content is wanted.
    if (!header.includes('FlateDecode') || /\/Subtype\s*\/(Image|Type1C|CIDFontType0C|TrueType)|\/Type\s*\/(XObject|Font|Metadata)|\/FontFile|\/Length1\s/.test(header)) continue;
    // /Length is authoritative when it is a direct integer. Otherwise fall
    // back to the endstream keyword and drop the EOL that precedes it, which
    // is not part of the compressed data and makes a strict inflater fail.
    const declared = Number([...header.matchAll(/\/Length\s+(\d+)(?!\s+\d+\s+R)/g)].at(-1)?.[1]);
    let end = Number.isFinite(declared) && declared > 0 ? begin + declared : source.indexOf('endstream', begin);
    if (end < 0 || end <= begin) continue;
    while (end > begin && '\r\n'.includes(source[end - 1])) end--;
    const raw = await inflate(bytes.subarray(begin, end));
    if (!raw) continue;
    const content = latin1(raw);
    // A page's content stream opens a text object and shows text. Colour
    // profiles and other Flate blobs do not, and random binary that happens to
    // contain a parenthesis must not be mistaken for undecodable text — that
    // is the difference between skipping a stream and warning about one.
    if (!/BT[\s\r\n]/.test(content) || !/\b(?:Tj|TJ)[\s\r\n]/.test(content)) continue;
    const painted = paint(content);
    if (!painted.trim()) continue;
    if (readableRatio(painted) < READABLE) { dropped++; continue; }
    parts.push(painted);
    pages++;
    if (parts.join('').length > MAX_TEXT) break;
  }
  const text = parts.join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
  return {text, pages, ...confidenceOf(text, dropped)};
}
