import {CapabilityMenu} from './shared/components/ui.js';
import {capabilitiesByName} from './shared/capabilities.js';

// Mobile opens on a home screen that is the icon grid itself. Once a tool is
// open the same icons stay available, but only inside the Tools dropdown, so
// the tool keeps the screen.
export function mountToolNavigation(previous,{onSelect,onSettings}){
  const menu=CapabilityMenu(capabilitiesByName);
  previous.replaceWith(menu);
  const summary=menu.querySelector('#navigation-toggle');
  const current=menu.querySelector('#current-function');
  const tile=id=>menu.querySelector(`#navigate-${id}`);
  const settings=menu.querySelector('#open-settings');
  settings.setAttribute('aria-controls','capability-settings');
  function select(id,{focus=false}={}){
    // Home, and anything no longer in the registry, land on the home screen.
    const chosen=capabilitiesByName.find(item=>item.id===id)||null;
    for(const item of capabilitiesByName){
      if(item.id===chosen?.id)tile(item.id).setAttribute('aria-current','page');
      else tile(item.id).removeAttribute('aria-current');
    }
    if(chosen)tile('home').removeAttribute('aria-current');
    else tile('home').setAttribute('aria-current','page');
    summary.hidden=!chosen;
    menu.open=!chosen;
    current.textContent=chosen?chosen.label:'Home';
    onSelect(chosen?chosen.id:null);
    // A closed dropdown cannot hold focus, so a chosen tool focuses the toggle.
    if(focus)(chosen?summary:tile('home')).focus({preventScroll:true});
  }
  select(null);
  for(const id of ['home',...capabilitiesByName.map(item=>item.id)])tile(id).addEventListener('click',()=>select(id,{focus:true}));
  settings.addEventListener('click',()=>onSettings());
  return menu;
}
