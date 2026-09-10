// Turns a dropped file into something the finance reading can use, entirely on
// the device. A statement is never uploaded: either its text is extracted here
// and only that text is sent, or — for a scan or a photo, which have no text to
// extract — the picture is downscaled here and sent as an image.
//
// Every path reports what it produced and how confident it is, because the
// owner reviews the extraction before it is read and reviews the drafts before
// anything is saved. Silence about a bad extraction is the one failure this
// module must not have.
import {pdfText} from './pdf-text.js';

export const TEXT_TYPES = ['.pdf', '.csv', '.tsv', '.txt', '.xlsx'];
export const IMAGE_TYPES = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
export const ACCEPTED = [...TEXT_TYPES, ...IMAGE_TYPES];
export const MAX_BYTES = 25000000;
// Long enough for a multi-page statement, short enough to stay inside the
// reading's own character budget once the instructions are added.
export const MAX_SEND = 24000;
// A statement is read for its figures, not its detail: 1400px keeps a table
// legible to a vision model while holding the encoded image to a few hundred KB.
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.72;

const extensionOf = name => (String(name).toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0];
export const isImage = name => IMAGE_TYPES.includes(extensionOf(name));

// Spreadsheet rows and CSV become one line per row. The reading wants figures
// beside their labels; column alignment is not worth preserving.
const rowsToText = rows => rows
  .map(row => (Array.isArray(row) ? row : [row])
    .map(cell => cell === null || cell === undefined ? '' : String(cell instanceof Date ? cell.toISOString().slice(0, 10) : cell).trim())
    .filter(Boolean).join('  |  '))
  .filter(line => line.trim())
  .join('\n');

async function spreadsheet(file) {
  const {default: readXlsx} = await import('../vendor/read-xlsx.js');
  const rows = await readXlsx(file);
  return rowsToText(rows);
}

// Downscales and re-encodes so a 5 MB phone photo becomes a few hundred KB.
// The original file is never sent.
async function downscale(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw Error('This image could not be opened. iPhone HEIC photos are not readable here — share or export it as JPEG first.'); }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await canvas.convertToBlob({type: 'image/jpeg', quality: JPEG_QUALITY});
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('This image could not be read.'));
    reader.readAsDataURL(blob);
  });
  return {dataUrl, width, height, bytes: blob.size};
}

// Returns either {kind:'text', text, confidence, note} or
// {kind:'image', image, confidence, note}. Throws only when the file itself is
// unusable; a poor extraction comes back as a low confidence, not an error,
// because the owner is the one who decides whether it is good enough to read.
export async function readStatement(file) {
  const extension = extensionOf(file.name);
  if (!ACCEPTED.includes(extension)) throw Error(`Use ${ACCEPTED.join(', ')}.`);
  if (file.size > MAX_BYTES) throw Error(`That file is ${(file.size / 1000000).toFixed(1)} MB. The limit is ${MAX_BYTES / 1000000} MB.`);
  if (!file.size) throw Error('That file is empty.');

  if (IMAGE_TYPES.includes(extension)) {
    const image = await downscale(file);
    return {kind: 'image', image, confidence: 'good', note: `Downscaled to ${image.width}×${image.height} (${Math.round(image.bytes / 1000)} KB) on this device before sending.`};
  }

  if (extension === '.pdf') {
    const result = await pdfText(new Uint8Array(await file.arrayBuffer()));
    return {kind: 'text', text: result.text, confidence: result.confidence, note: result.note, pages: result.pages};
  }

  if (extension === '.xlsx') {
    const text = await spreadsheet(file);
    return text.trim()
      ? {kind: 'text', text, confidence: 'good', note: ''}
      : {kind: 'text', text: '', confidence: 'none', note: 'That spreadsheet has no readable rows on its first sheet.'};
  }

  const text = (await file.text()).replace(/\r\n?/g, '\n').trim();
  return text
    ? {kind: 'text', text, confidence: 'good', note: ''}
    : {kind: 'text', text: '', confidence: 'none', note: 'That file is empty.'};
}

// The reading has a character budget. Trimming is the owner's business, so say
// exactly what was cut rather than quietly sending the first part.
export function trimForReading(text, limit = MAX_SEND) {
  if (text.length <= limit) return {text, trimmed: 0};
  return {text: text.slice(0, limit), trimmed: text.length - limit};
}
