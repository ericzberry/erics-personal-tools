// Health: a private notebook of personal and family history.
//
// A sentence is a complete record. The only thing a record needs is its note;
// a type, a date, directions and a status are organization the owner may add,
// never a form to fill in. Structure earns a field only where it changes what
// is found later, what the summary lists as current, or which relative a note
// sits under.
//
// Everything about a record — the note, its type, its date, which relative it
// concerns, its directions and status, its history — is sealed on the device
// before it is saved. The cloud holds one opaque envelope per object and the
// validator the Worker shares with the apps refuses anything else, so the
// Worker cannot tell a named relative or a medication from any other health
// record. The plaintext validators below run on the device, before sealing and
// again after opening.
const fail=message=>{throw Object.assign(Error(message),{status:400});};

export const HEALTH_TYPES=['Note','Condition','Procedure','Medication','Allergy or reaction','Test or result'];
export const CONDITION_STATUSES=['Unspecified','Ongoing','Past'];
export const MEDICATION_STATUSES=['Unspecified','Taking','Stopped'];
export const FAMILY_SIDES=['Unspecified','Maternal','Paternal','Both','Other'];
export const SUMMARY_CHOICES=[{value:'auto',text:'Automatic'},{value:'include',text:'Always include'},{value:'exclude',text:'Never include'}];
export const HEALTH_NOTE_MAX=8000;
export const HEALTH_WHEN_MAX=160;
export const HEALTH_DIRECTIONS_MAX=500;
export const HEALTH_LABEL_MAX=120;
export const HEALTH_ALIAS_MAX=20;
export const HEALTH_CHANGES_MAX=200;
// The record write travels as JSON inside the shared 64 KB request boundary,
// and the Worker seals what it receives again. The device measures the actual
// UTF-8 size of what it is about to queue against this, not the note's length.
export const HEALTH_ENVELOPE_MAX=60*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text=(value,max,label,required=false)=>{
  if(value===undefined||value===null)value='';
  if(typeof value!=='string')fail(`Enter ${label} as text.`);
  if(value.length>max)fail(`${label[0].toUpperCase()+label.slice(1)} can be up to ${max.toLocaleString('en-US')} characters; this is ${value.length.toLocaleString('en-US')}.`);
  const trimmed=value.trim();
  if(required&&!trimmed)fail(`Enter ${label}.`);
  return trimmed;
};
const isSealedEnvelope=value=>{
  try{const parsed=JSON.parse(value);return parsed?.v===1&&typeof parsed.iv==='string'&&typeof parsed.ciphertext==='string';}catch{return false;}
};
const isoTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():'';

// --- What the Worker sees. One field, already sealed.
export function normalizeHealth(input,previous={}){
  const secret=input?.secret??previous.secret;
  if(typeof secret!=='string'||!secret.trim())fail('Health records must be encrypted on your device before they are saved.');
  if(secret.length>HEALTH_ENVELOPE_MAX)fail('This record is too large to save. Shorten the note or split it into two.');
  if(!isSealedEnvelope(secret))fail('Health records must be encrypted on your device before they are saved.');
  return {v:1,secret};
}
// The size of the write as it will leave the device, measured on the bytes.
export const healthWriteBytes=(id,secret)=>new TextEncoder().encode(JSON.stringify({v:1,secret,id,revision:'00000000-0000-4000-8000-000000000000',operation:'00000000-0000-4000-8000-000000000000'})).length;
export function assertHealthWriteFits(id,secret){
  if(healthWriteBytes(id,secret)>HEALTH_ENVELOPE_MAX)fail('This record is too large to save. Shorten the note or split it into two.');
}

// --- What is inside the envelope.
export const HEALTH_KINDS=['record','relative','revision'];
const CHANGE_KINDS=['directions','stopped','taking','resumed'];

