// Recognizes the account sites this tool knows how to read, and answers one
// question about the tab beside the panel: is the owner already signed in to
// one of them?
//
// The probe is deliberately thin. It runs inside the page, decides there, and
// hands back three facts — the path, whether a password field is on screen, and
// whether a sign-out control is — so no page text crosses back into the
// extension merely to detect a site. Reading the balances themselves stays what
// it was: one snapshot of the visible page, taken only when the owner asks for
// it, in `finance-page-read.js`.

export const ACCOUNT_SITES=[
  {id:'etrade',label:'E*TRADE',institution:'E*TRADE',kind:'brokerage',
    // The signed-in application lives under /etx/ (Complete View and the
    // account pages) and the older /e/t/ paths; the marketing site does not.
    hosts:['etrade.com'],app:/^\/(etx|e\/t)\//i}
];

const hostMatches=(hostname,host)=>hostname===host||hostname.endsWith(`.${host}`);
export function accountSite(url){
  let parsed;
  try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:')return null;
  return ACCOUNT_SITES.find(site=>site.hosts.some(host=>hostMatches(parsed.hostname,host)))||null;
}

// Runs inside the page. Self-contained: an injected function carries no closure
// from this module, and it returns no page content.
export function readSignInState(){
  const body=document.body;
  if(!body)return null;
  return {
    path:location.pathname,
    password:!!document.querySelector('input[type="password"]'),
    exit:/\b(log\s?off|log\s?out|sign\s?out)\b/i.test(body.innerText||'')
  };
}

// A password field on screen is the one signal that settles it: a log-on form
// means the owner is not through it yet, whatever else the page shows.
export const signedIn=(site,state)=>!!site&&!!state&&!state.password&&(state.exit||site.app.test(state.path||''));

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
      const [result]=await api.scripting.executeScript({target:{tabId:tab.id},func:readSignInState});
      current=signedIn(site,result?.result)?site:null;
    }catch{current=null;}
    return current;
  };
}
