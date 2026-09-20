import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {selectCapability,showTool} from '../src/navigation.js';
import {pageOffers} from '../src/page-offers.js';

const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the wallet to load.');
};

// Loading the wallet starts by reading this device's connection, so the reads
// count the loads. Nothing is stored here: an unconnected device is enough to
// see whether the wallet reached for its records at all.
function host(){
  let reads=0;
  const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  globalThis.chrome={storage:{local:{get:async()=>{reads++;return {};},set:async()=>{}},onChanged:{addListener(){},removeListener(){}}}};
  // linkedom's <select> value is read-only; the app sets it like a browser does.
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  mountApp(document.getElementById('app'));
  return {document,window,reads:()=>reads,
    status:()=>document.getElementById('rewards-status').textContent,
    stop(){window.dispatchEvent(new window.Event('pagehide'));Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);}};
}

// Beside a program's own site the strip under the header offers to read the
// balance, and pressing it lands on the wallet — which disables every control
// in it until it has loaded. Arriving without loading left the reading that had
// just been offered dead on the screen, saying nothing about why, because the
// wallet loaded only when its own row in the Tools menu was pressed.
test('the wallet loads when the panel arrives on it, whichever route brought it there',async()=>{
  const h=host();
  const offer=pageOffers({url:'https://www.marriott.com/loyalty/myAccount/default.mi',active:'home'}).find(item=>item.id==='loyalty-balance');
  assert.equal(offer.label,'Read your Bonvoy balance');
  assert.equal(offer.capability,'rewards');
  const {rewardsTool}=await import('../src/rewards.js');
  assert.equal(h.reads(),0,'a panel that has not opened the wallet reads nothing');

  // Where the strip goes: the capability is selected in the panel, without the
  // Tools row that used to be the only thing that loaded it.
  selectCapability(offer.capability);
  await settle(()=>h.reads()>0);
  await settle(()=>h.status());
  assert.equal(h.status(),'Open Settings to connect this device.');
  const arrived=h.reads();

  // The panel renders again on every poll of the tab beside it. Only an arrival
  // loads the wallet, or it would load once a second.
  for(let i=0;i<3;i++)showTool('home');
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.reads(),arrived);

  // Leaving the wallet and coming back is a new arrival.
  selectCapability('auto');
  selectCapability('rewards');
  await settle(()=>h.reads()>arrived);
  rewardsTool.stop();h.stop();
});