function validateChange(change){
  if(!change||typeof change!=='object')fail('A medication change is missing.');
  if(!CHANGE_KINDS.includes(change.kind))fail('Unknown medication change.');
  return {kind:change.kind,at:isoTime(change.at)||fail('A change needs the time it was recorded.'),
    effective:text(change.effective,HEALTH_WHEN_MAX,'the effective date'),
    from:text(change.from,HEALTH_DIRECTIONS_MAX,'the previous directions'),to:text(change.to,HEALTH_DIRECTIONS_MAX,'the new directions'),
    // A change recorded out of order stays in the history and leaves the
    // current regimen alone; `applied` says which it was.
    applied:change.applied!==false};
}
export function validateHealthRecord(payload){
  const note=text(payload?.note,HEALTH_NOTE_MAX,'a note',true);
  const type=payload?.type||HEALTH_TYPES[0];
  if(!HEALTH_TYPES.includes(type))fail('Choose one of the record types.');
  const relative=payload?.relative?String(payload.relative):'';
  if(relative&&!UUID.test(relative))fail('The relative this note is about could not be identified.');
  const status=payload?.status||'Unspecified';
  if(!MEDICATION_STATUSES.includes(status)&&!CONDITION_STATUSES.includes(status))fail('Choose one of the listed statuses.');
  const summary=payload?.summary||'auto';
  if(!['auto','include','exclude'].includes(summary))fail('Choose whether this record belongs in the summary.');
  const changes=Array.isArray(payload?.changes)?payload.changes.map(validateChange):[];
  if(changes.length>HEALTH_CHANGES_MAX)fail(`A medication keeps up to ${HEALTH_CHANGES_MAX} recorded changes. Start a new record for this medication to record more.`);
  return {kind:'record',v:1,note,type,when:text(payload?.when,HEALTH_WHEN_MAX,'when it happened'),relative,
    directions:text(payload?.directions,HEALTH_DIRECTIONS_MAX,'directions'),status,summary,changes,
    reviewedAt:isoTime(payload?.reviewedAt),reviewedFor:typeof payload?.reviewedFor==='string'?payload.reviewedFor.slice(0,200):'',
    createdAt:isoTime(payload?.createdAt)};
}
export function validateRelative(payload){
  const side=payload?.side||FAMILY_SIDES[0];
  if(!FAMILY_SIDES.includes(side))fail('Choose one of the family sides.');
  const aliases=Array.isArray(payload?.aliases)?payload.aliases.map(alias=>text(alias,HEALTH_LABEL_MAX,'an alias')).filter(Boolean):[];
  if(aliases.length>HEALTH_ALIAS_MAX)fail(`A relative keeps up to ${HEALTH_ALIAS_MAX} other names.`);
  return {kind:'relative',v:1,label:text(payload?.label,HEALTH_LABEL_MAX,'a name for this relative',true),side,aliases:[...new Set(aliases)],createdAt:isoTime(payload?.createdAt)};
}
export function validateRevision(payload){
  if(!UUID.test(String(payload?.record||'')))fail('A revision must name the record it belongs to.');
  return {kind:'revision',v:1,record:payload.record,at:isoTime(payload?.at)||fail('A revision needs the time it was saved.'),
    change:text(payload?.change,40,'what changed')||'edit',prior:validateHealthRecord(payload?.prior)};
}
// Every opened envelope goes through here, so a record damaged in storage or
// written by a newer client is refused with a reason rather than drawn.
export function validateHealthPayload(payload){
  if(!payload||typeof payload!=='object')fail('This health record could not be read.');
  if(payload.v!==undefined&&payload.v!==1)fail('This record was saved by a newer version of the app. Update to read it.');
  switch(payload.kind){
    case 'record':return validateHealthRecord(payload);
    case 'relative':return validateRelative(payload);
    case 'revision':return validateRevision(payload);
    default:fail('This record was saved by a newer version of the app. Update to read it.');
  }
}

