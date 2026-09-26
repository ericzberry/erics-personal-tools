import {tripBrowserPage} from './trip-browser-page.js';
import {safePublicURL} from './public-url.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export const TRIP_CHANNELS=[{id:'web',label:'Web search',url:'https://www.google.com/travel/hotels'},{id:'amex',label:'Amex Travel',url:'https://www.americanexpress.com/en-us/travel/'},{id:'chase',label:'Chase Travel',url:'https://www.chase.com/travel'}];
export function travelBrowser(api){
  const owned=new Set();
  const guard=url=>{const safe=safePublicURL(url);if(!safe||/\/checkout|\/payment|\/purchase|\/confirmation|logout|signout/i.test(safe))throw Error('This link is outside travel research.');if([...new URL(safe).searchParams.keys()].some(k=>/^(access_token|id_token|refresh_token|password|secret|authorization|code|state|session|sessionid)$/i.test(k)))throw Error('Finish sign-in in the browser, then resume from the travel page.');return safe;};
  async function ready(id,signal){for(let i=0;i<20;i++){signal?.throwIfAborted();if((await api.tabs.get(id)).status==='complete')return;await wait(500);}throw Error('The page is still loading. Resume when it is ready.');}
  return {
    async open(url,signal){const tab=await api.tabs.create({url:guard(url),active:true});owned.add(tab.id);await ready(tab.id,signal);return tab.id;},
    async read(id,signal){if(!owned.has(id))throw Error('Use a research tab opened by this search.');await ready(id,signal);guard((await api.tabs.get(id)).url);const result=await api.scripting.executeScript({target:{tabId:id},func:tripBrowserPage});return result[0]?.result;},
    async act(id,page,step,signal){
      signal?.throwIfAborted();if(!owned.has(id)||(await api.tabs.get(id)).url!==page.url)throw Error('The research tab moved. Resume the search.');
      const control=page.controls.find(c=>c.index===step.index);if(!control)throw Error('The model named a control not on the page.');
      if(step.type==='open'){
        if(/confirm|pay\b|purchase|reserv|buy\b|delete|sign.?out|log.?out|subscribe/i.test(control.label))throw Error('Review this action yourself; browser research cannot commit it.');
        if(!control.href)throw Error('Only observed links can be opened.');
        await api.tabs.update(id,{url:guard(control.href)});
      }else await api.scripting.executeScript({target:{tabId:id},func:tripBrowserPage,args:[{...step,control}]});
      await wait(600);await ready(id,signal);
    }
  };
}
