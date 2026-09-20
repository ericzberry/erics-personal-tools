// Local synthetic fixture for the wallet's points and miles: the programs it
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
const reading=(balances,credits=[],rates=[],benefits=[],slow=false)=>async(token,path)=>{
  if(path==='/v1/ai-connections')return {connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]};
  if(slow)await new Promise(resolve=>setTimeout(resolve,4000));
  return {balances,credits,rates,benefits,unread:'Premier qualifying points were left out — they are not a spendable balance.'};
};
// The Best card store, so a rate read off a card's page has a saved card to
// land on. One of the two rates it already holds; the other is new.
const cardStore=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      const id=url.slice('/v1/cards/'.length);
      if(!options.method)return {records:[...saved],syncMessage:''};
      const value={...options.value,id,revision:'next'};
      saved=saved.map(card=>card.id===id?value:card);
      return {record:value,records:[...saved]};
    },
    async saved(){return [...saved];}
  };
};
const reserve=[{id:'50000000-0000-4000-8000-000000000001',name:'J.P. Morgan Reserve',unit:'points',base:1,cpp:1.5,
  rules:JSON.stringify([{category:'Dining',channel:'Any',rate:2,remaining:null,active:true,end:'',condition:''}]),
  source:'',checked:'2026-01-01',notes:'',revision:'first'}];
const found=[{program:'MileagePlus',source:'United Airlines',amount:91204,unit:'miles',confidence:'high',notes:'8,400 PQP shown on the page are qualifying points, not a balance.'}];
// An issuer running a currency per kind of card: the points cards earn
// Membership Rewards, the cash-back card earns Reward Dollars, and both are
// printed on the one page the panel reads.
const amexPage=async()=>({text:'Membership Rewards Points 13,674 · 2 Accounts\nReward Dollars $125.49 · Blue Cash Preferred',host:'americanexpress.com',title:'American Express',trimmed:0,tables:1});
// What a card's own benefits page states beside its balance: a tracker per
// recurring credit, saying what is left of it in the period it is in now.
const amexCredits=[
  {credit:'$200 Airline Fee Credit',card:'Morgan Stanley Platinum Card® (-61007)',amount:200,remaining:200,cadence:'annual',confidence:'high',notes:''},
  {credit:'$300 Digital Entertainment Credit',card:'Morgan Stanley Platinum Card® (-61007)',amount:25,remaining:25,cadence:'monthly',confidence:'high',notes:'$67 earned this year.'},
  {credit:'Uber Cash',card:'Morgan Stanley Platinum Card® (-61007)',amount:15,remaining:0,cadence:'monthly',confidence:'medium',notes:'Spent this month.'}
];
const amexFound=[
  {program:'Membership Rewards',source:'American Express',amount:13674,unit:'points',confidence:'high',notes:''},
  {program:'Reward Dollars',source:'American Express',amount:125.49,unit:'dollars',confidence:'high',notes:'Earned on Blue Cash Preferred.'}
];

// An invitation-only card's own page: the rates it states, and the benefits it
// carries that no tracker counts. One of the rates lands on a rule the saved
// card already holds, one lands on a card the wallet does not have.
const reservePage=async()=>({text:'J.P. Morgan Reserve (...4411)\nUltimate Rewards\n204,812 pts\n8x on Chase Travel\n4x on flights and hotels booked direct\n3x on dining\nAll other earnings\n1x',
  host:'chase.com',title:'J.P. Morgan Reserve rewards',trimmed:0,tables:1});
