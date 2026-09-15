import test from 'node:test';
import assert from 'node:assert/strict';
import {unlockInWindow,UNLOCK_MESSAGE,UNLOCK_PAGE} from '../src/vault-window.js';

function listeners(){
  const set=new Set();
  return {set,addListener:listener=>set.add(listener),removeListener:listener=>set.delete(listener),emit:(...args)=>{for(const listener of [...set])listener(...args);}};
}
function browser(){
  const created=[],removed=[];
  const onRemoved=listeners(),onMessage=listeners();
  const windows={
    async getCurrent(){return {left:100,top:50,width:1200,height:900};},
    async create(options){created.push(options);return {id:7};},
    async remove(id){removed.push(id);onRemoved.emit(id);},
    onRemoved
  };
  const runtime={onMessage,getURL:path=>`chrome-extension://synthetic/${path}`};
  const request=()=>new URL(created.at(-1).url).searchParams.get('request');
  return {windows,runtime,created,removed,onRemoved,onMessage,request};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

test('the check opens one small window over the browser and settles on that window’s answer',async()=>{
  const chrome=browser();
  const pending=unlockInWindow(chrome)();
  await tick();
  assert.equal(chrome.created.length,1);
  const [options]=chrome.created;
  assert.equal(options.type,'popup');
  assert.equal(options.focused,true);
  assert.ok(options.url.startsWith(`chrome-extension://synthetic/${UNLOCK_PAGE}?request=`));
  assert.equal(options.left,Math.round(100+(1200-options.width)/2),'centred over the window the panel is in');

  // Another panel's window answering is not this one's answer.
  chrome.onMessage.emit({type:UNLOCK_MESSAGE,request:'someone-else',error:{name:'NotAllowedError',message:'no'}});
  chrome.onMessage.emit({type:UNLOCK_MESSAGE,request:chrome.request(),error:null});
  await pending;
  assert.equal(chrome.onMessage.set.size,0,'nothing is left listening');
  assert.equal(chrome.onRemoved.set.size,0);
  // The window closing itself afterwards changes nothing.
  chrome.onRemoved.emit(7);
});

test('a failed check keeps its reason, and a window closed by hand counts as canceled',async()=>{
  const failed=browser();
  const failing=unlockInWindow(failed)();
  await tick();
  failed.onMessage.emit({type:UNLOCK_MESSAGE,request:failed.request(),error:{name:'NotAllowedError',message:'The operation either timed out or was not allowed.'}});
  await assert.rejects(failing,error=>error.name==='NotAllowedError');

  const closed=browser();
  const closing=unlockInWindow(closed)();
  await tick();
  closed.onRemoved.emit(99);
  closed.onRemoved.emit(7);
  await assert.rejects(closing,error=>error.name==='NotAllowedError'&&/canceled/.test(error.message));
});

test('a window that never answers is closed rather than waited on for ever',async()=>{
  const chrome=browser();
  const pending=unlockInWindow({...chrome,waitMs:20})();
  await assert.rejects(pending,/timed out/);
  assert.deepEqual(chrome.removed,[7]);
});

test('a host without extension windows has no window to offer',()=>{
  assert.equal(unlockInWindow({windows:undefined,runtime:undefined}),null);
});
