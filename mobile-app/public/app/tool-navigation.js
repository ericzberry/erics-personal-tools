import {CapabilityMenu} from './shared/components/ui.js';
import {APP_AREAS,areaDestination,areaForCapability,CAPABILITIES,CAPABILITY_ALIASES} from './shared/capabilities.js';
export const SETTINGS_SCREEN='settings';
export function mountToolNavigation(previous,{onScreen}){
  const bar=CapabilityMenu();previous.replaceWith(bar);
  const settings=bar.querySelector('#open-settings');settings.setAttribute('aria-controls','capability-settings');
  const known=new Set(['home','info','more','documents',...CAPABILITIES.map(c=>c.id)]);
  function show(screen,{focus=false,area='',view=''}={}){
    const alias=CAPABILITY_ALIASES[screen];if(alias){screen=alias.capability;view=alias.view;}
    screen=areaDestination(screen||'home');if(screen==='attention')screen='home';
    if(screen!==SETTINGS_SCREEN&&!known.has(screen))screen='home';
    const active=APP_AREAS.find(a=>a.id===area)||areaForCapability(screen);
    for(const item of APP_AREAS){const tab=bar.querySelector(`#navigate-area-${item.id}`);if(screen!==SETTINGS_SCREEN&&item.id===active.id)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
    if(screen===SETTINGS_SCREEN)settings.setAttribute('aria-current','page');else settings.removeAttribute('aria-current');
    onScreen(screen,{area,view,focus});
  }
  for(const item of APP_AREAS)bar.querySelector(`#navigate-area-${item.id}`).addEventListener('click',()=>show(item.default,{focus:true}));
  settings.addEventListener('click',()=>show(SETTINGS_SCREEN,{focus:true}));
  bar.show=show;return bar;
}
