import {CapabilityNavigation} from './shared/components/ui.js';
import {CAPABILITIES} from './shared/capabilities.js';

// Reuse the extension menu, with only destinations that have mobile views.
export function mountToolNavigation(previous,{onSelect,onSettings,storage=localStorage}){
  const navigation=CapabilityNavigation(CAPABILITIES.map(({id,label})=>({id,label})));
  previous.replaceWith(navigation);
  const toggle=navigation.querySelector('#navigation-toggle');
  const settings=navigation.querySelector('#open-settings');
  settings.setAttribute('aria-controls','capability-settings');
  function select(id,{focus=false}={}){
    if(!CAPABILITIES.some(item=>item.id===id))id=CAPABILITIES[0].id;
    navigation.querySelector('#current-function').textContent=CAPABILITIES.find(item=>item.id===id).label;
    for(const item of CAPABILITIES){
      const row=navigation.querySelector(`#navigate-${item.id}`);
      if(item.id===id)row.setAttribute('aria-current','page');
      else row.removeAttribute('aria-current');
    }
    navigation.open=false;
    onSelect(id);
    if(focus)toggle.focus({preventScroll:true});
    try{storage.setItem('mobile-selected-tool',id);}catch{/* Navigation works without persistence. */}
  }
  let saved;
  try{saved=storage.getItem('mobile-selected-tool');}catch{/* Use the first tool. */}
  select(saved);
  for(const item of CAPABILITIES)navigation.querySelector(`#navigate-${item.id}`).addEventListener('click',()=>select(item.id,{focus:true}));
  settings.addEventListener('click',()=>{navigation.open=false;onSettings();});
  navigation.ownerDocument.addEventListener('pointerdown',event=>{if(!navigation.contains(event.target))navigation.open=false;});
  return navigation;
}
