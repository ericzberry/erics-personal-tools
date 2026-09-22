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
  {id:'attention',label:'Needs attention',href:'attention.html',icon:'M9 4h6l6 16H3L9 4Z M12 9v5 M12 17h.01'},
  {id:'subscriptions',label:'Subscriptions & renewals',href:'subscriptions.html',icon:'M4 8a8 8 0 0 1 14-2l2 2 M20 3v5h-5 M20 16a8 8 0 0 1-14 2l-2-2 M4 21v-5h5'},
  {id:'sizes',label:'Clothing sizes',href:'sizes.html',icon:'M8.5 4 3 6.5 4.5 10 7 9v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9l2.5 1L21 6.5 15.5 4 M8.5 4a3.5 3.5 0 0 0 7 0'},
  {id:'replacements',label:'Replacement drawer',href:'replacements.html',icon:'M4 4h16v16H4V4Z M4 12h16 M10 8h4 M10 16h4'},
  {id:'gifts',label:'Gift ideas',href:'gifts.html',icon:'M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z M2.5 7.5h19V11h-19V7.5Z M12 7.5V21 M12 7.5C10.6 5 9.2 3.6 8 4.3c-1.2.8-.4 3.2 4 3.2Z M12 7.5c1.4-2.5 2.8-3.9 4-3.2 1.2.8.4 3.2-4 3.2Z'},
  {id:'reminders',label:'Reminders',href:'reminders.html',icon:'M12 4a5 5 0 0 0-5 5v3.4L5.5 16h13L17 12.4V9a5 5 0 0 0-5-5Z M10 19a2 2 0 0 0 4 0'},
  {id:'rewards',label:'Rewards & benefits',href:'rewards.html',icon:'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 9.7l5.4-.8L12 4Z'},
  {id:'finance',label:'Finance',href:'finance.html',icon:'M4 20V10 M9.5 20V5 M15 20v-7 M20.5 20V8 M3 20h18'},
  {id:'personal',label:'Personal information',href:'personal.html',icon:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5 20a7 7 0 0 1 14 0'},
  {id:'taxes',label:'Taxes',href:'taxes.html',icon:'M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M13 3v5h5 M9 13h6 M9 17h4'},
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
// The capabilities that mount inside the side panel rather than opening a tab.
export const PANEL_CAPABILITIES=['travel','rewards','finance','taxes','attention','subscriptions','gifts','sizes','replacements','reminders','personal'];
// Best card and Purchase advisor are Rewards' Pay view now. Their ids and
// pages stay as ways in — a bookmark, an older link, the strip — and land on
// that view rather than on a second calculator.
export const CAPABILITY_ALIASES=Object.freeze({cards:{capability:'rewards',view:'pay'},advisor:{capability:'rewards',view:'pay'}});
export const resolveCapability=id=>CAPABILITY_ALIASES[id]?.capability||id;
// Gmail is not listed: it appears on its own when the active tab is Gmail.
// Automatic mode has no menu row: it is the state the sidebar starts in, and
// the toggle names it, so listing it again would be a row for "no tool chosen".
export const AUTO_CAPABILITY={id:'auto',label:'Current tab'};
// The screen both hosts open on. It is not a tool, so it stays out of the
// registry, but both menus lead with it so it can be reached from any page.
export const HOME_CAPABILITY={id:'home',label:'Home',icon:'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z M9.5 21v-6h5v6'};
export const capabilities=[
  // The panel is where a tool belongs: beside the page the work came from. A
  // capability keeps its `href` only while it has no home in the panel yet.
  ...CAPABILITIES.map(({href,...rest})=>PANEL_CAPABILITIES.includes(rest.id)?rest:{...rest,href}),
  {id:'football',label:'Fantasy football',section:MISC_SECTION,icon:'M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z M12 13.5V17 M8.5 20h7'}
];
