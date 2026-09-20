import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountHomeBirthdays} from '../src/home.js';
import {normalizeReminder} from '../src/reminder-data.js';
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the home screen to settle.');
};
function setup(){
  const {document,window}=parseHTML('<html><body><div id="home-birthdays"></div></body></html>');
  globalThis.document=document;globalThis.window=window;
  return document;
}
const store=records=>({async request(){return {records,syncMessage:''};}});
const today=()=>'2026-09-20';
const group=(document,id)=>document.querySelector(`#${id}`).closest('.home-group');

test('today’s birthday leads the home screen, and the fortnight follows it',async()=>{
  const document=setup();
  const records=[
    normalizeReminder({kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12,since:'2016'}),
    normalizeReminder({kind:'Birthday',title:'Derek’s birthday',subject:'Next door',date:'1985-09-24',every:12,since:'1985'})
  ];
  mountHomeBirthdays(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},offline:store(records),today});
  await settle(()=>document.querySelectorAll('.home-birthday').length===2);
  const now=group(document,'home-today'),soon=group(document,'home-upcoming');
  assert.equal(now.hidden,false);
  assert.match(now.textContent,/Birthdays today/);
  assert.match(now.textContent,/Maisie’s birthday/);
  assert.match(now.textContent,/turns 10/);
  // Today's row says nothing about when: the heading over it already did.
  assert.doesNotMatch(now.textContent,/Today ·|In \d+ days/);
  assert.match(soon.textContent,/Next two weeks/);
  assert.match(soon.textContent,/In 4 days/);
  assert.match(soon.textContent,/Next door/);
  assert.match(soon.textContent,/turns 41/);
  // Today comes first in the document, not merely first in its own run.
  assert.equal(now.compareDocumentPosition(soon)&4,4,'today’s run is set above the fortnight');
});

test('a run with nobody in it is hidden rather than headed',async()=>{
  const document=setup();
  const records=[normalizeReminder({kind:'Birthday',title:'Derek’s birthday',date:'1985-09-24',every:12})];
  mountHomeBirthdays(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},offline:store(records),today});
  await settle(()=>document.querySelectorAll('.home-birthday').length===1);
  assert.equal(group(document,'home-today').hidden,true,'nobody’s birthday today is not a heading');
  assert.equal(group(document,'home-upcoming').hidden,false);
});

// The home screen is a glance, not a tool: it reports nothing, asks for
// nothing, and leaves the screen as it was. Reminders is where a connection
// problem is said out loud.
test('no connection and no records leave the home screen exactly as it was',async()=>{
  for(const credentials of [{get:async()=>''},{get:async()=>{throw Error('offline');}}]){
    const document=setup();
    mountHomeBirthdays(document.getElementById('home-birthdays'),{credentials,offline:store([]),today});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(document.querySelectorAll('.home-birthday').length,0);
    assert.equal(group(document,'home-today').hidden,true);
    assert.equal(group(document,'home-upcoming').hidden,true);
  }
});

// Both hosts call refresh() when the reader comes back to the home screen,
// and the mobile app calls it again when a typed note turns into a birthday.
test('refreshing picks up a birthday written after the screen was built',async()=>{
  const document=setup();
  const records=[];
  const tool=mountHomeBirthdays(document.getElementById('home-birthdays'),
    {credentials:{get:async()=>'token'},offline:store(records),today});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(group(document,'home-today').hidden,true);
  records.push(normalizeReminder({kind:'Birthday',title:'Derek’s birthday',date:'2016-09-20',every:12}));
  await tool.refresh();
  assert.equal(group(document,'home-today').hidden,false);
  assert.match(group(document,'home-today').textContent,/Derek’s birthday/);
});
