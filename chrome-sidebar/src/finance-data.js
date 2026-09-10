// The asset ledger. Validation is shared with the Worker, so every rule here
// applies to a record however it arrives.
//
// Two deliberate constraints run through this file:
//  - Money is never guessed. Currencies are reported side by side and never
//    converted, because this application has no exchange-rate source it can
//    defend. Partial interests are weighted by the stated ownership share and
//    nothing else.
//  - History is keyed by as-of date. Saving a value for a date replaces that
//    date's snapshot, which makes the append idempotent: the device queues a
//    change, the Worker revalidates it, and both reach the same history.
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const FINANCE_KINDS=[
  {id:'bank',label:'Bank account',side:'asset',liquidity:'Liquid'},
  {id:'brokerage',label:'Brokerage',side:'asset',liquidity:'Liquid'},
  {id:'retirement',label:'Retirement',side:'asset',liquidity:'Semi-liquid'},
  {id:'private',label:'Private investment',side:'asset',liquidity:'Illiquid'},
  {id:'business',label:'Business interest',side:'asset',liquidity:'Illiquid'},
  {id:'realestate',label:'Real estate',side:'asset',liquidity:'Illiquid'},
  {id:'crypto',label:'Digital assets',side:'asset',liquidity:'Semi-liquid'},
  {id:'vehicle',label:'Vehicle',side:'asset',liquidity:'Illiquid'},
  {id:'other-asset',label:'Other asset',side:'asset',liquidity:'Semi-liquid'},
  {id:'mortgage',label:'Mortgage',side:'liability',liquidity:'Illiquid'},
  {id:'loan',label:'Loan',side:'liability',liquidity:'Illiquid'},
  {id:'credit',label:'Credit line',side:'liability',liquidity:'Liquid'},
  {id:'other-liability',label:'Other liability',side:'liability',liquidity:'Semi-liquid'}
];
export const LIQUIDITY=['Liquid','Semi-liquid','Illiquid'];
export const MAX_HISTORY=240;
export const FINANCE_SECRET_MAX=8192;
export const STALE_DAYS=90;
export const MAX_VALUE=1e12;
export const financeKind=id=>FINANCE_KINDS.find(kind=>kind.id===id)||null;
export const kindLabel=id=>financeKind(id)?.label||id||'Other asset';
export const kindSide=id=>financeKind(id)?.side||'asset';

const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
const amount=(value,label,{max=MAX_VALUE}={})=>{
  if(!['number','string'].includes(typeof value)||(typeof value==='string'&&!value.trim())||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max)fail(`Enter a valid ${label} between 0 and ${max.toLocaleString('en-US')}.`);
  // Two decimal places: money, not a float with a tail.
  return Math.round(Number(value)*100)/100;
};
const optionalAmount=(value,label,options)=>value===null||value===undefined||value===''?null:amount(value,label,options);
export const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const date=(value,label,required=false)=>{
  const clean=text(value??'',10,label,required);
  if(clean&&!isDate(clean))fail(`Enter a valid ${label} as YYYY-MM-DD.`);
  return clean;
};

// One snapshot per as-of date. Re-saving the same figure changes nothing, so a
// queued change revalidated by the Worker cannot duplicate an entry.
export function withSnapshot(history,entry){
  return [entry,...history.filter(existing=>existing.asOf!==entry.asOf)]
    .sort((a,b)=>b.asOf.localeCompare(a.asOf))
    .slice(0,MAX_HISTORY);
}
export function valueHistory(value){
  let parsed;
  try{parsed=typeof value==='string'?JSON.parse(value||'[]'):(value||[]);}catch{fail('Check the saved value history.');}
  if(!Array.isArray(parsed)||parsed.length>MAX_HISTORY)fail(`Save up to ${MAX_HISTORY} value snapshots per record.`);
  return parsed.map(entry=>{
    if(!entry||typeof entry!=='object')fail('Check the saved value history.');
    return {asOf:date(entry.asOf,'snapshot date',true),value:amount(entry.value,'snapshot value'),source:text(entry.source??'',120,'snapshot source')};
  }).sort((a,b)=>b.asOf.localeCompare(a.asOf));
}

