import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const context = vm.createContext({URL});
vm.runInContext(readFileSync(new URL('../src/gmail-reader.js',import.meta.url),'utf8'),context);
const read = html => context.GmailReader.read(parseHTML(html).document,'https://mail.google.com/mail/u/0/#inbox/test',e=>!e.hasAttribute('hidden'));
const message = (text, extra='')=>`<div class="gs"><span class="gD" email="sender@example.test">Sender</span><div class="a3s" ${extra}>${text}</div></div>`;
test('reads latest expanded email and skips hidden message bodies',()=>{
  const data=read(`<h2 class="hP">Subject</h2>${message('Older')}${message('Current')}${message('Hidden','hidden')}`);
  assert.equal(data.text,'Current');assert.equal(data.from,'sender@example.test');assert.equal(data.subject,'Subject');
});
test('inbox and collapsed threads clear current email; long email is explicitly rejected',()=>{
  assert.equal(read('<h2>Inbox</h2>'),null);
  assert.equal(read(`<h2 class="hP">Subject</h2>${message('Hidden','hidden')}`),null);
  assert.match(read(`<h2 class="hP">Subject</h2>${message('x'.repeat(20001))}`).error,/too long/);
});
