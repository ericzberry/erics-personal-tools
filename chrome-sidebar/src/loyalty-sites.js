// The loyalty programs this tool recognizes, so a balance can be read off the
// page the owner already has open.
//
// A program here is the airline, hotel or issuer currency a balance is kept in:
// MileagePlus miles, Bonvoy points, Membership Rewards points. The registry
// answers one question and costs one URL comparison to answer it — is the tab
// beside the panel a program's own site? — and that is all the wallet needs to
// offer the reading. Nothing is read, requested, or signed into to decide it.
//
// Reading the balance itself is the same errand Finance already runs for an
// account page: one snapshot of the visible page, taken only when the owner
// presses for it, through `finance-page-read.js`. No session, cookie or
// credential leaves the browser, and nothing is saved by reading.
//
// An entry is one program: the hosts it is recognized by, the name a wallet
// entry should carry, who provides it, the unit the balance is counted in, and
// the page its balance is printed on. The unit is what makes miles and points
// add up separately; the URL is what saves hunting for the balance through a
// marketing site every time, and it is the published account page, so a visit
// without a session lands on the program's own sign-in and returns there.
export const LOYALTY_UNITS=['miles','points','Avios'];
export const LOYALTY_PROGRAMS=[
  // Airlines.
  {id:'united',label:'MileagePlus',source:'United Airlines',unit:'miles',hosts:['united.com'],
    url:'https://www.united.com/en/us/myunited'},
  {id:'delta',label:'SkyMiles',source:'Delta Air Lines',unit:'miles',hosts:['delta.com'],
    url:'https://www.delta.com/us/en/skymiles/my-skymiles/overview'},
  {id:'american',label:'AAdvantage',source:'American Airlines',unit:'miles',hosts:['aa.com'],
    url:'https://www.aa.com/loyalty/myaccount/landing'},
  {id:'alaska',label:'Mileage Plan',source:'Alaska Airlines',unit:'miles',hosts:['alaskaair.com'],
    url:'https://www.alaskaair.com/account'},
  {id:'southwest',label:'Rapid Rewards',source:'Southwest Airlines',unit:'points',hosts:['southwest.com'],
    url:'https://www.southwest.com/myaccount'},
  {id:'jetblue',label:'TrueBlue',source:'JetBlue',unit:'points',hosts:['jetblue.com'],
    url:'https://www.jetblue.com/trueblue'},
  {id:'british-airways',label:'Executive Club',source:'British Airways',unit:'Avios',hosts:['britishairways.com'],
    url:'https://www.britishairways.com/travel/execclub/executive-club-dashboard/public/en_us'},
  {id:'virgin-atlantic',label:'Flying Club',source:'Virgin Atlantic',unit:'points',hosts:['virginatlantic.com'],
    url:'https://www.virginatlantic.com/flying-club/my-account'},
  {id:'flying-blue',label:'Flying Blue',source:'Air France-KLM',unit:'miles',hosts:['flyingblue.com','airfrance.us','klm.com'],
    url:'https://www.flyingblue.com/en/my-account'},
  {id:'aeroplan',label:'Aeroplan',source:'Air Canada',unit:'points',hosts:['aircanada.com','aeroplan.com'],
    url:'https://account.aircanada.com/'},
  {id:'miles-and-more',label:'Miles & More',source:'Lufthansa',unit:'miles',hosts:['miles-and-more.com'],
    url:'https://www.miles-and-more.com/row/en/account.html'},
  {id:'emirates',label:'Skywards',source:'Emirates',unit:'miles',hosts:['emirates.com'],
    url:'https://www.emirates.com/account/english/my-account/'},
  {id:'krisflyer',label:'KrisFlyer',source:'Singapore Airlines',unit:'miles',hosts:['singaporeair.com'],
    url:'https://www.singaporeair.com/krisflyer/myAccount.form'},
  {id:'amtrak',label:'Guest Rewards',source:'Amtrak',unit:'points',hosts:['amtrak.com'],
    url:'https://www.amtrak.com/guest-rewards'},
  // Hotels.
  {id:'marriott',label:'Bonvoy',source:'Marriott',unit:'points',hosts:['marriott.com'],
    url:'https://www.marriott.com/loyalty/myAccount/default.mi'},
  {id:'hilton',label:'Hilton Honors',source:'Hilton',unit:'points',hosts:['hilton.com'],
    url:'https://www.hilton.com/en/hilton-honors/guest/my-account/'},
  {id:'hyatt',label:'World of Hyatt',source:'Hyatt',unit:'points',hosts:['hyatt.com'],
    url:'https://www.hyatt.com/myhyatt'},
  {id:'ihg',label:'IHG One Rewards',source:'IHG',unit:'points',hosts:['ihg.com'],
    url:'https://www.ihg.com/onerewards/content/us/en/account/dashboard'},
  {id:'wyndham',label:'Wyndham Rewards',source:'Wyndham',unit:'points',hosts:['wyndhamhotels.com'],
    url:'https://www.wyndhamhotels.com/wyndham-rewards/account/summary'},
  {id:'choice',label:'Choice Privileges',source:'Choice Hotels',unit:'points',hosts:['choicehotels.com'],
    url:'https://www.choicehotels.com/choice-privileges/account'},
  {id:'accor',label:'ALL Accor',source:'Accor',unit:'points',hosts:['all.accor.com','accor.com'],
    url:'https://all.accor.com/loyalty-program/my-account/index.en.shtml'},
  // Issuer currencies. These sites are recognized by Finance too: a card page
  // is both where a statement balance is and where a points balance is, and
  // the two readings are different errands that both belong to the tab.
  {id:'membership-rewards',label:'Membership Rewards',source:'American Express',unit:'points',hosts:['americanexpress.com'],
    url:'https://global.americanexpress.com/rewards/summary'},
  {id:'ultimate-rewards',label:'Ultimate Rewards',source:'Chase',unit:'points',hosts:['chase.com','ultimaterewards.com'],
    url:'https://ultimaterewards.chase.com/'},
  {id:'thankyou',label:'ThankYou Rewards',source:'Citi',unit:'points',hosts:['citi.com','thankyou.com'],
    url:'https://www.thankyou.com/'},
  {id:'capital-one-miles',label:'Capital One Miles',source:'Capital One',unit:'miles',hosts:['capitalone.com'],
    url:'https://myaccounts.capitalone.com/rewards'}
];

const hostMatches=(hostname,host)=>hostname===host||hostname.endsWith(`.${host}`);
// Is the tab beside the panel a loyalty program's own site? HTTPS only: a
// balance read over plain HTTP is not this program's.
export function loyaltySite(url){
  let parsed;
  try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:')return null;
  return LOYALTY_PROGRAMS.find(program=>program.hosts.some(host=>hostMatches(parsed.hostname,host)))||null;
}
export const loyaltyProgramById=id=>LOYALTY_PROGRAMS.find(program=>program.id===id)||null;
