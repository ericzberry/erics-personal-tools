import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountPurchaseAdvisor} from '../src/purchase-advisor.js';
import {normalizeCard} from '../src/card-data.js';
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the advisor to settle.');
};
function harness(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  return {document,window,restore:()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor)};
}
// The shared formatted select keeps a hidden native select as its data source,
// which this DOM does not give a working value of its own.
function shim(document,values){
  for(const [id,initial] of Object.entries(values)){
    let value=initial;
    Object.defineProperty(document.getElementById(id),'value',{configurable:true,get:()=>value,set:next=>{value=next;}});
  }
}
const store=(records,{requests}={requests:[]})=>({saved:async()=>[...records],request:async(token,path)=>{requests.push(path);return {records:[...records],syncMessage:''};}});
const PLATINUM='11111111-1111-4111-8111-111111111111',EVERYDAY='22222222-2222-4222-8222-222222222222';
const cards=[
  {id:PLATINUM,revision:'1',...normalizeCard({name:'Synthetic Platinum Card',unit:'cash',base:1,cpp:1,checked:'2026-09-20',
    rules:JSON.stringify([{category:'Online shopping',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:'',merchant:''}])})},
  {id:EVERYDAY,revision:'1',...normalizeCard({name:'Synthetic Everyday Card',unit:'cash',base:2,cpp:1,checked:'2026-09-20',rules:'[]'})}
];
const wallet=[
  {id:'w-plat',kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available'},
  {id:'w-dell',kind:'benefit',name:'Dell credit',source:'Synthetic Platinum Card',value:'$200 per year',remaining:'$150',state:'available',card:'w-plat'}
];
const catalogs=[{id:'amex-offers',programId:'amex-offers',label:'Amex Offers',offers:[
  {key:'dell',name:'Dell',category:'Electronics',badge:'',card:'Synthetic Everyday Card (-72005)',summary:'Spend $599 or more, get $100 back.',path:'/offers/eligible?account_key=e'}]}];
const reading={merchant:'Dell',category:'Online shopping',channel:'Online',amount:2000,confidence:'high',reason:'A laptop from Dell.'};

test('one sentence becomes one recommendation: the card, the figure, its parts and its conditions',async()=>{
  const h=harness();const requests=[];const asked=[];
  const remote=async(token,path,options)=>{
    if(path==='/v1/ai-connections')return {connections:[{id:'ai',hasApiKey:true,provider:'openai'}]};
    asked.push(options.value);return reading;
  };
  const tool=mountPurchaseAdvisor(h.document.querySelector('main'),{credentials:{get:async()=>'token'},
    cards:store(cards,{requests}),wallet:store(wallet,{requests}),programs:store(catalogs,{requests}),remote});
  await tool.ready;
  const $=id=>h.document.getElementById(id);
  shim(h.document,{'advisor-category':'','advisor-channel':'Direct'});
  assert.deepEqual(requests.sort(),['/v1/cards','/v1/rewards','/v1/rewards/programs'],'each store is brought up to date once');
  $('advisor-purchase').value='I’m buying a laptop from Dell for $2,000';
  $('advisor-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  await settle(()=>$('advisor-result').children.length>0);
  // Only the description went to the model.
  assert.deepEqual(asked,[{purchase:'I’m buying a laptop from Dell for $2,000'}]);
  assert.match($('advisor-reading').textContent,/Dell · Online shopping · Online · \$2,000/);
  const best=h.document.querySelector('.advice-best');
  assert.equal(best.querySelector('strong').textContent,'Pay with Synthetic Platinum Card');
  assert.equal(best.querySelector('h3').textContent,'$210.00 back');
  const lines=[...best.querySelectorAll('.advice-lines .record-row')].map(row=>[row.querySelector('.record-name').textContent,row.querySelector('.record-figure strong').textContent]);
  assert.deepEqual(lines,[['3% Online shopping bonus','$60.00'],['Dell credit','$150.00']]);
  assert.match(best.textContent,/\$150 left/);
  assert.doesNotMatch(best.textContent,/Conditions/,'nothing has to hold for the Platinum');
  // The Everyday's offer is not on the card yet, so it is not in the
  // Everyday's figure: the gap is the whole $170, and what adding the offer
  // would make of it is said apart from what holds now.
  assert.match(best.textContent,/Synthetic Everyday Card is next: \$170\.00 less here\./);
  // Adding the offer would lift the Everyday to $140, still short of the
  // Platinum's $210, so the answer would not change and the step is said
  // under the Everyday rather than as something to do.
  assert.doesNotMatch($('advisor-result').textContent,/Could be better after…/);
  // The other card, with what holds on it and what still has to.
  const others=h.document.querySelector('.advice-others');
  assert.match(others.textContent,/Synthetic Everyday Card/);
  assert.match(others.textContent,/\$40\.00/);
  assert.match(others.textContent,/2% base rate · \$170\.00 less\./);
  assert.match(others.textContent,/Could be better after: Add the Dell offer to the card first\. Spend \$599\.00 or more\./);
  // Correcting the amount recomputes without asking the model again.
  $('advisor-amount').value='400';
  $('advisor-amount').dispatchEvent(new h.window.Event('input',{bubbles:true}));
  assert.equal($('advisor-result').children.length,0,'a changed reading clears the answer');
  $('advisor-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  await settle(()=>$('advisor-result').children.length>0);
  assert.equal(asked.length,1);
  assert.equal(h.document.querySelector('.advice-best h3').textContent,'$162.00 back','3% of $400 and the $150 credit');
  assert.match(h.document.querySelector('.advice-others').textContent,/this purchase is under it/);
  h.restore();
});

test('with no model to read the purchase, the controls open and a category by hand still answers',async()=>{
  const h=harness();
  const remote=async(token,path)=>{if(path==='/v1/ai-connections')return {connections:[]};throw Error('not asked');};
  const tool=mountPurchaseAdvisor(h.document.querySelector('main'),{credentials:{get:async()=>'token'},
    cards:store(cards),wallet:store(wallet),programs:null,remote});
  await tool.ready;
  const $=id=>h.document.getElementById(id);
  shim(h.document,{'advisor-category':'','advisor-channel':'Direct'});
  assert.match($('advisor-ai-status').textContent,/Save an AI connection in Settings to read a purchase\./);
  $('advisor-purchase').value='groceries';
  $('advisor-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  await settle(()=>$('advisor-purchase-status').textContent.includes('Set the category below'));
  assert.equal($('advisor-adjust').hidden,false);
  $('advisor-category').value='Groceries';
  $('advisor-category').dispatchEvent(new h.window.Event('change',{bubbles:true}));
  $('advisor-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
  await settle(()=>$('advisor-result').children.length>0);
  assert.equal(h.document.querySelector('.advice-best strong').textContent,'Pay with Synthetic Everyday Card');
  assert.equal(h.document.querySelector('.advice-best h3').textContent,'2% back');
  assert.doesNotMatch($('advisor-reading').textContent,/You set these values|Read from your description/);
  h.restore();
});

test('nothing saved and no connection each say so, and a disconnect clears the answer',async()=>{
  const h=harness();
  let token='token';
  const remote=async(t,path)=>{if(path==='/v1/ai-connections')return {connections:[{id:'ai',hasApiKey:true,provider:'openai'}]};return reading;};
  const tool=mountPurchaseAdvisor(h.document.querySelector('main'),{credentials:{get:async()=>token},cards:store([]),wallet:store([]),programs:store([]),remote});
  await tool.ready;
  const $=id=>h.document.getElementById(id);
  assert.equal($('advisor-status').textContent,'No card has earning rates yet. Add them under Card rates.');
  tool.clear();
  assert.equal($('advisor-status').textContent,'Connect in Settings to download your cards.');
  assert.equal($('advisor-recommend').disabled,true);
  h.restore();
});
