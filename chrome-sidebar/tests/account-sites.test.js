import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSite,signedIn,readSignInState,combineSignInState,accountSiteWatcher,ACCOUNT_SITES} from '../src/account-sites.js';

const etrade=ACCOUNT_SITES.find(site=>site.id==='etrade');
const chase=ACCOUNT_SITES.find(site=>site.id==='chase');
const morganStanley=ACCOUNT_SITES.find(site=>site.id==='morgan-stanley');
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
  // A look-alike host is not the site, and neither is an unencrypted one.
  for(const url of ['https://etrade.com.example.invalid/','https://notetrade.com/','http://us.etrade.com/etx/','https://chase.com.example.invalid/','https://notchase.com/','https://morganstanleyclientserv.com.example.invalid/','https://notmorganstanleyclientserv.com/','chrome://extensions','',undefined])
    assert.equal(accountSite(url),null,String(url));
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
