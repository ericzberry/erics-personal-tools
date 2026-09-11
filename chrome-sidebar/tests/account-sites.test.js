import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSite,signedIn,readSignInState,accountSiteWatcher,ACCOUNT_SITES} from '../src/account-sites.js';

const etrade=ACCOUNT_SITES.find(site=>site.id==='etrade');

test('an account site is recognized by its host, and nothing else is',()=>{
  for(const url of ['https://us.etrade.com/etx/pxy/my-accounts','https://etrade.com/home','https://www.etrade.com/e/t/accounts/portfolio'])
    assert.equal(accountSite(url)?.id,'etrade',url);
  // A look-alike host is not the site, and neither is an unencrypted one.
  for(const url of ['https://etrade.com.example.invalid/','https://notetrade.com/','http://us.etrade.com/etx/','chrome://extensions','',undefined])
    assert.equal(accountSite(url),null,String(url));
});

test('a log-on form settles it: the owner is not signed in yet',()=>{
  const app={path:'/etx/pxy/my-accounts',password:false,exit:false};
  assert.equal(signedIn(etrade,app),true,'the signed-in application is enough on its own');
  assert.equal(signedIn(etrade,{...app,password:true}),false,'a password field outranks every other signal');
  assert.equal(signedIn(etrade,{path:'/home',password:false,exit:true}),true,'a sign-out control counts anywhere on the site');
  assert.equal(signedIn(etrade,{path:'/home',password:false,exit:false}),false);
  assert.equal(signedIn(etrade,null),false);
  assert.equal(signedIn(null,app),false);
});

test('the page probe reports three facts and no page content',()=>{
  const body={innerText:'Accounts  Net account value $12,345.67  Log Off'};
  globalThis.document={body,querySelector:()=>null};
  globalThis.location={pathname:'/etx/pxy/my-accounts'};
  const state=readSignInState();
  assert.deepEqual(Object.keys(state).sort(),['exit','password','path']);
  assert.equal(state.exit,true);
  assert.equal(state.password,false);
  assert.equal(JSON.stringify(state).includes('12,345'),false,'no balance leaves the page to detect a site');
  globalThis.document={body:{innerText:'Log on  User ID'},querySelector:selector=>selector==='input[type="password"]'?{}:null};
  assert.equal(readSignInState().password,true);
  delete globalThis.document;delete globalThis.location;
});

test('the page is asked only on a recognized site, and only once per throttle',async()=>{
  let asked=0,clock=0;
  const api={scripting:{executeScript:async()=>{asked++;return [{result:{path:'/etx/pxy/my-accounts',password:false,exit:false}}];}}};
  const detect=accountSiteWatcher({api,now:()=>clock,throttleMs:8000});
  assert.equal(await detect({id:1,url:'https://example.invalid/accounts'}),null);
  assert.equal(asked,0,'an unrecognized host is settled by its URL alone');
  assert.equal((await detect({id:1,url:'https://us.etrade.com/etx/pxy/my-accounts'}))?.id,'etrade');
  assert.equal(asked,1);
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