// --- Reading a record.
// The first line the owner wrote is the record's title. Only its rendering is
// cut short; the note is kept whole.
export const recordTitle=record=>(record.note||'').split('\n').map(line=>line.trim()).find(Boolean)||'Untitled note';
export const isMedication=record=>record.type==='Medication';
export const isAllergy=record=>record.type==='Allergy or reaction';
export const isCondition=record=>record.type==='Condition';
// A medication whose status was never recorded is said so, not counted as taken.
export const medicationStatusLabel=record=>record.status==='Taking'?'Taking':record.status==='Stopped'?'Stopped':'Status not recorded';

// --- When. The owner's words are kept; a sortable date is added only for the
// unambiguous forms, and never displayed in their place.
const daysIn=(year,month)=>new Date(Date.UTC(year,month,0)).getUTCDate();
export function parseWhen(input=''){
  const when=String(input||'').trim();
  const none={text:when,sort:null,precision:'none',approx:false};
  if(!when)return none;
  let match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(when);
  if(match){
    const [,year,month,day]=match.map(Number);
    if(month<1||month>12||day<1||day>daysIn(year,month))return {...none,error:`${when} is not a real date. Enter it as YYYY-MM-DD, or describe it in words.`};
    return {text:when,sort:when,precision:'day',approx:false};
  }
  match=/^(\d{4})-(\d{2})$/.exec(when);
  if(match){
    const month=Number(match[2]);
    if(month<1||month>12)return {...none,error:`${when} is not a real month. Enter it as YYYY-MM, or describe it in words.`};
    return {text:when,sort:`${when}-31`,precision:'month',approx:false};
  }
  if(/^\d{4}$/.test(when))return {text:when,sort:`${when}-12-31`,precision:'year',approx:false};
  match=/^(?:about|around|circa|approx\.?|approximately|roughly|~|c\.)\s*(\d{4})\??$|^(\d{4})\?$/i.exec(when);
  if(match){const year=match[1]||match[2];return {text:when,sort:`${year}-12-31`,precision:'year',approx:true};}
  match=/^(\d{4})\s*(?:-|–|—|to|until)\s*(\d{4})$/i.exec(when);
  if(match)return {text:when,sort:`${match[1]}-12-31`,precision:'range',approx:true,end:match[2]};
  return none;
}
// Newest known event first; what has no date follows, newest entry first, and
// the entry time is never shown as if it were the event's.
const recordOrder=(a,b)=>{
  const [wa,wb]=[parseWhen(a.when).sort,parseWhen(b.when).sort];
  if(wa&&wb&&wa!==wb)return wb<wa?-1:1;
  if(wa&&!wb)return -1;
  if(!wa&&wb)return 1;
  return (b.createdAt||'').localeCompare(a.createdAt||'');
};
export const UNDATED='Undated';
export function historyGroups(records){
  const sorted=[...records].sort(recordOrder);
  const groups=new Map();
  for(const record of sorted){
    const parsed=parseWhen(record.when);
    const title=parsed.sort?parsed.sort.slice(0,4):UNDATED;
    if(!groups.has(title))groups.set(title,[]);
    groups.get(title).push(record);
  }
  return [...groups].map(([title,list])=>({title,records:list}));
}

// --- Relatives and the family view.
const collate=(a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true});
export function familyGroups(records,relatives){
  return [...relatives].sort((a,b)=>collate(a.label,b.label)).map(relative=>({relative,
    records:records.filter(record=>record.relative===relative.id).sort(recordOrder)}));
}
export const relativeOf=(record,relatives)=>record.relative?relatives.find(relative=>relative.id===record.relative)||null:null;
export const relativeLabel=(record,relatives)=>relativeOf(record,relatives)?.label||(record.relative?'Relative':'');

// --- Search: plain text, case-insensitive, over what the owner wrote.
export function searchHealth(records,relatives,query){
  const needle=String(query||'').trim().toLowerCase();
  if(!needle)return records;
  return records.filter(record=>[record.note,record.directions,record.when,record.type,relativeLabel(record,relatives),relativeOf(record,relatives)?.side||'']
    .join('\n').toLowerCase().includes(needle));
}

