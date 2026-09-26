import {CapabilityMenu} from './shared/components/ui.js';
import {APP_AREAS,areaDestination,areaForCapability,CAPABILITIES,CAPABILITY_ALIASES} from './shared/capabilities.js';
export const SETTINGS_SCREEN='settings';
export function mountToolNavigation(previous,{onScreen}){
  const menu=CapabilityMenu();previous.replaceWith(menu);
  const summary=menu.querySelector('#navigation-toggle'),current=menu.querySelector('#current-function');
  const settings=menu.querySelector('#open-settings');settings.setAttribute('aria-controls','capability-settings');
  const known=new Set(['home','info','more','documents',...CAPABILITIES.map(c=>c.id)]);
  function show(screen,{focus=false,area='',view=''}={}){
    const alias=CAPABILITY_ALIASES[screen];if(alias){screen=alias.capability;view=alias.view;}
    screen=areaDestination(screen||'home');if(screen==='attention')screen='home';
    if(screen!==SETTINGS_SCREEN&&!known.has(screen))screen='home';
    const active=APP_AREAS.find(a=>a.id===area)||areaForCapability(screen);
    for(const item of APP_AREAS){const tile=menu.querySelector(`#navigate-area-${item.id}`);if(screen!==SETTINGS_SCREEN&&item.id===active.id)tile.setAttribute('aria-current','page');else tile.removeAttribute('aria-current');}
    menu.open=false;current.textContent=screen===SETTINGS_SCREEN?'Settings':active.label;
    onScreen(screen,{area,view});
    if(focus)summary.focus({preventScroll:true});
  }
  for(const item of APP_AREAS)menu.querySelector(`#navigate-area-${item.id}`).addEventListener('click',()=>show(item.default,{focus:true}));
  settings.addEventListener('click',()=>show(SETTINGS_SCREEN,{focus:true}));
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.open=false;});
  menu.show=show;return menu;
}
