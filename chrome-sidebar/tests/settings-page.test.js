import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountSettings,mountApp} from '../src/components/views.js';
function setup(){const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;globalThis.window=window;return {document,window};}
test('settings page exposes all controller hooks and is included as a private options page',()=>{
 const {document}=setup();mountSettings(document.getElementById('app'));
 const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);assert.equal(new Set(ids).size,ids.length);
 const source=readFileSync(new URL('../src/settings-page.js',import.meta.url),'utf8');
 for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(document.getElementById(id),id);
 for(const label of document.querySelectorAll('label'))assert.ok(document.getElementById(label.getAttribute('for')));
 assert.equal(document.getElementById('ai-key').type,'password');
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.options_ui.page,'settings.html');assert.equal(manifest.options_ui.open_in_tab,true);assert.equal(manifest.omnibox.keyword,'ericberry');
 assert.equal(manifest.web_accessible_resources,undefined);assert.equal(manifest.externally_connectable,undefined);
 mountApp(document.getElementById('app'));assert.equal(document.getElementById('cloud-backup'),null);assert.ok(document.querySelector('a[href="settings.html"]'));
});
test('page connects, saves, preserves a masked key on edit, and removes through extension messages',async()=>{
 const {document,window}=setup();const $=id=>document.getElementById(id);
 // Linkedom omits the native select.value setter used by Chrome.
 const selectValue=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:selectValue.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
 globalThis.location={protocol:'chrome-extension:'};
 let connected=false,connections=[],revision=0;const messages=[];
 globalThis.chrome={runtime:{sendMessage:async message=>{
   messages.push(message);assert.equal(message.type,'ERIC_SETTINGS');
   if(message.action==='status')return {ok:true,connected};
   if(message.action==='connect'){connected=true;return {ok:true,connected};}
   if(message.action==='list')return {ok:true,connections};
   if(message.action==='models')return {ok:true,models:[{id:'test-model',name:'Test model'}]};
   if(message.action==='test')return {ok:true,model:'test-model',text:'OK'};
   if(message.action==='generate')return {ok:true,model:'test-model',text:'<img src=x> A safe text response',durationMs:100,usage:{inputTokens:8,outputTokens:9}};
   if(message.action==='save'){
     const old=connections.find(item=>item.id===message.id),{apiKey,...value}=message.connection;
     const connection={...value,id:message.id,revision:String(++revision),hasApiKey:apiKey===undefined?!!old?.hasApiKey:!!apiKey};
     connections=[connection];return {ok:true,connection};
   }
   if(message.action==='remove'){connections=[];return {ok:true};}
   if(message.action==='disconnect'){connected=false;return {ok:true,connected};}
 }}};
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
 await import('../src/settings-page.js');
 assert.equal($('connection-save').disabled,true);
 $('settings-token').value='private-extension-token';$('settings-connect').click();await settle();
 assert.equal($('settings-token').value,'');assert.equal($('connection-save').disabled,false);
 $('ai-name').value='My AI';$('ai-key').value='provider-secret';
 $('connection-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();
 assert.equal(connections.length,1);assert.equal(connections[0].model,undefined);assert.equal($('ai-model'),null);assert.equal(connections[0].hasApiKey,true);assert.equal($('ai-key').value,'');assert.equal(document.body.textContent.includes('provider-secret'),false);
 $('ai-name').value='Renamed';$('connection-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();
 assert.equal(messages.filter(item=>item.action==='save').at(-1).connection.apiKey,undefined);assert.equal(connections[0].hasApiKey,true);
 $('connection-models').click();await settle();assert.equal($('provider-model-list').children.length,1);
 $('playground-model').value='test-model';$('connection-test').click();await settle();assert.match($('playground-status').textContent,/accepted/);
 $('playground-prompt').value='Hello';$('playground-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();
 assert.match($('playground-output').textContent,/safe text response/);assert.equal($('playground-output').querySelector('img'),null);
 const generation=messages.find(message=>message.action==='generate');assert.equal(generation.apiKey,undefined);assert.equal(generation.id,connections[0].id);assert.deepEqual(generation.messages,[{role:'user',content:'Hello'}]);
 $('ai-name').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal($('playground-run').disabled,true);
 $('connection-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();
 $('connection-remove').click();assert.equal($('connection-remove-confirm').hidden,false);
 $('connection-confirm-remove').click();await settle();assert.equal(connections.length,0);
 $('settings-disconnect').click();await settle();assert.equal($('connection-save').disabled,true);
 delete globalThis.chrome;delete globalThis.location;
});