// --- The summary is computed from saved records, never kept as a second copy.
// An allergy is in unless the owner says otherwise; so is a medication being
// taken and a condition that is ongoing. Everything else — family history, a
// medication with no status, an old procedure — is in only when chosen.
export function includedInSummary(record){
  if(record.summary==='include')return true;
  if(record.summary==='exclude')return false;
  if(isAllergy(record))return true;
  if(isMedication(record)&&record.status==='Taking'&&!record.relative)return true;
  if(isCondition(record)&&record.status==='Ongoing'&&!record.relative)return true;
  return false;
}
export const SUMMARY_SECTIONS=[['allergies','Allergies and reactions'],['medications','Medications'],['ongoing','Ongoing issues'],['other','Other history'],['family','Family history']];
export function summaryOf(records,{selected}={}){
  const chosen=selected?records.filter(record=>selected.has(record.id)):records.filter(includedInSummary);
  const sections={allergies:[],medications:[],ongoing:[],other:[],family:[]};
  for(const record of chosen.sort(recordOrder)){
    if(record.relative)sections.family.push(record);
    else if(isAllergy(record))sections.allergies.push(record);
    else if(isMedication(record))sections.medications.push(record);
    else if(isCondition(record)&&record.status==='Ongoing')sections.ongoing.push(record);
    else sections.other.push(record);
  }
  return sections;
}

// --- Medication changes. Each is appended to the record's own dated history
// with the timestamp it was recorded at and, when the owner gave one, the date
// it took effect. Nothing here is advice: a status is what the owner recorded.
const latestEffective=record=>record.changes.filter(change=>change.applied&&parseWhen(change.effective).sort).map(change=>parseWhen(change.effective).sort).sort().at(-1)||null;
export function applyMedicationChange(record,{kind,to='',effective='',at=new Date().toISOString(),current}){
  if(!CHANGE_KINDS.includes(kind))fail('Unknown medication change.');
  const when=parseWhen(effective);
  if(when.error)fail(when.error);
  const latest=latestEffective(record);
  // A change dated before one already recorded cannot be assumed to describe
  // the present, and one whose date cannot be placed against an earlier one is
  // no clearer; the owner is asked which it is rather than guessed at.
  let applies=true;
  if(latest&&effective){
    if(!when.sort||when.sort<latest){
      if(current===undefined)throw Object.assign(Error('Does this change describe the current regimen, or an earlier period?'),{code:'ordering'});
      applies=current===true;
    }
  }
  const entry={kind,at,effective:when.text,applied:applies,
    from:kind==='directions'||kind==='resumed'?record.directions||'':record.status||'Unspecified',
    to:kind==='directions'||kind==='resumed'?to:kind==='stopped'?'Stopped':'Taking'};
  if((kind==='directions'||kind==='resumed')&&!to.trim())fail(kind==='resumed'?'Review the directions before resuming this medication.':'Enter the new directions.');
  const next={...record,changes:[...record.changes,validateChange(entry)]};
  if(applies){
    if(kind==='directions')next.directions=to.trim();
    if(kind==='resumed'){next.directions=to.trim();next.status='Taking';}
    if(kind==='stopped')next.status='Stopped';
    if(kind==='taking')next.status='Taking';
  }
  return validateHealthRecord(next);
}
// What a review is a review of. Editing the note, directions or status of a
// medication makes the last review stale; only Mark reviewed renews it.
export const reviewFingerprint=record=>JSON.stringify([record.note,record.directions,record.status]);
export const isReviewed=record=>!!record.reviewedAt&&record.reviewedFor===reviewFingerprint(record);
export const markReviewed=(record,at=new Date().toISOString())=>validateHealthRecord({...record,reviewedAt:at,reviewedFor:reviewFingerprint(record)});
// Current and unspecified medications are reviewed together; a stopped one is
// history. The aggregate date exists only when every one of them is reviewed
// as it stands now, and it is the earliest of those reviews.
export const medicationsToReview=records=>records.filter(record=>isMedication(record)&&!record.relative&&record.status!=='Stopped').sort(recordOrder);
export function reviewDate(records){
  const list=medicationsToReview(records);
  if(!list.length||!list.every(isReviewed))return '';
  return list.map(record=>record.reviewedAt).sort()[0];
}

