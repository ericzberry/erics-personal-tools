import {readReservationPage} from './reservation-reader.js';
import {bookingProvider,safePublicURL} from './restaurant-search.js';
import {LIMITS} from './restaurant-data.js';
const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Stopped','AbortError'));return;}
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});
});
// Owned tabs only (docs/RESTAURANT_SEARCH_SPEC.md §7.1, §7.3): a check opens
// its own background tab and closes it; a tab the owner opened is read on
// request and never navigated or closed. A page is ready when its reservation
// region has settled or it has said something explicit, within the readiness
// limit; a fixed wait is the fallback, not the rule.
export function reservationBrowser(api,{readiness=LIMITS.readinessMs,now=Date.now}={}) {
  const owned=new Set();
  async function snapshot(tabId,expectedURL) {
    const tab=await api.tabs.get(tabId);
    if(!safePublicURL(tab.url)||new URL(tab.url).origin!==new URL(expectedURL).origin)throw Error('The booking tab moved to a different site. Open its booking link to start again.');
    const results=await api.scripting.executeScript({target:{tabId},func:readReservationPage});
    const page=results[0]?.result;if(!page)throw Error('Chrome could not read this booking page. Check extension site access.');
    if(new URL(page.url).origin!==new URL(expectedURL).origin)throw Error('The page changed while being read. Recheck the booking page.');
    return page;
  }
  const settled=page=>!page.loading&&page.text.length>80;
  const recognised=page=>(page.controls||[]).some(c=>c.region==='reservation');
  return {
    async open(job,signal) {
      signal?.throwIfAborted();
      const target=job.searchURL;
      const tab=await api.tabs.create({url:target,active:false});owned.add(tab.id);
      const started=now();
      try {
        let prior='',stable=0,page;
        while(now()-started<readiness){
          await pause(700,signal);const current=await api.tabs.get(tab.id);
          if(current.status!=='complete')continue;
          page=await snapshot(tab.id,target);
          const signature=JSON.stringify([page.text.length,page.controls.map(c=>[c.text,c.disabled,c.region]),page.loading]);
          stable=signature===prior?stable+1:0;prior=signature;
          // A recognised widget that has held still once is read; a page with
          // no widget gets a second still sample in case it is still drawing.
          if(settled(page)&&(recognised(page)?stable>=1:stable>=2))return {tabId:tab.id,url:target,snapshot:page};
        }
        if(!page)throw Error(`The booking page did not load within ${Math.round(readiness/1000)} seconds. Open it and recheck.`);
        return {tabId:tab.id,url:target,snapshot:page,timedOut:true};
      } catch(error){error.tabId=tab.id;error.url=target;throw error;}
    },
    async read(tabId,url){return snapshot(tabId,url);},
    async focus(tabId){const tab=await api.tabs.get(tabId);await api.tabs.update(tabId,{active:true});await api.windows.update(tab.windowId,{focused:true});},
    async close(tabId){if(owned.has(tabId)){owned.delete(tabId);await api.tabs.remove(tabId).catch(()=>{});}},
    async closeAll(){await Promise.all([...owned].map(async id=>{owned.delete(id);await api.tabs.remove(id).catch(()=>{});}));},
    owns:tabId=>owned.has(tabId),
    provider:bookingProvider
  };
}
