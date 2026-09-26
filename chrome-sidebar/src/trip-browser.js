import {tripBrowserPage} from './trip-browser-page.js';
import {travelResearchURL} from './trip-data.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export {TRIP_CHANNELS} from './trip-data.js';
export function travelBrowser(api){
  const owned=new Set();let retained=null;
  const guard=(url,options)=>{const safe=travelResearchURL(url,options);if(!safe||/\/checkout|\/payment|\/purchase|\/confirmation|logout|signout/i.test(safe))throw Error('This link is outside travel research or contains sign-in credentials.');return safe;};
  async function ready(id,signal){for(let i=0;i<20;i++){signal?.throwIfAborted();if((await api.tabs.get(id)).status==='complete')return;await wait(500);}throw Error('The page is still loading. Resume when it is ready.');}
  return {
    async open(url,signal){let tab;if(retained!==null){try{tab=await api.tabs.update(retained,{url:guard(url),active:false});}catch{retained=null;}}if(!tab)tab=await api.tabs.create({url:guard(url),active:false});owned.add(tab.id);await ready(tab.id,signal);return tab.id;},
    async release(id){if(owned.has(id))retained=id;},
    async read(id,signal){if(!owned.has(id))throw Error('Use a research tab opened by this search.');await ready(id,signal);guard((await api.tabs.get(id)).url,{stripSecrets:true});const result=await api.scripting.executeScript({target:{tabId:id},func:tripBrowserPage});const page=result[0]?.result;if(page){page.url=guard(page.url,{stripSecrets:true});page.controls=page.controls.map(c=>c.href&&!travelResearchURL(c.href)?{...c,href:''}:c);}return page;},
    async act(id,page,step,signal){
      signal?.throwIfAborted();if(!owned.has(id))throw Error('Use a research tab opened by this search.');
      const currentURL=guard((await api.tabs.get(id)).url,{stripSecrets:true});
      if(currentURL!==page.url){
        const error=Error('The research tab moved. Resume the search.');
        // Dynamic search pages update their query/hash while the model reads.
        // Discard the stale action and observe again; never click stale controls.
        if(new URL(currentURL).origin===new URL(page.url).origin)error.code='TRAVEL_PAGE_CHANGED';
        throw error;
      }
      if(step.type==='wait'){await wait(1500);return;}
      if(step.type==='scroll'){await api.scripting.executeScript({target:{tabId:id},func:tripBrowserPage,args:[step]});return;}
      const control=page.controls.find(c=>c.index===step.index);if(!control)throw Error('The model named a control not on the page.');
      if(step.type==='open'){
        if(/confirm|pay\b|purchase|reserv|buy\b|delete|sign.?out|log.?out|subscribe/i.test(control.label))throw Error('Review this action yourself; browser research cannot commit it.');
        if(!control.href)throw Error('Only observed links can be opened.');
        await api.tabs.update(id,{url:guard(control.href)});
      }else await api.scripting.executeScript({target:{tabId:id},func:tripBrowserPage,args:[{...step,control}]});
      await wait(600);
      const children=(await api.tabs.query({})).filter(tab=>tab.openerTabId===id&&!owned.has(tab.id));
      if(children.length===1){const child=children[0];guard(child.url,{stripSecrets:true});owned.add(child.id);await ready(child.id,signal);await api.tabs.remove(id);owned.delete(id);return child.id;}
      if(children.length>1)throw Error('Several result tabs opened. Choose a source and resume its saved page.');
      await ready(id,signal);return id;
    }
  };
}
