import {CLOUD_URL} from './cloud-storage.js';
export const RELEASE_CHECK_INTERVAL=60*60*1000;
const CACHE_KEY='releaseCheck';
export function newerVersion(latest,current){
  const valid=value=>typeof value==='string'&&/^\d+(\.\d+){0,3}$/.test(value)&&value.split('.').every(n=>Number(n)<=65535);
  if(!valid(latest)||!valid(current))return false;
  const a=latest.split('.').map(Number),b=current.split('.').map(Number);
  for(let i=0;i<4;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return false;
}
export function releaseChecker(storage,{fetcher=fetch,now=Date.now}={}){
  let pending;
  async function check(){
    const cached=(await storage.get(CACHE_KEY))[CACHE_KEY]||{};
    const time=now();
    if(typeof cached.checkedAt==='number'&&time-cached.checkedAt<RELEASE_CHECK_INTERVAL)return cached;
    // Persist before networking, including failed attempts and browser restarts.
    let next={...cached,checkedAt:time};await storage.set({[CACHE_KEY]:next});
    try{
      const response=await fetcher(`${CLOUD_URL}/v1/releases/latest`,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Unavailable');
      const data=await response.json();
      if(typeof data.version==='string'&&/^\d+(\.\d+){0,3}$/.test(data.version)&&data.version.split('.').every(n=>Number(n)<=65535)){
        next={checkedAt:time,version:data.version};await storage.set({[CACHE_KEY]:next});
      }
    }catch{/* Keep last known version; update checks never interrupt the tool. */}
    return next;
  }
  return ()=>pending||(pending=check().finally(()=>{pending=null;}));
}
