import {REWARDS_KEY,validateReward} from './rewards-data.js';
export async function rewardsRequest(action,data={}){
  const result=await chrome.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});
  if(!result?.ok)throw Error(result?.error||'Rewards sync is unavailable.');
  return result;
}
// Retain the local source until the cloud acknowledges every migrated record.
// Stable IDs make a retry safe even after an interrupted acknowledgement.
export async function loadRewards(storage,request=rewardsRequest){
  let cloud=await request('rewards-list');
  const local=(await storage.get(REWARDS_KEY))[REWARDS_KEY];
  if(Array.isArray(local)&&local.length){
    const ids=new Set(cloud.entries.map(e=>e.id));
    const missing=local.filter(e=>!ids.has(e.id)).map(e=>validateReward(e,e.updatedAt));
    if(missing.length)cloud=await request('rewards-save',{entries:[...cloud.entries,...missing],revision:cloud.revision});
    if(!local.every(e=>cloud.entries.some(saved=>saved.id===e.id)))throw Error('Cloud migration was not confirmed. Local rewards are preserved.');
    await storage.remove(REWARDS_KEY);
  }
  return cloud;
}
