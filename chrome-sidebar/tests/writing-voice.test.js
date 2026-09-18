import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {mountWritingVoice} from '../src/writing-voice.js';

const connection={id:'a5bb73f0-738b-4cf6-9862-41c6468cf40a',provider:'openai',hasApiKey:true};
const learned={prompt:'Open with "Hey".',voices:[{name:'Warm professional',audience:'investors',markers:['no exclamation marks']}],sampled:1000,updatedAt:'2026-09-18T00:00:00.000Z'};

// The panel as the side panel builds it, with the Worker replaced by a script
// of replies and a record of what it was asked.
function panel({google={connected:true,sentMail:true},profile=null,pages=3,fails=null,gate=null,grant=false,revokes=false}={}){
  const {document}=parseHTML('<html><body><div id="app"></div></body></html>');
  globalThis.document=document;
  mountApp(document.getElementById('app'));
  const $=id=>document.getElementById(id);
  const asked=[],opened=[];
  let consented=false;
  const state={profile,scan:null};
  let page=0;
  const request=async(action,data={})=>{
    asked.push({action,...data});
    if(fails&&action===fails.action){if(revokes)google={connected:true,sentMail:false};throw Error(fails.message);}
    if(action==='status')return {connected:true};
    if(action==='list')return {connections:[connection]};
    if(action==='google-connect'){consented=true;return {url:'https://accounts.google.com/o/oauth2/v2/auth?x=1'};}
    if(action==='voice'){if(grant&&consented)google={connected:true,sentMail:true};return {profile:state.profile,scan:state.scan,google};}
    if(action==='voice-scan'){
      if(gate)await gate(page);
      if(data.restart){page=0;state.scan=null;}
      page++;
      const done=page>=pages;
      state.scan=done?null:{sampled:page*20,scanned:page*25,accounts:page,startedAt:'2026-09-18T00:00:00.000Z'};
      if(done)state.profile=learned;
      return {profile:state.profile,scan:state.scan,google,done};
    }
    if(action==='voice-save'){state.profile={...state.profile,prompt:data.prompt};return {profile:state.profile,scan:null,google};}
    if(action==='voice-forget'){state.profile=null;return {profile:null,scan:null,google};}
    throw Error(`unexpected ${action}`);
  };
  const voice=mountWritingVoice({
    nodes:{status:$('voice-status'),actions:$('voice-actions'),list:$('voice-list'),editor:$('voice-editor'),prompt:$('voice-prompt')},
    request,openExternal:url=>{opened.push(url);return true;},pollMs:1,pollLimit:3
  });
  const labels=()=>[...$('voice-actions').querySelectorAll('button')].map(button=>button.textContent);
  const variants=()=>[...$('voice-actions').querySelectorAll('button')].map(button=>button.className.split(' ')[0]);
  const press=label=>$('voice-actions').querySelectorAll('button')[labels().indexOf(label)].click();
  return {voice,$,asked,opened,labels,variants,press,state};
}
const settle=async()=>{for(let turn=0;turn<40;turn++)await Promise.resolve();};

test('a Google account that cannot read sent mail is offered the one action that applies',async()=>{
  // No connection at all and a connection Google will not let read mail are
  // different repairs, and the button says which one this is.
  for(const [google,label] of [[{connected:false,sentMail:false},'Connect Google'],[{connected:true,sentMail:false},'Approve reading mail']]){
    const {voice,labels,variants,asked,opened,$}=panel({google});
    await voice.load();
    assert.deepEqual(labels(),[label]);
    assert.deepEqual(variants(),['button-secondary']);
    assert.equal($('voice-editor').hidden,true);
    await voice.load();
    assert.equal(asked.filter(call=>call.action==='voice').length,1,'the section is read once, not on every render');
    opened.length=0;
  }
});

test('connecting opens consent in a tab of its own, and the panel waits for the answer',async()=>{
  const {voice,press,opened,labels,$}=panel({google:{connected:false,sentMail:false},grant:true});
  await voice.load();
  press('Connect Google');
  await settle();
  assert.deepEqual(opened,['https://accounts.google.com/o/oauth2/v2/auth?x=1']);
  assert.match($('voice-status').textContent,/Approve reading your sent mail/);
  // Consent is answered in that other tab, so the panel polls rather than
  // asking for a refresh, and stops as soon as the scope is granted.
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(labels(),['Study my sent mail']);
});

