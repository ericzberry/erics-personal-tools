import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {Field,Option} from '../src/components/ui.js';
function setup(){
  const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;
  const nodes=Field({id:'choice',label:'Service',kind:'select',options:[{text:'Alpha',value:'a'},{text:'Unavailable',value:'b'},{text:'Charlie',value:'c'}]});
  document.body.append(...nodes);
  const select=document.getElementById('choice'),trigger=document.getElementById('choice-trigger');
  // Linkedom does not implement the browser's writable select.value property.
  Object.defineProperty(select,'value',{get(){return Array.from(this.options).find(o=>o.selected)?.value;},set(value){for(const option of this.options)option.selected=option.value===value;}});
  select.options[0].selected=true;select.options[1].disabled=true;
  const press=key=>{const event=new window.Event('keydown',{cancelable:true});event.key=key;trigger.dispatchEvent(event);};
  return {document,window,select,trigger,press};
}
test('formatted selection skips disabled options and emits one bubbling change on commit',()=>{
  const {select,trigger,press,document}=setup();let changes=0;document.body.addEventListener('change',()=>changes++);
  press('ArrowDown');press('ArrowDown');assert.equal(trigger.getAttribute('aria-activedescendant'),'choice-option-2');
  press('Enter');assert.equal(select.value,'c');assert.equal(changes,1);assert.equal(trigger.textContent,'Charlie');assert.equal(trigger.getAttribute('aria-expanded'),'false');
  press('ArrowDown');press('Enter');assert.equal(changes,1);
});
test('formatted selection supports type-ahead, Escape, Tab, outside dismissal and updated options',async()=>{
  const {select,trigger,press,document,window}=setup();
  press('c');assert.equal(trigger.getAttribute('aria-activedescendant'),'choice-option-2');press('Escape');assert.equal(select.value,'a');
  press('ArrowDown');press('End');assert.equal(trigger.getAttribute('aria-activedescendant'),'choice-option-2');press('Home');assert.equal(trigger.getAttribute('aria-activedescendant'),'choice-option-0');press('Tab');assert.equal(trigger.getAttribute('aria-expanded'),'false');
  trigger.click();document.body.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(trigger.getAttribute('aria-expanded'),'false');
  select.replaceChildren(Option('<b>Updated service</b>','updated'));select.options[0].selected=true;
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(trigger.textContent,'<b>Updated service</b>');assert.equal(trigger.querySelector('b'),null);
  select.disabled=true;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(trigger.disabled,true);
  assert.equal(trigger.getAttribute('aria-labelledby'),'choice-label');
});
test('editable suggestions use formatted options while preserving custom input',()=>{
  const {document,window}=parseHTML('<html><body><datalist id="models"><option value="example-small"></option><option value="example-large"></option></datalist></body></html>');globalThis.document=document;
  document.body.append(...Field({id:'model',label:'Model',kind:'text',list:'models'}));
  const input=document.getElementById('model');assert.equal(input.hasAttribute('list'),false);
  const press=key=>{const event=new window.Event('keydown',{cancelable:true});event.key=key;input.dispatchEvent(event);};
  input.value='example';input.dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('[role=option]').length,2);
  press('ArrowDown');press('Enter');assert.equal(input.value,'example-small');assert.equal(input.getAttribute('aria-expanded'),'false');
  input.value='my-custom-model';input.dispatchEvent(new window.Event('input'));assert.equal(input.getAttribute('aria-expanded'),'false');assert.equal(input.value,'my-custom-model');
});
