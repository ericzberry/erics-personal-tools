import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp,AISettingsView,AiTaskRow} from '../src/components/views.js';
test('Settings builds the one cloud connection on arrival and links once to AI connections',async()=>{
 const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');
 globalThis.document=document;globalThis.window=window;
 mountApp(document.getElementById('app'));const $=id=>document.getElementById(id);
 assert.equal($('travel-settings-connection').children.length,0);
 await import('../src/settings.js');
 $('open-settings').click();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal($('settings-tool').hidden,false);
 // The wallet's own connection panel is the screen's only connection, and opening
 // Settings builds it even when the wallet itself was never opened.
 assert.equal(document.querySelectorAll('#travel-settings-connection #travel-cloud').length,1);
 for(const id of ['travel-connect','travel-refresh','travel-disconnect','travel-connection-status'])assert.ok($(id),id);
 for(const id of ['credential-token','credential-connect','credential-list','credential-secret','save-credential'])assert.equal($(id),null,id);
 // AI connections are reached one way: the page that owns them.
 assert.deepEqual([...document.querySelectorAll('#settings-tool a')].map(node=>node.getAttribute('href')),['settings.html']);
 $('close-settings').click();assert.equal($('settings-tool').hidden,true);
 window.dispatchEvent(new window.Event('pagehide'));
});

// A model is chosen once, here, for a named action. The row carries the action
// and its model and nothing else: no feature offers this choice beside its own
// button, so this list is the whole of it.
test('the AI settings screen lists one row per action, with the model that runs it',()=>{
 const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');
 globalThis.document=document;globalThis.window=window;
 document.getElementById('app').replaceChildren(AISettingsView());
 assert.ok(document.getElementById('ai-tasks-list'),'the screen has a place for every action');
 const chosen=[];
 const row=AiTaskRow({task:'finance.intake',label:'Finance reading',automatic:'',chosen:'gpt-5-mini',
  options:[{id:'gpt-4o-mini'},{id:'gpt-5-mini'}],onChange:model=>chosen.push(model)});
 document.getElementById('ai-tasks-list').replaceChildren(row);
 assert.equal(row.querySelector('.record-name').textContent,'Finance reading');
 const select=row.querySelector('select');
 // Automatic leads, and is what an empty choice means.
 assert.deepEqual([...select.options].map(option=>option.value),['','gpt-4o-mini','gpt-5-mini']);
 assert.equal([...select.options][0].textContent,'Automatic');
 assert.equal([...select.options].find(option=>option.selected).value,'gpt-5-mini');
 for(const option of select.options)option.selected=option.value==='';
 select.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.deepEqual(chosen,['']);
 // The action's own name, not the word "Model", is what a screen reader hears.
 assert.equal(row.querySelector('.formatted-select-trigger').getAttribute('aria-label'),'Model for Finance reading');
});
