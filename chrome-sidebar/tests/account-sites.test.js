import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSite,financeSite,institutionNamed,signedIn,readSignInState,combineSignInState,accountSiteWatcher,ACCOUNT_SITES,FINANCE_SITES} from '../src/account-sites.js';

const etrade=ACCOUNT_SITES.find(site=>site.id==='etrade');
const chase=ACCOUNT_SITES.find(site=>site.id==='chase');
const morganStanley=ACCOUNT_SITES.find(site=>site.id==='morgan-stanley');
const schwab=ACCOUNT_SITES.find(site=>site.id==='schwab');
const coinbase=ACCOUNT_SITES.find(site=>site.id==='coinbase');
const ubs=ACCOUNT_SITES.find(site=>site.id==='ubs');
const carta=ACCOUNT_SITES.find(site=>site.id==='carta');
const icapital=ACCOUNT_SITES.find(site=>site.id==='icapital');
const frame=(result,frameId=0)=>({frameId,result});

test('an account site is recognized by its host, and nothing else is',()=>{
  for(const url of ['https://us.etrade.com/etx/pxy/my-accounts','https://etrade.com/home','https://www.etrade.com/e/t/accounts/portfolio'])
    assert.equal(accountSite(url)?.id,'etrade',url);
  // Banking, cards and the J.P. Morgan accounts share one sign-on:
  // jpmorganonline.com redirects here, so this host covers both names.
  for(const url of ['https://secure.chase.com/web/auth/dashboard','https://www.chase.com/','https://chase.com/personal/investments'])
    assert.equal(accountSite(url)?.id,'chase',url);
  // Morgan Stanley Online logs on from one subdomain and serves the signed-in
  // application from another, so the registrable domain covers both.
  for(const url of ['https://www.morganstanleyclientserv.com/cs/MSORLandingPage.aspx','https://login.morganstanleyclientserv.com/ux/','https://morganstanleyclientserv.com/'])
    assert.equal(accountSite(url)?.id,'morgan-stanley',url);
  // The firm's public site is not where the accounts are, and is left alone.
  assert.equal(accountSite('https://www.morganstanley.com/what-we-do/wealth-management'),null);
  // Schwab's balances are on the client subdomain alone, which serves the log-on
  // form as well as the application.
  for(const url of ['https://client.schwab.com/app/accounts/summary/','https://client.schwab.com/Areas/Access/Login'])
    assert.equal(accountSite(url)?.id,'schwab',url);
  // The marketing site has nothing to read, and Schwab Alliance redirects to it.
  for(const url of ['https://www.schwab.com/','https://schwab.com/branches','https://www.schwaballiance.com/'])
    assert.equal(accountSite(url),null,url);
  // Coinbase serves its application and its marketing site from the same host,
  // so reading names www and the areas the owner's money is on; the sign-in
  // host beside it is Coinbase's page but never a readable one.
  for(const url of ['https://www.coinbase.com/home','https://www.coinbase.com/assets','https://www.coinbase.com/explore'])
    assert.equal(accountSite(url)?.id,'coinbase',url);
  for(const url of ['https://login.coinbase.com/signin','https://coinbase.com/'])
    assert.equal(accountSite(url),null,url);
  // A look-alike host is not the site, and neither is an unencrypted one.
  for(const url of ['https://etrade.com.example.invalid/','https://notetrade.com/','http://us.etrade.com/etx/','https://chase.com.example.invalid/','https://notchase.com/','https://morganstanleyclientserv.com.example.invalid/','https://notmorganstanleyclientserv.com/','https://client.schwab.com.example.invalid/','https://notclient.schwab.com/','chrome://extensions','',undefined])
    assert.equal(accountSite(url),null,String(url));
});

