import test from 'node:test';
import assert from 'node:assert/strict';
import {observeToolSize} from '../public/app/tool-layout.js';

test('tool layout follows async growth, disclosure changes, and shrinking tools without a resize loop', () => {
  let height=180, overflow=180, resized, mutated, frame;
  const events={}, reports=[];
  const content={
    getBoundingClientRect:()=>({height}), get scrollHeight(){return overflow;},
    addEventListener:(name,handler)=>events[name]=handler, ownerDocument:{}
  };
  const env={
    ResizeObserver:class {constructor(callback){resized=callback;} observe(target){assert.equal(target,content);}},
    MutationObserver:class {constructor(callback){mutated=callback;} observe(target){assert.equal(target,content);}},
    requestAnimationFrame:callback=>{frame=callback;},
    addEventListener:(name,handler)=>events[name]=handler
  };
  observeToolSize(content,value=>reports.push(value),env);
  frame(); assert.deepEqual(reports,[192]);
  // Async data and disclosure mutations must work even without a resize event.
  height=1500; overflow=1501; mutated(); frame();
  height=1700; overflow=1700; events.toggle(); frame();
  height=250; overflow=250; resized(); frame();
  resized(); frame(); // Parent resizing must not create an endless message loop.
  assert.deepEqual(reports,[192,1513,1712,262]);
  height=400; overflow=400; events.resize(); frame();
  assert.equal(reports.at(-1),412);
});
