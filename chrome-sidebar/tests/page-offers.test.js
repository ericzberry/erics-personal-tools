import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {pageOffers,OFFER_SOURCES,MAX_STRIP_OFFERS} from '../src/page-offers.js';
import {PageOfferStrip} from '../src/components/ui.js';
import {mountPageStrip} from '../src/page-strip.js';
import {mountApp} from '../src/components/views.js';

const schwab={id:'schwab',label:'Schwab',institution:'Charles Schwab',kind:'brokerage'};
const gift=(person,link,status='Idea')=>({id:person,person,idea:'Something',link,status});
const setup=()=>{const {document}=parseHTML('<html><body><nav id="strip"></nav></body></html>');globalThis.document=document;return document;};

test('the panel is built with the strip under its header',()=>{
  const document=setup();
  const app=document.createElement('div');document.body.append(app);
  mountApp(app);
  const bar=document.getElementById('page-offers');
  assert.ok(bar,'the strip belongs to the shell, not to a tool: it outlives every one of them');
  assert.equal(bar.hidden,true,'an empty strip is not shown');
  assert.equal(app.children[0].tagName.toLowerCase(),'header');
  assert.equal(app.children[1],bar,'it sits under the header, above whichever tool is open');
});

test('a page nothing knows offers nothing',()=>{
  for(const url of ['https://example.invalid/anything','chrome://extensions','',undefined])
    assert.deepEqual(pageOffers({url}),[],String(url));
});

test('a saved gift idea is recognized on the page it was saved from',()=>{
  const gifts=[gift('Maisie','https://shop.example.com/thing/42')];
  // The link and the page in front of the owner rarely carry the same tracking
  // parameters, and a trailing slash is not a different page.
  for(const url of ['https://shop.example.com/thing/42','https://shop.example.com/thing/42/','https://shop.example.com/thing/42?utm_source=mail#reviews'])
    assert.deepEqual(pageOffers({url,gifts}).map(offer=>offer.label),['Saved for Maisie'],url);
  // Another page of the same shop is not the thing that was saved.
  assert.deepEqual(pageOffers({url:'https://shop.example.com/thing/43',gifts}),[]);
  assert.deepEqual(pageOffers({url:'https://other.example.com/thing/42',gifts}),[]);
});

test('an idea already bought says so, and several say how many',()=>{
  const url='https://shop.example.com/thing/42';
  assert.equal(pageOffers({url,gifts:[gift('Celeste',url,'Bought')]})[0].label,'Bought for Celeste');
  assert.equal(pageOffers({url,gifts:[gift('Ariana',url),gift('Maisie',url)]})[0].label,'2 saved ideas');
});

test('the gift offer opens the page the Tools menu opens, with its own icon',()=>{
  const [offer]=pageOffers({url:'https://shop.example.com/thing/42',gifts:[gift('Maisie','https://shop.example.com/thing/42')]});
  assert.equal(offer.capability,'gifts');
  assert.equal(offer.href,'gifts.html','a capability with a page of its own is a link to it');
  assert.ok(offer.icon,'the row carries the same icon as the menu row it leads to');
  assert.equal(offer.viaTab,false);
});

test('a signed-in account site offers the snapshot, and hands the panel back to the tab',()=>{
  const [offer]=pageOffers({url:'https://client.schwab.com/app/accounts/summary/',site:schwab});
  assert.equal(offer.label,'Store Schwab snapshots');
  assert.equal(offer.capability,'finance');
  assert.equal(offer.viaTab,true,'Finance beside the tab is what Automatic mode shows');
  assert.equal(offer.href,'','a tool that lives in the panel is not a link');
  // Being on the site is not being signed in to it: the probe answers that, and
  // without its answer there is nothing to offer.
  assert.deepEqual(pageOffers({url:'https://client.schwab.com/Areas/Access/Login'}),[]);
});

test('a reward program’s own site offers its offers, and Gmail and a draft offer theirs',()=>{
  assert.equal(pageOffers({url:'https://www.msreserved.com/offers'})[0]?.label,'Morgan Stanley Reserved offers');
  const [mail]=pageOffers({url:'https://mail.google.com/mail/u/0/#inbox'});
  assert.equal(mail.label,'Summarize or reply');
  assert.ok(mail.icon,'Gmail has no menu row, so the offer carries its own icon');
  assert.equal(pageOffers({url:'https://fantasy.espn.com/football/draft'})[0]?.label,'Draft advice');
});

