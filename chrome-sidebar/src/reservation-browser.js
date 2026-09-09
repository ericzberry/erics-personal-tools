import {readReservationPage} from './reservation-reader.js';
import {bookingURL,bookingProvider,safePublicURL} from './restaurant-search.js';
const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Stopped','AbortError'));return;}
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});
});
export function reservationBrowser(api) {
  const owned=new Set();
  async function snapshot(tabId,expectedURL) {
    const tab=await api.tabs.get(tabId);
    if(!safePublicURL(tab.url)||new URL(tab.url).origin!==new URL(expectedURL).origin)throw Error('The booking tab moved to a different site. Open its booking link to start again.');
    const results=await api.scripting.executeScript({target:{tabId},func:readReservationPage});
    const page=results[0]?.result;if(!page)throw Error('Chrome could not read this booking page. Check extension site access.');
    if(new URL(page.url).origin!==new URL(expectedURL).origin)throw Error('The page changed while being read. Recheck the booking page.');
    return page;
  }
  return {
    async open(url,search,size,signal,time=search.startTime) {
      signal?.throwIfAborted();
      const target=bookingURL(url,search,size,time);
      // A dedicated background tab: never navigate, close, or repurpose a user's tab.
      const tab=await api.tabs.create({url:target,active:false});owned.add(tab.id);
      try {
        let prior='',stable=0,page;
        for(let i=0;i<18;i++){
          await pause(1000,signal);const current=await api.tabs.get(tab.id);
          if(current.status!=='complete')continue;
          page=await snapshot(tab.id,target);
          const signature=JSON.stringify([page.text,page.controls,page.loading]);
          stable=signature===prior?stable+1:0;prior=signature;
          if(stable>=2&&page.text.length>80&&!page.loading)return {tabId:tab.id,url:target,snapshot:page};
        }
        if(!page)throw Error('The booking page did not load within 18 seconds. Open it and recheck.');
        return {tabId:tab.id,url:target,snapshot:page};
      } catch(error){error.tabId=tab.id;error.url=target;throw error;}
    },
    async read(tabId,url){return snapshot(tabId,url);},
    async focus(tabId){const tab=await api.tabs.get(tabId);await api.tabs.update(tabId,{active:true});await api.windows.update(tab.windowId,{focused:true});},
    async close(tabId){if(owned.has(tabId)){owned.delete(tabId);await api.tabs.remove(tabId).catch(()=>{});}},
    async closeAll(){await Promise.all([...owned].map(async id=>{owned.delete(id);await api.tabs.remove(id).catch(()=>{});}));},
    provider:bookingProvider
  };
}
