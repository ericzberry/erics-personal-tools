import {mountExtensionTravel} from './travel-page.js';
import {showSettings} from './navigation.js';
let mounted=false;
document.getElementById('navigate-travel')?.addEventListener('click',()=>{
  const root=document.getElementById('travel-tool');
  if(root&&!mounted){mountExtensionTravel(root);mounted=true;}
});

// Finance opens in the sidebar, beside the account page it reads. The tool is
// built on first use so a sidebar that never opens it pays nothing for it.
let finance=null;
document.getElementById('navigate-finance')?.addEventListener('click',async()=>{
  const root=document.getElementById('finance-tool');
  if(!root||finance)return;
  finance=(async()=>{
    const [{mountExtensionFinance},{readOpenAccountPage}]=await Promise.all([import('./finance-page.js'),import('./finance-page-read.js')]);
    return mountExtensionFinance(root,{readPage:()=>readOpenAccountPage(),onSettings:()=>showSettings(true)});
  })();
});

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