test('a finance page is recognized wherever it is, and reading is the narrower question',()=>{
  // Recognition costs one URL comparison, so the pages a snapshot cannot be
  // read from are recognized too: the marketing site, the log-on form, and the
  // institutions that have no reader at all.
  for(const url of ['https://www.schwab.com/','https://client.schwab.com/Areas/Access/Login','https://www.schwaballiance.com/'])
    assert.equal(financeSite(url)?.id,'schwab',url);
  assert.equal(financeSite('https://www.morganstanley.com/what-we-do/wealth-management')?.id,'morgan-stanley');
  assert.equal(financeSite('https://www.ubs.com/us/en/wealth-management.html')?.id,'ubs');
  assert.equal(financeSite('https://digital.fidelity.com/ftgw/digital/portfolio/summary')?.id,'fidelity');
  assert.equal(financeSite('https://www.americanexpress.com/en-us/account/')?.institution,'American Express');
  // And nothing else is: a look-alike host, an unencrypted one, or a page that
  // is simply not an institution's.
  for(const url of ['https://ubs.com.example.invalid/','https://notubs.com/','http://www.ubs.com/','https://example.invalid/banking','chrome://extensions','',undefined])
    assert.equal(financeSite(url),null,String(url));
  // The readable sites are the same registry, narrowed: every one of them is
  // recognized as a finance page first.
  for(const site of ACCOUNT_SITES)
    for(const host of site.hosts)assert.equal(financeSite(`https://${host}/`)?.id,site.id,host);
  assert.deepEqual(ACCOUNT_SITES.map(site=>site.id),FINANCE_SITES.filter(site=>site.read).map(site=>site.id));
  // One entry per institution and per host, so a page cannot be two sites.
  const ids=FINANCE_SITES.map(site=>site.id),hosts=FINANCE_SITES.flatMap(site=>site.hosts);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(new Set(hosts).size,hosts.length);
  for(const site of FINANCE_SITES)assert.ok(site.label&&site.institution&&site.kind,site.id);
});

test('a log-on form settles it: the owner is not signed in yet',()=>{
  const app={path:'/etx/pxy/my-accounts',ready:true,password:false,exit:false};
  assert.equal(signedIn(etrade,app),true,'the signed-in application is enough on its own');
  assert.equal(signedIn(etrade,{...app,password:true}),false,'a password field outranks every other signal');
  assert.equal(signedIn(etrade,{path:'/home',ready:true,password:false,exit:true}),true,'a sign-out control counts anywhere on the site');
  assert.equal(signedIn(etrade,{path:'/home',ready:true,password:false,exit:false}),false);
  assert.equal(signedIn(etrade,null),false);
  assert.equal(signedIn(null,app),false);
});

// Chase's log-on shell and its signed-in application serve the same path, so the
// path alone is never allowed to answer until the page has finished loading and
// had its chance to show a password field.
// Coinbase asks for an email before it ever shows a password field, so the
// signal that settles every other site does not fire on its log-on page. The
// path is what answers instead, and it has to tell the application from the
// marketing site sharing its host.
test('Coinbase is read on the pages the money is on, and on none of the pages anyone can see',()=>{
  const app={ready:true,password:false,exit:false};
  for(const path of ['/home','/assets','/assets/bitcoin','/accounts','/portfolio','/transactions','/settings/limits'])
    assert.equal(signedIn(coinbase,{...app,path}),true,path);
  for(const path of ['/explore','/price/bitcoin','/learn/tips-and-tutorials','/card','/one','/'])
    assert.equal(signedIn(coinbase,{...app,path}),false,path);
  // And the sign-in step that does show a password field is refused whatever
  // path it is on.
  assert.equal(signedIn(coinbase,{...app,path:'/home',password:true}),false);
});

// Carta routes inside one application without changing the path: an investor's
// portfolio, a firm's funds and a company's cap table can all sit on the same
// one. So the application is named by what it is not — the handful of log-on
// paths — rather than by a prefix that would refuse most of the site.
test('Carta is read wherever the application is, and never on the way into it',()=>{
  const app={ready:true,password:false,exit:false};
  for(const path of ['/','/investors/portfolio','/firms/averin/funds','/corporations/celsie/securities'])
    assert.equal(signedIn(carta,{...app,path}),true,path);
  for(const path of ['/login','/logout','/sign-in','/password/reset','/mfa'])
    assert.equal(signedIn(carta,{...app,path}),false,path);
  assert.equal(signedIn(carta,{...app,path:'/investors/portfolio',password:true}),false);
  // The application has a host of its own; the marketing site is Carta's page
  // and never a readable one.
  assert.equal(accountSite('https://app.carta.com/investors/portfolio')?.id,'carta');
  for(const url of ['https://www.carta.com/','https://carta.com/pricing','https://app.carta.com.example.invalid/'])
    assert.equal(accountSite(url),null,url);
  assert.equal(financeSite('https://www.carta.com/')?.id,'carta');
});