const reserveRates=[
  {label:'8x on Chase Travel',card:'J.P. Morgan Reserve (...4411)',category:'Travel',channel:'Issuer portal',rate:8,unit:'points',condition:'Booked through Chase Travel.',confidence:'high'},
  {label:'4x on flights and hotels booked direct',card:'J.P. Morgan Reserve (...4411)',category:'Travel',channel:'Direct',rate:4,unit:'points',condition:'Flights and hotels booked with the airline or hotel itself.',confidence:'high'},
  {label:'3x on dining',card:'J.P. Morgan Reserve (...4411)',category:'Dining',channel:'Any',rate:3,unit:'points',confidence:'high'},
  {label:'All other earnings',card:'J.P. Morgan Reserve (...4411)',base:true,rate:1,unit:'points',confidence:'high'},
  {label:'5% back at drugstores',card:'Freedom Unlimited ••••8820',category:'Drugstores',channel:'Any',rate:5,unit:'cash',confidence:'medium'}
];
const reserveBenefits=[
  {benefit:'Priority Pass Select',card:'J.P. Morgan Reserve (...4411)',kind:'membership',value:'Priority Pass Select membership',state:'activation',notes:'Enroll once, then add guests.',confidence:'high'},
  {benefit:'Global Entry or TSA PreCheck credit',card:'J.P. Morgan Reserve (...4411)',kind:'benefit',value:'$120 every four years',confidence:'high',notes:''},
  {benefit:'The Edit hotel collection',card:'J.P. Morgan Reserve (...4411)',kind:'membership',value:'Daily breakfast and a $100 property credit',confidence:'medium',notes:''}
];
const reserveBalance=[{program:'Ultimate Rewards',source:'Chase',amount:204812,unit:'points',confidence:'high',notes:''}];

// A program whose own name already carries its issuer: the panel that reads it
// says "IHG One Rewards" once, not "IHG IHG One Rewards".
const ihgPage=async()=>({text:'IHG One Rewards\nPoints balance 28,550',host:'ihg.com',title:'IHG One Rewards',trimmed:0,tables:1});
const ihgFound=[{program:'IHG One Rewards',source:'IHG',amount:28550,unit:'points',confidence:'high',notes:''}];

const root=document.getElementById('balance-states');
for(const [label,url,remote,read,cards] of [
  ['Beside a program page · nothing read yet','https://www.united.com/en/us/myunited',reading(found),page],
  ['Beside a program page · read, nothing saved yet','https://www.united.com/en/us/myunited',reading(found),page],
  ['Beside a program named after its own issuer · read, nothing saved yet','https://www.ihg.com/onerewards/content/us/en/account/dashboard',reading(ihgFound),ihgPage],
  ['Beside a program page · the page shows no balance','https://www.marriott.com/loyalty/myAccount.mi',reading([]),page],
  ['Beside an issuer running two currencies · nothing read yet','https://global.americanexpress.com/rewards/summary',reading(amexFound),amexPage],
  ['Beside an issuer running two currencies · read, nothing saved yet','https://global.americanexpress.com/rewards/summary',reading(amexFound),amexPage],
  ['Beside a card’s benefits page · read, nothing saved yet','https://global.americanexpress.com/rewards/summary',reading(amexFound.slice(0,1),amexCredits),amexPage],
  ['Beside a card’s rewards page · rates and benefits read, nothing saved yet','https://ultimaterewards.chase.com/',
    reading(reserveBalance,[],reserveRates,reserveBenefits),reservePage,cardStore(reserve)],
  ['Beside a card’s rewards page · read, with no saved card for the rates','https://ultimaterewards.chase.com/',
    reading(reserveBalance,[],reserveRates,reserveBenefits),reservePage,cardStore([])],
  ['An ordinary page · no panel at all','https://example.invalid/',reading(found),page],
  ['A full tab · the wallet, with no page to read',null,reading(found),null]
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const tool=mountRewards(host,{credentials,offline:store(entries),remote,readPage:read,cards:cards||null,vault:{unlocked:()=>true,available:()=>true,lock(){},touch(){},key:async()=>null,open:async()=>({number:''}),recoveryCode:()=>'EV1-SYNTHETIC'}});
  await tool.refresh();
  tool.site(url?loyaltySite(url):null);
  if(label.includes('read,')) host.querySelector('#balance-body button')?.click();
}
