import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {mountToolNavigation,SETTINGS_SCREEN} from '../dist/app/tool-navigation.js';
import {CAPABILITIES,capabilitySections} from '../dist/app/shared/capabilities.js';

const alphabetical=[...CAPABILITIES].sort((a,b)=>a.label.localeCompare(b.label));

function setup(){
  const {document,window}=parseHTML('<html><body><div id="previous"></div><p id="outside">Content</p></body></html>');
  globalThis.document=document;
  const screens=[];
  const nav=mountToolNavigation(document.getElementById('previous'),{onScreen:screen=>screens.push(screen)});
  return {document,window,nav,screens};
}
const toolTiles=nav=>[...nav.querySelectorAll('.launcher-tile')].filter(tile=>!['navigate-home','open-settings'].includes(tile.id));

test('the app opens on a home screen holding nothing but the tool icons',()=>{
  const {nav,screens}=setup();
  assert.deepEqual(screens,[null]);
  assert.equal(nav.tagName.toLowerCase(),'details');
  // Home shows the grid itself, so the menu is open and its hamburger hidden.
  assert.equal(nav.open,true);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,true);
  assert.equal(nav.querySelector('#current-function').textContent,'Home');
  // Home is already the home screen, so its own tile is not one of the icons.
  assert.equal(nav.querySelector('#navigate-home').hidden,true);
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,0);
});

test('the collapsed menu is a hamburger naming the open screen',()=>{
  const {nav}=setup();
  const summary=nav.querySelector('#navigation-toggle');
  assert.equal(summary.getAttribute('aria-label'),'Tools menu');
  assert.ok(summary.querySelector('svg.glyph'),'the toggle renders a hamburger icon');
  nav.querySelector('#navigate-cards').click();
  assert.equal(summary.hidden,false);
  assert.equal(nav.querySelector('#current-function').textContent,'Best card');
});

test('tools are alphabetical inside their section, with Fantasy items under Misc',()=>{
  const {nav}=setup();
  const tiles=toolTiles(nav);
  const ordered=capabilitySections(alphabetical).flatMap(group=>group.items);
  assert.deepEqual(tiles.map(tile=>tile.id),ordered.map(item=>`navigate-${item.id}`));
  assert.deepEqual(tiles.map(tile=>tile.querySelector('.launcher-label').textContent),ordered.map(item=>item.label));
  assert.equal(tiles.length,CAPABILITIES.length);
  assert.deepEqual([...nav.querySelectorAll('.launcher-group-title')].map(node=>node.textContent),['Misc']);
  assert.deepEqual([...nav.querySelectorAll('.launcher-group .launcher-tile')].map(tile=>tile.id),['navigate-rankings']);
  // League rules and AI connections are no longer tools.
  for(const id of ['navigate-rules','navigate-ai'])assert.equal(nav.querySelector(`#${id}`),null);
});

test('every capability ships an icon so the launcher can render it',()=>{
  const {nav}=setup();
  for(const item of CAPABILITIES){
    assert.ok(item.icon,`${item.id} has no icon`);
    const glyph=nav.querySelector(`#navigate-${item.id} svg`);
    assert.ok(glyph,`${item.id} rendered no icon`);
    assert.equal(glyph.getAttribute('aria-hidden'),'true');
    assert.equal(glyph.querySelector('path').getAttribute('d'),item.icon);
  }
});

test('opening a tool collapses the icons behind the hamburger, and Home brings them back',()=>{
  const {nav,screens}=setup();
  nav.querySelector('#navigate-cards').click();
  assert.equal(screens.at(-1),'cards');
  assert.equal(nav.open,false);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,false);
  assert.equal(nav.querySelector('#current-function').textContent,'Best card');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-cards');
  // Home is only reachable from inside a screen, so the menu now offers it.
  assert.equal(nav.querySelector('#navigate-home').hidden,false);
  nav.querySelector('#navigate-home').click();
  assert.equal(screens.at(-1),null);
  assert.equal(nav.open,true);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,true);
  assert.equal(nav.querySelector('#navigate-home').hidden,true);
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,0);
});

test('Settings is a screen of its own, reached only from the menu',()=>{
  const {nav,screens}=setup();
  const settings=nav.querySelector('#open-settings');
  assert.ok(settings);
  assert.equal(settings.getAttribute('aria-controls'),'capability-settings');
  assert.ok(settings.classList.contains('launcher-tile--settings'));
  nav.querySelector('#navigate-cards').click();
  settings.click();
  assert.equal(screens.at(-1),SETTINGS_SCREEN);
  // Settings takes the screen, so no tool stays selected behind it.
  assert.equal(nav.querySelector('#current-function').textContent,'Settings');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'open-settings');
  assert.equal(nav.querySelector('#navigation-toggle').hidden,false);
  // The hamburger stays available, so Home is still one tap away.
  nav.querySelector('#navigate-home').click();
  assert.equal(screens.at(-1),null);
  assert.equal(settings.hasAttribute('aria-current'),false);
});