// iCapital is the opposite case: one application per manager, each on that
// manager's own subdomain, and the whole of it — log-on included — served
// from one single-page shell that answers 200 to every path there is. Nothing
// the server does separates the two, and the log-on form asks for an email
// address and shows no password field, so the area the figures are on is
// named the way Coinbase's is.
test('iCapital is read on the reporting page, on any manager\u2019s subdomain, and nowhere else',()=>{
  const app={ready:true,password:false,exit:false};
  for(const path of ['/investment_dashboard','/investment_dashboard/cash_flow'])
    assert.equal(signedIn(icapital,{...app,path}),true,path);
  for(const path of ['/login','/register','/forgot_password','/documents','/'])
    assert.equal(signedIn(icapital,{...app,path}),false,path);
  // The shell routes a visitor with no session to /login, but only once it has
  // run: a half-built page still reporting the path it asked for is not the
  // application yet.
  assert.equal(signedIn(icapital,{...app,path:'/investment_dashboard',ready:false}),false);
  // Every manager's site is the same application under a different name, so
  // the registrable domain covers a second one without another entry.
  for(const url of ['https://vistaequitypartners.icapitalnetwork.com/investment_dashboard','https://someotherfirm.icapitalnetwork.com/investment_dashboard'])
    assert.equal(accountSite(url)?.id,'icapital',url);
  assert.equal(accountSite('https://vistaequitypartners.icapitalnetwork.com.example.invalid/'),null);
  assert.equal(financeSite('https://vistaequitypartners.icapitalnetwork.com/login')?.institution,'iCapital');
});

test('a page still loading cannot be read as a signed-in one by its path',()=>{
  const loading={path:'/web/auth/dashboard',ready:false,password:false,exit:false};
  assert.equal(signedIn(chase,loading),false,'the log-on frame may not have arrived yet');
  assert.equal(signedIn(chase,{...loading,ready:true}),true,'a finished page with no password field is the application');
  assert.equal(signedIn(chase,{...loading,password:true}),false);
  // A rendered sign-out control is proof by itself: no log-on page carries one,
  // so it does not have to wait for the rest of the page.
  assert.equal(signedIn(chase,{path:'/web/auth/dashboard',ready:false,password:false,exit:true}),true);
});

// Morgan Stanley Online serves its public pages from the same /cs/ prefix as the
// signed-in application, marked by a `free` segment. None of them carries a
// password field, so without holding them out the page an owner lands on the
// moment they sign out would read as a signed-in session.
test('a site’s public pages are held out of its application paths',()=>{
  const page=(path,extra={})=>({path,ready:true,password:false,exit:false,...extra});
  assert.equal(signedIn(morganStanley,page('/cs/MSORLandingPage.aspx')),true,'the landing page after signing on is the application');
  assert.equal(signedIn(morganStanley,page('/cs/Secure/MSSBAdventApplication/adventDownload.aspx')),true);
  assert.equal(signedIn(morganStanley,page('/cs/freecontent/logout.aspx')),false,'signing out lands here, and carries no password field to say so');
  assert.equal(signedIn(morganStanley,page('/cs/freeContent/FreeContentFixedWidth.aspx')),false,'the prefix is held out however the site capitalizes it');
  assert.equal(signedIn(morganStanley,page('/cs/freecontentenrollment/enrollments/identification.aspx')),false,'creating a username is not being signed in');
  assert.equal(signedIn(morganStanley,page('/ux/')),false,'the log-on form is on the same site, under its own path');
});

