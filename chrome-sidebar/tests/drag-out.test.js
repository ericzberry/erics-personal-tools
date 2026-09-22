import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {dragOut,toBase64,DRAG_OUT_TYPE,DRAG_OUT_REQUEST,DRAG_OUT_RESULT,DRAG_OUT_RELAY} from '../src/drag-out.js';

const RELAY_SOURCE=readFileSync(new URL(`../${DRAG_OUT_RELAY}`,import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));

// What a drag carries. Chrome's own, reduced to what these two halves use.
class Transfer{
  constructor(){this.data=new Map();this.list=[];this.items={add:file=>this.list.push(file)};this.dropEffect='none';this.effectAllowed='all';}
  get types(){return [...this.data.keys(),...(this.list.length?['Files']:[])];}
  get files(){return this.list;}
  setData(type,value){this.data.set(type,String(value));}
  getData(type){return this.data.get(type)||'';}
  clearData(){this.data.clear();}
}
// A stand-in for the extension APIs the side panel half uses, recording what
// was injected where and delivering messages the way Chrome does.
function fakeChrome({activeTab=7,injectable=true}={}){
  const listeners=[],activated=[],injected=[];
  return {injected,activated,
    runtime:{onMessage:{addListener:fn=>listeners.push(fn)}},
    tabs:{query:async()=>[{id:activeTab}],onActivated:{addListener:fn=>activated.push(fn),removeListener:fn=>activated.splice(activated.indexOf(fn),1)}},
    scripting:{executeScript:async target=>{injected.push(target);if(!injectable)throw Error('Cannot access this page.');}},
    // One message, answered by the first listener that says it will answer.
    send(message,sender={tab:{id:activeTab}}){
      return new Promise(resolve=>{
        for(const listener of listeners)if(listener(message,sender,resolve)===true)return;
        resolve(undefined);
      });
    }};
}
function dragStart(document,row){
  const transfer=new Transfer();
  transfer.setData('text/uri-list','https://drive.google.com/file/d/k1/view');
  const event=new document.defaultView.Event('dragstart',{bubbles:true});
  event.dataTransfer=transfer;
  row.dispatchEvent(event);
  return {event,transfer};
}
const dragEnd=(document,row,dropEffect)=>{
  const event=new document.defaultView.Event('dragend',{bubbles:true});
  event.dataTransfer={dropEffect};
  row.dispatchEvent(event);
};

test('the relay spells the same names as the side panel half',()=>{
  for(const name of [DRAG_OUT_TYPE,DRAG_OUT_REQUEST,DRAG_OUT_RESULT])assert.ok(RELAY_SOURCE.includes(`'${name}'`),name);
});

test('bytes survive the trip as text, however long the document',async()=>{
  const bytes=new Uint8Array(200000).map((_,at)=>at*7%256);
  const back=Buffer.from(await toBase64(new Blob([bytes])),'base64');
  assert.deepEqual(new Uint8Array(back),bytes);
});

// The drag carries an id and nothing else; the document is fetched as it
// starts and handed once, to a page's relay, for the id this panel issued.
test('a drag carries only an id, arms the page beside the panel, and hands the document over once',async()=>{
  const {document}=parseHTML('<html><body><a id="row" href="https://drive.google.com/file/d/k1/view">K-1 - Vista.pdf</a></body></html>');
  globalThis.document=document;
  const chrome=fakeChrome();
  const start=dragOut(chrome);
  const row=document.getElementById('row');
  const results=[];let reads=0;
  row.addEventListener('dragstart',event=>start(event,{
    read:async()=>{reads++;return new File(['%PDF synthetic'],'K-1 - Vista.pdf',{type:'application/pdf'});},
    onResult:result=>results.push(result)}));
  const {transfer}=dragStart(document,row);
  await settle();

  // The Drive address is gone, so a page that is not listening has nothing to open.
  assert.deepEqual(transfer.types,[DRAG_OUT_TYPE]);
  assert.equal(transfer.effectAllowed,'copy');
  const id=transfer.getData(DRAG_OUT_TYPE);
  assert.match(id,/^[0-9a-f-]{36}$/);
  assert.equal(reads,1,'fetched as the drag starts, not when it lands');
  assert.deepEqual(chrome.injected,[{target:{tabId:7,allFrames:true},files:[DRAG_OUT_RELAY]}]);
  // A tab brought forward mid-drag is armed too.
  chrome.activated[0]({tabId:9});
  assert.equal(chrome.injected.at(-1).target.tabId,9);

  // Another page's id, or a message from something that is not a page, goes unanswered here.
  assert.equal(await chrome.send({type:DRAG_OUT_REQUEST,id:'11111111-1111-4111-8111-111111111111'}),undefined);
  assert.equal(await chrome.send({type:DRAG_OUT_REQUEST,id},{}),undefined);

  const reply=await chrome.send({type:DRAG_OUT_REQUEST,id});
  assert.deepEqual([reply.ok,reply.name,reply.type],[true,'K-1 - Vista.pdf','application/pdf']);
  assert.equal(Buffer.from(reply.data,'base64').toString(),'%PDF synthetic');
  // Once.
  assert.equal((await chrome.send({type:DRAG_OUT_REQUEST,id})).ok,false);

  await chrome.send({type:DRAG_OUT_RESULT,id,accepted:false,error:''});
  assert.deepEqual(results,[{accepted:false,error:''}]);
  dragEnd(document,row,'copy');
  assert.equal(chrome.activated.length,0,'the drag no longer follows tabs once it is over');
});

