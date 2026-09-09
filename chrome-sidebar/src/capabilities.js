// Shared data destinations used by desktop and mobile.
export const CAPABILITIES = [
  {id:'travel',label:'Travel wallet',href:'travel.html'},
  {id:'rules',label:'League rules',href:'data.html?capability=rules'},
  {id:'rankings',label:'Player rankings',href:'data.html?capability=rankings'},
  {id:'ai',label:'AI connections',href:'settings.html'},
  {id:'restaurants',label:'Restaurants',href:'restaurants.html'}
];
export const capabilities=[
  {id:'auto',label:'Current tab',description:'Follow Gmail and ESPN automatically'},
  ...CAPABILITIES.map(item=>item.id==='travel'?{id:item.id,label:item.label}:item),
  {id:'rewards',label:'Rewards & benefits',description:'Accounts, points, credits, and discounts'},
  {id:'gmail',label:'Gmail',description:'Read, summarize, and draft replies'},
  {id:'football',label:'Fantasy football',description:'Draft board and roster advice'}
];
