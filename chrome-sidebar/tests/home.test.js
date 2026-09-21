import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountHome} from '../src/home.js';
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
const mount=(document,{records=[],wallet=[],credentials={get:async()=>'token'}}={})=>
  mountHome(document.getElementById('home-birthdays'),
    {credentials,reminders:store(records),rewards:store(wallet),today});
const credit=(name,value,extra={})=>({id:name,kind:'benefit',name,source:'Synthetic Platinum',value,state:'available',...extra});

test('today’s birthday leads the home screen, and the fortnight follows it',async()=>{
  const document=setup();
  const records=[
    normalizeReminder({kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12,since:'2016'}),
    normalizeReminder({kind:'Birthday',title:'Derek’s birthday',subject:'Next door',date:'1985-09-24',every:12,since:'1985'})
  ];
  mount(document,{records});
  await settle(()=>document.querySelectorAll('.home-row').length===2);
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
  mount(document,{records});
  await settle(()=>document.querySelectorAll('.home-row').length===1);
  assert.equal(group(document,'home-today').hidden,true,'nobody’s birthday today is not a heading');
  assert.equal(group(document,'home-upcoming').hidden,false);
  assert.equal(group(document,'home-quarter').hidden,true,'an empty wallet is not a heading either');
});

// The home screen is a glance, not a tool: it reports nothing, asks for
// nothing, and leaves the screen as it was. Reminders and Rewards are where a
// connection problem is said out loud.
test('no connection and no records leave the home screen exactly as it was',async()=>{
  for(const credentials of [{get:async()=>''},{get:async()=>{throw Error('offline');}}]){
    const document=setup();
    mount(document,{credentials});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(document.querySelectorAll('.home-row').length,0);
    for(const id of ['home-today','home-upcoming','home-quarter'])assert.equal(group(document,id).hidden,true);
  }
});

// Both hosts call refresh() when the reader comes back to the home screen,
// and the mobile app calls it again when a typed note turns into a birthday.
test('refreshing picks up a birthday written after the screen was built',async()=>{
  const document=setup();
  const records=[];
  const tool=mount(document,{records});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(group(document,'home-today').hidden,true);
  records.push(normalizeReminder({kind:'Birthday',title:'Derek’s birthday',date:'2016-09-20',every:12}));
  await tool.refresh();
  assert.equal(group(document,'home-today').hidden,false);
  assert.match(group(document,'home-today').textContent,/Derek’s birthday/);
});

test('the money the quarter takes back sits under the birthdays, largest first',async()=>{
  const document=setup();
  const wallet=[
    credit('Ride credit','$15 ride credit',{cadence:'monthly'}),
    credit('Dining credit','$100 dining credit',{cadence:'quarterly',remaining:'$62.50'}),
    credit('Hotel credit','$300 hotel credit',{due:'2026-09-25',state:'activation'}),
    credit('Fitness credit','$300 fitness credit',{cadence:'annual'})];
  mount(document,{records:[normalizeReminder({kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12})],wallet});
  await settle(()=>document.querySelectorAll('#home-quarter .home-row').length===2);
  const run=group(document,'home-quarter');
  assert.match(run.textContent,/Use this quarter/);
  assert.deepEqual([...run.querySelectorAll('.home-row strong')].map(node=>node.textContent),
    ['Hotel credit','Dining credit']);
  // The money leads the row: it is what put the credit here and what the run is
  // ordered by. What a tracker says is left says so; a card's own terms do not.
  assert.match(run.querySelector('.home-row .footnote').textContent,/^\$300 · Synthetic Platinum · In 5 days · needs enrollment$/);
  assert.match(run.textContent,/\$62\.50 left · Synthetic Platinum · In 10 days/);
  // A yearly credit closes on December 31, and a $15 one is not worth a home
  // screen; the birthdays are still above all of it.
  assert.doesNotMatch(run.textContent,/Fitness credit|Ride credit/);
  assert.equal(group(document,'home-today').compareDocumentPosition(run)&4,4,'the birthdays stay on top');
});

test('past the sixth credit the rest are counted rather than listed',async()=>{
  const document=setup();
  const wallet=Array.from({length:9},(unused,index)=>
    credit(`Credit ${index}`,`$${100+index*10} credit`,{cadence:'quarterly'}));
  mount(document,{wallet});
  await settle(()=>document.querySelectorAll('#home-quarter .home-row').length===6);
  const run=group(document,'home-quarter');
  assert.deepEqual([...run.querySelectorAll('.home-row strong')].map(node=>node.textContent),
    ['Credit 8','Credit 7','Credit 6','Credit 5','Credit 4','Credit 3']);
  assert.equal(run.querySelector('.home-more').textContent,'3 more · $330');
});

// One store failing is not the other's problem: a wallet that will not open
// leaves the birthdays exactly where they were.
test('a wallet that cannot be read leaves the birthdays alone',async()=>{
  const document=setup();
  const records=[normalizeReminder({kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12})];
  mountHome(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},
    reminders:store(records),rewards:{async request(){throw Error('Storage unavailable');}},today});
  await settle(()=>document.querySelectorAll('.home-row').length===1);
  assert.match(group(document,'home-today').textContent,/Maisie’s birthday/);
  assert.equal(group(document,'home-quarter').hidden,true);
});

