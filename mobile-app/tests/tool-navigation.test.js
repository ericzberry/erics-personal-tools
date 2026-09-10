import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {mountToolNavigation} from '../dist/app/tool-navigation.js';
import {CAPABILITIES} from '../dist/app/shared/capabilities.js';

const alphabetical=[...CAPABILITIES].sort((a,b)=>a.label.localeCompare(b.label));

function setup(storage){
  const {document,window}=parseHTML('<html><body><div id="previous"></div><p id="outside">Content</p></body></html>');
  globalThis.document=document;
  const selections=[];let settings=0;
  const nav=mountToolNavigation(document.getElementById('previous'),{storage,onSelect:id=>selections.push(id),onSettings:()=>settings++});
  return {document,window,nav,selections,get settings(){return settings;}};
}

test('mobile opens on an alphabetized icon launcher, not a dropdown',()=>{
  const ctx=setup({getItem:()=>null,setItem(){}});
  const {nav}=ctx;
  const tools=[...nav.querySelectorAll('.launcher-tile:not(.launcher-tile--settings)')];
  assert.deepEqual(tools.map(tile=>tile.id),alphabetical.map(item=>`navigate-${item.id}`));
  assert.deepEqual(tools.map(tile=>tile.querySelector('.launcher-label').textContent),alphabetical.map(item=>item.label));
  // Every tool is reachable on the first screen; nothing is hidden behind a menu.
  assert.equal(tools.length,CAPABILITIES.length);
  assert.equal(nav.querySelectorAll('select,a,details,summary').length,0);
  assert.equal(nav.querySelector('#navigation-toggle'),null);
  assert.equal(nav.querySelector('#current-function'),null);
  assert.equal(nav.tagName.toLowerCase(),'nav');
  assert.equal(nav.getAttribute('aria-label'),'Tools');
});

test('every capability ships an icon so the launcher can render it',()=>{
  const {nav}=setup({getItem:()=>null,setItem(){}});
  for(const item of CAPABILITIES){
    assert.ok(item.icon,`${item.id} has no icon`);
    const glyph=nav.querySelector(`#navigate-${item.id} svg`);
    assert.ok(glyph,`${item.id} rendered no icon`);
    assert.equal(glyph.getAttribute('aria-hidden'),'true');
    assert.equal(glyph.querySelector('path').getAttribute('d'),item.icon);
  }
});

test('the launcher restores the saved tool, switches in place, and persists the choice',()=>{
  const saved=new Map([['mobile-selected-tool','rules']]);
  const ctx=setup({getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)});
  const {nav,selections}=ctx;
  assert.deepEqual(selections,['rules']);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-rules');
  nav.querySelector('#navigate-cards').click();
  assert.equal(selections.at(-1),'cards');
  assert.equal(saved.get('mobile-selected-tool'),'cards');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-cards');
});

test('stale desktop choices and unavailable preference storage fall back to Travel wallet',()=>{
  assert.deepEqual(setup({getItem:()=>'gmail',setItem(){}}).selections,['travel']);
  assert.deepEqual(setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}).selections,['travel']);
});

test('Settings stays a separate maintenance action, not a tool',()=>{
  const ctx=setup({getItem:()=>null,setItem(){}});
  const settings=ctx.nav.querySelector('#open-settings');
  assert.ok(settings);
  assert.equal(settings.getAttribute('aria-controls'),'capability-settings');
  assert.ok(settings.classList.contains('launcher-tile--settings'));
  settings.click();
  assert.equal(ctx.settings,1);
  // Choosing Settings must not change or persist the selected tool.
  assert.equal(ctx.selections.length,1);
  assert.equal(ctx.nav.querySelector('[aria-current="page"]').id,'navigate-travel');
});
