// Points and miles: the shape one balance is stored in, what a reading of an
// account page may turn into, and how the wallet's balances add up.
//
// A balance is an ordinary wallet entry — kind `balance`, with the program as
// its name and the airline, hotel or issuer as its source — so nothing here
// introduces a second record shape, and every balance saved by hand before
// this existed counts the same as one that was read off a page.
//
// The unit is the part that matters for a total: miles and points are not the
// same thing and are never added together. It is not a stored field. It is
// read back out of the entry's own value, which is what keeps older entries
// counting and leaves the record shape alone.
import {validateReward} from './rewards-data.js';

// The units a total is kept in. Anything else a program calls its currency is
// counted under the closest of these, because a wallet that answered "how many
// points do I have" in nine currencies would not be answering.
export const BALANCE_UNITS=['miles','points','Avios'];
export const BALANCE_LIMIT=25;
// Loose on purpose: the unit is as often inside the program's own name —
// MileagePlus, Rapid Rewards points — as it is beside the figure.
const UNIT_PATTERNS=[[/avios/i,'Avios'],[/mile/i,'miles'],[/point/i,'points']];

export const balanceUnit=text=>UNIT_PATTERNS.find(([pattern])=>pattern.test(String(text||'')))?.[1]||'';
// One balance as the wallet's value field holds it: the figure, then the unit.
export const formatBalance=(amount,unit)=>`${Math.round(amount).toLocaleString('en-US')} ${unit||'points'}`;

// The figure and unit inside a stored entry. A balance whose value names no
// number — "Gold status", "Member offers" — has no figure to add up and is
// left out of every total rather than counted as zero.
export function readBalance(entry){
  if(!entry||entry.kind!=='balance')return null;
  const value=String(entry.value||'');
  const [,digits]=/(\d[\d,.\s]*)/.exec(value)||[];
  if(!digits)return null;
  const amount=Number(digits.replace(/[,\s]/g,'').replace(/\.$/,''));
  if(!Number.isFinite(amount)||amount<0)return null;
  // The unit is usually in the value beside the figure; when it is not, the
  // program's own name carries it — "United MileagePlus" is miles.
  const unit=balanceUnit(value)||balanceUnit(`${entry.name} ${entry.source}`)||'points';
  return {amount,unit};
}

// What the owner asked for: the total number of miles and points they hold,
// one line per unit, largest first. `stale` counts the balances that have not
// been updated in a month, because a total is only as current as its oldest
// figure and saying so is cheaper than being wrong quietly.
export function balanceTotals(entries=[],{now=new Date(),staleDays=30}={}){
  const cutoff=now.getTime()-staleDays*86400000;
  const units=new Map();
  let stale=0,unread=0;
  for(const entry of entries){
    if(entry?.kind!=='balance'||entry.deleting)continue;
    const figure=readBalance(entry);
    if(!figure){unread++;continue;}
    const total=units.get(figure.unit)||{unit:figure.unit,amount:0,programs:0};
    total.amount+=figure.amount;total.programs++;
    units.set(figure.unit,total);
    const at=Date.parse(entry.updatedAt);
    if(!Number.isFinite(at)||at<cutoff)stale++;
  }
  return {totals:[...units.values()].sort((a,b)=>b.amount-a.amount||a.unit.localeCompare(b.unit)),stale,unread};
}

const text=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const CONFIDENCE=['high','medium','low'];

// One balance as a reading proposes it. A reading is a proposal and nothing
// more: every figure is checked here, shown to the owner, and saved only by a
// press of their own — the same rule a statement reading already follows.
export function parseBalanceReading(input,program=null,now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw Error('Reading that page returned nothing to review.');
  const found=Array.isArray(input.balances)?input.balances:[];
  if(found.length>BALANCE_LIMIT)throw Error(`A page reading returns at most ${BALANCE_LIMIT} balances.`);
  const seen=new Set();
  return found.map(row=>{
    const amount=Number(String(row?.amount??'').replace(/[,\s]/g,''));
    if(!Number.isFinite(amount)||amount<0||amount>1e12)return null;
    const name=text(row?.program,200)||program?.label||'';
    const source=text(row?.source,200)||program?.source||'';
    if(!name||!source)return null;
    const unit=BALANCE_UNITS.includes(row?.unit)?row.unit:balanceUnit(`${row?.unit} ${name}`)||program?.unit||'points';
    // A page that states the same program twice states one balance; the first
    // reading of it is the one kept, so a second cannot quietly overwrite it.
    const key=`${name}|${source}`.toLowerCase();
    if(seen.has(key))return null;
    seen.add(key);
    return {name,source,amount,unit,value:formatBalance(amount,unit),
      notes:text(row?.notes,400),
      confidence:CONFIDENCE.includes(row?.confidence)?row.confidence:'medium',
      readAt:now};
  }).filter(Boolean);
}

// Which saved entry a read balance is about. A program is matched by its own
// name first and by its source second, so "MileagePlus" read off united.com
// updates the MileagePlus entry already in the wallet instead of adding a
// second one beside it. Nothing else is matched: a benefit or a card is never
// overwritten by a balance reading.
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchBalances(rows=[],entries=[]){
  const balances=entries.filter(entry=>entry?.kind==='balance'&&!entry.deleting);
  const taken=new Set();
  return rows.map(row=>{
    const candidates=balances.filter(entry=>!taken.has(entry.id)&&
      (key(entry.name)===key(row.name)||(key(entry.source)===key(row.source)&&key(entry.name)===key(row.name))));
    const bySource=candidates.length?candidates:balances.filter(entry=>!taken.has(entry.id)&&key(entry.source)===key(row.source));
    const match=bySource.length===1?bySource[0]:null;
    if(match)taken.add(match.id);
    return {...row,match,ambiguous:!match&&bySource.length>1};
  });
}

// A read balance in the shape the wallet stores, checked by the same validator
// a typed entry passes. Updating keeps everything about the saved entry except
// the figure and the date it was read: its expiration, its notes, and the card
// it was filed under are the owner's, not the page's.
export function balanceRecord(row,match=null,now=new Date().toISOString()){
  const base=match||{kind:'balance',name:row.name,source:row.source,state:'available',card:'',cadence:'',due:'',url:'',notes:row.notes,secret:'',secretHint:''};
  return validateReward({...base,kind:'balance',value:row.value},now);
}
