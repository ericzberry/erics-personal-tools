import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {gmailConnection} from '../src/gmail-connection.js';
test('already-open Gmail tabs reconnect by injecting the reader once, then read normally',async()=>{
 let installed=false,injections=0;const email={text:'Current email'};
 const read=gmailConnection({tabs:{get:async()=>({url:'https://mail.google.com/mail/u/0/#inbox/example'}),sendMessage:async()=>{if(!installed)throw Error('No receiver');return {email};}},scripting:{executeScript:async options=>{assert.deepEqual(options,{target:{tabId:7},files:['src/gmail-reader.js','src/gmail-content.js']});injections++;installed=true;}}});
 assert.deepEqual(await read(7),{email});assert.deepEqual(await read(7),{email});assert.equal(injections,1);
});
test('recovery never injects into a tab that navigated away from Gmail',async()=>{
 const read=gmailConnection({tabs:{get:async()=>({url:'https://example.com'}),sendMessage:async()=>{throw Error('No receiver');}},scripting:{executeScript:()=>assert.fail('Wrong site')}});
 await assert.rejects(read(7),/Open a message/);
});
test('permission failures are surfaced and repeated polling does not repeatedly inject',async()=>{
 let injections=0;const read=gmailConnection({tabs:{get:async()=>({url:'https://mail.google.com/'}),sendMessage:async()=>{throw Error('No receiver');}},scripting:{executeScript:async()=>{injections++;throw Error('Permission denied');}}});
 await assert.rejects(read(7),/Permission denied/);await assert.rejects(read(7),/site access/);assert.equal(injections,1);
});
test('re-injected Gmail listener remains single and accepts only this extension',()=>{
 const listeners=new Set();const context=vm.createContext({chrome:{runtime:{id:'extension',onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}},GmailReader:{read:()=>({text:'Message'})},document:{},location:{href:'https://mail.google.com/'}});
 const script=readFileSync(new URL('../src/gmail-content.js',import.meta.url),'utf8');vm.runInContext(script,context);vm.runInContext(script,context);assert.equal(listeners.size,1);
 const [listener]=listeners;listener({type:'READ_CURRENT_EMAIL'},{id:'other'},()=>assert.fail('Foreign caller'));
 let response;listener({type:'READ_CURRENT_EMAIL'},{id:'extension'},value=>{response=value;});assert.equal(response.email.text,'Message');
});
