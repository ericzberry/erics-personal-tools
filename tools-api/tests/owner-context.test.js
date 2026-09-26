import test from 'node:test';
import assert from 'node:assert/strict';
import {withOwnerContext} from '../src/owner-context.js';
const connection={people:[{name:'Adult',role:'You',age:null,ageYear:null},{name:'Child',role:'Child',age:7,ageYear:2026},{name:'Friend',role:'Other',location:'Example town',age:null,ageYear:null}]};
test('shared family context reaches each provider only when relevant',()=>{
  const chat={messages:[{role:'user',content:'Book for my family near Friend in 2027'}]};
  assert.match(withOwnerContext(connection,chat,'chat',2027).messages[0].content,/"age":8/);
  assert.match(withOwnerContext(connection,{input:chat.messages},'responses',2027).instructions,/"inFamily":false/);
  assert.match(withOwnerContext(connection,chat,'anthropic',2027).system,/referenceYear/);
  const unrelated={messages:[{role:'user',content:'Read this invoice'}]};assert.equal(withOwnerContext(connection,unrelated,'chat'),unrelated);
  assert.equal(withOwnerContext({},chat,'chat'),chat);assert.equal(chat.messages.length,1);
});