test('what is already on screen is never offered',()=>{
  const open=pageOffers({url:'https://mail.google.com/mail/u/0/#inbox',active:'gmail'});
  assert.deepEqual(open,[],'an offer to go where the owner already is would name a visible state');
  assert.equal(pageOffers({url:'https://client.schwab.com/app/accounts/summary/',site:schwab,active:'finance'}).length,0);
  assert.equal(pageOffers({url:'https://client.schwab.com/app/accounts/summary/',site:schwab,active:'gifts'}).length,1,'a tool chosen by hand still hears about the tab');
});

test('offers arrive most specific first, and stop at one row',()=>{
  const url='https://www.msreserved.com/offers';
  const offers=pageOffers({url,site:schwab,gifts:[gift('Maisie',url)]});
  assert.deepEqual(offers.map(offer=>offer.id),['gift-link','account-site','reward-program']);
  assert.ok(offers.length<=MAX_STRIP_OFFERS);
  assert.ok(OFFER_SOURCES.every(source=>source.capability&&typeof source.match==='function'));
});

test('the strip renders one row: links to pages, buttons to panel tools',()=>{
  const document=setup();
  const chosen=[];
  const offers=pageOffers({url:'https://www.msreserved.com/offers',site:schwab,gifts:[gift('Maisie','https://www.msreserved.com/offers')]});
  document.getElementById('strip').replaceChildren(...PageOfferStrip(offers,{onSelect:offer=>chosen.push(offer.id)}));
  const rows=[...document.querySelectorAll('#strip > *')];
  assert.deepEqual(rows.map(row=>row.tagName.toLowerCase()),['a','button','button']);
  assert.equal(rows[0].getAttribute('href'),'gifts.html');
  assert.equal(rows[0].getAttribute('target'),'_blank');
  for(const row of rows){
    assert.ok(row.querySelector('svg'),'every row shows its capability’s icon');
    assert.equal(row.querySelector('svg').getAttribute('aria-hidden'),'true');
    assert.ok(row.textContent.trim().length);
  }
  rows[1].dispatchEvent(new document.defaultView.Event('click'));
  assert.deepEqual(chosen,['account-site']);
});

test('the strip shows the tab’s offers, hides itself when there are none, and goes where it says',async()=>{
  const document=setup();
  const root=document.getElementById('strip');
  const selected=[],tabs=[];
  let notify=()=>{};
  const strip=mountPageStrip(root,{
    gifts:{saved:async()=>[gift('Maisie','https://shop.example.com/thing/42')]},
    credentials:{get:async()=>'token'},
    changes:onChange=>{notify=onChange;return {close(){}};},
    active:()=>'',subscribe:()=>()=>{},
    select:id=>selected.push(id),toTab:()=>tabs.push('auto')
  });
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(root.hidden,true,'an empty strip is not a strip');
  strip.update({url:'https://shop.example.com/thing/42',site:schwab});
  assert.equal(root.hidden,false);
  assert.deepEqual([...root.children].map(node=>node.textContent.trim()),['Saved for Maisie','Store Schwab snapshots']);
  root.children[1].dispatchEvent(new document.defaultView.Event('click'));
  assert.deepEqual(tabs,['auto'],'a tool of the tab’s own hands the panel back to the tab');
  assert.deepEqual(selected,[]);
  // A saved idea deleted in another window stops being recognized here.
  strip.stop();
  notify();
});

test('a browser with no access token still offers what the page alone says',async()=>{
  const document=setup();
  const root=document.getElementById('strip');
  const strip=mountPageStrip(root,{
    gifts:{saved:async()=>{throw Error('never asked');}},
    credentials:{get:async()=>''},
    changes:()=>({close(){}}),active:()=>'',subscribe:()=>()=>{},select(){},toTab(){}
  });
  await new Promise(resolve=>setTimeout(resolve,0));
  strip.update({url:'https://mail.google.com/mail/u/0/#inbox',site:null});
  assert.deepEqual([...root.children].map(node=>node.textContent.trim()),['Summarize or reply']);
  strip.stop();
});
