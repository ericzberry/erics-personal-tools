import test from 'node:test';
import assert from 'node:assert/strict';
import {writtenPortion,htmlToText,messageText,voiceSample,voiceChunk,normalizeVoiceProfile,voiceGuidance,replyInstruction,MAX_VOICE_SAMPLE,MAX_VOICES} from '../src/voice-data.js';

const encode=text=>Buffer.from(text,'utf8').toString('base64url');
const part=(mimeType,text)=>({mimeType,body:{data:encode(text)}});
const sent=(parts,headers=[])=>({internalDate:String(Date.UTC(2026,3,2)),payload:{mimeType:'multipart/alternative',headers,parts}});

test('only the part Eric typed survives a reply, a forward, a signature and a quote',()=>{
  const gmail=`Happy to help — send it over and I'll turn it around Friday.

Eric

On Thu, Sep 11, 2025 at 9:02 AM Marty Krátký-Katz <
martin.kratky.katz@gmail.com> wrote:

> Hey man, hope you've been well!
> A big update from my end.`;
  assert.equal(writtenPortion(gmail),"Happy to help — send it over and I'll turn it around Friday.\n\nEric");
  assert.equal(writtenPortion('Sounds good.\n\n-----Original Message-----\nFrom: Someone\nSent: Monday'),'Sounds good.');
  assert.equal(writtenPortion('Yes, Tuesday works.\n\n---------- Forwarded message ---------\nFrom: Someone'),'Yes, Tuesday works.');
  assert.equal(writtenPortion('Thanks!\n\n--\nEric Berry\n555-1234'),'Thanks!');
  assert.equal(writtenPortion('On it.\n\nFrom: Someone\nSent: Monday\nTo: Eric'),'On it.');
  assert.equal(writtenPortion('Will do.\n\nSent from my iPhone'),'Will do.');
  // A message that is nothing but a forward teaches nothing and is not a sample.
  assert.equal(writtenPortion('---------- Forwarded message ---------\nFrom: Someone'),'');
});

test('an HTML-only message is cut at the quote before its tags are stripped',()=>{
  const html='<div>Hi <b>there</b>&nbsp;&amp; welcome<br>Line two</div><blockquote class="gmail_quote"><p>Everything they wrote</p></blockquote>';
  assert.equal(htmlToText(html).trim(),'Hi there & welcome\nLine two');
  assert.equal(messageText({mimeType:'text/html',body:{data:encode(html)}}).includes('Everything they wrote'),false);
  // The plain alternative is preferred over the rendering of the same message.
  assert.equal(messageText(sent([part('text/plain','Plain words'),part('text/html','<p>Rendered words</p>')]).payload),'Plain words');
});

test('a sample carries who it went to and is trimmed, and a one-word reply is skipped',()=>{
  const message=sent([part('text/plain','x'.repeat(MAX_VOICE_SAMPLE+500))],[{name:'To',value:'marty@example.test'},{name:'Subject',value:'Reference'}]);
  const sample=voiceSample(message);
  assert.equal(sample.text.length,MAX_VOICE_SAMPLE);
  assert.deepEqual([sample.to,sample.subject,sample.date],['marty@example.test','Reference','2026-04-02']);
  assert.equal(voiceSample(sent([part('text/plain','Sounds good')])),null);
  assert.equal(voiceSample({payload:{}}),null);
});

test('a batch is filled by size, keeps at least one sample, and leaves the rest for the next one',()=>{
  const samples=Array.from({length:10},(_,index)=>({to:'a@b.test',subject:'s',text:'x'.repeat(500),date:`2026-04-0${index%9+1}`}));
  const {taken,rest}=voiceChunk(samples,1200);
  assert.equal(taken.length,2);assert.equal(rest.length,8);
  assert.equal(voiceChunk([{text:'x'.repeat(5000)}],100).taken.length,1);
  assert.deepEqual(voiceChunk([],1200),{taken:[],rest:[]});
});

test('a profile keeps only what it can state, and guidance names the voices it found',()=>{
  const profile=normalizeVoiceProfile({
    prompt:'Write short. Open with "Hey".',
    voices:[{name:'Warm professional',audience:'investors',markers:['opens with "Hey"','no exclamation marks','x'.repeat(400)]},{name:'',audience:'nobody'}],
    sampled:1000,model:'gpt-5.6-terra'
  });
  assert.equal(profile.voices.length,1);
  assert.equal(profile.voices[0].markers[2].length,140);
  assert.ok(profile.updatedAt);
  assert.equal(normalizeVoiceProfile({prompt:'p',voices:Array.from({length:9},(_,i)=>({name:`v${i}`}))}).voices.length,MAX_VOICES);
  assert.throws(()=>normalizeVoiceProfile({prompt:'   '}),/needs the instructions/);
  const guidance=voiceGuidance(profile);
  assert.match(guidance,/1,000 messages/);
  assert.match(guidance,/Warm professional — for investors/);
  // A voice that was never learned adds nothing to a reply prompt.
  assert.equal(voiceGuidance(null),'');
  assert.equal(voiceGuidance({prompt:''}),'');
});

test('an instruction is collapsed to one line and a runaway one is refused',()=>{
  assert.equal(replyInstruction('  say yes,\n  and ask for the form  '),'say yes, and ask for the form');
  assert.equal(replyInstruction(undefined),'');
  assert.throws(()=>replyInstruction('x'.repeat(1201)),/under 1,200 characters/);
});
