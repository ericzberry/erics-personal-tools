import {mountExtensionTravel} from './travel-page.js';
let mounted=false;
// Settings shows the wallet's connection panel, so Settings mounts it too.
export function mountTravelTool(){
  const root=document.getElementById('travel-tool');
  if(root&&!mounted){mountExtensionTravel(root);mounted=true;}
}
document.getElementById('navigate-travel')?.addEventListener('click',mountTravelTool);

// Finance opens in the sidebar, beside the account page it reads. The tool is
// built on first use so a sidebar that never opens it pays nothing for it.
let finance=null;
export function openFinanceTool(){
  const root=document.getElementById('finance-tool');
  if(!root)return null;
  finance??=(async()=>{
    const [{mountExtensionFinance},{readOpenAccountPage}]=await Promise.all([import('./finance-page.js'),import('./finance-page-read.js')]);
    return mountExtensionFinance(root,{readPage:()=>readOpenAccountPage(),onSettings:()=>document.getElementById('open-settings')?.click()});
  })();
  return finance;
}
// Whoever is already mounted, without building the tool to ask. Arriving at
// Finance asks for the passkey, so nothing may mount it except a deliberate
// arrival — a tab that has stopped being an account page included.
export const mountedFinanceTool=()=>finance;
document.getElementById('navigate-finance')?.addEventListener('click',openFinanceTool);

// Standalone settings/data pages use the same data registry in the shared formatted picker.
const {CAPABILITIES}=await import('./capabilities.js');
const picker=document.getElementById('capability-picker');
picker?.addEventListener('change',()=>{
  const capability=CAPABILITIES.find(c=>c.id===picker.value);
  if(capability){
    if(globalThis.chrome?.tabs?.create&&location.protocol==='chrome-extension:')chrome.tabs.create({url:chrome.runtime.getURL(capability.href)});
    else location.assign(capability.href);
  }
  picker.value='';
});
