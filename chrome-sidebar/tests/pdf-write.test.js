import test from 'node:test';
import assert from 'node:assert/strict';
import {writePdf,wrapLine,encodeWinAnsi} from '../src/pdf-write.js';

test('a text PDF is written whole on the device: header, pages, fonts, cross-reference table',()=>{
  const lines=[{style:'title',text:'Health summary'},{style:'heading',text:'Medications'},{style:'body',text:'Cetirizine — 10 mg each morning, “as needed” in spring'},
    ...Array.from({length:120},(_,i)=>({style:'body',text:`Line ${i} `.repeat(12)}))];
  const {bytes,pages,unwritable}=writePdf(lines,{title:'Health summary'});
  const text=Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(pages>1,'long text runs onto a second page');
  assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,pages);
  assert.match(text,/\/BaseFont \/Helvetica-Bold/);
  assert.match(text,/\/Encoding \/WinAnsiEncoding/);
  assert.equal(unwritable,0,'curly quotes and dashes are in the character set');
  // Every object offset in the cross-reference table points at that object.
  // `startxref` also contains the word, so the table is found by its own line.
  const table=text.lastIndexOf('\nxref\n')+1;
  const xref=text.slice(table);
  const offsets=[...xref.matchAll(/^(\d{10}) 00000 n/gm)].map(match=>Number(match[1]));
  offsets.forEach((offset,index)=>assert.ok(text.slice(offset).startsWith(`${index+1} 0 obj`),`object ${index+1} at ${offset}`));
  assert.ok(offsets.length>4,'the table lists the objects');
  assert.equal(Number(/startxref\n(\d+)/.exec(text)[1]),table);
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});

test('what the character set cannot carry is counted, never dropped silently',()=>{
  const {bytes,unwritable}=encodeWinAnsi('Crème brûlée — 日本 ✓');
  assert.equal(unwritable,3);
  assert.equal(Buffer.from(bytes).toString('latin1'),'Crème brûlée \x97 ?? ?');
  assert.equal(writePdf([{style:'body',text:'日本'}]).unwritable,2);
  // Wrapping breaks between words, and a word wider than the page by character.
  const wrapped=wrapLine('one two three four five six seven eight nine ten',11,120);
  assert.ok(wrapped.length>1&&wrapped.every(line=>line.length<=24));
  assert.ok(wrapLine('x'.repeat(200),11,120).length>1);
  assert.deepEqual(wrapLine('first\n\nthird',11,500),['first','','third']);
});
