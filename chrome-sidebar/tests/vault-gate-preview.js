// Local synthetic fixture for the passkey gate's states. Not copied into
// release builds. The gate, the ledger and their styles are the real modules;
// only the passkey itself is synthetic, so the states a person actually meets —
// waiting for the sheet, a dismissed sheet, and the open section — can be
// inspected at sidebar widths without a passkey provider.
import {mountFinance} from '../src/finance.js';
import {normalizeFinance} from '../src/finance-data.js';
const records=[
  {kind:'brokerage',name:'Synthetic brokerage',institution:'Synthetic Securities',owner:'Test owner',value:1284000,asOf:'2026-08-31'},
  {kind:'mortgage',name:'Synthetic mortgage on a long property name',institution:'Synthetic Bank',owner:'Test owner',value:412500,asOf:'2026-08-31'}
].map((record,index)=>({...normalizeFinance(record),id:`0000000${index}-0000-4000-8000-00000000000${index}`,revision:'first'}));
const offline={request:async()=>({records}),resolve:async()=>({records})};
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
for(const [label,answer] of [['Waiting for the passkey sheet','wait'],['Sheet dismissed','dismiss'],['Open','open']]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  mountFinance(host,{vault:vault({answer}),credentials,offline,remote:async()=>({connections:[]})});
  // The pane a preview runs in reports itself hidden, which is exactly when the
  // gate declines to raise a sheet, so each state is driven from its button.
  host.querySelector('.vault-gate button')?.click();
}
