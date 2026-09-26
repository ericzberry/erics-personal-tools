import {AreaWorkspace,MoreView} from './components/areas.js';
import {AUTO_CAPABILITY,HOME_CAPABILITY,capabilities,CAPABILITY_ALIASES,APP_AREAS,areaDestination,areaForCapability} from './capabilities.js';
// Home is chosen like any tool; it just is not one of the registry's entries.
const destinations=[HOME_CAPABILITY,...capabilities];
let currentTool='home',selection=AUTO_CAPABILITY.id,settingsOpen=false;
// Anyone who wants to know which tool is on screen now: the strip under the
// header, which must not offer what the owner is already looking at.
const navigated=new Set();
export function onNavigate(listener){navigated.add(listener);return()=>navigated.delete(listener);}
const $=id=>document.getElementById(id);
let workspace=null,areaOverride='';
const rootFor=id=>$(`${id==='documents'?'travel':id}-tool`);
function render(){
  if(workspace?.ownerDocument!==document)workspace=null;
  if(!workspace&&$('app')){
    $('more-tool').replaceChildren(MoreView());
    workspace=AreaWorkspace({rootFor,onSelect:choose});$('app').append(workspace);
  }
  const active=selection===AUTO_CAPABILITY.id?currentTool:selection;
  for(const key of ['football','gmail','home','info','more',...capabilities.map(c=>c.id)]){const node=rootFor(key);if(key==='attention')continue;if(node)node.hidden=settingsOpen||key!==(active==='documents'?'travel':active);}
  if(workspace){workspace.hidden=settingsOpen;workspace.show(active,{area:areaOverride});if(settingsOpen){const node=rootFor(active);if(node)node.hidden=true;}}
  $('settings-tool').hidden=!settingsOpen;
  const area=APP_AREAS.find(a=>a.id===areaOverride)||areaForCapability(active);
  $('current-function').textContent=settingsOpen?'Settings':selection===AUTO_CAPABILITY.id?AUTO_CAPABILITY.label:area.label;
  $('open-settings').setAttribute('aria-expanded',String(settingsOpen));
  for(const item of APP_AREAS){
    const node=$(`navigate-area-${item.id}`);
    if(!settingsOpen&&item.id===area.id)node?.setAttribute('aria-current','page');else node?.removeAttribute('aria-current');
  }
  for(const listener of navigated)listener(activeCapability());
}
// The capability actually on screen: the chosen one, or in Automatic mode
// whichever tool the tab is showing. The strip under the header reads this so
// it never offers to go where the owner already is.
export const activeCapability=()=>settingsOpen?'settings':selection===AUTO_CAPABILITY.id?currentTool:selection;
function closeNavigation(){ $('app-navigation').open=false; }
export function showTool(tool){currentTool=tool;render();}
export function showSettings(open){settingsOpen=open;closeNavigation();render();}
// A view a tool was asked for on the way in — Pay, for the old Best card and
// Purchase advisor ids — waits here until that tool takes it.
let requestedView='';
export const takeRequestedView=()=>{const view=requestedView;requestedView='';return view;};
export function selectCapability(id,{area=''}={}){
  areaOverride=area;
  if(id==='attention')id='home';
  id=areaDestination(id);
  const alias=CAPABILITY_ALIASES[id];
  if(alias){requestedView=alias.view;id=alias.capability;}
  selection=id;settingsOpen=false;closeNavigation();render();$('navigation-toggle').focus();
}
export function showRewards(open){selectCapability(open?'rewards':AUTO_CAPABILITY.id);}
const choose=id=>{selectCapability(id);import('./capability-links.js').then(async({openPanelTool})=>{const tool=await openPanelTool(id==='documents'?'travel':id);if(id==='travel'||id==='documents')tool?.setScope(id==='documents'?'documents':'memberships');});};
export function initializeNavigation(){
  render();
  for(const area of APP_AREAS)$(`navigate-area-${area.id}`).addEventListener('click',()=>choose(area.default));
  for(const item of capabilities.filter(c=>['restaurants','rankings','football'].includes(c.id)))$(`navigate-${item.id}`)?.addEventListener('click',()=>{
    if(item.href){if(globalThis.chrome?.tabs?.create)chrome.tabs.create({url:chrome.runtime.getURL(item.href)});else window.open(item.href,'_blank');}
    else selectCapability(item.id);
  });
  document.addEventListener('pointerdown',event=>{if(!$('app-navigation').contains(event.target))closeNavigation();});
  render();
}

export function selectTool(tool){selectCapability(tool||AUTO_CAPABILITY.id);}
