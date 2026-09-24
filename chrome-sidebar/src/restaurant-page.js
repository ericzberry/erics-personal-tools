import {mountRestaurants} from './restaurants.js';
import {reservationBrowser} from './reservation-browser.js';
import {restaurantHistory} from './restaurant-history.js';
import {deviceCredentials} from './cloud-storage.js';
import {aiConnections} from './ai-connection.js';
// The extension's restaurant page: the shared search, given the things only
// the installed extension has — the message bridge to the Worker, the tabs
// it may open and read, and the device's encrypted history.
const api=globalThis.chrome?.runtime?.id?globalThis.chrome:null;
async function request(action,data={}){
  if(!api)throw Error('Open this workspace from the installed Chrome extension to use your saved connection and live booking pages.');
  // Activity is bounded to this pending research call; Chrome can otherwise retire
  // the message bridge while a web-search response is still being generated.
  const heartbeat=action==='restaurants'?setInterval(()=>{api.runtime.sendMessage({type:'ERIC_SETTINGS',action:'status'}).catch(()=>{});},15000):null;
  let response;
  try{response=await api.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});}finally{if(heartbeat)clearInterval(heartbeat);}
  if(!response?.ok)throw Error(response?.error||'Could not reach the extension service. Reload the extension and try again.');
  return response;
}
const connections=aiConnections({load:async()=>(await request('list')).connections,provider:'openai',need:'to research restaurants'});
const legacy=api?(await api.storage.local.get('restaurantSearchPreferences').catch(()=>({}))).restaurantSearchPreferences:null;
const credentials=api?deviceCredentials():{get:async()=>''};
const tool=mountRestaurants(document.getElementById('app'),{
  host:'chrome',credentials,
  read:async words=>(await request('restaurant-intent',{id:await connections.id(),...words})).reading,
  research:async intent=>request('restaurants',{id:await connections.id(),intent}),
  browser:api?reservationBrowser(api):null,
  openTab:api?async url=>(await api.tabs.create({url,active:true})).id:null,
  generate:api?async messages=>{const r=await request('generate',{id:await connections.id(),task:'restaurant.availability',messages,maxTokens:2000});if(r.warning)throw Error(r.warning);return r.text;}:null,
  history:api?restaurantHistory():null,
  defaults:{city:legacy?.city||'New York City',neighborhood:legacy?.neighborhood||'',includeLongTravel:!!legacy?.includeLongTravel},
  connectionNote:()=>api?connections.note():Promise.resolve('Preview only. Open the installed extension for live search.')
});
await tool.open();
