import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
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
