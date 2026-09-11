// Recognizes the account sites this tool knows how to read, and answers one
// question about the tab beside the panel: is the owner already signed in to
// one of them?
//
// The probe is deliberately thin. It runs inside the page, decides there, and
// hands back four facts — the path, whether the document has finished loading,
// whether a password field is on screen, and whether a sign-out control is — so
// no page text crosses back into the extension merely to detect a site. Reading
// the balances themselves stays what it was: one snapshot of the visible page,
// taken only when the owner asks for it, in `finance-page-read.js`.

export const ACCOUNT_SITES=[
  {id:'etrade',label:'E*TRADE',institution:'E*TRADE',kind:'brokerage',
    // The signed-in application lives under /etx/ (Complete View and the
    // account pages) and the older /e/t/ paths; the marketing site does not.
    hosts:['etrade.com'],app:/^\/(etx|e\/t)\//i},
  {id:'chase',label:'Chase',institution:'Chase',kind:'bank',
    // Banking, cards and the J.P. Morgan investment accounts all sit behind the
    // same sign-on: jpmorganonline.com redirects to secure.chase.com, so one
    // entry covers both names. The signed-in application lives under /web/auth/
    // — but so does the log-on shell, which serves the identical
    // /web/auth/dashboard path and puts its password field in a frame. That is
    // why the password question is put to every frame below: on this site it is
    // the only thing that tells a log-on page from a signed-in one.
    hosts:['chase.com'],app:/^\/web\/auth\//i}
];

const hostMatches=(hostname,host)=>hostname===host||hostname.endsWith(`.${host}`);
export function accountSite(url){
  let parsed;
  try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:')return null;
  return ACCOUNT_SITES.find(site=>site.hosts.some(host=>hostMatches(parsed.hostname,host)))||null;
}

// Runs inside the page, once per frame. Self-contained: an injected function
// carries no closure from this module, and it returns no page content.
export function readSignInState(){
  const body=document.body;
  if(!body)return null;
  return {
    path:location.pathname,
    ready:document.readyState==='complete',
    password:!!document.querySelector('input[type="password"]'),
    exit:/\b(log\s?off|log\s?out|sign\s?out)\b/i.test(body.innerText||'')
  };
}

// The tab's answer is every frame's answer together. A log-on form inside a
// frame is still a log-on form, so the password and sign-out questions are
// answered yes if any frame says yes. Only the top frame's path and loading
// state describe the tab, so those are read from it alone; a frame's own path
// is never used to decide what the tab is showing.
export function combineSignInState(results=[]){
  const frames=results.filter(entry=>entry?.result);
  if(!frames.length)return null;
  const top=(frames.find(entry=>entry.frameId===0)||frames[0]).result;
  return {
    path:top.path,ready:top.ready,
    password:frames.some(entry=>entry.result.password),
    exit:frames.some(entry=>entry.result.exit)
  };
}

// A password field on screen is the one signal that settles it: a log-on form
// means the owner is not through it yet, whatever else the page shows.
//
// The two positive signals are not equally quick to trust. A rendered sign-out
// control is proof by itself the moment it appears, because no log-on page
// carries one. A path is only evidence once the page has finished loading:
// Chase's log-on shell occupies the signed-in application's own path and fills
// in its password frame partway through the load, so a half-built shell reads
// as the application it is about to refuse to become.
export const signedIn=(site,state)=>!!site&&!!state&&!state.password&&(state.exit||(!!state.ready&&site.app.test(state.path||'')));

export const PROBE_MS=8000;
// Asks the page at most once every `throttleMs`, and only while the tab is on a
// site this tool recognizes. Every other tab costs nothing but a URL comparison.
export function accountSiteWatcher({api=globalThis.chrome,now=()=>Date.now(),throttleMs=PROBE_MS}={}){
  let key='',asked=0,current=null;
  return async function detect(tab){
    const site=accountSite(tab?.url);
    if(!site||tab.id===undefined){key='';current=null;return null;}
    const next=`${tab.id}:${tab.url}`;
    if(next===key&&now()-asked<throttleMs)return current;
    key=next;asked=now();
    try{
      const results=await api.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:readSignInState});
      current=signedIn(site,combineSignInState(results))?site:null;
    }catch{current=null;}
    return current;
  };
}
