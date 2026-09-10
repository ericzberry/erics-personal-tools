import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {mountToolNavigation} from '../dist/app/tool-navigation.js';
import {CAPABILITIES,capabilitySections} from '../dist/app/shared/capabilities.js';

const alphabetical=[...CAPABILITIES].sort((a,b)=>a.label.localeCompare(b.label));

function setup(){
  const {document,window}=parseHTML('<html><body><div id="previous"></div><p id="outside">Content</p></body></html>');
  globalThis.document=document;
  const selections=[];let settings=0;
  const nav=mountToolNavigation(document.getElementById('previous'),{onSelect:id=>selections.push(id),onSettings:()=>settings++});
  return {document,window,nav,selections,get settings(){return settings;}};
}
const toolTiles=nav=>[...nav.querySelectorAll('.launcher-tile')].filter(tile=>!['navigate-home','open-settings'].includes(tile.id));

test('the app opens on a home screen whose icons are shown in place',()=>{
  const {nav,selections}=setup();
  assert.deepEqual(selections,[null]);
  assert.equal(nav.tagName.toLowerCase(),'details');
  // Home shows the grid itself, so the dropdown is open and its toggle hidden.
  assert.equal(nav.open,true);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,true);
  assert.equal(nav.querySelector('#navigate-home').getAttribute('aria-current'),'page');
  assert.equal(nav.querySelector('#current-function').textContent,'Home');
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

test('opening a tool collapses the icons into the dropdown, and Home brings them back',()=>{
  const {nav,selections}=setup();
  nav.querySelector('#navigate-cards').click();
  assert.equal(selections.at(-1),'cards');
  assert.equal(nav.open,false);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,false);
  assert.equal(nav.querySelector('#current-function').textContent,'Best card');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-cards');
  nav.querySelector('#navigate-home').click();
  assert.equal(selections.at(-1),null);
  assert.equal(nav.open,true);
  assert.equal(nav.querySelector('#navigation-toggle').hidden,true);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-home');
});

test('Settings stays a separate maintenance action, not a tool',()=>{
  const ctx=setup();
  const settings=ctx.nav.querySelector('#open-settings');
  assert.ok(settings);
  assert.equal(settings.getAttribute('aria-controls'),'capability-settings');
  assert.ok(settings.classList.contains('launcher-tile--settings'));
  settings.click();
  assert.equal(ctx.settings,1);
  // Choosing Settings must not change the selected screen.
  assert.equal(ctx.selections.length,1);
  assert.equal(ctx.nav.querySelector('[aria-current="page"]').id,'navigate-home');
});
