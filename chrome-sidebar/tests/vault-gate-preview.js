// Local synthetic fixture for the passkey gate's states. Not copied into
// release builds. The gate, the ledger and their styles are the real modules;
// only the passkey itself is synthetic, so the states a person actually meets —
// waiting for the sheet, a dismissed sheet, and the open section — can be
// inspected at sidebar widths without a passkey provider.
import {mountFinance} from '../src/finance.js';
import {normalizeFinance,markRef,portfolioRef} from '../src/finance-data.js';
import {ACCOUNT_SITES} from '../src/account-sites.js';
// A ledger at the level of detail it actually keeps: a few portfolios, a figure
// per asset class, and a long name to see wrap at 280px.
const portfolio=(number,name,kind)=>({...normalizeFinance({row:'portfolio',number,name,kind,currency:'USD'}),id:portfolioRef(number),revision:'first'});
const figure=(portfolioNumber,cls,asOf,amount)=>{
  const value=normalizeFinance({row:'mark',portfolio:portfolioNumber,class:cls,asOf,amount});
  return {...value,id:markRef(value),revision:String(Math.round(amount*100))};
};
const records=[
  portfolio(1,'Synthetic and Longer-Named Berry Estate',1),
  portfolio(2,'Synthetic Berry',2),
  figure(1,1,'2026-08-31',1284000),
  figure(1,2,'2026-08-31',412500.25),
  figure(1,3,'2026-08-31',18400.12),
  figure(1,1,'2026-05-31',1150000),
  figure(1,21,'2026-08-31',412500),
  figure(2,9,'2026-08-31',622450)
];
const offline={request:async()=>({records}),resolve:async()=>({records})};
// What a signed-in account page reads back as, so the reading prompt and the
// figures it folds into can be inspected without an account or a model call.
const reading={readings:[
  {account:'Synthetic brokerage',label:'Net Account Value',class:'unclassified',registration:'',scope:'account',value:1286400.25,asOf:'2026-08-31',confidence:'high',reason:'Net account value.'},
  {account:'Synthetic rollover IRA with a long account name',label:'Total value',class:'unclassified',registration:'ira',scope:'account',value:412000,asOf:'2026-08-31',confidence:'medium',reason:'Total value.'},
  {account:'',label:'Total Assets',class:'unclassified',registration:'',scope:'all',value:1698400.25,asOf:'2026-08-31',confidence:'high',reason:'Across accounts.'}
],unread:''};
const credentials={get:async()=>'synthetic-preview-token-at-least-32-characters'};
// Each state is one vault, so the three can sit side by side on one page.
const vault=({answer='open'}={})=>{
  let open=false;
  return {idleMs:900000,available:()=>true,unlocked:()=>open,touch(){},lock(){open=false;},
    async key(){
      if(answer==='wait')return new Promise(()=>{});
      if(answer==='dismiss')throw Object.assign(Error('Synthetic dismissal'),{name:'NotAllowedError'});
      open=true;
      return crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'AES-GCM',false,['encrypt','decrypt']);
    },
    async unlockWithRecoveryCode(){open=true;return this.key();},
    recoveryCode:()=>'EV1-SYNTHETIC0000-SYNTHETIC0000-SYNTHETIC0000-0000'};
};
const root=document.getElementById('gate-states');
// The open state is shown once per registered account site, so a site added to
// the registry brings its own snapshot prompt to this page to be reviewed
// rather than sitting behind whichever one happens to be listed first. The last
// two are the quiet arrival — the panel turning to Finance because the tab
// beside it is a finance page — with and without a site it can read, which is
// the difference between offering the snapshot and offering only the intake.
const states=[
  ['Waiting for the passkey sheet','wait',null,false],
  ['Sheet dismissed','dismiss',null,false],
  // The panel beside an ordinary page: no site to name, so reading the page is
  // offered by the one action in Read an update rather than a panel of its own.
  ['Open · beside a page that is not an account site','open',null,false],
  ...ACCOUNT_SITES.map(site=>[`Open · beside a signed-in ${site.label} page`,'open',site,false]),
  ['Quiet · beside a signed-in Schwab page','open',ACCOUNT_SITES.find(site=>site.id==='schwab'),true],
  ['Quiet · beside a finance page with no reader','open',null,true]
];
for(const [label,answer,site,quiet] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const tool=mountFinance(host,{vault:vault({answer}),credentials,offline,quiet,
    // The open state stands in for the sidebar, the one host that sits beside a
    // logged-in account page, so the page action can be reviewed too.
    ...(answer==='open'?{readPage:async()=>({text:'Synthetic balances from the open page',host:'accounts.example',title:'',trimmed:0,tables:1})}:{}),
    remote:async(token,path)=>path.endsWith('/finance-intake')?reading:({connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]})});
  // The open state also stands in for arriving at Finance because the tab beside
  // the panel is an account site the owner is already signed in to.
  if(site)tool.site(site);
  // The pane a preview runs in reports itself hidden, which is exactly when the
  // gate declines to raise a sheet, so each state is driven from its button.
  host.querySelector('.vault-gate button')?.click();
}
