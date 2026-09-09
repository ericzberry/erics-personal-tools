import {CAPABILITIES} from './capabilities.js';
const picker=document.getElementById('capability-picker');
picker?.addEventListener('change',()=>{
  const capability=CAPABILITIES.find(c=>c.id===picker.value);
  if(capability){
    if(globalThis.chrome?.tabs?.create&&location.protocol==='chrome-extension:')chrome.tabs.create({url:chrome.runtime.getURL(capability.href)});
    else location.assign(capability.href);
  }
  picker.value='';
});
