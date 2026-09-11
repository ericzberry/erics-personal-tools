import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
test('controller preserves failed inputs, stops pending research and rejects stale search criteria',async()=>{
  const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;
  const value=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:value.get,set(v){for(const o of this.options)o.selected=o.value===String(v);}});
  let resolveResearch,fail=false;const requests=[];
  globalThis.chrome={runtime:{id:'test',sendMessage:async m=>{
    requests.push(m);
    if(m.action==='list')return {ok:true,connections:[{id:'test',name:'Test',provider:'openai',hasApiKey:true}]};
    if(m.action==='restaurants'){if(fail)return {ok:false,error:'Research failed'};return new Promise(resolve=>{resolveResearch=resolve;});}
  }},storage:{local:{get:async()=>({}),set:async()=>{}}}};
  try{
    await import('../src/restaurant-page.js');
    const $=id=>document.getElementById('restaurant-'+id),settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
    const submit=()=>$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    $('connection').value='test';
    $('query').value='Exampel Bistro';submit();await settle();assert.equal($('find').disabled,true);assert.equal($('stop').hidden,false);
    $('stop').click();assert.equal($('find').disabled,false);resolveResearch({ok:true,restaurants:[],summary:'stale response'});await settle();assert.equal($('summary').textContent,'');assert.match($('status').textContent,/Stopped/);
    fail=true;submit();await settle();assert.equal($('query').value,'Exampel Bistro');assert.match($('error').textContent,/Research failed/);
    fail=false;submit();await settle();resolveResearch({ok:true,restaurants:[{id:'1',name:'Example Bistro',address:'100 Example',city:'NYC',neighborhood:'UWS',borough:'Manhattan',travel:'included',booking:[{url:'https://resy.com/cities/new-york-ny/venues/example',provider:'Resy'}],evidence:[]}],summary:'Match'});await settle();
    assert.equal($('check').disabled,true);const choice=document.querySelector('.choice-row input');choice.checked=true;choice.dispatchEvent(new window.Event('change'));assert.equal($('check').disabled,false);
    $('party').value='4';$('check').click();await settle();assert.match($('error').textContent,/Search details changed/);assert.equal(requests.filter(m=>m.action==='restaurants').length,3);
    $('city').value='Paris';$('city').dispatchEvent(new window.Event('input'));assert.equal($('nyc').hidden,true);
    // Flexible dates belong to a named restaurant; a category search keeps one date.
    assert.equal($('through-field').hidden,true);
    $('flex-dates').checked=true;$('flex-dates').dispatchEvent(new window.Event('input'));
    assert.equal($('through-field').hidden,false);assert.equal(document.querySelector('label[for="restaurant-date"]').textContent,'First date');
    $('mode').value='category';$('mode').dispatchEvent(new window.Event('input'));
    assert.equal($('date-options').hidden,true);assert.equal($('through-field').hidden,true);
  }finally{delete globalThis.chrome;Object.defineProperty(window.HTMLSelectElement.prototype,'value',value);}
});
