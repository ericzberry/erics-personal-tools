import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSession} from '../src/session-selection.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('automatically follows practice instead of the empty real league selection', () => {
  const league = {mode:'league',connected:false,lastSeenAt:1,state:'waiting'};
  const practice = {mode:'practice',connected:true,lastSeenAt:10000,state:'drafting',picks:[1,2,3,4,5,6]};
  assert.equal(selectSession({league,practice},'auto',10001),practice);
  assert.equal(selectSession({league,practice},'league',10001),league);
});
test('active draft takes priority over a completed tab heartbeat', () => {
  const current={connected:true,lastSeenAt:10000,state:'drafting'};
  const old={connected:true,lastSeenAt:11000,state:'complete'};
  assert.equal(selectSession({old,current},'auto',11001),current);
  assert.equal(selectSession({},'auto'),undefined);
});
test('transient message failure retries; failed acknowledgement is not cached', async () => {
  let heartbeat, attempts=0, disconnected=false;
  const context=vm.createContext({
    EspnDraftReader:{read:()=>({picks:[]})}, document:{body:{}},location:{href:'test'},
    chrome:{runtime:{sendMessage:async()=>{ attempts++; if(attempts===1)throw Error('Worker unavailable');return {ok:attempts>2};}}},
    MutationObserver:class{observe(){} disconnect(){disconnected=true;}},
    setInterval:fn=>{heartbeat=fn;},clearInterval(){},setTimeout(){},Date,JSON
  });
  vm.runInContext(readFileSync(new URL('../src/content.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  await heartbeat();await heartbeat();
  assert.equal(attempts,3);assert.equal(disconnected,false);
});
