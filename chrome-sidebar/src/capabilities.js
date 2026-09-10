// Shared data destinations used by desktop and mobile.
// Every entry in both lists needs an `icon`: a 24x24 stroked SVG path drawn with
// currentColor. The mobile launcher and the sidebar Tools menu both render one
// per entry, so a capability without an icon is incomplete in either host.
export const CAPABILITIES = [
  {id:'travel',label:'Travel wallet',href:'travel.html',icon:'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8Z M9 8V5h6v3'},
  {id:'rewards',label:'Rewards & benefits',href:'rewards.html',icon:'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 9.7l5.4-.8L12 4Z'},
  {id:'cards',label:'Best card',href:'cards.html',icon:'M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3 10.5h18'},
  {id:'rules',label:'League rules',href:'data.html?capability=rules',icon:'M6 3h8l4 4v14H6V3Z M14 3v4h4 M9.5 12.5h5 M9.5 16.5h5'},
  {id:'rankings',label:'Player rankings',href:'data.html?capability=rankings',icon:'M5 20v-6 M12 20V5 M19 20v-9'},
  {id:'ai',label:'AI connections',href:'settings.html',icon:'M7 7h10v10H7V7Z M12 3v4 M12 17v4 M3 12h4 M17 12h4'},
  {id:'restaurants',label:'Restaurants',href:'restaurants.html',icon:'M7 3v6a2 2 0 0 0 4 0V3 M9 3v4 M9 9v12 M17 21V3l3 4.5-3 4.5'}
];
// Alphabetical by label, for hosts that present tools as a flat list.
export const capabilitiesByName=[...CAPABILITIES].sort((a,b)=>a.label.localeCompare(b.label));
export const DEFAULT_CAPABILITY=CAPABILITIES[0].id;
export const capabilities=[
  {id:'auto',label:'Current tab',description:'Follow Gmail and ESPN automatically',icon:'M6 3l11.5 7.6-4.8 1.4 2.6 5.4-2.7 1.3-2.6-5.4L6 16.4V3Z'},
  ...CAPABILITIES.map(item=>['travel','rewards'].includes(item.id)?{id:item.id,label:item.label,icon:item.icon}:item),
  {id:'gmail',label:'Gmail',description:'Read, summarize, and draft replies',icon:'M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3.5 7.5l8.5 6 8.5-6'},
  {id:'football',label:'Fantasy football',description:'Draft board and roster advice',icon:'M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z M12 13.5V17 M8.5 20h7'}
];
