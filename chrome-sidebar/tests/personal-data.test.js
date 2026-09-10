import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePersonal,validatePersonalPayload,groupPersonalRecords,expiringPersonal,PERSONAL_VALUE_MAX} from '../src/personal-data.js';
import {secretVault,sealSecret,openSecret} from '../src/secret-vault.js';
const sealed=JSON.stringify({v:1,iv:'aa',ciphertext:'bb'});
const base={category:'Identification',label:'Passport number',secret:sealed};

test('a record must arrive already sealed, so the Worker never holds a readable value',()=>{
  const record=normalizePersonal({...base,hint:'ends 7781',person:'Eric'});
  assert.equal(record.secret,sealed);
  assert.equal(record.value,undefined);
  for(const change of [{secret:''},{secret:'123-45-6789'},{secret:JSON.stringify({v:2,iv:'a',ciphertext:'b'})},{category:'Unknown'},{label:'  '},{expires:'2026-02-30'},{hint:'x'.repeat(41)}])
    assert.throws(()=>normalizePersonal({...base,...change}),undefined,JSON.stringify(change));
});

test('the value and its notes are sealed as one payload and open together',async()=>{
  const vault=secretVault({credentials:{get:async()=>{throw Error('no passkey in this test');}},subtle:crypto.subtle,origin:'https://example.com'});
  const key=await vault.unlockWithRecoveryCode('EV1-'+'A'.repeat(52));
  const payload=validatePersonalPayload({value:'123-45-6789',notes:'Issued 2019'});
  const envelope=await sealSecret(key,'record-1',payload);
  assert.equal(envelope.includes('123-45'),false,'the value must never appear in the envelope');
  assert.deepEqual(await openSecret(key,'record-1',envelope),payload);
  // An envelope moved to another record does not open: it is bound to its id.
  await assert.rejects(()=>openSecret(key,'record-2',envelope));
  assert.throws(()=>validatePersonalPayload({value:''}),/Enter the value to protect/);
  assert.throws(()=>validatePersonalPayload({value:'x'.repeat(PERSONAL_VALUE_MAX+1)}));
});

test('records group by category and a retired category keeps its own group before Other',()=>{
  const groups=groupPersonalRecords([
    {...normalizePersonal({...base,label:'Passport'}),id:'a'},
    {...normalizePersonal({...base,category:'Medical',label:'Blood type'}),id:'b'},
    {category:'Retired category',label:'Old record',id:'c'}
  ]);
  assert.deepEqual(groups.map(group=>group.category),['Identification','Medical','Retired category']);
});

test('expiring records are surfaced from metadata alone, without opening any value',()=>{
  const rows=expiringPersonal([
    {...normalizePersonal({...base,label:'Expired card',expires:'2026-08-01'}),id:'a'},
    {...normalizePersonal({...base,label:'Renews later',expires:'2027-08-01'}),id:'b'},
    {...normalizePersonal({...base,label:'No date'}),id:'c'}
  ],{today:'2026-09-10'});
  assert.deepEqual(rows.map(row=>row.label),['Expired card']);
  assert.ok(rows[0].days<0);
});
