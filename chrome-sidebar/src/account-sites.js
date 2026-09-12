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
    hosts:['chase.com'],app:/^\/web\/auth\//i},
  {id:'morgan-stanley',label:'Morgan Stanley',institution:'Morgan Stanley',kind:'brokerage',
    // Morgan Stanley Online is one site under two names: the log-on form is
    // served from login.morganstanleyclientserv.com/ux/ and the signed-in
    // application from www. under /cs/, so the shared registrable domain covers
    // both and the log-on path falls outside the application's own.
    //
    // The site keeps its public pages under that same /cs/ prefix, marked by a
    // `free` segment: /cs/freecontent/logout.aspx is exactly where signing out
    // lands and /cs/freecontentenrollment/ is where a username is created.
    // Neither shows a password field, so without holding them out they would
    // read as the application. A deep link followed with no session at all is
    // refused in place, on the application's own path, and that one page cannot
    // be told apart here; reading it simply finds no figures.
    //
    // Self-directed accounts at E*TRADE from Morgan Stanley sign in separately
    // and are already their own entry above.
    hosts:['morganstanleyclientserv.com'],app:/^\/cs\/(?!free)/i},
  {id:'schwab',label:'Schwab',institution:'Charles Schwab',kind:'brokerage',
    // The balances are on client.schwab.com and nowhere else: www.schwab.com is
    // the marketing site, and schwaballiance.com now redirects there too. So
    // this entry names the client subdomain instead of the registrable domain,
    // and an ordinary visit to schwab.com is never asked anything.
    //
    // The signed-in application is everything under /app/ — /app/accounts/summary/
    // is where signing on lands. Nothing signed out sits on that prefix: an
    // unauthenticated request for one is redirected to /Areas/Access/Login
    // carrying it back as a ReturnUrl, which is also where the legacy
    // /Login/SignOn/ form and /Areas/Access/SignOut end up, and the host's own
    // public pages are under /Public/. A signed-in page that is not under /app/
    // is still recognized the way any other is, by its sign-out control.
    //
    // Schwab serves its log-on form from a frame on another host
    // (sws-gateway-nr.schwab.com), so the password field is visible only to a
    // probe that asks every frame — which is what Chase already established.
    //
    // The label is what the panel calls the site; the institution is the name
    // the ledger's own field asks for, and the one a new record should carry.
    hosts:['client.schwab.com'],app:/^\/app\//i}
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
