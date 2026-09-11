import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEmail} from '../src/email-cloud.js';
const email={subject:'Meeting',from:'sender@example.com',text:'Please confirm by Friday.'};
const connection={id:'a5bb73f0-738b-4cf6-9862-41c6468cf40a',provider:'openai',hasApiKey:true};
function sender({connected=true,connections=[connection],result={text:'• Confirm by Friday.'},calls=[]}={}){return async message=>{
 calls.push(message);return {ok:true,...(message.action==='status'?{connected}:message.action==='list'?{connections}:result)};
};}
test('summary uses D1 connection ID and only sends the current email as untrusted input',async()=>{
 const calls=[];assert.equal(await summarizeEmail({email,send:sender({calls})}),'• Confirm by Friday.');
 assert.deepEqual(calls.map(c=>c.action),['status','list','generate']);const request=calls[2];
 assert.equal(request.id,connection.id);assert.equal(request.model,undefined);assert.equal(request.task,'email.summary');assert.equal(request.apiKey,undefined);
 assert.match(request.messages[0].content,/untrusted data/);assert.deepEqual(JSON.parse(request.messages[1].content),{subject:email.subject,from:email.from,body:email.text});
});
test('summary stays lightweight despite a different saved model and other providers or empty keys cannot be selected',async()=>{
 const calls=[];await summarizeEmail({email,send:sender({calls,connections:[{...connection,provider:'anthropic'}, {...connection,hasApiKey:false},{...connection,model:'saved-model'}]})});assert.equal(calls[2].model,undefined);assert.equal(calls[2].task,'email.summary');
 for(const connections of [[],[{...connection,provider:'anthropic'}],[{...connection,hasApiKey:false}]])await assert.rejects(summarizeEmail({email,send:sender({connections})}),/Save an OpenAI/);
 await assert.rejects(summarizeEmail({email,send:sender({connected:false})}),/Connect this browser in Settings/);
});
test('cancelled and oversized emails are not sent; provider failures do not return success',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(summarizeEmail({email,signal:controller.signal,send:()=>assert.fail()}),{name:'AbortError'});
 await assert.rejects(summarizeEmail({email:{text:'x'.repeat(20001)},send:()=>assert.fail()}),/20,000/);
 for(const result of [{ok:false,error:'Quota exceeded'},{text:''},{text:'partial',warning:'Output limit reached'}])await assert.rejects(summarizeEmail({email,send:sender({result})}));
 const pending=new AbortController();await assert.rejects(summarizeEmail({email,signal:pending.signal,send:async()=>{pending.abort();return {ok:true,connected:true};}}),{name:'AbortError'});
});