test('a document that cannot be read says why to the page that asked',async()=>{
  const {document}=parseHTML('<html><body><a id="row" href="#">Gone.pdf</a></body></html>');
  globalThis.document=document;
  const chrome=fakeChrome();
  const start=dragOut(chrome);
  const row=document.getElementById('row');
  row.addEventListener('dragstart',event=>start(event,{read:async()=>{throw Error('That document is no longer in the tax folder.');}}));
  const {transfer}=dragStart(document,row);
  const id=transfer.getData(DRAG_OUT_TYPE);
  const reply=await chrome.send({type:DRAG_OUT_REQUEST,id});
  assert.deepEqual(reply,{ok:false,error:'That document is no longer in the tax folder.'});
  // The relay always reports back, which is what lets the panel forget the drag.
  await chrome.send({type:DRAG_OUT_RESULT,id,accepted:false,error:reply.error});
});

// A browser page or the Web Store cannot be scripted, so a drop there does
// nothing — and that is said, where a drag the owner let go of is not.
test('a page the relay cannot reach is named when the drag lands nowhere',async()=>{
  for(const [injectable,expected] of [[false,1],[true,0]]){
    const {document}=parseHTML('<html><body><a id="row" href="#">K-1.pdf</a></body></html>');
    globalThis.document=document;
    const chrome=fakeChrome({injectable});
    const start=dragOut(chrome);
    const row=document.getElementById('row');
    const results=[];
    row.addEventListener('dragstart',event=>start(event,{read:async()=>new File(['x'],'K-1.pdf'),onResult:result=>results.push(result)}));
    dragStart(document,row);
    await settle();
    dragEnd(document,row,'none');
    await settle();
    assert.equal(results.length,expected);
    if(expected)assert.match(results[0].error,/can’t take files/);
  }
});

test('with no page beside it there is nothing to hand to',()=>{
  assert.equal(dragOut({}),null);
  assert.equal(dragOut(undefined),null);
});

// The page half. linkedom runs every listener in bubbling order and has no
// DataTransfer, so what this holds is the exchange — the drop caught, the
// document asked for, the file dropped again where the pointer let go — not
// that the relay runs before the page's own handlers; that is checked in Chrome.
function relayPage(html,{reply}={}){
  const {document,window}=parseHTML(html);
  const sent=[];
  class DragEvent extends window.Event{constructor(type,init={}){super(type,init);this.dataTransfer=init.dataTransfer;this.clientX=init.clientX;}}
  Object.assign(globalThis,{document,Element:window.Element,Event:window.Event,DragEvent,DataTransfer:Transfer,
    addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window),
    chrome:{runtime:{sendMessage:async message=>{sent.push(message);return message.type===DRAG_OUT_REQUEST?reply:undefined;}}}});
  delete globalThis.ericsToolsDragOut;
  new Function(RELAY_SOURCE)();
  const drop=(target,id='drag-1')=>{
    const transfer=new Transfer();transfer.setData(DRAG_OUT_TYPE,id);
    const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:40});
    target.dispatchEvent(event);
    return event;
  };
  return {document,window,sent,drop};
}
const PDF={ok:true,name:'K-1 - Vista.pdf',type:'application/pdf',data:Buffer.from('%PDF synthetic').toString('base64')};

test('the page is handed a real file where the drop landed',async()=>{
  const {document,sent,drop}=relayPage('<html><body><div id="zone"><p id="inside">Drag and drop files</p></div></body></html>',{reply:PDF});
  const received=[];
  document.getElementById('zone').addEventListener('drop',event=>{
    if(!event.dataTransfer.files.length)return;
    event.preventDefault();
    received.push(...event.dataTransfer.files);
  });
  const native=drop(document.getElementById('inside'));
  assert.equal(native.defaultPrevented,true,'the drop holding only an id is the relay’s');
  await settle();
  assert.equal(received.length,1);
  assert.deepEqual([received[0].name,received[0].type,await received[0].text()],['K-1 - Vista.pdf','application/pdf','%PDF synthetic']);
  assert.deepEqual(sent.map(message=>message.type),[DRAG_OUT_REQUEST,DRAG_OUT_RESULT]);
  assert.deepEqual([sent[0].id,sent[1].accepted,sent[1].error],['drag-1',true,'']);
});

test('a spot with no drop handler gives the file to the upload field near it',async()=>{
  const {document,sent,drop}=relayPage('<html><body><form><label id="pick">Select Files</label><input id="field" type="file"></form></body></html>',{reply:PDF});
  const field=document.getElementById('field');
  let changed=0;
  field.addEventListener('change',()=>changed++);
  drop(document.getElementById('pick'));
  await settle();
  assert.equal(field.files[0].name,'K-1 - Vista.pdf');
  assert.equal(changed,1);
  assert.equal(sent[1].accepted,true);
});

test('a page with nowhere to put a file, or a document that did not come, says so to the panel',async()=>{
  const bare=relayPage('<html><body><p id="text">Nothing here takes files</p></body></html>',{reply:PDF});
  bare.drop(bare.document.getElementById('text'));
  await settle();
  assert.deepEqual([bare.sent[1].accepted,bare.sent[1].error],[false,'']);

  const failed=relayPage('<html><body><div id="zone"></div></body></html>',{reply:{ok:false,error:'That document is no longer in the tax folder.'}});
  failed.drop(failed.document.getElementById('zone'));
  await settle();
  assert.deepEqual([failed.sent[1].accepted,failed.sent[1].error],[false,'That document is no longer in the tax folder.']);
});

test('a drag that is not the panel’s passes through untouched',async()=>{
  const {document,sent}=relayPage('<html><body><div id="zone"></div></body></html>',{reply:PDF});
  const transfer=new Transfer();transfer.setData('text/plain','hello');
  const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer});
  document.getElementById('zone').dispatchEvent(event);
  await settle();
  assert.equal(event.defaultPrevented,false);
  assert.equal(sent.length,0);
});
