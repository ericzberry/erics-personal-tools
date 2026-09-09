import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {selectTool,showTool,showSettings} from '../src/navigation.js';
test('selected wallet remains in the sidebar through active-tab refresh and settings',()=>{
  const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
  globalThis.document=document;mountApp(document.getElementById('app'));
  selectTool('travel');showTool('gmail');
  assert.equal(document.getElementById('travel-tool').hidden,false);
  assert.equal(document.getElementById('gmail-tool').hidden,true);
  showSettings(true);assert.equal(document.getElementById('travel-tool').hidden,true);
  showSettings(false);assert.equal(document.getElementById('travel-tool').hidden,false);
  selectTool('');assert.equal(document.getElementById('gmail-tool').hidden,false);
});
