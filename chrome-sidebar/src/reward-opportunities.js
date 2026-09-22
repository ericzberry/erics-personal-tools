// What is worth doing with what the owner holds.
//
// One projection, read by For you, the home screen and Needs attention alike,
// and written by none of them: it reads the wallet, the card terms and the
// catalogues and hands back a short ranked list with stable keys, so the same
// opportunity resolved on one screen is resolved on every screen. Nothing in
// it is a second store of benefits, and nothing in it is a model's opinion —
// every row is a rule over saved records, and the rules are here to be read.
//
// A program worth something that is not money — lounge access, a membership
// waiting to be set up, a certificate with a date on it — ranks on how useful
// and how urgent it is, never on a dollar figure it has not got. Money is a
// tie-breaker among the rows that have some. And nothing here says the owner
// is losing $X by not spending: with no purchase in view, a credit is worth
// using only if they were already going to buy the thing.
import {resetDate,rewardWorth,CADENCE_LABELS} from './rewards-data.js';
import {formatAmount} from './credit-data.js';
import {cardAccounts,accountCoverage} from './wallet-data.js';
import {loyaltyProgramNamed} from './loyalty-sites.js';
import {programById} from './program-data.js';
import {key} from './card-data.js';

// Priority buckets, in the order they are shown. Within a bucket the score
// decides; across buckets it never does.
export const BUCKETS=Object.freeze({goal:1,setup:2,recurring:3,possible:4,explore:5});
export const TOP_COUNT=5,PER_SOURCE=2,EXPLORE_MAX=1;
// How close to a period's close a recurring credit is worth raising — the
// wallet's own windows, so For you and the older Next actions agree.
const WINDOW={monthly:7,quarterly:14,semiannual:30,annual:45};
const DAY=86400000;
// The score is explainable and adds up: how well it fits a stated goal
// (0–4; goals arrive in a later phase and score 0 until then), how directly
// it can be acted on (0–3), what the documented consequence or urgency is
// (0–3), how useful the owner said it was (0–2), less the effort (0–2).
export function score({goal=0,actionable=0,urgency=0,declared=0,effort=0}){
  const clamp=(value,max)=>Math.max(0,Math.min(max,value));
  return clamp(goal,4)+clamp(actionable,3)+clamp(urgency,3)+clamp(declared,2)-clamp(effort,2);
}
const urgencyOf=days=>days===null?0:days<=7?3:days<=30?2:days<=90?1:0;
// The part of an opportunity that, when it changes, reopens a dismissed one:
// the period, the terms, the state. A day passing is not a change.
const fingerprint=(...parts)=>parts.map(part=>String(part??'')).join('|');
export const opportunityKey=(type,id,period='')=>`${type}:${id}${period?`:${period}`:''}`;
// Whether a resolution still holds. Done and not useful hold until the terms
// or the period change; remind, check and waiting hold until their date.
export function resolved(item,resolutions=[],today){
  const record=resolutions.find(entry=>entry.kind==='resolution'&&entry.key===item.key);
  if(!record)return null;
  if(['done','not_useful'].includes(record.action))return record.fingerprint===item.fingerprint?record:null;
  if(record.until&&record.until>today)return record;
  return null;
}
const cardOf=(entry,entries)=>entry.card?entries.find(other=>other.id===entry.card&&other.kind==='card')||null:null;
const sourceOf=(entry,entries)=>cardOf(entry,entries)?.name||entry.source||'';
export function rewardOpportunities({entries=[],cards=[],catalogs=[],resolutions=[],goals=[]}={},{now=new Date()}={}){
  const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const midnight=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const live=entries.filter(entry=>entry&&!entry.deleting&&!entry.conflict);
  const items=[];
  const add=item=>items.push({figure:'',action:null,state:'confirmed',...item,score:score(item.parts||{})});
  // Benefits and access: what needs setting up, what is about to close.
  for(const entry of live.filter(entry=>['benefit','membership'].includes(entry.kind)&&entry.state!=='used')){
    const reset=!entry.due&&entry.cadence?resetDate(entry.cadence,now):'';
    const deadline=entry.due||reset,limit=reset?WINDOW[entry.cadence]:30;
    const days=deadline?Math.round((Date.parse(deadline)-midnight)/DAY):null;
    const worth=rewardWorth(entry);
    // The figure says what kind of figure it is: what the tracker last said
    // is left, or the allowance the card gives where no tracker has been
    // read. A benefit with no money in it has no figure.
    const money=worth===null?'':entry.remaining?`${entry.remaining} left`:`${formatAmount(worth)} allowance`;
    const source=sourceOf(entry,live),period=deadline||'';
    const base={recordId:entry.id,source,entry,deadline,days,figure:money,url:entry.url||''};
    if(entry.state==='activation'){
      // Access the card already includes and nobody has switched on. A
      // membership or a protection is as useful as a credit here, and its
      // lack of a dollar figure is not a lack of importance.
      add({...base,key:opportunityKey('setup',entry.id),bucket:BUCKETS.setup,kind:'setup',
        title:`Set up ${entry.name}`,why:entry.kind==='membership'||worth===null?'Included with the card, not yet activated':'Needs enrolling before it pays',
        state:'setup',fingerprint:fingerprint(entry.value,entry.state,period),
        action:{label:'Set up access',url:entry.url||''},
        parts:{actionable:2,urgency:urgencyOf(days),effort:1}});
      continue;
    }
    if(days!==null&&days<0){
      add({...base,key:opportunityKey('verify',entry.id,period),bucket:BUCKETS.possible,kind:'verify',
        title:`Check whether ${entry.name} still applies`,why:`Its date passed on ${deadline}`,state:'possible',
        fingerprint:fingerprint(entry.value,period),action:{label:'Check',url:entry.url||''},parts:{actionable:1,urgency:1,effort:1}});
      continue;
    }
    if(days!==null&&days<=limit){
      // A credit closing with its period, or a certificate with a date: worth
      // raising if the owner was going to use it anyway, which is how it is
      // worded. A recurring credit is the "recurring" bucket; a one-time one
      // with a date is the same bucket, its urgency doing the ranking.
      add({...base,key:opportunityKey('use',entry.id,period),bucket:BUCKETS.recurring,kind:'use',
        title:days===0?`Use ${entry.name} today`:`Use ${entry.name} within ${days} day${days===1?'':'s'}`,
        why:reset?`Resets ${CADENCE_LABELS[entry.cadence].toLowerCase()} · useful if you were already planning to spend it`:`Ends ${deadline} · useful if you were already planning to use it`,
        fingerprint:fingerprint(entry.value,entry.remaining,period),
        action:{label:'Open',url:entry.url||''},
        parts:{actionable:2,urgency:urgencyOf(days),declared:0,effort:0}});
    }
  }
  // Data the wallet lacks and a recommendation would lean on. One row per
  // account, not one per credit: reading the card's page fills them all.
  const accounts=cardAccounts(live,cards);
  for(const account of accounts){
    const coverage=accountCoverage(account,{entries:live,catalogs},now);
    const trackers=coverage.kinds.find(kind=>kind.kind==='credits');
    if(trackers&&trackers.state!=='read'){
      add({key:opportunityKey('read-credits',account.id||account.product),bucket:BUCKETS.possible,kind:'gap',
        recordId:account.id,source:account.product,hint:account.hint,
        title:`Read what is left of ${account.product}’s credits`,why:`${trackers.detail} · Pay counts a credit only once its tracker has been read`,
        state:'possible',fingerprint:fingerprint(trackers.state,trackers.at),
        action:{label:'Read the page',url:account.entry?.url||''},parts:{actionable:2,urgency:0,effort:1}});
    }
    if(!account.cardId&&!account.ambiguous){
      add({key:opportunityKey('rates',account.id||account.product),bucket:BUCKETS.possible,kind:'gap',
        recordId:account.id,source:account.product,hint:account.hint,
        title:`Add what ${account.product} earns`,why:'Pay cannot compare it until its rates are saved',
        state:'possible',fingerprint:fingerprint('rates'),action:{label:'Add rates',url:''},parts:{actionable:2,urgency:0,effort:2}});
    }
  }
  // A balance that has gone out of date. Never one that was never read: a
  // program held to reach its page is not a reading gone stale.
  for(const entry of live.filter(entry=>entry.kind==='balance'&&/\d/.test(String(entry.value||'')))){
    const age=Number.isFinite(Date.parse(entry.updatedAt))?Math.floor((now-Date.parse(entry.updatedAt))/DAY):null;
    if(age===null||age<30)continue;
    const program=loyaltyProgramNamed(entry.name,entry.source);
    // The figure rides in the reason, not the figure slot: a long balance
    // beside a long title leaves no room for either at the narrowest width,
    // and the figure here is context rather than the thing to act on.
    add({key:opportunityKey('balance',entry.id),bucket:BUCKETS.possible,kind:'gap',recordId:entry.id,entry,
      source:program?.short||entry.source,title:`Update the ${program?.short||entry.source} balance`,
      why:`${entry.value} · last read ${age} days ago`,state:'possible',
      fingerprint:fingerprint(entry.value,String(entry.updatedAt||'').slice(0,10)),
      action:{label:'Open',url:entry.url||program?.url||''},parts:{actionable:2,urgency:0,effort:1}});
  }
  // A catalogue held is not a membership held. With no entry saying the owner
  // is in the program, the catalogue is something to check eligibility for;
  // with one, it is somewhere to browse — once, at the bottom, never as a
  // dump of its offers.
  for(const catalog of catalogs.filter(catalog=>catalog?.offers?.length)){
    const program=programById(catalog.programId||catalog.id);
    if(!program)continue;
    const member=live.some(entry=>['membership','card'].includes(entry.kind)&&
      [entry.name,entry.source].some(field=>key(field).includes(key(program.label))||key(program.source).includes(key(field))&&key(field).length>4));
    const fresh=catalog.offers.filter(offer=>Date.parse(offer.firstSeenAt)>=now-30*DAY).length;
    if(!member&&program.reading==='markup'){
      add({key:opportunityKey('eligibility',program.id),bucket:BUCKETS.possible,kind:'access',source:program.label,
        title:`Check whether ${program.label} is yours to use`,why:`${catalog.offers.length} offers read; membership not confirmed`,
        state:'possible',fingerprint:fingerprint('eligibility'),action:{label:'Check eligibility',url:program.origin},parts:{actionable:1,urgency:0,effort:1}});
      continue;
    }
    const count=catalog.offers.length;
    add({key:opportunityKey('browse',program.id),bucket:BUCKETS.explore,kind:'explore',source:program.label,
      title:`Browse ${program.label}${/offers$/i.test(program.label)?'':' offers'}`,why:`${count} offer${count===1?'':'s'}${fresh?`, ${fresh} new`:''}`,
      state:member?'confirmed':'possible',fingerprint:fingerprint(catalog.offers.length),
      action:{label:'Browse offers',url:''},parts:{actionable:1,urgency:0,effort:0}});
  }
  const ranked=items
    .filter(item=>!resolved(item,resolutions,today))
    .sort((a,b)=>a.bucket-b.bucket||b.score-a.score||(a.days??1e6)-(b.days??1e6)||a.title.localeCompare(b.title));
  // The short list: five, no more than two from one card or program, one
  // exploration at most, so a card with a dozen credits closing does not fill
  // the screen with itself.
  const top=[],perSource=new Map();let explored=0;
  for(const item of ranked){
    if(top.length>=TOP_COUNT)break;
    const source=key(item.source||'');
    if((perSource.get(source)||0)>=PER_SOURCE)continue;
    if(item.bucket===BUCKETS.explore&&explored>=EXPLORE_MAX)continue;
    top.push(item);perSource.set(source,(perSource.get(source)||0)+1);
    if(item.bucket===BUCKETS.explore)explored++;
  }
  const rest=ranked.filter(item=>!top.includes(item));
  const dismissed=items.length-ranked.length;
  return {top,rest,all:ranked,dismissed,
    // What the home screen and Needs attention take: the rows that are about
    // something closing or waiting to be set up, in the same order and with
    // the same keys.
    urgent:ranked.filter(item=>item.bucket<=BUCKETS.recurring)};
}
// The resolution record for a choice made on a row.
export const resolutionFor=(item,action,{until='',now=new Date()}={})=>({kind:'resolution',key:item.key,action,until,fingerprint:item.fingerprint,at:now.toISOString()});