// Schwab puts everything signed out somewhere other than its application: a deep
// link to /app/ with no session comes back as /Areas/Access/Login carrying the
// path it wanted, and the log-on form's password field is in a frame served from
// another host.
test('the Schwab application is /app/, and nothing signed out is there',()=>{
  const page=(path,extra={})=>({path,ready:true,password:false,exit:false,...extra});
  assert.equal(signedIn(schwab,page('/app/accounts/summary/')),true,'where signing on lands');
  assert.equal(signedIn(schwab,page('/app/whatever-the-application-adds-next')),true,'the whole prefix is the application');
  assert.equal(signedIn(schwab,page('/Areas/Access/Login')),false,'every signed-out page is redirected here');
  assert.equal(signedIn(schwab,page('/Login/SignOn/CustomerCenterLogin.aspx')),false,'the older log-on form is on this host too');
  assert.equal(signedIn(schwab,page('/Public/BranchLocator/AccessSchwab.aspx')),false,'a public page on the application’s own host');
  // Only a probe that asks every frame sees the password field, because the top
  // frame of the log-on page does not have one.
  const combined=combineSignInState([frame(page('/Areas/Access/Login'),0),frame(page('/ui/host/',{password:true}),4)]);
  assert.equal(combined.password,true,'the gateway frame answers for the page');
  assert.equal(signedIn(schwab,combined),false);
});

// UBS Online Services splits one host down its first path segment: /wma/ is the
// application — the joint account and the trusts under the titles that hold them
// — and /cauth/ is the log-on form and everything public. A deep link into the
// application with no session is sent to the form carrying why it was refused,
// never the path it wanted, and a path that is neither answers from /cauth/ too.
test('the UBS application is /wma/, and the log-on form and public pages are not',()=>{
  const page=(path,extra={})=>({path,ready:true,password:false,exit:false,...extra});
  assert.equal(signedIn(ubs,page('/wma/accounts/dashboard')),true,'where the accounts are listed');
  assert.equal(signedIn(ubs,page('/wma/whatever-online-services-adds-next')),true,'the whole prefix is the application');
  assert.equal(signedIn(ubs,page('/cauth/wma/signin',{password:true})),false,'the log-on form');
  assert.equal(signedIn(ubs,page('/cauth/wma/signin')),false,'and the form before its password field is built');
  assert.equal(signedIn(ubs,page('/cauth/wma/404.html')),false,'the public page every other path answers from');
  // Reading is the Online Services subdomain alone; the firm's own site carries
  // no balances and is recognized without ever being asked anything.
  assert.equal(accountSite('https://onlineservices.ubs.com/wma/accounts/dashboard')?.id,'ubs');
  assert.equal(accountSite('https://www.ubs.com/us/en.html'),null,'the marketing site has nothing to read');
  assert.equal(financeSite('https://www.ubs.com/us/en.html')?.id,'ubs','and is still recognized as UBS’s');
});

test('the page probe reports four facts and no page content',()=>{
  const body={innerText:'Accounts  Net account value $12,345.67  Log Off'};
  globalThis.document={body,readyState:'complete',querySelector:()=>null};
  globalThis.location={pathname:'/etx/pxy/my-accounts'};
  const state=readSignInState();
  assert.deepEqual(Object.keys(state).sort(),['exit','password','path','ready']);
  assert.equal(state.exit,true);
  assert.equal(state.password,false);
  assert.equal(state.ready,true);
  assert.equal(JSON.stringify(state).includes('12,345'),false,'no balance leaves the page to detect a site');
  globalThis.document={body:{innerText:'Log on  User ID'},readyState:'interactive',querySelector:selector=>selector==='input[type="password"]'?{}:null};
  assert.equal(readSignInState().password,true);
  assert.equal(readSignInState().ready,false);
  delete globalThis.document;delete globalThis.location;
});

// Chase puts its log-on form in a frame under the signed-in application's own
// path. Asking only the top frame would call that page a signed-in session.
test('every frame answers, and only the top frame describes the tab',()=>{
  const shell=frame({path:'/web/auth/dashboard',ready:true,password:false,exit:false},0);
  const logon=frame({path:'/web/auth/',ready:true,password:true,exit:false},7);
  const combined=combineSignInState([shell,logon]);
  assert.equal(combined.path,'/web/auth/dashboard','a frame’s own path never stands for the tab’s');
  assert.equal(combined.password,true,'a password field in a frame is still a password field');
  assert.equal(signedIn(chase,combined),false);
  assert.equal(signedIn(chase,combineSignInState([shell])),true,'without the log-on frame the same shell is the application');
  // The top frame is found by its id, not by its position in the results.
  assert.equal(combineSignInState([logon,shell]).path,'/web/auth/dashboard');
  assert.equal(combineSignInState([frame(null,0),logon]).path,'/web/auth/','a frame that answered nothing is skipped');
  assert.equal(combineSignInState([]),null);
  assert.equal(combineSignInState([frame(null,0)]),null);
});

