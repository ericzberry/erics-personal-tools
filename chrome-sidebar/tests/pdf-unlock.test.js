import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfText} from '../src/pdf-text.js';
import {unlockPdf} from '../src/pdf-unlock.js';
import {rc4Locked, aes256Locked, plainPdf} from './fixtures/locked-pdf.js';

// The copy that is filed has to be a document, not a pile of decrypted bytes:
// no lock left in it, and the same text read back out of it on its own.
async function assertUnlocked(result) {
  assert.equal(result.unlocked, true, result.note);
  assert.match(result.text, /241,207\.00/);
  const rebuilt = await pdfText(result.bytes);
  assert.equal(rebuilt.encrypted, false);
  assert.equal(rebuilt.needsPassword, false);
  assert.match(rebuilt.text, /Adjusted gross income 812,455\.00/);
  assert.equal(Buffer.from(result.bytes).includes('/Encrypt'), false);
  assert.match(Buffer.from(result.bytes).toString('latin1'), /\nstartxref\n\d+\n%%EOF/);
}

test('a document that needs a password says so, and refuses a wrong one', async () => {
  for (const bytes of [rc4Locked(), await aes256Locked()]) {
    const read = await pdfText(bytes);
    assert.deepEqual([read.encrypted, read.needsPassword, read.text], [true, true, '']);
    assert.match(read.note, /password/i);
    assert.doesNotMatch(read.note, /scan/i);

    await assert.rejects(unlockPdf(bytes), error => error.needsPassword === true);
    await assert.rejects(unlockPdf(bytes, {password: 'not-it'}),
      error => error.needsPassword === true && /did not open/.test(error.message));
  }
});

test('the password files an unlocked copy, and the owner password opens it too', async () => {
  for (const bytes of [rc4Locked(), await aes256Locked()]) {
    await assertUnlocked(await unlockPdf(bytes, {password: 'taxes-2025'}));
    await assertUnlocked(await unlockPdf(bytes, {password: 'owner-secret'}));
  }
});

// A bank's statement carries an owner password and an empty user one: it opens
// for anybody, and it is still encrypted. It is filed unlocked without anyone
// being asked for anything.
test('a document locked against editing rather than reading is unlocked unasked', async () => {
  const result = await unlockPdf(rc4Locked({userPassword: ''}));
  await assertUnlocked(result);
  assert.match(result.note, /Unlocked on this device/);
});

test('a document with no lock on it is filed exactly as it arrived', async () => {
  const bytes = plainPdf();
  const result = await unlockPdf(bytes);
  assert.deepEqual([result.encrypted, result.unlocked], [false, false]);
  assert.equal(result.bytes, bytes, 'an unencrypted file must not be rewritten at all');
  assert.match(result.text, /241,207\.00/);
});

test('a file that is not a PDF is refused rather than rewritten', async () => {
  await assert.rejects(unlockPdf(new TextEncoder().encode('PK not a pdf')), /not a PDF/);
});
