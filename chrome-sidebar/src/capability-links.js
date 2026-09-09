import {mountExtensionTravel} from './travel-page.js';
let mounted=false;
document.getElementById('navigate-travel')?.addEventListener('click',()=>{
  const root=document.getElementById('travel-tool');
  if(root&&!mounted){mountExtensionTravel(root);mounted=true;}
});

// Standalone settings/data pages use the same data registry in a native picker.
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
