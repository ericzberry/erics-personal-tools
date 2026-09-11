// Local synthetic fixture for the Taxes states. Not copied into release builds.
// The tool, its components and its styles are the real modules; only Drive, the
// reading and the dropped file are synthetic, so the states a person actually
// meets can be inspected at sidebar and page widths without a Google account.
import {mountTaxes} from '../src/taxes.js';

const token='synthetic-preview-token-at-least-32-characters';
const credentials={get:async()=>token};
const FILED=[
  {name:'Form 1099 - Schwab.pdf',modifiedTime:'2026-02-14T00:00:00.000Z',size:184000,webViewLink:'#'},
  {name:'K-1 - Averin Capital Fund I, LP.pdf',modifiedTime:'2026-03-02T00:00:00.000Z',size:2240000,webViewLink:'#'}
];
// One synthetic Worker per state, so the states can sit side by side.
const api=({connected=true,filed=FILED,existing=null}={})=>async(_token,path,options={})=>{
  if(path==='/v1/drive/status')return {connected,account:connected?'owner@example.com':'',configured:true,folderId:'synthetic'};
  if(path.startsWith('/v1/drive/filed'))return {year:'2025',files:filed};
  if(path==='/v1/ai-connections')return {connections:[{id:'synthetic','name':'Synthetic model',provider:'openai',hasApiKey:true}]};
  if(path.endsWith('/tax-intake'))return {type:'1099',issuer:'Schwab',year:'2025',confidence:'high',reason:'Read off the form header.'};
  if(path==='/v1/drive/plan')return {ticket:'synthetic',year:options.value.year,name:'Form 1099 - Schwab.pdf',folder:{id:'f',created:false},
    existing,keepBothName:'Form 1099 - Schwab (2).pdf'};
  return {};
};
const upload=async()=>({filed:{name:'Form 1099 - Schwab.pdf',year:'2025',id:'x',webViewLink:'#',size:184000,modifiedTime:'2026-09-11T00:00:00.000Z'},replaced:false});
// A dropped document, built here so the drop zone can be exercised without a
// file picker. Text rather than PDF, so the on-device extraction succeeds and
// the states after it can be seen.
const syntheticDocument=()=>new File(
  [new Blob(['2025 Form 1099-DIV\nPayer: Synthetic Brokerage\nRecipient: Test owner\nTotal ordinary dividends 1,284.00\n'.repeat(6)],{type:'text/plain'})],
  'statement-download.txt',{type:'text/plain'});

const root=document.getElementById('tax-states');
const states=[
  ['Drive not connected',{connected:false,filed:[]}],
  ['Connected, nothing dropped',{}],
  ['Document read, ready to file',{},'drop'],
  ['That name is already filed',{existing:{name:'Form 1099 - Schwab.pdf',modifiedTime:'2026-02-14T00:00:00.000Z',size:184000}},'conflict']
];
for(const [label,options,step] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:20px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const tool=mountTaxes(host,{credentials,remote:api(options),upload,openExternal:()=>true});
  if(step){
    await tool.refresh();
    // Drive the drop the way a person would, through the shared file-drop path.
    const zone=host.querySelector('#taxes-drop');
    zone.dispatchEvent(Object.assign(new Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[syntheticDocument()]}}));
    await new Promise(resolve=>setTimeout(resolve,300));
    if(step==='conflict')host.querySelector('#taxes-file-actions button')?.click();
    await new Promise(resolve=>setTimeout(resolve,200));
  }
}
