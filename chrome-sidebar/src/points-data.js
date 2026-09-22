// What the owner's points can do.
//
// A balance is a figure in one currency at one program, and nothing here adds
// two of them together: Membership Rewards, Bonvoy points and the cash back a
// card keeps in dollars are three things. What a point is worth is a separate
// fact from the balance and from the card that earned it — a planning value
// the owner keeps per currency, with where it came from — and a card's terms
// supply it only until the owner says otherwise. Nothing here is a redemption:
// a value is a scenario, and the screen says so.
import {loyaltyProgramNamed} from './loyalty-sites.js';
import {balanceUnit,UNREAD_BALANCE} from './balance-data.js';
import {key} from './card-data.js';
import {cardAccounts,accountPrograms,FRESH_DAYS} from './wallet-data.js';

const DAY=86400000;
// The figure in a balance as the wallet wrote it: "13,674 points", "$125.49",
// "82,431". A value with no digits is not a figure.
export function balanceAmount(value){
  const [found]=/\d[\d,]*(?:\.\d{1,2})?/.exec(String(value||''))||[];
  if(found===undefined)return null;
  const amount=Number(found.replace(/,/g,''));
  return Number.isFinite(amount)?amount:null;
}
// The currency a balance is kept in: the registry's id where it knows the
// program, and otherwise the entry's own name, so two typed balances of one
// unknown program are still one currency.
export const currencyId=entry=>loyaltyProgramNamed(entry?.name,entry?.source)?.id||key(`${entry?.source||''} ${entry?.name||''}`);
// One row per balance the wallet holds a figure for, with what earns into it
// and what a point is worth to the owner. `valuations` are the wallet's own
// records; a card's terms stand in where none is saved and every card earning
// into the currency agrees on a value.
export function pointsAccounts({entries=[],cards=[],valuations=[]}={},{now=new Date()}={}){
  const live=entries.filter(entry=>entry&&!entry.deleting&&!entry.conflict);
  const accounts=cardAccounts(live,cards);
  return live.filter(entry=>entry.kind==='balance').map(entry=>{
    const program=loyaltyProgramNamed(entry.name,entry.source);
    const amount=entry.value===UNREAD_BALANCE?null:balanceAmount(entry.value);
    const unit=program?.unit||balanceUnit(entry.value)||'points';
    const currency=currencyId(entry);
    const age=Number.isFinite(Date.parse(entry.updatedAt))?Math.floor((now-Date.parse(entry.updatedAt))/DAY):null;
    const earners=accounts.filter(account=>program&&accountPrograms(account).some(other=>other.id===program.id));
    const saved=valuations.find(record=>record.kind==='valuation'&&record.key===currency)||null;
    const fromTerms=[...new Set(earners.map(account=>account.card).filter(card=>card&&card.unit==='points').map(card=>Number(card.cpp)))];
    const valuation=unit==='dollars'?{cents:100,source:'Cash',asOf:''}
      :saved?{cents:saved.cents,source:saved.source||'Your planning value',asOf:saved.asOf,saved:true}
      :fromTerms.length===1&&fromTerms[0]>0?{cents:fromTerms[0],source:'Card terms',asOf:earners.find(account=>account.card)?.card?.checked||''}
      :null;
    return {id:entry.id,entry,program,currency,unit,amount,value:entry.value,
      label:program?.short||entry.source||entry.name,name:program?.label||entry.name,
      observedAt:amount===null?'':String(entry.updatedAt||'').slice(0,10),age:amount===null?null:age,
      stale:amount!==null&&(age===null||age>FRESH_DAYS.balance),
      earners:earners.map(account=>({id:account.id,name:account.product,hint:account.hint})),
      valuation,
      // What the balance would come to as cash, on the planning value. A
      // scenario, never a redemption, and nothing where the value is unknown.
      scenarioCents:amount!==null&&valuation?Math.round(amount*valuation.cents):null,
      url:entry.url||program?.url||''};
  }).filter(row=>row.amount!==null||row.earners.length).sort((a,b)=>a.label.localeCompare(b.label));
}
// What a redemption is worth per point, from an actual pair of prices: what
// the same thing costs in cash, what the award still charges in cash, and
// what it costs in points. $600 against 30,000 points + $60 is 1.8¢.
export function redemptionValue({cashPrice,awardCash=0,points,extraCost=0}){
  const spent=Number(points);
  if(!(spent>0)||!Number.isFinite(Number(cashPrice)))return null;
  return Math.round((Number(cashPrice)-Number(awardCash||0)-Number(extraCost||0))/spent*100*100)/100;
}
// The valuation record the owner saves for a currency.
export const valuationFor=(currency,cents,{source='Your planning value',asOf=new Date().toISOString().slice(0,10)}={})=>({kind:'valuation',key:currency,cents:Number(cents),source,asOf});