// The weather is the device's own once-a-day reading, handed in the way the
// hosts hand in `dailyWeather`: what is already worked out, and a way to work it out.
const cool={day:'2026-09-20',date:'2026-09-20',place:'Synthetic Heights',low:59,high:70,coldest:60,sky:'partly',layer:'light',dress:'Bring a light jacket',rain:'',snow:''};
const weatherOf=(result,{kept=null}={})=>({saved:async()=>kept,today:async()=>{if(result instanceof Error)throw result;return result;}});
const reading=run=>({
  range:run.querySelector('.home-weather-range')?.textContent,
  meta:run.querySelector('.home-weather-meta')?.textContent,
  sky:[...run.querySelector('.home-weather-sky').classList].find(name=>name.startsWith('home-weather-sky--')),
  advice:[...run.querySelectorAll('.home-weather-advice')].map(node=>node.textContent)
});

test('the day’s weather leads the home screen as one reading: the sky, the range, what to wear',async()=>{
  const document=setup();
  mountHome(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},
    reminders:store([normalizeReminder({kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12})]),rewards:store([]),today,
    weather:weatherOf(cool)});
  await settle(()=>!!document.querySelector('.home-weather'));
  const run=group(document,'home-weather');
  assert.equal(run.hidden,false);
  assert.deepEqual(reading(run),{range:'59–70°',meta:'Partly cloudy · Synthetic Heights',sky:'home-weather-sky--partly',advice:['Bring a light jacket']});
  assert.ok(run.querySelector('.home-weather-sky svg'),'the sky is drawn');
  // One reading, not a run: no heading over it and no rows ruled apart in it.
  assert.equal(run.querySelector('h2'),null);
  assert.equal(run.querySelector('.home-row'),null);
  assert.equal(run.getAttribute('aria-label'),'Today’s weather');
  assert.equal(run.compareDocumentPosition(group(document,'home-today'))&4,4,'the weather is set above today’s birthdays');
});

test('a wet day says when to take the umbrella, and does not name the rain twice',async()=>{
  const document=setup();
  mountHome(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},reminders:store([]),rewards:store([]),today,
    weather:weatherOf({...cool,sky:'rain',rain:'2–5 PM'})});
  await settle(()=>document.querySelectorAll('.home-weather-advice').length===2);
  const run=group(document,'home-weather');
  assert.deepEqual(reading(run),{range:'59–70°',meta:'Synthetic Heights',sky:'home-weather-sky--rain',
    advice:['Bring a light jacket','Bring an umbrella · rain likely 2–5 PM']});
  const storm=setup();
  mountHome(storm.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},reminders:store([]),rewards:store([]),today,
    weather:weatherOf({...cool,sky:'storm',rain:'8–10 AM and 4–6 PM'})});
  await settle(()=>storm.querySelectorAll('.home-weather-advice').length===2);
  assert.equal(reading(group(storm,'home-weather')).advice[1],'Bring an umbrella · storms likely 8–10 AM and 4–6 PM');
});

test('snow rides with the jacket, the feel is said when it decided it, and a day already worked out is read back',async()=>{
  const document=setup();
  let asked=0;
  const kept={...cool,sky:'snow',layer:'heavy',dress:'Bring a heavy jacket',low:22,high:30,coldest:15,snow:'2–5 PM'};
  mountHome(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},reminders:store([]),rewards:store([]),today,
    weather:{saved:async()=>kept,today:async()=>{asked++;return kept;}}});
  await settle(()=>!!document.querySelector('.home-weather'));
  assert.deepEqual(reading(group(document,'home-weather')),{range:'22–30°',meta:'feels like 15° · Synthetic Heights',sky:'home-weather-sky--snow',
    advice:['Bring a heavy jacket · snow likely 2–5 PM']});
  assert.doesNotMatch(group(document,'home-weather').textContent,/umbrella/);
  assert.equal(asked,0,'a saved day asks for nothing');
});

test('a forecast that cannot be had leaves out the weather and nothing else',async()=>{
  const document=setup();
  mountHome(document.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},
    reminders:store([normalizeReminder({kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12})]),rewards:store([]),today,
    weather:weatherOf(Error('The forecast is unavailable.'))});
  await settle(()=>document.querySelectorAll('.home-row').length===1);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(group(document,'home-weather').hidden,true);
  assert.equal(group(document,'home-today').hidden,false);
  // With no place and no sky, what is left is still the reading.
  const other=setup();
  mountHome(other.getElementById('home-birthdays'),{credentials:{get:async()=>'token'},reminders:store([]),rewards:store([]),today,
    weather:weatherOf({...cool,place:'',sky:null})});
  await settle(()=>!!other.querySelector('.home-weather'));
  assert.deepEqual(reading(group(other,'home-weather')),{range:'59–70°',meta:undefined,sky:'home-weather-sky--unknown',advice:['Bring a light jacket']});
  assert.equal(group(other,'home-weather').querySelector('.home-weather-sky svg'),null);
});
