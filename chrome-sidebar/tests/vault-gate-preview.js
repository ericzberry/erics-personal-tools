// Local synthetic fixture for the passkey gate's states. Not copied into
// release builds. The gate, the ledger and their styles are the real modules;
// only the passkey itself is synthetic, so the states a person actually meets —
// waiting for the sheet, a dismissed sheet, and the open section — can be
// inspected at sidebar widths without a passkey provider.
import {mountFinance} from '../src/finance.js';
import {normalizeFinance} from '../src/finance-data.js';
import {ACCOUNT_SITES} from '../src/account-sites.js';
const records=[
  {kind:'brokerage',name:'Synthetic brokerage',institution:'Synthetic Securities',owner:'Test owner',value:1284000,asOf:'2026-08-31'},
  {kind:'mortgage',name:'Synthetic mortgage on a long property name',institution:'Synthetic Bank',owner:'Test owner',value:412500,asOf:'2026-08-31'}
].map((record,index)=>({...normalizeFinance(record),id:`0000000${index}-0000-4000-8000-00000000000${index}`,revision:'first'}));
const offline={request:async()=>({records}),resolve:async()=>({records})};
// What a signed-in account page reads back as, so the snapshot prompt and the
// figures it produces can be inspected without an account or a model call.
const reading={updates:[
  {name:'Synthetic brokerage',institution:'Synthetic Securities',owner:'',kind:'brokerage',currency:'USD',value:1286400.25,asOf:'2026-08-31',confidence:'high',reason:'Net account value.'},
  {name:'Synthetic rollover IRA with a long account name',institution:'Synthetic Securities',owner:'',kind:'retirement',currency:'USD',value:412000,asOf:'2026-08-31',confidence:'medium',reason:'Total value.'}
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
// rather than sitting behind whichever one happens to be listed first.
const states=[
  ['Waiting for the passkey sheet','wait',null],
  ['Sheet dismissed','dismiss',null],
  ...ACCOUNT_SITES.map(site=>[`Open · beside a signed-in ${site.label} page`,'open',site])
];
for(const [label,answer,site] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const tool=mountFinance(host,{vault:vault({answer}),credentials,offline,
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
