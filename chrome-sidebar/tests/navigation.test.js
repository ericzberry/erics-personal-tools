import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {selectTool,showTool,showSettings,selectCapability} from '../src/navigation.js';
import {APP_AREAS} from '../src/capabilities.js';
const setup=()=>{const {document}=parseHTML('<html><body><main id="app"></main></body></html>');globalThis.document=document;mountApp(document.getElementById('app'));return document;};
test('manual selection survives context changes and settings',()=>{
  const doc=setup();selectTool('travel');showTool('gmail');
  assert.equal(doc.getElementById('travel-tool').hidden,false);assert.equal(doc.getElementById('gmail-tool').hidden,true);
  showSettings(true);assert.equal(doc.getElementById('travel-tool').hidden,true);
  showSettings(false);assert.equal(doc.getElementById('travel-tool').hidden,false);
  selectTool('');assert.equal(doc.getElementById('gmail-tool').hidden,false);
});
test('the six areas replace the old menu and mark only their selected parent',()=>{
  const doc=setup();selectTool('sizes');
  assert.deepEqual([...doc.querySelectorAll('.capability-list .capability-item')].map(n=>n.textContent),['Today','Money','Travel','Info','Health','More']);
  assert.equal(doc.getElementById('navigate-area-info').getAttribute('aria-current'),'page');
  assert.equal(doc.getElementById('current-function').textContent,'Info');
  assert.equal(doc.querySelectorAll('.capability-list [aria-current]').length,1);
  assert.equal(doc.getElementById('navigate-sizes'),null);
});
test('Today includes attention and remains selected when the browser tab changes',()=>{
  const doc=setup();showTool('gmail');selectTool('attention');
  assert.equal(doc.getElementById('home-tool').hidden,false);
  assert.ok(doc.getElementById('home-tool').contains(doc.getElementById('attention-tool')));
  assert.equal(doc.getElementById('attention-tool').hidden,false);
  showTool('finance');assert.equal(doc.getElementById('home-tool').hidden,false);
});
test('area switching preserves forms and returns a shared panel to its own tab',()=>{
  const doc=setup();selectTool('documents');const wallet=doc.getElementById('travel-tool');
  const input=doc.createElement('input');input.value='unsaved';wallet.append(input);
  assert.ok(doc.getElementById('area-journeys').contains(wallet));
  selectTool('travel');assert.ok(doc.querySelector('.area-detail').contains(wallet));
  selectTool('documents');assert.ok(doc.getElementById('area-journeys').contains(wallet));
  assert.equal(input.value,'unsaved');assert.equal(wallet.hidden,false);
  selectCapability('rewards',{area:'info'});assert.equal(doc.getElementById('current-function').textContent,'Info');
  selectTool('rewards');assert.equal(doc.getElementById('current-function').textContent,'Money');
  assert.ok(doc.getElementById('area-money').contains(doc.getElementById('rewards-tool')));
});
