import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {generateEmailText} from '../src/email-ai.js';
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
const email={subject:'Test',from:'sender@example.test',text:'Please let me know if you can attend Friday.'};
test('summary and reply invoke local model with email as data and destroy sessions',async()=>{
  for(const action of ['summary','reply']) {
    let destroyed=false,createOptions,prompt;
    const model={availability:async()=> 'available',create:async options=>{createOptions=options;return {prompt:async input=>{prompt=input;return 'Generated text';},destroy(){destroyed=true;}};}};
    assert.equal(await generateEmailText({email,action,model}),'Generated text');
    assert.match(createOptions.initialPrompts[0].content,/untrusted/);
    assert.ok(prompt[0].content.includes(email.text));assert.equal(destroyed,true);
    if(action==='reply')assert.match(prompt[0].content,/placeholders/);
  }
});
test('unavailable model and cancellation never fabricate output',async()=>{
  await assert.rejects(generateEmailText({email,action:'reply',model:null}),/isn’t available/);
  await assert.rejects(generateEmailText({email,action:'summary',model:{availability:async()=> 'unavailable'}}),/isn’t available/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(generateEmailText({email,action:'summary',signal:controller.signal,model:{availability:async()=> 'available'}}),{name:'AbortError'});
});
test('generation failures still destroy the model session',async()=>{
  let destroyed=false;
  await assert.rejects(generateEmailText({email,action:'reply',model:{availability:async()=> 'available',create:async()=>({prompt:async()=>{throw Error('Model failed');},destroy(){destroyed=true;}})}}),/Model failed/);
  assert.equal(destroyed,true);
});