test('the page is asked only on a recognized site, and only once per throttle',async()=>{
  let asked=0,clock=0,target=null;
  const api={scripting:{executeScript:async options=>{asked++;target=options.target;return [frame({path:'/etx/pxy/my-accounts',ready:true,password:false,exit:false})];}}};
  const detect=accountSiteWatcher({api,now:()=>clock,throttleMs:8000});
  assert.equal(await detect({id:1,url:'https://example.invalid/accounts'}),null);
  assert.equal(asked,0,'an unrecognized host is settled by its URL alone');
  assert.equal((await detect({id:1,url:'https://us.etrade.com/etx/pxy/my-accounts'}))?.id,'etrade');
  assert.equal(asked,1);
  assert.equal(target.allFrames,true,'the question goes to every frame on the page');
  clock=7999;
  assert.equal((await detect({id:1,url:'https://us.etrade.com/etx/pxy/my-accounts'}))?.id,'etrade');
  assert.equal(asked,1,'the same page is not re-probed inside the throttle');
  clock=8001;
  await detect({id:1,url:'https://us.etrade.com/etx/pxy/my-accounts'});
  assert.equal(asked,2);
  // A new URL is a new question, throttle or not.
  await detect({id:1,url:'https://us.etrade.com/etx/pxy/positions'});
  assert.equal(asked,3);
});

test('a page that cannot be read is treated as not signed in',async()=>{
  const api={scripting:{executeScript:async()=>{throw Error('Cannot access contents of the page');}}};
  const detect=accountSiteWatcher({api,throttleMs:0});
  assert.equal(await detect({id:2,url:'https://us.etrade.com/etx/pxy/my-accounts'}),null);
});

// Reaching the figures is its own errand: an institution's front page is
// marketing, and the account summary is several presses past it. So every
// institution holds the page its balances are printed on, and the link is a
// way to reach them rather than a way to obtain them.
test('every institution carries the page its balances are printed on',()=>{
  for(const site of FINANCE_SITES){
    const url=new URL(site.url);
    assert.equal(url.protocol,'https:',`${site.id} links over HTTPS`);
    assert.ok(!url.username&&!url.password,`${site.id} carries no credentials in its link`);
    const registrable=host=>host.split('.').slice(-2).join('.');
    assert.ok(site.hosts.some(host=>registrable(host)===registrable(url.hostname)),
      `${site.id} links to its own institution, not somewhere else`);
  }
});

test('a readable site keeps its page through the narrowing that makes it readable',()=>{
  for(const site of ACCOUNT_SITES)assert.ok(site.url,`${site.id} keeps its page`);
  assert.equal(ACCOUNT_SITES.find(site=>site.id==='schwab')?.url,'https://client.schwab.com/app/accounts/summary/');
});

// A wallet holds the institution's name on a card, never the host it was
// issued from, so the registry answers to the name as well as to the URL.
test('an institution is found by the name a record carries',()=>{
  assert.equal(institutionNamed('Chase')?.id,'chase');
  assert.equal(institutionNamed('American Express')?.id,'american-express');
  assert.equal(institutionNamed('U.S. Bank')?.id,'us-bank');
  // A card names its issuer before it names itself, and a bank names its own
  // longer legal name; both open with the institution.
  assert.equal(institutionNamed('Chase Sapphire Reserve')?.id,'chase');
  assert.equal(institutionNamed('American Express National Bank')?.id,'american-express');
  // The word has to end where the institution's does: a longer word that
  // merely starts with the same letters is a different company.
  assert.equal(institutionNamed('Citizens Bank'),null);
  assert.equal(institutionNamed('Discovery Benefits'),null);
  assert.equal(institutionNamed(''),null);
});