export function normalizeFinance(input,previous={}){
  const get=key=>input[key]??previous[key];
  const kind=text(get('kind'),40,'an account type',true);
  if(!financeKind(kind))fail('Choose an account or liability type.');
  const liquidity=text(get('liquidity')??financeKind(kind).liquidity,20,'a liquidity');
  if(!LIQUIDITY.includes(liquidity))fail('Choose how quickly this can be converted to cash.');
  const currency=text(get('currency')??'USD',3,'a currency code',true).toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))fail('Enter a three-letter currency code, such as USD.');
  const ownership=amount(get('ownership')??100,'ownership share',{max:100});
  const asOf=date(get('asOf'),'as-of date',true);
  const value=amount(get('value'),'value');
  const source=text(input.source??'',120,'a value source');
  // The record's current figure is whichever snapshot is newest by date, so a
  // backdated correction is filed in history without rewriting today's total.
  const history=withSnapshot(valueHistory(get('history')??'[]'),{asOf,value,source});
  const secret=text(get('secret')??'',FINANCE_SECRET_MAX,'the protected account details');
  if(secret&&!isSealedEnvelope(secret))fail('Protected values must be encrypted on your device before they are saved.');
  const secretHint=text(get('secretHint')??'',24,'the protected value hint');
  if(!!secret!==!!secretHint)fail('Save the protected account details together with a short hint.');
  return {
    kind,name:text(get('name'),120,'a record name',true),institution:text(get('institution')??'',120,'an institution'),
    owner:text(get('owner')??'',120,'an owner'),currency,liquidity,ownership,
    value:history[0].value,asOf:history[0].asOf,
    rate:optionalAmount(get('rate'),'rate',{max:100}),
    commitment:optionalAmount(get('commitment'),'total commitment'),
    unfunded:optionalAmount(get('unfunded'),'unfunded commitment'),
    tags:text(get('tags')??'',200,'tags'),notes:text(get('notes')??'',4000,'notes'),
    secret,secretHint,history:JSON.stringify(history)
  };
}
// Kept local so this module stays importable by the Worker without pulling in
// the passkey vault, which needs browser crypto.
function isSealedEnvelope(value){
  try{const parsed=JSON.parse(value);return parsed?.v===1&&typeof parsed.iv==='string'&&typeof parsed.ciphertext==='string';}catch{return false;}
}

// Records still queued for deletion, or waiting on a conflict decision, are left
// out of every total: a figure nobody has agreed on should not move net worth.
const counted=records=>records.filter(record=>!record.deleting&&!record.conflict);
const share=record=>(Number(record.ownership??100))/100;
export const effectiveValue=record=>Math.round(Number(record.value||0)*share(record)*100)/100;
export const signedValue=record=>kindSide(record.kind)==='liability'?-effectiveValue(record):effectiveValue(record);
const sum=values=>Math.round(values.reduce((total,value)=>total+value,0)*100)/100;
const byTotal=(a,b)=>Math.abs(b.total)-Math.abs(a.total)||a.label.localeCompare(b.label);

