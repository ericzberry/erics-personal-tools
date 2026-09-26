import {Stack,Button,ActionGroup,Tabs,CapabilityLauncher,PageHeader} from './ui.js';
import {APP_AREAS,areaForCapability,capabilityLabel,CAPABILITIES,capabilities} from '../capabilities.js';
// Content stays mounted when an area changes. Each tab owns its actual panel,
// preserving unsaved inputs and keeping aria-controls tied to visible content.
export function AreaWorkspace({rootFor,onSelect,mobile=false}){
  const groups=new Map();
  for(const area of APP_AREAS){
    const items=area.views.map(key=>({key,label:capabilityLabel(key),panel:rootFor(key)})).filter(item=>item.panel);
    groups.set(area.id,Tabs({id:`area-${area.id}`,label:area.label,items,onSelect}));
  }
  const back=Button('All info',{variant:'secondary',size:'compact'});
  const backRow=ActionGroup([back],{compact:true,hidden:true,className:'area-return'});
  let parent='info';back.addEventListener('click',()=>onSelect(APP_AREAS.find(a=>a.id===parent).default));
  const extra=Stack([],{className:'area-detail',hidden:true});
  const node=Stack([...groups.values(),backRow,extra],{className:'area-workspace'});
  // Tools outside the primary tabs (an Info editor, or a More tool) use a
  // single return path rather than growing another row of navigation.
  return Object.assign(node,{show(id,{area:override}={}){
    const area=APP_AREAS.find(a=>a.id===override)||areaForCapability(id);parent=area.id;
    const direct=area.views.includes(id);
    for(const [key,tabs] of groups){tabs.hidden=key!==area.id||!direct;if(!tabs.hidden){const root=rootFor(id);if(root&&!tabs.contains(root))tabs.append(root);tabs.select(id);}}
    backRow.hidden=direct;extra.hidden=direct;
    back.textContent=area.id==='info'?'All info':`Back to ${area.label}`;
    if(!direct){const root=rootFor(id);if(root){extra.append(root);root.hidden=false;}}
    // Previously opened details remain mounted, with only the current one shown.
    for(const child of extra.children)child.hidden=child!==rootFor(id)||direct;
    return area;
  }});
}
export function MoreView({mobile=false}={}){
  const items=(mobile?CAPABILITIES:capabilities).filter(c=>['restaurants','rankings','football'].includes(c.id));
  return Stack([PageHeader({title:'More'}),CapabilityLauncher(items.map(c=>({...c,section:null})),{id:'more-launcher',label:'More tools'})],{className:'travel-wallet'});
}
