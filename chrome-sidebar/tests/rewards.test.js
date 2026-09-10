import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReward,nextActions,luhnValid} from '../src/rewards-data.js';
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
