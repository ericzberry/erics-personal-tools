// The real estate sites whose listing pages these tools recognize.
//
// Recognition is by URL alone. Every one of these sites serves a single
// property's page under a path shape of its own, and a search results page, a
// map or an agent's profile under another, so the path is enough to tell a
// listing from everything around it and no page has to be looked inside.
// Reading the listing itself stays what reading a page always is here: one
// snapshot of the visible text, taken only when the owner asks.
//
// Zillow's shape was checked against its live search pages. The others were not
// — each refuses automated browsing — and follow the detail-page URLs those
// sites are known to use. A page that matches but turns out not to be a listing
// costs one reading that comes back saying so, and nothing is saved.
export const LISTING_SITES=[
  {id:'zillow',label:'Zillow',hosts:['zillow.com'],listing:/^\/(homedetails|b)\//i},
  {id:'redfin',label:'Redfin',hosts:['redfin.com'],listing:/\/home\/\d+/i},
  {id:'realtor',label:'Realtor.com',hosts:['realtor.com'],listing:/^\/realestateandhomes-detail\//i},
  {id:'compass',label:'Compass',hosts:['compass.com'],listing:/^\/listing\//i},
  {id:'streeteasy',label:'StreetEasy',hosts:['streeteasy.com'],listing:/^\/(building\/[^/]+|sale\/\d+|rental\/\d+)/i},
  {id:'trulia',label:'Trulia',hosts:['trulia.com'],listing:/^\/(home|p)\//i},
  {id:'homes',label:'Homes.com',hosts:['homes.com'],listing:/^\/property\//i}
];
const hostMatches=(hostname,host)=>hostname===host||hostname.endsWith(`.${host}`);
export function listingSite(url){
  let parsed;
  try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:')return null;
  const site=LISTING_SITES.find(entry=>entry.hosts.some(host=>hostMatches(parsed.hostname,host)));
  return site&&site.listing.test(parsed.pathname)?site:null;
}
