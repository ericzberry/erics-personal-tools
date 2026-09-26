import {aiConnections} from './ai-connection.js';
import {researchTrip,researchAll} from './trip-research.js';
import {travelBrowser} from './trip-browser.js';
import {tripSources} from './trip-data.js';
import {mountTrips} from './trips.js';
import {tripsOffline} from './trips-offline.js';
import {deviceCredentials,cloudRequest} from './cloud-storage.js';
import {createRewardsCapture} from './rewards-capture.js';
import {CapabilityPicker} from './components/capabilities.js';
export const mountExtensionTrips=(root,options={})=>{
  const api=globalThis.chrome?.runtime?.id?chrome:null;
  const request=async(action,data={})=>{const r=await api.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});if(!r?.ok)throw Error(r?.error||'Could not reach the research connection.');return r;};
  const connections=aiConnections({load:async()=>(await request('list')).connections,need:'for travel research'});
  const credentials=deviceCredentials();
  const fullPage=root.id==='trips-root';
  const params=new URLSearchParams(location.search);
  if(fullPage&&params.has('run')){const clean=new URL(location.href);clean.searchParams.delete('run');history.replaceState(null,'',clean.href);}
  const openResults=(trip,run='')=>api.tabs.create({url:api.runtime.getURL(`trips.html?trip=${encodeURIComponent(trip.id)}${run?'&run='+encodeURIComponent(run):''}`),active:true});
  const browser=api?travelBrowser(api):null;
  return mountTrips(root,{initialTrip:fullPage?params.get('trip'):'',autoResearch:fullPage?params.get('run'):'',onOpenResults:api&&!fullPage?trip=>openResults(trip):null,credentials,offline:tripsOffline(),research:api?args=>!fullPage?openResults(args.trip,args.channel).then(()=>args.trip):(args.channel==='all'?researchAll:researchTrip)({...args,channel:tripSources(args.trip).find(c=>c.id===args.channel),browser,onObservation:createRewardsCapture({
    entries:async()=>(await cloudRequest(await credentials.get(),'/v1/rewards')).entries||[],
    read:async value=>cloudRequest(await credentials.get(),`/v1/ai-connections/${await connections.id()}/balance-intake`,{method:'POST',value,timeoutMs:130000}),
    save:async(id,value)=>cloudRequest(await credentials.get(),`/v1/rewards/programs/${id}`,{method:'PUT',value})
  }),generate:async messages=>{
    const result=await request('generate',{id:await connections.id(),task:'travel.browser',messages});if(result.warning)throw Error(result.warning);return result.text;
  }}):null,...options});
};
const root=document.getElementById('trips-root');
if(root){
  document.getElementById('trips-navigation').replaceChildren(CapabilityPicker());
  mountExtensionTrips(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
