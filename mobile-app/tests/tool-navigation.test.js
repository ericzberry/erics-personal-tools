import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {mountToolNavigation} from '../dist/app/tool-navigation.js';

function setup(storage){
  const {document,window}=parseHTML('<html><body><div id="previous"></div><p id="outside">Content</p></body></html>');
  globalThis.document=document;
  const selections=[];let settings=0;
  const nav=mountToolNavigation(document.getElementById('previous'),{storage,onSelect:id=>selections.push(id),onSettings:()=>settings++});
  return {document,window,nav,selections,get settings(){return settings;}};
}
test('mobile menu restores supported tools, switches in place, and routes Settings separately',()=>{
  const saved=new Map([['mobile-selected-tool','rules']]);
  const ctx=setup({getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)});
  const {nav,selections}=ctx;
  assert.deepEqual([...nav.querySelectorAll('.capability-item')].map(row=>row.id),['navigate-travel','navigate-rewards','navigate-cards','navigate-rules','navigate-rankings','navigate-ai','navigate-restaurants']);
  assert.equal(nav.querySelectorAll('a,select').length,0);
  assert.deepEqual(selections,['rules']);
  assert.equal(nav.querySelector('[aria-current="page"]').id,'navigate-rules');
  nav.open=true;nav.querySelector('#navigate-cards').click();
  assert.equal(nav.open,false);assert.equal(selections.at(-1),'cards');
  assert.equal(saved.get('mobile-selected-tool'),'cards');
  assert.equal(nav.querySelector('#current-function').textContent,'Best card');
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);
  nav.querySelector('#open-settings').click();assert.equal(ctx.settings,1);
  nav.open=true;ctx.document.getElementById('outside').dispatchEvent(new ctx.window.Event('pointerdown',{bubbles:true}));assert.equal(nav.open,false);
  nav.open=true;const event=new ctx.window.Event('keydown',{bubbles:true});event.key='Escape';nav.dispatchEvent(event);assert.equal(nav.open,false);
});
test('stale desktop choices and unavailable preference storage fall back to Travel wallet',()=>{
  assert.deepEqual(setup({getItem:()=> 'gmail',setItem(){}}).selections,['travel']);
  assert.deepEqual(setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}).selections,['travel']);
});
