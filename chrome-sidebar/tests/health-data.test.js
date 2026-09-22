import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHealth,validateHealthRecord,validateHealthPayload,validateRelative,validateRevision,parseWhen,historyGroups,detectRelative,summaryOf,includedInSummary,
  applyMedicationChange,markReviewed,isReviewed,reviewDate,medicationStatusLabel,searchHealth,exportLabel,visitSummaryLines,recordTitle,assertHealthWriteFits,HEALTH_NOTE_MAX,UNDATED} from '../src/health-data.js';
import {secretVault,sealSecret,openSecret} from '../src/secret-vault.js';
const sealed=JSON.stringify({v:1,iv:'aa',ciphertext:'bb'});
const record=(over={})=>validateHealthRecord({note:'Synthetic note',createdAt:'2026-09-01T00:00:00.000Z',...over});
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;

test('the Worker accepts only a sealed envelope, and nothing about the record is readable in it',()=>{
  assert.deepEqual(normalizeHealth({secret:sealed,note:'My dad had Parkinson’s',type:'Condition'}),{v:1,secret:sealed});
  for(const bad of [{},{secret:''},{secret:'My dad had Parkinson’s'},{secret:JSON.stringify({v:2,iv:'a',ciphertext:'b'})}])
    assert.throws(()=>normalizeHealth(bad),/encrypted on your device/);
  assert.throws(()=>assertHealthWriteFits(id(1),'x'.repeat(70*1024)),/too large/);
  assertHealthWriteFits(id(1),sealed);
});

test('a sentence is a complete record: nothing but the note is required, and its uncertainty is kept',()=>{
  const saved=record({note:'Possible migraine, never diagnosed'});
  assert.equal(saved.type,'Note');
  assert.equal(saved.when,'');
  assert.equal(saved.status,'Unspecified');
  assert.equal(saved.summary,'auto');
  assert.equal(saved.note,'Possible migraine, never diagnosed');
  assert.equal(recordTitle(record({note:'  \nAppendix removed around 2012; no complications\nMore detail'})),'Appendix removed around 2012; no complications');
  assert.throws(()=>validateHealthRecord({note:'   '}),/Enter a note/);
  assert.throws(()=>validateHealthRecord({note:'x'.repeat(HEALTH_NOTE_MAX+1)}),/8,000 characters/);
  assert.throws(()=>validateHealthRecord({note:'x',type:'Diagnosis code'}),/record types/);
  // A medication without status or directions saves as itself.
  const medication=record({note:'Cetirizine',type:'Medication'});
  assert.equal(medicationStatusLabel(medication),'Status not recorded');
  assert.equal(includedInSummary(medication),false,'an unspecified medication is not silently current');
  // Type changes keep what the record already carried.
  const retyped=validateHealthRecord({...medication,directions:'10 mg',status:'Taking',type:'Note'});
  assert.equal(retyped.directions,'10 mg');
  assert.equal(retyped.status,'Taking');
});

test('the envelope opens on the device and refuses an unknown kind or a newer version',async()=>{
  const vault=secretVault({credentials:{get:async()=>{throw Error('no passkey in this test');}},subtle:crypto.subtle,origin:'https://example.com'});
  const key=await vault.unlockWithRecoveryCode('EV1-'+'A'.repeat(52));
  const payload=record({note:'My dad had Parkinson’s',relative:id(2)});
  const envelope=await sealSecret(key,`health:${id(1)}`,payload);
  assert.equal(envelope.includes('Parkinson'),false);
  assert.deepEqual(validateHealthPayload(await openSecret(key,`health:${id(1)}`,envelope)),payload);
  await assert.rejects(()=>openSecret(key,id(1),envelope),undefined,'the identity is namespaced');
  assert.throws(()=>validateHealthPayload({kind:'attachment',v:1}),/newer version/);
  assert.throws(()=>validateHealthPayload({kind:'record',v:2,note:'x'}),/newer version/);
  assert.deepEqual(validateRelative({label:' Dad ',aliases:['Father','Father','']}),{kind:'relative',v:1,label:'Dad',side:'Unspecified',aliases:['Father'],createdAt:''});
  assert.equal(validateRevision({record:id(1),at:'2026-09-02T00:00:00Z',change:'edit',prior:payload}).prior.note,payload.note);
});

