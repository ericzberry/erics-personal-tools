import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEmail,draftReply} from '../src/email-cloud.js';
const email={subject:'Meeting',from:'sender@example.com',text:'Please confirm by Friday.'};
const connection={id:'a5bb73f0-738b-4cf6-9862-41c6468cf40a',provider:'openai',hasApiKey:true};
const profile={prompt:'Open with "Hey". Keep it to three sentences.',voices:[{name:'Warm professional',audience:'investors',markers:['no exclamation marks']}],sampled:1000,updatedAt:'2026-09-18T00:00:00.000Z'};
function sender({connected=true,connections=[connection],result={text:'• Confirm by Friday.'},calls=[],voice={profile:null}}={}){return async message=>{
 calls.push(message);
 if(message.action==='voice'){if(voice instanceof Error)return {ok:false,error:voice.message};return {ok:true,...voice};}
 return {ok:true,...(message.action==='status'?{connected}:message.action==='list'?{connections}:result)};
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

test('a reply carries Eric\u2019s instruction and his learned voice, and keeps the email as untrusted data',async()=>{
 const calls=[];
 assert.equal(await draftReply({email,instruction:'Say yes and ask for the form',send:sender({calls,voice:{profile},result:{text:'Hey Marty — yes.'}})}),'Hey Marty — yes.');
 assert.deepEqual(calls.map(c=>c.action),['status','list','voice','generate']);
 const request=calls[3];
 assert.equal(request.task,'email.reply');assert.equal(request.id,connection.id);assert.equal(request.model,undefined);
 assert.match(request.messages[0].content,/untrusted data/);
 assert.match(request.messages[0].content,/Open with "Hey"/);
 assert.match(request.messages[0].content,/Warm professional — for investors/);
 const sent=JSON.parse(request.messages[1].content);
 assert.equal(sent.goal,'Say yes and ask for the form');
 assert.deepEqual(sent.email,{subject:email.subject,from:email.from,body:email.text});
});
test('no instruction and no learned voice still draft, and an unreachable voice is not a failed reply',async()=>{
 for(const voice of [{profile:null},new Error('Storage unavailable.')]) {
  const calls=[];
  await draftReply({email,send:sender({calls,voice,result:{text:'Drafted.'}})});
  const request=calls[3];
  assert.equal(request.messages[0].content.includes('How Eric writes'),false);
  assert.match(JSON.parse(request.messages[1].content).goal,/Reply to this message/);
 }
});
test('a long thread loses its tail rather than the voice it has to be answered in',async()=>{
 const calls=[];
 await draftReply({email:{...email,text:'x'.repeat(20000)},instruction:'Decline politely',send:sender({calls,voice:{profile:{...profile,prompt:'y'.repeat(6000)}},result:{text:'No.'}})});
 const request=calls[3];
 const length=request.messages.reduce((total,message)=>total+message.content.length,0);
 assert.ok(length<=32000,`prompt was ${length} characters`);
 assert.match(request.messages[0].content,/yyyy/);
 assert.ok(JSON.parse(request.messages[1].content).email.body.length>2000);
});
test('a reply refuses an oversized email, an oversized instruction, and a cancelled request',async()=>{
 await assert.rejects(draftReply({email:{text:'x'.repeat(20001)},send:()=>assert.fail()}),/20,000/);
 await assert.rejects(draftReply({email,instruction:'x'.repeat(1201),send:()=>assert.fail()}),/1,200 characters/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(draftReply({email,signal:controller.signal,send:()=>assert.fail()}),{name:'AbortError'});
 await assert.rejects(draftReply({email,send:sender({connected:false})}),/Connect this browser in Settings/);
 await assert.rejects(draftReply({email,send:sender({connections:[],voice:{profile:null}})}),/Save an OpenAI/);
 for(const result of [{text:''},{text:'partial',warning:'Output limit reached'}])await assert.rejects(draftReply({email,send:sender({result})}));
});
