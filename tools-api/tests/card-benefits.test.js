import test from 'node:test';
import assert from 'node:assert/strict';
import {researchCardBenefits} from '../src/rewards.js';
const connection={provider:'openai',apiKey:'synthetic-key'};
const page='https://issuer.example/benefits';
const card={name:'Synthetic Platinum Card (United States)',source:'Synthetic Bank',value:'5x flights, 1x everything else',url:page,notes:'$895 annual fee'};
const benefits=[
  {kind:'benefit',name:'Ride credit',value:'$15 per month',state:'activation',cadence:'monthly',due:'',url:'',notes:'Enroll before using'},
  {kind:'membership',name:'Lounge access',value:'Priority Pass Select',state:'available',cadence:'',due:'',url:'',notes:''}
];
const responder=(reply,{searched=true,sources=[{url:`${page}?utm_source=openai`}]}={})=>async url=>
  url.endsWith('/models')?Response.json({data:[{id:'gpt-5-mini'}]})
    :Response.json({status:'completed',output:[...(searched?[{type:'web_search_call',action:{sources}}]:[]),{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]});

test('benefit research returns one card and its benefits in the shape the wallet stores',async()=>{
  const result=await researchCardBenefits(connection,{name:'synthetic platinum'},responder({card,benefits}));
  assert.equal(result.card.kind,'card');
  assert.equal(result.card.name,card.name);
  assert.equal(result.card.cadence,'');
  // Every benefit names the card it came with, so the wallet can file it there.
  assert.deepEqual(result.benefits.map(b=>b.source),[card.name,card.name]);
  assert.deepEqual(result.benefits.map(b=>b.kind),['benefit','membership']);
  assert.deepEqual(result.benefits.map(b=>b.cadence),['monthly','']);
  assert.equal(result.benefits[0].state,'activation','an enrollment requirement survives research');
  assert.equal(new Set([result.card.id,...result.benefits.map(b=>b.id)]).size,3,'each entry gets its own id');
  // Research reports what a card gives, never what the owner has already used,
  // and never a sealed value it has no way to know.
  assert.equal(result.benefits.some(b=>b.state==='used'||b.secret||b.card),false);
});

test('benefit research needs the issuer page it cites, and answers a loose name with the cards it could be',async()=>{
  await assert.rejects(researchCardBenefits(connection,{name:'synthetic'},responder({card,benefits},{searched:false})),e=>e.status===502);
  // Searching is not enough: the page the answer names has to be one it opened.
  await assert.rejects(researchCardBenefits(connection,{name:'synthetic'},responder({card,benefits},{sources:[{url:'https://elsewhere.example/page'}]})),e=>e.status===502);
  const matches=[{name:'Synthetic Blue Cash Everyday (United States)',note:'No annual fee'},{name:'Synthetic Blue Cash Preferred (United States)',note:'$95 annual fee'}];
  const result=await researchCardBenefits(connection,{name:'blue cash'},responder({matches}));
  assert.deepEqual(result.matches.map(m=>m.name),matches.map(m=>m.name));
  assert.equal(result.card,undefined,'an unresolved card brings back no benefits to save by mistake');
  await assert.rejects(researchCardBenefits(connection,{name:''},responder({card,benefits})),e=>e.status===400);
});

test('a field research got wrong is dropped, but a benefit the wallet cannot store stops the whole card',async()=>{
  const messy=[{...benefits[0],cadence:'fortnightly',due:'2026-02-30',url:'http://insecure.example/offer'}];
  const result=await researchCardBenefits(connection,{name:'synthetic'},responder({card,benefits:messy}));
  assert.deepEqual([result.benefits[0].cadence,result.benefits[0].due,result.benefits[0].url],['','','']);
  assert.equal(result.benefits[0].name,'Ride credit','the rest of the benefit survives');
  // A benefit with nothing in it is not something to review, so it fails loudly.
  await assert.rejects(researchCardBenefits(connection,{name:'synthetic'},responder({card,benefits:[{kind:'benefit',name:'Credit'}]})),e=>e.status===502);
  await assert.rejects(researchCardBenefits(connection,{name:'synthetic'},responder({card,benefits:[]})),e=>e.status===502);
  await assert.rejects(researchCardBenefits(connection,{name:'synthetic'},responder({card:{...card,url:''},benefits})),e=>e.status===502);
  await assert.rejects(researchCardBenefits({provider:'anthropic',apiKey:'k'},{name:'synthetic'},responder({card,benefits})),e=>e.status===400);
});