test('when is kept as written; only the unambiguous forms sort, and no day is ever invented',()=>{
  assert.deepEqual(parseWhen('2012-03-04'),{text:'2012-03-04',sort:'2012-03-04',precision:'day',approx:false});
  assert.equal(parseWhen('2012-03').precision,'month');
  assert.equal(parseWhen('2012').sort,'2012-12-31');
  assert.deepEqual(parseWhen('around 2012'),{text:'around 2012',sort:'2012-12-31',precision:'year',approx:true});
  assert.equal(parseWhen('2010–2012').precision,'range');
  for(const words of ['as a child','early 50s','age 8','3/4/12'])assert.deepEqual(parseWhen(words),{text:words,sort:null,precision:'none',approx:false});
  assert.match(parseWhen('2012-02-30').error,/not a real date/);
  assert.equal(parseWhen('2012-02-30').text,'2012-02-30','the input is preserved with the error');
  const groups=historyGroups([
    record({note:'Undated older entry',createdAt:'2026-01-01T00:00:00Z'}),
    record({note:'Surgery',when:'around 2012'}),
    record({note:'Undated newer entry',createdAt:'2026-05-01T00:00:00Z'}),
    record({note:'Broke wrist',when:'2024-06-01'}),
    record({note:'Age 8',when:'age 8'})
  ]);
  assert.deepEqual(groups.map(group=>group.title),['2024','2012',UNDATED]);
  assert.deepEqual(groups.at(-1).records.map(item=>item.note),['Age 8','Undated newer entry','Undated older entry'],'undated entries order by entry time, without showing it as a date');
});

test('a clear family subject is recognized on the device, and only a clear one',()=>{
  const dad={id:id(2),label:'Dad',side:'Paternal',aliases:[]};
  const mary1={id:id(3),label:'Aunt Mary',side:'Unspecified',aliases:[]},mary2={id:id(4),label:'Aunt Mary',side:'Unspecified',aliases:[]};
  assert.deepEqual(detectRelative('My dad had Parkinson’s',[]),{status:'new',label:'Dad',side:'Unspecified'},'a parent is on no side of the family');
  assert.equal(detectRelative('My dad had Parkinson’s',[dad]).status,'found');
  assert.equal(detectRelative('my father was diagnosed with diabetes at 60',[dad]).relative,dad,'father is dad');
  assert.deepEqual(detectRelative('My maternal grandmother had breast cancer',[]),{status:'new',label:'Maternal grandmother',side:'Maternal'});
  assert.deepEqual(detectRelative('My mom’s father died of a stroke',[]),{status:'new',label:'Mom’s father',side:'Maternal'});
  assert.deepEqual(detectRelative('My sister Jane has asthma',[]),{status:'new',label:'Jane (sister)',side:'Unspecified'});
  assert.deepEqual(detectRelative('My aunt Mary had glaucoma',[]),{status:'new',label:'Aunt Mary',side:'Unspecified'});
  const twice=detectRelative('My aunt Mary had glaucoma',[mary1,mary2]);
  assert.equal(twice.status,'ambiguous');
  assert.deepEqual(twice.matches.map(match=>match.id),[mary1.id,mary2.id]);
  // Negation and hearsay stay in the note; the subject is still the relative.
  assert.equal(detectRelative('My dad did not have diabetes',[dad]).status,'found');
  // The owner's own condition is never reassigned to a relative.
  for(const mine of ['Dad said I have migraines','My dad said I have migraines','My dad thinks I should see someone','Migraine on my dad’s birthday'])
    assert.equal(detectRelative(mine,[dad]).status,'none',mine);
  // A step relation is its own person unless a saved label says otherwise.
  assert.equal(detectRelative('My stepdad had gout',[dad]).status,'new');
  const stepdad={id:id(5),label:'Dad (stepfather)',side:'Unspecified',aliases:[]};
  assert.equal(detectRelative('My dad had gout',[dad,stepdad]).status,'ambiguous','two people a sentence could mean are asked about, never merged');
  assert.equal(detectRelative('My papa had gout',[{...dad,aliases:['Papa']}]).status,'none','papa is not in the vocabulary');
  assert.equal(detectRelative('My father had gout',[{...dad,label:'Papa',aliases:['Father']}]).status,'found','an alias is a shortcut to a person');
});

test('the summary is computed from the records and never says what is absent',()=>{
  const allergy=record({note:'Penicillin — hives',type:'Allergy or reaction'});
  const excluded=record({note:'Latex',type:'Allergy or reaction',summary:'exclude'});
  const taking=record({note:'Cetirizine',type:'Medication',status:'Taking',directions:'10 mg each morning'});
  const stopped=record({note:'Ibuprofen',type:'Medication',status:'Stopped'});
  const ongoing=record({note:'Asthma',type:'Condition',status:'Ongoing'});
  const past=record({note:'Broke wrist',type:'Condition',status:'Past',when:'2024'});
  const chosen=record({note:'Appendix removed around 2012',type:'Procedure',summary:'include',when:'around 2012'});
  const family=record({note:'My dad had Parkinson’s',relative:id(2),summary:'include'});
  const familyQuiet=record({note:'My mom had asthma',relative:id(2)});
  const sections=summaryOf([allergy,excluded,taking,stopped,ongoing,past,chosen,family,familyQuiet]);
  assert.deepEqual(Object.fromEntries(Object.entries(sections).map(([key,list])=>[key,list.map(item=>item.note)])),
    {allergies:['Penicillin — hives'],medications:['Cetirizine'],ongoing:['Asthma'],other:['Appendix removed around 2012'],family:['My dad had Parkinson’s']});
  // A family note never becomes the owner's condition.
  assert.equal(sections.ongoing.some(item=>item.relative),false);
  const lines=visitSummaryLines({records:[{...taking,id:id(8)}],relatives:[],selected:[id(8)],preparedAt:'2026-09-22T12:00:00Z'});
  assert.equal(lines.some(line=>/No known|No medications|No family/i.test(line.text)),false);
  assert.ok(lines.some(line=>line.text==='Medications'));
  assert.ok(lines.some(line=>line.text==='Directions: 10 mg each morning'));
  assert.equal(lines.some(line=>line.text==='Allergies and reactions'),false,'an empty section is left out, never filled in');
});

