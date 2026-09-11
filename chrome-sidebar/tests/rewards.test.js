import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReward,nextActions,luhnValid,resetDate,parseCardBenefits,BENEFIT_LIMIT} from '../src/rewards-data.js';
const base={id:'a',kind:'balance',name:'Test airline',source:'Test program',value:'40,000 miles',state:'available'};
const now=new Date(2026,8,9,12);
test('rewards validate dates, required fields, and safe account links',()=>{
  assert.throws(()=>validateReward({...base,name:''}));
  for(const url of ['javascript:alert(1)','http://example.com','https://name:secret@example.com'])assert.throws(()=>validateReward({...base,url}));
  assert.throws(()=>validateReward({...base,due:'2026-02-30'}));
  assert.equal(validateReward({...base,url:'https://example.com'}).url,'https://example.com');
});
test('actions prioritize deadlines, exclude used benefits, and review stale balances',()=>{
  const records=[{...base,id:'stale',updatedAt:'2026-07-01'},
    {...base,id:'activate',kind:'benefit',state:'activation'},
    {...base,id:'today',due:'2026-09-09'},
    {...base,id:'past',due:'2026-09-08'},
    {...base,id:'used',state:'used',due:'2026-09-09'},
    {...base,id:'fresh',updatedAt:'2026-09-09T12:00:00Z'},
    {...base,id:'later',kind:'benefit',due:'2026-12-01'}];
  assert.deepEqual(nextActions(records,now).map(e=>e.id),['past','today','activate','stale']);
  assert.equal(nextActions(records,now)[1].reason,'Use by today');
});
test('date-only deadlines use local calendar days and include 30 day boundary',()=>{
  const list=nextActions([{...base,due:'2026-10-09',updatedAt:now.toISOString()}],now);
  assert.equal(list[0].reason,'Use within 30 days');
});

const CADENCE_ORDER=['monthly','quarterly','semiannual','annual'];

test('a card is an entry of its own, and a benefit says which card carries it',()=>{
  const card=validateReward({...base,id:'11111111-1111-4111-8111-111111111111',kind:'card',name:'Synthetic Platinum',value:'5x flights'});
  assert.equal(card.kind,'card');
  assert.equal(validateReward({...base,kind:'benefit',card:card.id}).card,card.id);
  // A card cannot belong to a card, and a benefit cannot point at something that
  // is not a saved record.
  assert.throws(()=>validateReward({...card,card:card.id}),/saved cards/);
  assert.throws(()=>validateReward({...base,kind:'benefit',card:'Amex Platinum'}),/saved cards/);
  assert.throws(()=>validateReward({...base,cadence:'fortnightly'}),/how often/);
  assert.equal(validateReward({...base,kind:'benefit',cadence:'monthly'}).cadence,'monthly');
});

test('a recurring credit expires when its period closes, on the calendar the issuer publishes',()=>{
  const september=new Date(2026,8,11);
  assert.deepEqual(CADENCE_ORDER.map(cadence=>resetDate(cadence,september)),
    ['2026-09-30','2026-09-30','2026-12-31','2026-12-31']);
  assert.deepEqual(CADENCE_ORDER.map(cadence=>resetDate(cadence,new Date(2026,0,4))),
    ['2026-01-31','2026-03-31','2026-06-30','2026-12-31']);
  assert.equal(resetDate('',september),'');
});

test('a recurring credit is raised near its reset, and a card itself is never a next action',()=>{
  const now=new Date(2026,8,26,12),fresh=now.toISOString();
  const records=[
    {...base,id:'monthly',kind:'benefit',name:'Ride credit',cadence:'monthly',updatedAt:fresh},
    {...base,id:'annual',kind:'benefit',name:'Airline fee credit',cadence:'annual',updatedAt:fresh},
    {...base,id:'card',kind:'card',name:'Synthetic Platinum',updatedAt:'2026-01-01'},
    {...base,id:'used',kind:'benefit',name:'Spent credit',cadence:'monthly',state:'used',updatedAt:fresh}];
  const raised=nextActions(records,now);
  // Four days from the end of September the monthly credit is urgent; a yearly
  // one with three months to run is not, and the card carries no deadline.
  assert.deepEqual(raised.map(e=>e.id),['monthly']);
  assert.equal(raised[0].reason,'Use within 4 days');
  assert.equal(raised[0].deadline,'2026-09-30');
  // A yearly credit is worth raising from much further out than a monthly one,
  // which would otherwise never leave the list.
  assert.deepEqual(nextActions(records,new Date(2026,10,20,12)).map(e=>e.id),['annual']);
  assert.deepEqual(nextActions(records,new Date(2026,10,26,12)).map(e=>e.id),['monthly','annual']);
  // An explicit date always wins over the period it would otherwise sit in.
  assert.equal(nextActions([{...base,kind:'benefit',cadence:'annual',due:'2026-09-27',updatedAt:fresh}],now)[0].reason,'Use within 1 day');
});

