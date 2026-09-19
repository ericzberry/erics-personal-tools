// Local synthetic fixture for the wallet's points and miles: the totals it
// opens with, and the panel offered beside a program's own page in each of its
// states. Not copied into release builds. The controller, components and
// styles are the real modules; only the wallet, the page and the reading of it
// are synthetic.
import {mountRewards} from '../src/rewards-tool.js';
import {validateReward} from '../src/rewards-data.js';
import {loyaltySite} from '../src/loyalty-sites.js';
const entries=[
  {kind:'balance',name:'MileagePlus',source:'United Airlines',value:'82,431 miles'},
  {kind:'balance',name:'Mileage Plan',source:'Alaska Airlines',value:'26,900 miles'},
  {kind:'balance',name:'Bonvoy',source:'Marriott',value:'240,118 points'},
  {kind:'balance',name:'Membership Rewards',source:'American Express',value:'512,000'},
  {kind:'balance',name:'World of Hyatt — Globalist through February',source:'Hyatt',value:'Globalist status'},
  {kind:'benefit',name:'Ride credit',source:'Amex Platinum',value:'$15 per month',cadence:'monthly'}
].map((entry,index)=>({...validateReward({...entry,state:'available'},index?new Date().toISOString():'2020-01-01T00:00:00.000Z'),
  id:`4000000${index}-0000-4000-8000-00000000000${index}`,revision:'first'}));

const store=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      const id=url.slice('/v1/rewards/'.length);
      if(!options.method)return {records:[...saved],syncMessage:''};
      if(options.method==='DELETE'){saved=saved.filter(entry=>entry.id!==id);return {records:[...saved]};}
      const value={...options.value,revision:'next'};
      saved=saved.some(entry=>entry.id===id)?saved.map(entry=>entry.id===id?value:entry):[...saved,value];
      return {record:value,records:[...saved]};
    },
    async resolve(){return {records:[...saved]};}
  };
};
const credentials={get:async()=>'synthetic-preview-token-at-least-32-characters'};
// One page of synthetic account text, read the way the sidebar reads the tab
// beside it, and one synthetic answer from the reading.
const page=async()=>({text:'MileagePlus\nMiles 91,204\nPremier Platinum · PQP 8,400',host:'united.com',title:'MileagePlus account',trimmed:0,tables:1});
const reading=(balances,slow=false)=>async(token,path)=>{
  if(path==='/v1/ai-connections')return {connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]};
  if(slow)await new Promise(resolve=>setTimeout(resolve,4000));
  return {balances,unread:'Premier qualifying points were left out — they are not a spendable balance.'};
};
const found=[{program:'MileagePlus',source:'United Airlines',amount:91204,unit:'miles',confidence:'high',notes:'8,400 PQP shown on the page are qualifying points, not a balance.'}];

const root=document.getElementById('balance-states');
for(const [label,url,remote,read] of [
  ['Beside a program page · nothing read yet','https://www.united.com/en/us/myunited',reading(found),page],
  ['Beside a program page · read, nothing saved yet','https://www.united.com/en/us/myunited',reading(found),page],
  ['Beside a program page · the page shows no balance','https://www.marriott.com/loyalty/myAccount.mi',reading([]),page],
  ['An ordinary page · no panel at all','https://example.invalid/',reading(found),page],
  ['A full tab · the wallet, with no page to read',null,reading(found),null]
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const tool=mountRewards(host,{credentials,offline:store(entries),remote,readPage:read,vault:{unlocked:()=>true,available:()=>true,lock(){},touch(){},key:async()=>null,open:async()=>({number:''}),recoveryCode:()=>'EV1-SYNTHETIC'}});
  await tool.refresh();
  tool.site(url?loyaltySite(url):null);
  if(label.includes('read, nothing')) host.querySelector('#balance-body button')?.click();
}
