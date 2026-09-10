// Personal records. Every value is sealed on the device before it is saved, so
// the cloud holds an opaque envelope and this validator never sees a plaintext
// value — only the label, category, and a short hint the owner chose to make
// visible. Validation is shared with the Worker, which therefore cannot be
// talked into storing an unsealed value.
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const PERSONAL_CATEGORIES=['Identification','Contact','Medical','Insurance','Financial identity','Employment','Family','Legal','Accounts','Other'];
// A sealed envelope is base64 and grows with its payload; this ceiling leaves
// room for a long document reference plus notes.
export const PERSONAL_SECRET_MAX=24576;
export const PERSONAL_VALUE_MAX=8000;
export const PERSONAL_NOTES_MAX=8000;

const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
const isSealedEnvelope=value=>{
  try{const parsed=JSON.parse(value);return parsed?.v===1&&typeof parsed.iv==='string'&&typeof parsed.ciphertext==='string';}catch{return false;}
};

export function normalizePersonal(input,previous={}){
  const get=key=>input[key]??previous[key];
  const category=text(get('category'),40,'a category',true);
  if(!PERSONAL_CATEGORIES.includes(category))fail('Choose a category for this record.');
  const secret=text(get('secret')??'',PERSONAL_SECRET_MAX,'the protected value',true);
  if(!isSealedEnvelope(secret))fail('Protected values must be encrypted on your device before they are saved.');
  const expires=text(get('expires')??'',10,'an expiration date');
  if(expires&&(!/^\d{4}-\d{2}-\d{2}$/.test(expires)||!Number.isFinite(Date.parse(expires))||new Date(expires).toISOString().slice(0,10)!==expires))fail('Enter a valid expiration date as YYYY-MM-DD.');
  return {
    category,
    label:text(get('label'),120,'a name for this record',true),
    person:text(get('person')??'',120,'who this record is about'),
    // Deliberately short and owner-written. A hint exists so a record can be
    // recognized in a list without unlocking; it is stored in the clear, so it
    // must never be the value itself.
    hint:text(get('hint')??'',40,'a hint'),
    expires,secret
  };
}

// The value and its notes travel together inside one envelope: they are sealed
// as a pair, so notes get the same protection as the value they describe.
export function validatePersonalPayload(payload){
  const value=text(payload?.value??'',PERSONAL_VALUE_MAX,'the value to protect',true);
  const notes=text(payload?.notes??'',PERSONAL_NOTES_MAX,'notes');
  return {value,notes};
}

export function groupPersonalRecords(records){
  const byLabel=(a,b)=>a.label.localeCompare(b.label,undefined,{sensitivity:'base',numeric:true});
  const known=PERSONAL_CATEGORIES.slice(0,-1),other=PERSONAL_CATEGORIES.at(-1);
  const extra=[...new Set(records.map(record=>record.category||other))].filter(value=>!PERSONAL_CATEGORIES.includes(value)).sort();
  return [...known,...extra,other]
    .map(category=>({category,records:records.filter(record=>(record.category||other)===category).sort(byLabel)}))
    .filter(group=>group.records.length);
}

// Records whose document expires soon deserve to be surfaced without opening
// each one; the expiry date is metadata, not a protected value.
export function expiringPersonal(records,{today=new Date().toISOString().slice(0,10),withinDays=90}={}){
  return records.filter(record=>!record.deleting&&!record.conflict&&record.expires)
    .map(record=>({...record,days:Math.round((Date.parse(record.expires)-Date.parse(today))/86400000)}))
    .filter(record=>record.days<=withinDays)
    .sort((a,b)=>a.days-b.days||a.label.localeCompare(b.label));
}
