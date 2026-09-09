import test from 'node:test';
import assert from 'node:assert/strict';
import {travelChanges} from '../src/travel-changes.js';
test('extension change markers reach every wallet without broadcasting private records',async()=>{
  const listeners=new Set(),writes=[];
  const storage={local:{set:async value=>{writes.push(value);for(const listener of listeners)listener(Object.fromEntries(Object.entries(value).map(([key,newValue])=>[key,{newValue}])),'local');}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
  let updates=0;
  const editor=travelChanges(()=>{},{storage}),sidebar=travelChanges(()=>updates++,{storage});
  await editor.publish();await editor.publish();
  assert.equal(updates,2);assert.equal(Object.keys(writes[0]).length,1);
  assert.notDeepEqual(writes[0],writes[1]);assert.match(writes[0]['travel-record-change'],/^[a-f0-9-]{36}$/);
  sidebar.close();await editor.publish();assert.equal(updates,2);editor.close();assert.equal(listeners.size,0);
});
test('non-extension previews retain channel delivery and cleanup',()=>{
  let channel,updates=0;
  class Channel {constructor(){channel=this;}postMessage(value){this.onmessage({data:value});}close(){this.closed=true;}}
  const changes=travelChanges(()=>updates++,{storage:null,Channel});
  changes.publish();assert.equal(updates,1);changes.close();assert.equal(channel.closed,true);
});
