import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {SCHEMA_VERSION,legacyIntent,venueFromLegacy} from './restaurant-data.js';
// What a device keeps of its restaurant searches (docs/RESTAURANT_SEARCH_SPEC.md
// §10): the last ten, for thirty days, each with the venues it found, the
// facts read about them and the availability observed — observations for a
// day, since a table seen yesterday is history. It is read-only downloaded
// research: nothing queues, so a disconnect never waits on it. Registered in
// private-resources.js under `restaurants`, which is what clears it.
export const RESTAURANT_HISTORY='restaurants';
export const LEGACY_RESTAURANT_CACHE='restaurant-research.v1';
export const HISTORY_LIMITS=Object.freeze({searches:10,searchMs:30*86400000,observationMs:86400000});
export function restaurantHistory({store=encryptedDeviceStore(),remote=cloudRequest,locks=globalThis.navigator?.locks,now=()=>Date.now()}={}){
  let chain=Promise.resolve();
  const exclusive=action=>{
    const run=()=>locks?locks.request(`erics-data:${RESTAURANT_HISTORY}`,action):action();
    const result=chain.then(run,run);chain=result.catch(()=>{});return result;
  };
  const prune=state=>{
    const cutoff=now()-HISTORY_LIMITS.searchMs,observed=now()-HISTORY_LIMITS.observationMs;
    state.searches=(state.searches||[]).filter(s=>Date.parse(s.updatedAt||s.researchedAt||0)>cutoff).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,HISTORY_LIMITS.searches);
    for(const s of state.searches)s.observations=(s.observations||[]).filter(o=>Date.parse(o.observedAt||0)>observed);
    return state;
  };
  // The previous version kept one downloaded shortlist. It comes forward as a
  // dated search whose evidence is leads, never as verified v2 facts, and the
  // old copy is removed only once the new one is written.
  async function migrate(token){
    const legacy=await store.read(LEGACY_RESTAURANT_CACHE,token).catch(()=>null);
    if(!legacy?.research)return null;
    const intent=legacyIntent(legacy.search||{});
    const search={schemaVersion:SCHEMA_VERSION,id:intent.id,legacy:true,intent,candidates:(legacy.research.restaurants||[]).map(item=>venueFromLegacy(item,{city:intent.city.name})),observations:[],clarification:String(legacy.research.clarification||''),researchedAt:legacy.downloadedAt||new Date(now()).toISOString(),updatedAt:legacy.downloadedAt||new Date(now()).toISOString()};
    const state={schemaVersion:SCHEMA_VERSION,searches:[search]};
    await store.write(RESTAURANT_HISTORY,token,state);
    await store.remove(LEGACY_RESTAURANT_CACHE,token).catch(()=>{});
    return state;
  }
  async function load(token){
    const state=await store.read(RESTAURANT_HISTORY,token);
    if(state&&state.schemaVersion!==SCHEMA_VERSION)throw Error('This device holds restaurant searches from a newer version. Update the app.');
    return prune(state||await migrate(token)||{schemaVersion:SCHEMA_VERSION,searches:[]});
  }
  return {
    resource:'restaurants',
    read:token=>token?exclusive(()=>load(token)):Promise.resolve({schemaVersion:SCHEMA_VERSION,searches:[]}),
    latest:token=>token?exclusive(async()=>(await load(token)).searches[0]||null):Promise.resolve(null),
    // A search is written whole under its own id; a later revision replaces it,
    // and a reply for a search that is no longer the latest still lands on its
    // own record rather than on whatever is showing (§3.5).
    write:(token,search)=>exclusive(async()=>{
      if(!token)throw Error('Connect with your private access token first.');
      const state=await load(token);
      const record={...search,schemaVersion:SCHEMA_VERSION,updatedAt:new Date(now()).toISOString()};
      state.searches=[record,...state.searches.filter(s=>s.id!==record.id)];
      await store.write(RESTAURANT_HISTORY,token,prune(state));
      return record;
    }),
    disconnect:token=>exclusive(async()=>{await store.remove(RESTAURANT_HISTORY,token);await store.remove(LEGACY_RESTAURANT_CACHE,token).catch(()=>{});}),
    hasPending:async()=>false
  };
}