export function financeCurrencies(records){
  const counts=new Map();
  for(const record of counted(records))counts.set(record.currency||'USD',(counts.get(record.currency||'USD')||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([currency,count])=>({currency,count}));
}

// Totals for one currency. Currencies are never combined: without a rate source
// this application can defend, a single "net worth" number across currencies
// would be invented rather than calculated.
export function financeSummary(records,{currency='USD',today=new Date().toISOString().slice(0,10)}={}){
  const rows=counted(records).filter(record=>(record.currency||'USD')===currency);
  const assets=rows.filter(record=>kindSide(record.kind)==='asset');
  const liabilities=rows.filter(record=>kindSide(record.kind)==='liability');
  const group=(list,key,label)=>{
    const groups=new Map();
    for(const record of list){
      const id=key(record)||'—';
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(record);
    }
    return [...groups].map(([id,items])=>({id,label:label(id),total:sum(items.map(signedValue)),count:items.length})).sort(byTotal);
  };
  const stale=rows.filter(record=>!record.asOf||Date.parse(today)-Date.parse(record.asOf)>STALE_DAYS*86400000)
    .sort((a,b)=>(a.asOf||'').localeCompare(b.asOf||''));
  return {
    currency,records:rows.length,
    assets:sum(assets.map(effectiveValue)),
    liabilities:sum(liabilities.map(effectiveValue)),
    net:sum(rows.map(signedValue)),
    unfunded:sum(rows.map(record=>Number(record.unfunded||0))),
    byKind:group(rows,record=>record.kind,kindLabel),
    byOwner:group(rows,record=>record.owner,id=>id==='—'?'Unassigned':id),
    byLiquidity:group(assets,record=>record.liquidity,id=>id),
    stale
  };
}

const snapshotsAt=(record,date)=>valueHistory(record.history??'[]').find(entry=>entry.asOf<=date)??null;
// A step function: on any given date a record is worth its most recent snapshot
// on or before that date, and nothing before its first one. Interpolating
// between snapshots would report figures that were never observed.
export function netWorthSeries(records,{currency='USD'}={}){
  const rows=counted(records).filter(record=>(record.currency||'USD')===currency);
  const dates=[...new Set(rows.flatMap(record=>valueHistory(record.history??'[]').map(entry=>entry.asOf)))].sort();
  return dates.map(date=>{
    const held=rows.map(record=>({record,snapshot:snapshotsAt(record,date)})).filter(item=>item.snapshot);
    const value=({record,snapshot})=>{
      const weighted=Math.round(snapshot.value*share(record)*100)/100;
      return kindSide(record.kind)==='liability'?-weighted:weighted;
    };
    return {
      asOf:date,records:held.length,
      assets:sum(held.filter(item=>kindSide(item.record.kind)==='asset').map(value)),
      liabilities:sum(held.filter(item=>kindSide(item.record.kind)==='liability').map(item=>-value(item))),
      net:sum(held.map(value))
    };
  });
}

// Lists group by asset then liability, in registry order, so a retired kind
// keeps its own group rather than vanishing from the ledger.
export function groupFinanceRecords(records){
  const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true});
  const known=FINANCE_KINDS.map(kind=>kind.id);
  const extra=[...new Set(records.map(record=>record.kind))].filter(kind=>!known.includes(kind)).sort();
  return [...known,...extra]
    .map(kind=>({kind,label:kindLabel(kind),side:kindSide(kind),records:records.filter(record=>record.kind===kind).sort(byName)}))
    .filter(group=>group.records.length);
}

export const matchKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Matching happens here, on the device, against records AI never sees. A draft
// only ever proposes a change; the owner confirms the record it lands on.
export function matchFinanceUpdates(updates,records){
  const rows=counted(records);
  return updates.map(update=>{
    const key=matchKey(update.name),institution=matchKey(update.institution);
    const exact=rows.filter(record=>matchKey(record.name)===key);
    const scoped=exact.length>1&&institution?exact.filter(record=>matchKey(record.institution)===institution):exact;
    const candidates=scoped.length?scoped:rows.filter(record=>key.length>=4&&(matchKey(record.name).includes(key)||key.includes(matchKey(record.name))));
    return {...update,match:candidates.length===1?candidates[0]:null,ambiguous:candidates.length>1};
  });
}

// AI reads pasted text into drafts and nothing more: it never sees saved
// records, never picks the record a draft belongs to, and never computes a
// total. A malformed draft is dropped so one bad row cannot discard the rest.
export function parseFinanceUpdates(value){
  if(!value||typeof value!=='object')throw Error('AI did not return any readable figures. Add more detail, or enter the record by hand.');
  const list=Array.isArray(value.updates)?value.updates.slice(0,40):[];
  const updates=list.flatMap(draft=>{
    try{
      if(!draft||typeof draft!=='object')return [];
      const kind=financeKind(draft.kind)?draft.kind:'other-asset';
      const asOf=isDate(draft.asOf)?draft.asOf:'';
      if(!asOf)return [];
      return [{
        name:text(draft.name??'',120,'a record name',true),
        institution:text(draft.institution??'',120,'an institution'),
        owner:text(draft.owner??'',120,'an owner'),
        kind,currency:/^[A-Za-z]{3}$/.test(draft.currency||'')?String(draft.currency).toUpperCase():'USD',
        value:amount(draft.value,'value'),asOf,
        confidence:['low','medium','high'].includes(draft.confidence)?draft.confidence:'low',
        reason:text(draft.reason??'',400,'an explanation')
      }];
    }catch{return [];}
  });
  const unread=text(value.unread??'',800,'the unread note');
  if(!updates.length&&!unread)throw Error('AI did not find any figures in that text. Add more detail, or enter the record by hand.');
  return {updates,unread};
}