test('the study runs page by page, shows how far it has got, and ends holding the profile',async()=>{
  const {voice,$,asked,labels}=panel();
  await voice.load();
  assert.deepEqual(labels(),['Study my sent mail']);
  await voice.study(true);
  const scans=asked.filter(call=>call.action==='voice-scan');
  assert.equal(scans.length,3);
  assert.deepEqual(scans.map(scan=>scan.restart),[true,false,false]);
  assert.equal(scans[0].connectionId,connection.id);
  assert.match($('voice-status').textContent,/1,000 sent messages/);
  assert.equal($('voice-prompt').value,learned.prompt);
  assert.equal($('voice-editor').hidden,false);
  assert.match($('voice-list').textContent,/Warm professional/);
  assert.match($('voice-list').textContent,/no exclamation marks/);
  assert.deepEqual(labels(),['Study again','Forget']);
});

test('a stopped study keeps its place, and resuming does not start over',async()=>{
  // The second page is held open so the study can be stopped while it is
  // genuinely mid-flight, which is the only moment Stop exists for.
  let release=()=>{};
  const held=new Promise(resolve=>{release=resolve;});
  let waited=false;
  const control=panel({pages:5,gate:async page=>{if(page===1&&!waited){waited=true;await held;}}});
  await control.voice.load();
  const running=control.voice.study(true);
  await settle();
  assert.match(control.$('voice-status').textContent,/of 1,000 read/);
  assert.deepEqual(control.labels(),['Stop']);
  control.press('Stop');
  release();
  await running;
  assert.match(control.$('voice-status').textContent,/Stopped at/);
  assert.deepEqual(control.labels(),['Resume']);
  control.press('Resume');
  await settle();
  const restarts=control.asked.filter(call=>call.action==='voice-scan').map(call=>call.restart);
  assert.equal(restarts[0],true);
  assert.equal(restarts.slice(1).includes(true),false);
});

test('an edited voice offers Save instead of Forget, and forgetting empties the panel',async()=>{
  const {voice,$,press,labels,variants,asked,state}=panel({profile:learned});
  await voice.load();
  assert.deepEqual(labels(),['Study again','Forget']);
  // The section keeps the voice; it is not the screen's main act. Studying is
  // quiet, forgetting is marked as destructive, and the one dark button
  // appears only when there is an edit to keep.
  assert.deepEqual(variants(),['button-secondary','button-danger']);
  $('voice-prompt').value='Open with "Hi".';
  $('voice-prompt').dispatchEvent(new globalThis.document.defaultView.Event('input'));
  assert.deepEqual(labels(),['Study again','Save']);
  assert.deepEqual(variants(),['button-secondary','button-primary']);
  press('Save');
  await settle();
  assert.equal(asked.at(-1).prompt,'Open with "Hi".');
  assert.equal(state.profile.prompt,'Open with "Hi".');
  assert.deepEqual(labels(),['Study again','Forget']);
  press('Forget');
  await settle();
  assert.equal($('voice-editor').hidden,true);
  assert.equal($('voice-list').textContent,'');
  assert.deepEqual(labels(),['Study my sent mail']);
});

test('a refused study says why and leaves the section usable',async()=>{
  const {voice,$,labels}=panel({fails:{action:'voice-scan',message:'Google would not allow reading your sent mail.'}});
  await voice.load();
  await voice.study(true);
  assert.equal($('voice-status').textContent,'Google would not allow reading your sent mail.');
  assert.deepEqual(labels(),['Study my sent mail']);
});

test('a refusal that is the connection losing mail access replaces Resume with the repair',async()=>{
  const {voice,$,labels,asked}=panel({
    fails:{action:'voice-scan',message:'Google would not allow reading your sent mail. Connect Google again and approve reading mail.'},revokes:true});
  await voice.load();
  await voice.study(true);
  assert.match($('voice-status').textContent,/Connect Google again/);
  // The reason stays in front of the one action that can clear it; resuming a
  // study Google will refuse again is not offered.
  assert.deepEqual(labels(),['Approve reading mail']);
  assert.equal(asked.filter(call=>call.action==='voice').length,2,'the state is asked for again once the study fails');
});
