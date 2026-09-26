import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {infoRecords,findInfo,productSearchURL,INFO_SOURCES,isMembership} from '../src/info-data.js';
import {isLoyaltyReward} from '../src/balance-data.js';
import {mountInfo} from '../src/info.js';
const data={people:[{id:'person',name:'Zoë',role:'Child',location:'Brooklyn',notes:'private notes'}],personal:[{id:'passport',label:'Passport',person:'Zoë',category:'Identification',hint:'ends 7781',secret:'sealed-private'}],travel:[{id:'miles',name:'Delta',category:'Airline',number:'SECRET-NUMBER',notes:'SECRET-NOTES'},{id:'doc',name:'US Passport',category:'Passport',number:'SECRET-DOCUMENT'}],sizes:[{id:'size',item:'Shirt',brand:'Loro Piana',size:'M',fit:'Slim'}],gifts:[{id:'gift',person:'Zoë',idea:'Telescope',status:'Idea'},{id:'deleted',idea:'Deleted',deleting:true}],replacements:[{id:'paint',item:'Paint',variant:'Hale Navy HC-154',pending:true}],rewards:[{id:'loyalty',kind:'balance',name:'SkyMiles',source:'Delta',value:'12,000 miles',secret:'private'},{id:'issuer',kind:'balance',name:'Membership Rewards',source:'American Express',value:'10,000 points'}]};
test('Info searches across record types and keeps document numbers and sealed payloads out',()=>{
  const rows=infoRecords(data);assert.equal(rows.length,7);
  assert.deepEqual(findInfo(rows,'zoe').map(r=>r.id).sort(),['gift','passport','person']);
  assert.equal(findInfo(rows,'loro shirt')[0].id,'size');
  assert.equal(findInfo(rows,'loyalty Delta','memberships').length,2);
  assert.equal(findInfo(rows,'secret').length,0);assert.doesNotMatch(JSON.stringify(rows),/SECRET|sealed-private|private notes/);
  assert.equal(rows.some(r=>r.id==='doc'||r.id==='issuer'||r.id==='deleted'),false);
  assert.equal(findInfo(rows,'Hale')[0].pending,true);
});
test('a web search sends only the product description, never the recipient or private record fields',()=>{
  const gift=infoRecords(data).find(r=>r.id==='gift');
  assert.equal(new URL(productSearchURL(gift)).searchParams.get('q'),'Telescope');
  assert.equal(productSearchURL(infoRecords(data).find(r=>r.id==='passport')),'');
  assert.equal(isMembership({category:'Passport'}),false);assert.equal(isMembership({category:'Hotel'}),true);
  assert.equal(isLoyaltyReward(data.rewards[0]),true);assert.equal(isLoyaltyReward(data.rewards[1]),false);
});
const settle=async check=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,2));if(check())return;}throw Error('Info did not settle');};
function setup(){const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;return {document,window,root:document.querySelector('main')};}
const vault={unlocked:()=>true,available:()=>true,borrowed:()=>true,touch(){}};
test('the collection reads existing stores, keeps source failures visible, and filters without network calls',async()=>{
  const {root,window}=setup();let requests=0,opened;
  const stores=Object.fromEntries(INFO_SOURCES.map(name=>[name,{request:async()=>{requests++;if(name==='personal')throw Error('Offline copy missing');return {records:data[name]||[],syncMessage:'Offline · Your records are available.'};}}]));
  mountInfo(root,{credentials:{get:async()=>'synthetic'},vault,stores,remote:async()=>({connections:[]}),onOpen:row=>opened=row});
  await settle(()=>root.querySelectorAll('#info-records .record-row').length===6);
  assert.match(root.querySelector('#info-coverage').textContent,/personal unavailable/);
  assert.equal(root.querySelector('#info-add').hidden,true);
  root.querySelector('#info-search').value='loro shirt';root.querySelector('#info-search').dispatchEvent(new window.Event('input'));
  assert.equal(root.querySelectorAll('#info-records .record-row').length,1);assert.equal(requests,7);
  root.querySelector('[aria-label="Open Shirt"]').click();assert.equal(opened.tool,'sizes');assert.equal(opened.id,'size');
});
test('locking or disconnecting while Info loads cannot repopulate private rows',async()=>{
  const {root}=setup();let finish,open=true;
  const pending=new Promise(resolve=>{finish=resolve;});
  const stores=Object.fromEntries(INFO_SOURCES.map(name=>[name,{request:()=>pending}]));
  const tool=mountInfo(root,{credentials:{get:async()=>'synthetic'},vault:{...vault,unlocked:()=>open},stores,remote:async()=>({connections:[]})});
  await new Promise(r=>setTimeout(r,5));open=false;tool.clear();finish({records:[{id:'x',name:'Private person',role:'You'}]});
  await new Promise(r=>setTimeout(r,5));assert.doesNotMatch(root.textContent,/Private person/);
});
