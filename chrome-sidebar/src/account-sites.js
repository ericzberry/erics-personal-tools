// Recognizes the finance sites this tool knows, and answers two questions about
// the tab beside the panel: is this page about the owner's money at all, and —
// for the few sites whose account pages can be read — is the owner already
// signed in to one?
//
// The first question costs one URL comparison, so every tab can be asked it.
// A recognized site is what turns the panel to Finance, which then arrives
// quiet: the intake is ready for what the page can put into the ledger, and
// nothing of what is already in it appears until the owner asks.
//
// The second question is the narrower one the snapshot needs, and it is put
// only to the sites that can be read. The probe behind it is deliberately thin.
// It runs inside the page, decides there, and hands back four facts — the path,
// whether the document has finished loading, whether a password field is on
// screen, and whether a sign-out control is — so no page text crosses back into
// the extension merely to detect a site. Reading the balances themselves stays
// what it was: one snapshot of the visible page, taken only when the owner asks
// for it, in `finance-page-read.js`.
//
// An entry is one institution: the hosts it is recognized by, the name its
// records should carry, the kind of record its accounts usually are, and the
// page its balances are printed on. The URL is the institution's published
// account page, so following it without a session lands on that institution's
// own sign-in and returns there; it is a way to reach the figures, never a way
// to obtain them. A `read` block is what makes a site readable — the path its
// signed-in application occupies, and the host that application lives on when
// that is narrower than the institution's own.
export const FINANCE_SITES=[
  {id:'etrade',label:'E*TRADE',institution:'E*TRADE',kind:'brokerage',hosts:['etrade.com'],
    url:'https://us.etrade.com/etx/pxy/my-portfolios',
    // The signed-in application lives under /etx/ (Complete View and the
    // account pages) and the older /e/t/ paths; the marketing site does not.
    read:{app:/^\/(etx|e\/t)\//i}},
  {id:'chase',label:'Chase',institution:'Chase',kind:'bank',hosts:['chase.com','jpmorganonline.com'],
    // The overview, by its own hash route, rather than wherever the dashboard
    // happens to open. The accounts are listed there under their kinds; the
    // dashboard's own landing states the kinds and their sums and nothing else,
    // which is a page that cannot answer what this tool is for.
    url:'https://secure.chase.com/web/auth/dashboard#/dashboard/overview',
    // Banking, cards and the J.P. Morgan investment accounts all sit behind the
    // same sign-on: jpmorganonline.com redirects to secure.chase.com, so one
    // entry covers both names. The signed-in application lives under /web/auth/
    // — but so does the log-on shell, which serves the identical
    // /web/auth/dashboard path and puts its password field in a frame. That is
    // why the password question is put to every frame below: on this site it is
    // the only thing that tells a log-on page from a signed-in one.
    read:{hosts:['chase.com'],app:/^\/web\/auth\//i}},
  {id:'morgan-stanley',label:'Morgan Stanley',institution:'Morgan Stanley',kind:'brokerage',
    hosts:['morganstanley.com','morganstanleyclientserv.com'],
    url:'https://www.morganstanleyclientserv.com/cs/',
    // Morgan Stanley Online is one site under two names: the log-on form is
    // served from login.morganstanleyclientserv.com/ux/ and the signed-in
    // application from www. under /cs/, so the shared registrable domain covers
    // both and the log-on path falls outside the application's own. The firm's
    // public site is its own name, recognized but never read.
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
    read:{hosts:['morganstanleyclientserv.com'],app:/^\/cs\/(?!free)/i}},
  {id:'schwab',label:'Schwab',institution:'Schwab',kind:'brokerage',
    hosts:['schwab.com','schwaballiance.com'],
    url:'https://client.schwab.com/app/accounts/summary/',
    // The balances are on client.schwab.com and nowhere else: www.schwab.com is
    // the marketing site, and schwaballiance.com now redirects there too. So
    // reading names the client subdomain instead of the registrable domain, and
    // an ordinary visit to schwab.com is never asked anything — recognized as
    // Schwab's, which costs a string comparison, and nothing more.
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
    read:{hosts:['client.schwab.com'],app:/^\/app\//i}},
  {id:'ubs',label:'UBS',institution:'UBS',kind:'brokerage',hosts:['ubs.com'],
    url:'https://onlineservices.ubs.com/',
    // Online Services is one host, split down the middle by its first path
    // segment: the signed-in application is everything under /wma/ — Wealth
    // Management Americas, where the accounts, the balances and the trusts
    // grouped under their titles are — and /cauth/ is everything that is not.
    // The log-on form is /cauth/wma/signin, which is where any /wma/ path
    // asked for without a session is sent, carrying se, status and portalNm
    // rather than the path it refused; and the site's public furniture is
    // under the same /cauth/ prefix, including the /cauth/wma/404.html that
    // answers for every path outside the two. Nothing signed out sits on
    // /wma/, so naming the application by that one segment holds the log-on
    // form and the public pages out of it in the same stroke.
    //
    // Reading names the Online Services subdomain rather than the registrable
    // domain: ubs.com is the firm's marketing site and carries no balances.
    // An ordinary visit there is still recognized as UBS's, which costs one
    // string comparison, and is never asked anything more.
    read:{hosts:['onlineservices.ubs.com'],app:/^\/wma\//i}},

  // The rest are recognized but not read, save for the few further down that
  // carry a `read` block of their own and are left standing beside the
  // institutions they belong with rather than moved up. Recognition is all the
  // panel needs to turn to Finance with its intake ready, and a statement, a
  // page reading or a typed record works the same wherever the figures came
  // from. A site becomes readable once its signed-in application has been
  // checked against its log-on and public pages, which is the only work that
  // separates the two.
  {id:'fidelity',label:'Fidelity',institution:'Fidelity',kind:'brokerage',hosts:['fidelity.com','netbenefits.com'],
    url:'https://digital.fidelity.com/ftgw/digital/portfolio/summary'},
  {id:'vanguard',label:'Vanguard',institution:'Vanguard',kind:'brokerage',hosts:['vanguard.com'],
    url:'https://personal1.vanguard.com/mvc-balances-holdings/balances'},
  {id:'merrill',label:'Merrill',institution:'Merrill',kind:'brokerage',hosts:['merrilledge.com','ml.com'],
    url:'https://olui2.fs.ml.com/'},
  {id:'bank-of-america',label:'Bank of America',institution:'Bank of America',kind:'bank',hosts:['bankofamerica.com'],
    url:'https://secure.bankofamerica.com/myaccounts/'},
  {id:'wells-fargo',label:'Wells Fargo',institution:'Wells Fargo',kind:'bank',hosts:['wellsfargo.com','wellsfargoadvisors.com'],
    url:'https://connect.secure.wellsfargo.com/accounts/start'},
  {id:'citi',label:'Citi',institution:'Citi',kind:'bank',hosts:['citi.com','citibank.com'],
    url:'https://online.citi.com/US/nga/account/overview'},
  {id:'us-bank',label:'U.S. Bank',institution:'U.S. Bank',kind:'bank',hosts:['usbank.com'],
    url:'https://onlinebanking.usbank.com/'},
  {id:'pnc',label:'PNC',institution:'PNC',kind:'bank',hosts:['pnc.com'],
    url:'https://onlinebanking.pnc.com/'},
  {id:'truist',label:'Truist',institution:'Truist',kind:'bank',hosts:['truist.com'],
    url:'https://onlinebanking.truist.com/'},
  {id:'ally',label:'Ally',institution:'Ally',kind:'bank',hosts:['ally.com'],
    url:'https://secure.ally.com/'},
  {id:'marcus',label:'Marcus',institution:'Marcus by Goldman Sachs',kind:'bank',hosts:['marcus.com'],
    url:'https://www.marcus.com/us/en/account'},
  {id:'capital-one',label:'Capital One',institution:'Capital One',kind:'bank',hosts:['capitalone.com'],
    url:'https://myaccounts.capitalone.com/accountSummary'},
  {id:'american-express',label:'American Express',institution:'American Express',kind:'credit',hosts:['americanexpress.com'],
    url:'https://global.americanexpress.com/dashboard'},
  {id:'discover',label:'Discover',institution:'Discover',kind:'credit',hosts:['discover.com'],
    url:'https://card.discover.com/cardmembersvcs/achome/homepage'},
  {id:'interactive-brokers',label:'Interactive Brokers',institution:'Interactive Brokers',kind:'brokerage',hosts:['interactivebrokers.com'],
    url:'https://www.interactivebrokers.com/portal'},
  {id:'robinhood',label:'Robinhood',institution:'Robinhood',kind:'brokerage',hosts:['robinhood.com'],
    url:'https://robinhood.com/account'},
  {id:'ameriprise',label:'Ameriprise',institution:'Ameriprise',kind:'brokerage',hosts:['ameriprise.com'],
    url:'https://www.ameriprise.com/account'},
  // Client Access, where the balances are, is served from the firm's own
  // rjf.com rather than from raymondjames.com, so a client sitting on it is
  // recognized only if that host is named here too.
  {id:'raymond-james',label:'Raymond James',institution:'Raymond James',kind:'brokerage',hosts:['raymondjames.com','rjf.com'],
    url:'https://clientaccess.rjf.com/'},
  {id:'edward-jones',label:'Edward Jones',institution:'Edward Jones',kind:'brokerage',hosts:['edwardjones.com'],
    url:'https://www.edwardjones.com/us-en/client-resources/online-access'},
  {id:'northern-trust',label:'Northern Trust',institution:'Northern Trust',kind:'brokerage',hosts:['northerntrust.com'],
    url:'https://www.northerntrust.com/'},
  {id:'pershing',label:'Pershing',institution:'BNY Pershing',kind:'brokerage',hosts:['netxinvestor.com','pershing.com'],
    url:'https://www.netxinvestor.com/'},
  {id:'betterment',label:'Betterment',institution:'Betterment',kind:'brokerage',hosts:['betterment.com'],
    url:'https://www.betterment.com/app/accounts'},
  {id:'wealthfront',label:'Wealthfront',institution:'Wealthfront',kind:'brokerage',hosts:['wealthfront.com'],
    url:'https://www.wealthfront.com/dashboard'},
  {id:'empower',label:'Empower',institution:'Empower',kind:'retirement',hosts:['empower.com','empower-retirement.com'],
    url:'https://participant.empower-retirement.com/participant/'},
  {id:'tiaa',label:'TIAA',institution:'TIAA',kind:'retirement',hosts:['tiaa.org'],
    url:'https://www.tiaa.org/public/tcm/user/dashboard'},
  // The one site in this list that states no account balance. Carta is a cap
  // table and a fund administrator: what it prints is what was committed to a
  // fund, how much of that has been called, what has come back, and what the
  // position is worth — and beside those, the numbers belonging to the
  // companies and the funds themselves. Read as a brokerage page it offers a
  // portfolio company's valuation as the reader's money, which is why the
  // reading is narrowed to positions in `finance-data.js` rather than here.
  {id:'carta',label:'Carta',institution:'Carta',kind:'private',hosts:['carta.com'],
    url:'https://app.carta.com/',
    // The signed-in application is the whole of app.carta.com, so the log-on
    // paths are named instead of the application's. The site routes inside the
    // application without changing the path — an investor's portfolio, a firm's
    // funds and a company's cap table can all sit on one — so a prefix that
    // named the portfolio would refuse every other page the figures are on.
    read:{hosts:['app.carta.com'],
      app:/^\/(?!(login|logout|signin|sign-?in|sign-?up|register|password|reset|mfa|verify)\b)/i}},
  // The other site that states positions and no balances, and the one the
  // owner's fund commitments are actually administered on. iCapital serves one
  // application per manager, each on that manager's own subdomain — the
  // owner's is Vista's — so the registrable domain covers every one of them at
  // once and a second manager needs nothing added here.
  {id:'icapital',label:'iCapital',institution:'iCapital',kind:'private',hosts:['icapitalnetwork.com'],
    url:'https://vistaequitypartners.icapitalnetwork.com/investment_dashboard',
    // Nothing the server does tells a signed-in visitor from a signed-out one:
    // every path on the host answers 200 with the same single-page shell —
    // /investment_dashboard, /documents and a path that does not exist alike —
    // and the shell then routes a visitor with no session to /login, carrying
    // what it refused as ?referral=. Neither does the form, which asks for an
    // email address and shows no password field at all until the step after:
    // the one signal that settles Chase and Schwab never fires here, exactly
    // as it never fires at Coinbase.
    //
    // What is left is the path the shell has settled on, and it is settled by
    // the time the document is complete — asked for /investment_dashboard with
    // no session, the tab reports /login before readyState does. So the
    // application is named by the area the figures are on, the way Coinbase's
    // is: Investment Reporting, where a fund's capital account is printed, is
    // /investment_dashboard, and the log-on, registration and password pages
    // are all outside it.
    read:{app:/^\/investment_dashboard\b/i}},
  {id:'coinbase',label:'Coinbase',institution:'Coinbase',kind:'crypto',hosts:['coinbase.com'],
    url:'https://www.coinbase.com/assets',
    // Coinbase signs in on a host of its own: asking for www.coinbase.com/home
    // with no session lands on login.coinbase.com/signin, which is why reading
    // names the www host alone. The log-on form is still recognized as
    // Coinbase's — it is on the registrable domain — but it can never be read,
    // and that matters here more than elsewhere: the form asks for an email
    // first and shows no password field at all until the step after, so the
    // one signal that settles every other site would not fire on it.
    //
    // The same host serves the marketing site, so the application is named by
    // its own areas rather than by a prefix. Everything the owner's money is on
    // is in this list; what is left over — /explore, /price/…, /learn, /card,
    // /one, the product pages — is public, has no balance on it, and is
    // recognized the way any other finance page is without being read.
    read:{hosts:['www.coinbase.com'],
      app:/^\/(home|assets|accounts|portfolio|transactions|statements|settings|notifications|advanced-trade)\b/i}},
  {id:'kraken',label:'Kraken',institution:'Kraken',kind:'crypto',hosts:['kraken.com'],
    url:'https://pro.kraken.com/app/portfolio'},
  {id:'treasury-direct',label:'TreasuryDirect',institution:'TreasuryDirect',kind:'other-asset',hosts:['treasurydirect.gov'],
    url:'https://www.treasurydirect.gov/RS/UN-Display.do'}
];

// The sites a snapshot can be read from: each institution's own entry, narrowed
// to the host and path its signed-in application occupies.
export const ACCOUNT_SITES=FINANCE_SITES.filter(site=>site.read)
  .map(({read,...site})=>({...site,hosts:read.hosts||site.hosts,app:read.app}));

const hostMatches=(hostname,host)=>hostname===host||hostname.endsWith(`.${host}`);
function match(url,sites){
  let parsed;
  try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:')return null;
  return sites.find(site=>site.hosts.some(host=>hostMatches(parsed.hostname,host)))||null;
}
// Is this page about the owner's money? One URL comparison and nothing else: no
// page is read, no request is made, and being signed in is not asked.
export const financeSite=url=>match(url,FINANCE_SITES);
// And the narrower question: is this one of the pages a snapshot can be read
// from? Being on such a site is not being signed in to it; `signedIn` settles
// that from what the page itself reports.
export const accountSite=url=>match(url,ACCOUNT_SITES);

// The institution a record names, asked by name rather than by host: a wallet
// holds "Chase" or "American Express" on a card, never the URL it was issued
// from, and the institution's published account page is the page that card is
// on. A name that opens with an institution's own is that institution —
// "Chase Sapphire Reserve" is Chase, "American Express National Bank" is
// American Express — and the word has to end there, so Citizens is never Citi.
const institutionKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function institutionNamed(name){
  const asked=institutionKey(name);
  if(!asked)return null;
  return FINANCE_SITES.find(site=>[site.institution,site.label].some(known=>{
    const key=institutionKey(known);
    return !!key&&(asked===key||asked.startsWith(`${key} `));
  }))||null;
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
// site this tool can read. Every other tab costs nothing but a URL comparison.
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
