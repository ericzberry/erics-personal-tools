import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {mountToolNavigation,SETTINGS_SCREEN} from '../dist/app/tool-navigation.js';
import {APP_AREAS} from '../dist/app/shared/capabilities.js';
function setup(){const {document,window}=parseHTML('<html><body><div id="previous"></div><p id="outside">Content</p></body></html>');globalThis.document=document;const screens=[];const nav=mountToolNavigation(document.getElementById('previous'),{onScreen:(screen,options)=>screens.push({screen,...options})});nav.show('home');return {document,window,nav,screens};}
test('Today opens as content and navigation holds exactly six shared destinations',()=>{
  const {nav,screens}=setup();assert.equal(screens.at(-1).screen,'home');assert.equal(nav.open,false);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,false);
  assert.deepEqual([...nav.querySelectorAll('[id^="navigate-area-"]')].map(n=>n.textContent),['Today','Money','Travel','Info','Health','More']);
  for(const area of APP_AREAS)assert.equal(nav.querySelector(`#navigate-area-${area.id} svg path`).getAttribute('d'),area.icon);
  for(const id of ['gifts','sizes','finance','attention'])assert.equal(nav.querySelector(`#navigate-${id}`),null);
});
test('area selection closes the menu and marks the parent of an Info result',()=>{
  const {nav,screens}=setup();nav.open=true;nav.querySelector('#navigate-area-info').click();
  assert.equal(nav.open,false);assert.equal(screens.at(-1).screen,'info');
  nav.show('gifts');assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-area-info');
  nav.show('rewards',{area:'info'});assert.equal(nav.querySelector('#current-function').textContent,'Info');
  nav.show('rewards');assert.equal(nav.querySelector('#current-function').textContent,'Money');
});
test('legacy destinations and aliases still reach their records',()=>{
  const {nav,screens}=setup();nav.show('attention');assert.equal(screens.at(-1).screen,'home');
  nav.show('cards');assert.equal(screens.at(-1).screen,'rewards');assert.equal(screens.at(-1).view,'pay');
  nav.show('unknown');assert.equal(screens.at(-1).screen,'home');
});
test('Settings and Escape preserve the way back to Today',()=>{
  const {nav,screens,window}=setup();nav.querySelector('#open-settings').click();assert.equal(screens.at(-1).screen,SETTINGS_SCREEN);
  assert.equal(nav.querySelector('#current-function').textContent,'Settings');
  nav.open=true;const event=new window.Event('keydown',{bubbles:true});event.key='Escape';nav.dispatchEvent(event);assert.equal(nav.open,false);
  nav.querySelector('#navigate-area-today').click();assert.equal(screens.at(-1).screen,'home');
});
