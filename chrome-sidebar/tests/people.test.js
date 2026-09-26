import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePerson,ageInYear,familyContext,relevantPeople} from '../src/people-data.js';
test('family ages advance by reference year without invented birthdays',()=>{
  const child=normalizePerson({name:'Child 1',role:'Child',age:7,ageYear:2026});
  assert.equal(ageInYear(child,2027),8);assert.equal(ageInYear(child,2025),6);
  assert.equal(familyContext([child],2028)[0].age,9);assert.equal(child.birthdate,undefined);
  for(const v of [{age:7,ageYear:null},{age:-1,ageYear:2026},{age:1.5,ageYear:2026},{schemaVersion:2}])assert.throws(()=>normalizePerson({...child,...v}));
});
test('household membership and named locations stay distinct',()=>{
  const family=normalizePerson({name:'Partner name',role:'Partner'}),other=normalizePerson({name:'Friend name',role:'Other',location:'Example town'});
  assert.deepEqual(familyContext([family,other]).map(p=>p.inFamily),[true,false]);
  assert.equal(relevantPeople([family,other],'a stay for my family').length,1);
  assert.deepEqual(relevantPeople([family,other],'visit Friend name'),[other]);
  assert.deepEqual(relevantPeople([family,other],'summarize this ledger'),[]);
});
