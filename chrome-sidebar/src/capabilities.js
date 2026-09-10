// Shared data destinations used by desktop and mobile.
// Every entry in both lists needs an `icon`: a 24x24 stroked SVG path drawn with
// currentColor. The mobile launcher and the sidebar Tools menu both render one
// per entry, so a capability without an icon is incomplete in either host.
// `section` groups an entry under a named group in both hosts; entries without
// one stay in the main, unlabelled group. A named section needs an icon here
// because the sidebar presents it as a menu row that opens to reveal its tools.
export const MISC_SECTION='Misc';
const SECTION_ICONS=new Map([[MISC_SECTION,'M6 12h.01 M12 12h.01 M18 12h.01']]);
export const CAPABILITIES = [
  {id:'travel',label:'Travel wallet',href:'travel.html',icon:'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8Z M9 8V5h6v3'},
  {id:'rewards',label:'Rewards & benefits',href:'rewards.html',icon:'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 9.7l5.4-.8L12 4Z'},
  {id:'cards',label:'Best card',href:'cards.html',icon:'M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3 10.5h18'},
  {id:'finance',label:'Finance',href:'finance.html',icon:'M4 20V10 M9.5 20V5 M15 20v-7 M20.5 20V8 M3 20h18'},
  {id:'personal',label:'Personal information',href:'personal.html',icon:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5 20a7 7 0 0 1 14 0'},
  {id:'rankings',label:'Player rankings',href:'data.html?capability=rankings',section:MISC_SECTION,icon:'M5 20v-6 M12 20V5 M19 20v-9'},
  {id:'restaurants',label:'Restaurants',href:'restaurants.html',icon:'M7 3v6a2 2 0 0 0 4 0V3 M9 3v4 M9 9v12 M17 21V3l3 4.5-3 4.5'}
];
// Alphabetical by label, for hosts that present tools as a flat list.
export const capabilitiesByName=[...CAPABILITIES].sort((a,b)=>a.label.localeCompare(b.label));
export const DEFAULT_CAPABILITY=CAPABILITIES[0].id;
// Groups entries for presentation: the unlabelled group first, then each named
// section in registry order. Both hosts render the same grouping.
export function capabilitySections(items=CAPABILITIES){
  const groups=new Map([[null,[]]]);
  for(const item of items){
    const title=item.section??null;
    if(!groups.has(title))groups.set(title,[]);
    groups.get(title).push(item);
  }
  return [...groups].filter(([,list])=>list.length).map(([title,list])=>({title,icon:title?SECTION_ICONS.get(title):null,items:list}));
}
// Gmail is not listed: it appears on its own when the active tab is Gmail.
export const capabilities=[
  {id:'auto',label:'Current tab',icon:'M6 3l11.5 7.6-4.8 1.4 2.6 5.4-2.7 1.3-2.6-5.4L6 16.4V3Z'},
  ...CAPABILITIES.map(({href,...rest})=>['travel','rewards'].includes(rest.id)?rest:{...rest,href}),
  {id:'football',label:'Fantasy football',section:MISC_SECTION,icon:'M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z M12 13.5V17 M8.5 20h7'}
];
