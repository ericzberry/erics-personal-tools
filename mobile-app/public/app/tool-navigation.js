import {CapabilityMenu} from './shared/components/ui.js';
import {capabilitiesByName} from './shared/capabilities.js';

// Mobile opens on a home screen that is the icon grid itself, so the grid holds
// nothing but the tools. Once a tool or Settings is open the same icons move
// behind the hamburger, and Home reappears there as the way back.
export const SETTINGS_SCREEN='settings';
export function mountToolNavigation(previous,{onScreen}){
  const menu=CapabilityMenu(capabilitiesByName);
  previous.replaceWith(menu);
  const summary=menu.querySelector('#navigation-toggle');
  const current=menu.querySelector('#current-function');
  const tile=id=>menu.querySelector(`#navigate-${id}`);
  const settings=menu.querySelector('#open-settings');
  settings.setAttribute('aria-controls','capability-settings');
  const mark=(node,on)=>on?node.setAttribute('aria-current','page'):node.removeAttribute('aria-current');
  function show(screen,{focus=false}={}){
    // Home, and anything no longer in the registry, land on the home screen.
    const chosen=capabilitiesByName.find(item=>item.id===screen)||null;
    const settingsOpen=screen===SETTINGS_SCREEN;
    const home=!chosen&&!settingsOpen;
    for(const item of capabilitiesByName)mark(tile(item.id),item.id===chosen?.id);
    mark(tile('home'),false);
    mark(settings,settingsOpen);
    // The home screen is already home, so its own tile only exists as the way back.
    tile('home').hidden=home;
    // On the home screen the grid is the page, so it needs no closing rule.
    menu.classList.toggle('capability-navigation--home',home);
    summary.hidden=home;
    menu.open=home;
    current.textContent=settingsOpen?'Settings':chosen?chosen.label:'Home';
    onScreen(settingsOpen?SETTINGS_SCREEN:chosen?chosen.id:null);
    // A closed menu cannot hold focus, so a chosen screen focuses the hamburger.
    if(focus)(home?tile(capabilitiesByName[0].id):summary).focus({preventScroll:true});
  }
  show(null);
  for(const id of ['home',...capabilitiesByName.map(item=>item.id)])tile(id).addEventListener('click',()=>show(id,{focus:true}));
  settings.addEventListener('click',()=>show(SETTINGS_SCREEN,{focus:true}));
  menu.show=show;
  return menu;
}
