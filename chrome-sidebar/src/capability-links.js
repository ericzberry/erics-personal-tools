import {selectTool} from './navigation.js';
import {mountExtensionTravel} from './travel-page.js';
import {CAPABILITIES} from './capabilities.js';
const picker=document.getElementById('capability-picker');
let mounted=false;
picker?.addEventListener('change',()=>{
  const capability=CAPABILITIES.find(c=>c.id===picker.value);
  const root=document.getElementById('travel-tool');
  if(root && (!capability || capability.id==='travel')){
    if(capability&&!mounted){mountExtensionTravel(root);mounted=true;}
    selectTool(capability?.id||'');return;
  }
  if(capability){
    if(globalThis.chrome?.tabs?.create&&location.protocol==='chrome-extension:')chrome.tabs.create({url:chrome.runtime.getURL(capability.href)});
    else location.assign(capability.href);
  }
  picker.value='';
});