test('researched benefits arrive as wallet entries that name their card, and a bad one is refused',()=>{
  const input={card:{name:'Synthetic Platinum (United States)',source:'Synthetic Bank',value:'5x flights',url:'https://issuer.example/benefits'},
    benefits:[{kind:'benefit',name:'Ride credit',value:'$15 per month',state:'activation',cadence:'monthly'},
      {kind:'status',name:'Lounge access',value:'Priority Pass'}]};
  const {card,benefits}=parseCardBenefits(input);
  assert.equal(card.kind,'card');
  assert.deepEqual(benefits.map(b=>[b.kind,b.source]),[['benefit',card.name],['benefit',card.name]]);
  assert.equal(benefits[0].cadence,'monthly');
  // Nothing researched is pre-linked or pre-sealed: the wallet links a benefit
  // to the card only once that card has been saved and has an id of its own.
  assert.deepEqual(benefits.map(b=>b.card+b.secret),['','']);
  assert.throws(()=>parseCardBenefits({card:input.card,benefits:[]}),/between 1 and/);
  assert.throws(()=>parseCardBenefits({card:input.card,benefits:Array.from({length:BENEFIT_LIMIT+1},()=>input.benefits[0])}),/between 1 and/);
  assert.throws(()=>parseCardBenefits({card:{name:'No issuer'},benefits:input.benefits}));
});

test('rewards stays open as the active tab changes and Back returns to current context',async()=>{
  const {parseHTML}=await import('linkedom');
  const {mountApp}=await import('../src/components/views.js');
  const {document}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;mountApp(document.getElementById('app'));
  const {showRewards,showTool,showSettings}=await import('../src/navigation.js');
  showRewards(true);showTool('gmail');assert.equal(document.getElementById('rewards-tool').hidden,false);assert.equal(document.getElementById('gmail-tool').hidden,true);
  showSettings(true);assert.equal(document.getElementById('rewards-tool').hidden,true);
  showSettings(false);assert.equal(document.getElementById('rewards-tool').hidden,false);
  showRewards(false);assert.equal(document.getElementById('gmail-tool').hidden,false);
});

test('capability navigation uses one registry, supports pinned tools, and defaults back to automatic context',async()=>{
 const {parseHTML}=await import('linkedom');const {mountApp}=await import('../src/components/views.js');
 const {document}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;mountApp(document.getElementById('app'));
 const {initializeNavigation,selectCapability,showTool}=await import('../src/navigation.js');initializeNavigation();
 assert.equal(document.getElementById('open-rewards'),null);
 // Gmail is not a menu entry: it appears on its own when the tab is Gmail.
 assert.equal(document.getElementById('navigate-gmail'),null);
 showTool('gmail');assert.equal(document.getElementById('gmail-tool').hidden,false);
 selectCapability('travel');showTool('football');assert.equal(document.getElementById('travel-tool').hidden,false);
 assert.equal(document.getElementById('navigate-travel').getAttribute('aria-current'),'page');
 selectCapability('auto');assert.equal(document.getElementById('football-tool').hidden,false);
 assert.equal(document.getElementById('navigate-travel').hasAttribute('aria-current'),false);
 assert.equal(document.getElementById('app-navigation').open,false);
});

test('the API only accepts an opaque sealed envelope and a four-digit hint, never raw digits',()=>{
  const sealed=JSON.stringify({v:1,iv:'aaaa',ciphertext:'bbbb'});
  const entry=validateReward({...base,secret:sealed,secretHint:'4321'});
  assert.equal(entry.secret,sealed);
  assert.equal(entry.secretHint,'4321');
  assert.equal(validateReward(base).secret,'');
  // A plaintext number, an unsealed envelope, or a hint on its own must fail
  // before anything reaches storage.
  assert.throws(()=>validateReward({...base,secret:'4111111111111111',secretHint:'1111'}),/encrypted on your device/);
  assert.throws(()=>validateReward({...base,secret:JSON.stringify({v:2,iv:'a',ciphertext:'b'}),secretHint:'1111'}),/encrypted on your device/);
  assert.throws(()=>validateReward({...base,secret:sealed,secretHint:'12'}),/last four digits/);
  assert.throws(()=>validateReward({...base,secretHint:'4321'}),/together/);
  assert.throws(()=>validateReward({...base,secret:sealed}),/together/);
  assert.throws(()=>validateReward({...base,secret:JSON.stringify({v:1,iv:'a',ciphertext:'b'.repeat(5000)}),secretHint:'1111'}),/encrypted on your device/);
});

test('a card number typo is caught before it is sealed',()=>{
  assert.equal(luhnValid('4111111111111111'),true);
  assert.equal(luhnValid('378282246310005'),true);
  assert.equal(luhnValid('4111111111111112'),false);
  for(const bad of ['','1234','4111-1111-1111-1111','41111111111111111111'])assert.equal(luhnValid(bad),false);
});
