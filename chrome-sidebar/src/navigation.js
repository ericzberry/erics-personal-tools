import {capabilities} from './capabilities.js';
let currentTool='football',selection='auto',settingsOpen=false;
const $=id=>document.getElementById(id);
function render(){
  const active=selection==='auto'?currentTool:selection;
  for(const key of ['football','gmail','home','rewards','travel'])$(`${key}-tool`).hidden=settingsOpen||key!==active;
  $('settings-tool').hidden=!settingsOpen;
  $('current-function').textContent=settingsOpen?'Settings':selection==='auto'?'Current tab':capabilities.find(item=>item.id===selection)?.label;
  $('open-settings').setAttribute('aria-expanded',String(settingsOpen));
  for(const item of capabilities){
    const node=$(`navigate-${item.id}`);
    if(!settingsOpen&&selection===item.id){node.setAttribute('aria-current','page');node.closest('.capability-submenu')?.setAttribute('open','');}
    else node.removeAttribute('aria-current');
  }
}
function closeNavigation(){ $('app-navigation').open=false; }
export function showTool(tool){currentTool=tool;render();}
export function showSettings(open){settingsOpen=open;closeNavigation();render();}
export function selectCapability(id){selection=id;settingsOpen=false;closeNavigation();render();$('navigation-toggle').focus();}
export function showRewards(open){selectCapability(open?'rewards':'auto');}
export function initializeNavigation(){
  for(const item of capabilities)if(!item.href)$(`navigate-${item.id}`).addEventListener('click',()=>selectCapability(item.id));
  document.addEventListener('pointerdown',event=>{if(!$('app-navigation').contains(event.target))closeNavigation();});
  render();
}

export function selectTool(tool){selectCapability(tool||'auto');}