// --- A clear family subject, recognized on the device. This is organization
// of who a note is about, not medical extraction: the sentence is kept whole,
// nothing is inferred about a disease, and negation or doubt stay in the words.
const RELATIONS=['dad','father','mom','mother','brother','sister','son','daughter','husband','wife','partner','grandfather','grandmother','grandpa','granddad','grandma','granny','aunt','uncle','cousin','nephew','niece','grandson','granddaughter','stepfather','stepmother','stepdad','stepmom','stepbrother','stepsister','twin'];
const QUALIFIERS=['maternal','paternal','older','younger','elder','eldest','oldest','youngest','late','step','half','biological','adoptive','adopted','identical','fraternal','little','big'];
const CANON={father:'dad',mother:'mom',grandpa:'grandfather',granddad:'grandfather',grandma:'grandmother',granny:'grandmother',stepdad:'stepfather',stepmom:'stepmother'};
// What may follow the relative for the sentence to be about them. "My dad said
// I have migraines" is about the owner, and is left alone.
const VERBS=/^(?:has|had|have|having|is|was|were|isn|wasn|got|gets|died|passed|developed|develops|suffered|suffers|underwent|undergoes|takes|took|taking|survived|battled|struggled|struggles|lives|lived|needed|needs|uses|used|wears|wore|broke|tested|carries|carried|smoked|smokes|drank|drinks|does|did|doesn|didn|never|also|recently|currently|still|just|both|and|probably|possibly|may|might|likely|apparently|reportedly|[,:;(\-–—])/i;
// Relationship words match with or without a capital, so a sentence starting
// with "My" and one starting mid-line both count; a name is told apart from a
// verb by its capital alone, so the rest stays case-sensitive.
const alternatives=list=>list.map(word=>`[${word[0].toUpperCase()}${word[0]}]${word.slice(1)}`).join('|');
const SUBJECT=new RegExp(`^\\s*[Mm]y\\s+((?:(?:${alternatives(QUALIFIERS)})[-\\s]+)*)(${alternatives(RELATIONS)})(?:\\s+([A-Z][\\p{L}'’-]{1,40}))?(?:['’]s\\s+((?:(?:${alternatives(QUALIFIERS)})[-\\s]+)*)(${alternatives(RELATIONS)}))?\\s*(.*)$`,'su');
const capitalize=word=>word?word[0].toUpperCase()+word.slice(1):'';
const tokens=value=>String(value||'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(token=>CANON[token]||token);
const sideOf=(qualifiers,relation)=>qualifiers.includes('maternal')||['mom','mother'].includes(relation)?'Maternal'
  :qualifiers.includes('paternal')||['dad','father'].includes(relation)?'Paternal':'';
export function detectRelative(note,relatives=[]){
  const match=SUBJECT.exec(String(note||''));
  if(!match)return {status:'none'};
  let [,qualifierText,relationRaw,name,ownedQualifierText,ownedRelation,rest]=match;
  const relation=CANON[relationRaw.toLowerCase()]||relationRaw.toLowerCase();
  // A capitalized verb is not a name.
  if(name&&VERBS.test(name.toLowerCase())){rest=`${name} ${rest}`.trim();name=undefined;}
  if(rest&&!VERBS.test(rest))return {status:'none'};
  const qualifiers=tokens(qualifierText);
  // The label keeps the owner's own words — Mother, Stepdad — and matching
  // uses the canonical ones, so "my father" still finds Dad.
  const said=[...String(qualifierText).toLowerCase().split(/[-\s]+/).filter(Boolean),relationRaw.toLowerCase()].join(' ');
  let label,side='',phrase;
  if(ownedRelation){
    // "my mom's father": the second relation is the person, the first says
    // whose side of the family they are on.
    const owned=CANON[ownedRelation.toLowerCase()]||ownedRelation.toLowerCase();
    const ownedQualifiers=tokens(ownedQualifierText);
    label=`${capitalize(said)}’s ${[...String(ownedQualifierText).toLowerCase().split(/[-\s]+/).filter(Boolean),ownedRelation.toLowerCase()].join(' ')}`;
    side=sideOf(qualifiers,relation);
    phrase=[...qualifiers,relation,...ownedQualifiers,owned];
  }else if(name){
    label=['aunt','uncle'].includes(relation)?`${capitalize(relationRaw.toLowerCase())} ${name}`:`${name} (${said})`;
    side=sideOf(qualifiers,relation);
    phrase=[...qualifiers,relation,name.toLowerCase()];
  }else{
    label=capitalize(said);
    side=sideOf(qualifiers,'');
    phrase=[...qualifiers,relation];
  }
  const known=relatives.filter(relative=>{
    const own=new Set([...tokens(relative.label),...(relative.aliases||[]).flatMap(tokens)]);
    return phrase.every(token=>own.has(token));
  });
  if(known.length===1)return {status:'found',relative:known[0],label:known[0].label};
  if(known.length>1)return {status:'ambiguous',matches:known,label};
  return {status:'new',label,side:side||'Unspecified'};
}

// --- The visit summary. The words the owner wrote, sectioned, with what the
// file is and when it was prepared. What is missing is left out: an empty
// section says nothing, and never "No known allergies".
const RELATIONSHIP_WORDS=new Set([...RELATIONS,...QUALIFIERS]);
// A relationship the file can safely name from a label, and "Relative" where a
// label does not separate into one. Editable in the preview.
export function exportLabel(relative){
  const label=String(relative.label||'').trim();
  const words=label.toLowerCase().replace(/['’]s\b/g,'').split(/[^\p{L}]+/u).filter(Boolean);
  const said=words.filter(word=>RELATIONSHIP_WORDS.has(word));
  if(words.length&&said.length===words.length)return capitalize(label);
  if(said.length)return capitalize(said.filter(word=>RELATIONS.includes(word)).join(' ')||said.join(' '));
  return 'Relative';
}
const dateWords=iso=>new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
export function visitSummaryLines({records,relatives,selected,labels={},preparedAt=new Date().toISOString(),review=''}){
  const sections=summaryOf(records,{selected:new Set(selected)});
  const lines=[{style:'title',text:'Health summary'},{style:'small',text:`Prepared ${dateWords(preparedAt)} from records the owner keeps. Not a clinical record; dates and wording are as the owner entered them.`}];
  if(review)lines.push({style:'small',text:`Medications reviewed by the owner ${dateWords(review)}.`});
  for(const [key,heading] of SUMMARY_SECTIONS){
    if(!sections[key].length)continue;
    lines.push({style:'heading',text:heading});
    for(const record of sections[key]){
      const relative=relativeOf(record,relatives);
      const qualifiers=[relative?(labels[relative.id]??exportLabel(relative)):'',record.type!=='Note'&&!(key==='medications'||key==='allergies')?record.type:'',record.when,
        isMedication(record)?medicationStatusLabel(record):isCondition(record)&&record.status!=='Unspecified'?record.status:''].filter(Boolean);
      lines.push({style:'body',text:record.note});
      if(record.directions)lines.push({style:'small',text:`Directions: ${record.directions}`});
      if(qualifiers.length)lines.push({style:'small',text:qualifiers.join(' · ')});
    }
  }
  return lines;
}
