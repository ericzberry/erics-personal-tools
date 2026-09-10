import {CapabilityLauncher} from './shared/components/ui.js';
import {capabilitiesByName,DEFAULT_CAPABILITY} from './shared/capabilities.js';

// Mobile opens straight onto the tools: a grid of small icons in alphabetical
// order, so no tool is hidden behind an unopened menu.
export function mountToolNavigation(previous,{onSelect,onSettings,storage=localStorage}){
  const launcher=CapabilityLauncher(capabilitiesByName,{settings:true});
  previous.replaceWith(launcher);
  const tile=id=>launcher.querySelector(`#navigate-${id}`);
  const settings=launcher.querySelector('#open-settings');
  settings.setAttribute('aria-controls','capability-settings');
  function select(id,{focus=false}={}){
    // A tool saved on desktop, or removed since, falls back to the default.
    if(!capabilitiesByName.some(item=>item.id===id))id=DEFAULT_CAPABILITY;
    for(const item of capabilitiesByName){
      if(item.id===id)tile(item.id).setAttribute('aria-current','page');
      else tile(item.id).removeAttribute('aria-current');
    }
    onSelect(id);
    if(focus)tile(id).focus({preventScroll:true});
    try{storage.setItem('mobile-selected-tool',id);}catch{/* Navigation works without persistence. */}
  }
  let saved;
  try{saved=storage.getItem('mobile-selected-tool');}catch{/* Use the default tool. */}
  select(saved);
  for(const item of capabilitiesByName)tile(item.id).addEventListener('click',()=>select(item.id,{focus:true}));
  settings.addEventListener('click',()=>onSettings());
  return launcher;
}