test('a medication’s changes keep their history, and a backdated change never overwrites the present unguessed',()=>{
  const at='2026-09-22T10:00:00.000Z';
  let medication={...record({note:'Cetirizine',type:'Medication',directions:'10 mg each morning',status:'Taking'}),id:id(7)};
  medication=applyMedicationChange(medication,{kind:'directions',to:'5 mg each morning',effective:'2026-09-01',at});
  assert.equal(medication.directions,'5 mg each morning');
  assert.deepEqual(medication.changes.map(change=>[change.kind,change.from,change.to,change.effective,change.applied]),[['directions','10 mg each morning','5 mg each morning','2026-09-01',true]]);
  assert.throws(()=>applyMedicationChange(medication,{kind:'directions',to:'20 mg',effective:'2026-08-01',at}),error=>error.code==='ordering');
  const history=applyMedicationChange(medication,{kind:'directions',to:'20 mg',effective:'2026-08-01',at,current:false});
  assert.equal(history.directions,'5 mg each morning','history only leaves the regimen alone');
  assert.equal(history.changes.at(-1).applied,false);
  assert.throws(()=>applyMedicationChange(medication,{kind:'stopped',effective:'last spring',at}),error=>error.code==='ordering','an unplaceable date is asked about');
  const stopped=applyMedicationChange(medication,{kind:'stopped',at});
  assert.equal(stopped.status,'Stopped');
  assert.equal(stopped.changes.at(-1).effective,'','no effective date is recorded as none');
  assert.throws(()=>applyMedicationChange(stopped,{kind:'resumed',to:'',at}),/Review the directions/);
  const resumed=applyMedicationChange(stopped,{kind:'resumed',to:'5 mg each morning',effective:'2026-10-01',at});
  assert.equal(resumed.status,'Taking');
  assert.equal(resumed.changes.length,3,'the stopped period stays in the history');
  // Review is of the record as it stands; an edit makes it stale.
  const reviewed=markReviewed(resumed,at);
  assert.equal(isReviewed(reviewed),true);
  assert.equal(isReviewed({...reviewed,directions:'10 mg'}),false);
  assert.equal(reviewDate([reviewed,markReviewed(record({note:'Vitamin D',type:'Medication'}),'2026-09-23T10:00:00.000Z')]),at,'the aggregate date is the earliest review');
  assert.equal(reviewDate([reviewed,record({note:'Vitamin D',type:'Medication'})]),'','no aggregate until every one is reviewed');
});

test('search reads the words, and export labels a relative only as safely as the label allows',()=>{
  const dad={id:id(2),label:'Dad',side:'Paternal',aliases:[]};
  const records=[record({note:'Cetirizine for seasonal allergies',type:'Medication',directions:'as needed'}),record({note:'My dad had Parkinson’s',relative:dad.id})];
  assert.equal(searchHealth(records,[dad],'SEASONAL').length,1);
  assert.equal(searchHealth(records,[dad],'as needed').length,1);
  assert.equal(searchHealth(records,[dad],'dad').length,1);
  assert.equal(searchHealth(records,[dad],'paternal').length,1,'family side matches');
  assert.equal(searchHealth(records,[dad],'').length,2);
  assert.equal(exportLabel(dad),'Dad');
  assert.equal(exportLabel({label:'Maternal grandmother'}),'Maternal grandmother');
  assert.equal(exportLabel({label:'Aunt Mary'}),'Aunt');
  assert.equal(exportLabel({label:'Jane (sister)'}),'Sister');
  assert.equal(exportLabel({label:'Bob'}),'Relative');
  const lines=visitSummaryLines({records:[{...records[1],id:id(9)}],relatives:[dad],selected:[id(9)],labels:{[dad.id]:'Father'},preparedAt:'2026-09-22T12:00:00Z'});
  assert.ok(lines.some(line=>line.text==='My dad had Parkinson’s'),'the note is shown as it is, names and all');
  assert.ok(lines.some(line=>line.text==='Father'));
});
