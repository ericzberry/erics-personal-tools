// What a card credit has left, read off the issuer's own benefits page.
//
// A card's credits are already in the wallet — research brings back what the
// card gives, how often it resets, and what has to be enrolled in. What no
// research can know is how much of one is left this month, and that is the part
// that decides whether the owner does anything today. The issuer prints it: a
// tracker per credit, with what has been earned against it and what is still
// to go.
//
// So this is the same errand the balance reading already runs — one snapshot of
// the page in front of the owner, turned into rows, saved only by a press of
// their own — over the other thing that page states. Nothing here is a new
// record: a credit is the benefit entry the wallet already holds, and the
// reading fills in `remaining` and, when there is nothing left, marks it used.
import {validateReward,CADENCES,BENEFIT_LIMIT,calendarDate,httpsOnly} from './rewards-data.js';

// A premium card tracks a couple of dozen credits; a page stating more than
// this is not a benefits page.
export const CREDIT_LIMIT=40;
const text=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const CONFIDENCE=['high','medium','low'];
export const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// An amount as the page prints it, kept as money and nothing else. A tracker
// says "$25 To Go"; what is stored is the figure, because the words around it
// are the page's and change with it.
const AMOUNT=/-?\$?\s?\d[\d,]*(\.\d{1,2})?/;
export function creditAmount(value){
  const [found]=AMOUNT.exec(String(value??''))||[];
  if(found===undefined)return null;
  const amount=Number(found.replace(/[$,\s]/g,''));
  return Number.isFinite(amount)&&amount>=0&&amount<1e9?amount:null;
}
export const formatAmount=amount=>amount.toLocaleString('en-US',{style:'currency',currency:'USD',
  minimumFractionDigits:amount%1?2:0,maximumFractionDigits:2});

// One credit as a reading proposes it. Every figure is checked here, shown to
// the owner, and saved only by a press of theirs — the rule a balance reading
// and a statement reading both already follow.
export function parseCreditReading(input,source='',now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw Error('Reading that page returned nothing to review.');
  const found=Array.isArray(input.credits)?input.credits:[];
  if(found.length>CREDIT_LIMIT)throw Error(`A page reading returns at most ${CREDIT_LIMIT} credits.`);
  const seen=new Set();
  return found.map(row=>{
    const name=text(row?.credit,200);
    if(!name)return null;
    // What is left in the period the credit is in now. A credit with nothing
    // left is not a credit with no figure: zero is the whole point of reading
    // a tracker, so only a tracker that stated nothing is refused.
    const remaining=creditAmount(row?.remaining);
    if(remaining===null)return null;
    const period=creditAmount(row?.amount);
    const already=key(name);
    if(seen.has(already))return null;
    seen.add(already);
    return {name,
      // The card the page filed it under, as the page names it. Which of the
      // owner's cards that is stays on the device.
      card:text(row?.card,200),
      // Who gives it, for a credit the page files under no card of its own: an
      // entry has to say where it came from, and the site it was read from is
      // the honest answer when the page does not give a better one.
      source:text(row?.source,200)||text(source,200),
      remaining,period,
      // The figure as the panel and the record both say it.
      left:formatAmount(remaining),
      value:period===null?'':formatAmount(period),
      cadence:CADENCES.includes(row?.cadence)?row.cadence:'',
      notes:text(row?.notes,400),
      confidence:CONFIDENCE.includes(row?.confidence)?row.confidence:'medium',
      readAt:now};
  }).filter(Boolean);
}

// Words that name no card in particular. Every Amex is an American Express
// card, so matching on those words matches every card the owner holds.
const COMMON=new Set(['card','cards','american','express','from','the','and','with','credit','rewards','preferred','account']);
const words=value=>key(value).split(' ').filter(word=>word.length>2&&!COMMON.has(word));
// The four digits a page prints beside a card's name — "(-61007)", "•••• 72005".
// Only a run long enough to be an account's tail counts, and only the last four
// of it, because that is the part a card is known by wherever it is written down.
const DIGITS=/\d{4,}/g;
const tails=value=>[...String(value||'').matchAll(DIGITS)].map(([run])=>run.slice(-4));
// Which of the owner's cards a page's card name is. The page says "Morgan
// Stanley Platinum Card® (-61007)" and the wallet holds whatever research
// called it, so they are matched on the words that tell one card from another.
// One card sharing the most of them wins; a tie names nothing, because filing a
// Platinum's credits under a Blue Cash is worse than not filing them at all.
export function matchCard(name,cards=[]){
  // Digits decide before words do, and only when exactly one saved card
  // carries them: an owner who put the last four in a card's name has said
  // which card this is more precisely than any name can.
  const digits=tails(name);
  if(digits.length){
    const byDigits=cards.filter(card=>tails(card.name).some(tail=>digits.includes(tail)));
    if(byDigits.length===1)return {card:byDigits[0],ambiguous:false};
  }
  const wanted=words(name);
  if(!wanted.length)return {card:null,ambiguous:false};
  const scored=cards.map(card=>({card,score:words(card.name).filter(word=>wanted.includes(word)).length}))
    .filter(entry=>entry.score>0)
    .sort((a,b)=>b.score-a.score);
  if(!scored.length)return {card:null,ambiguous:false};
  const best=scored.filter(entry=>entry.score===scored[0].score);
  return best.length===1?{card:best[0].card,ambiguous:false}:{card:null,ambiguous:true};
}

// Which saved benefit a read credit is about: the card it is filed under first,
// then the name. A page writes the amount into the title — "$200 Airline Fee
// Credit" — and research does not, so one name containing the other is the same
// credit. Nothing else is matched: a balance or a card is never overwritten by
// a credit reading.
const same=(a,b)=>{
  const [one,two]=[key(a),key(b)];
  return !!one&&!!two&&(one===two||one.includes(two)||two.includes(one));
};
// `taken` is shared on purpose. One press reads a card's page for two kinds of
// row — the credits with a tracker and the benefits without one — and a saved
// entry may only be claimed by one of them, or the same benefit would be
// proposed twice and saved over itself.
export function matchCredits(rows=[],entries=[],taken=new Set()){
  const cards=entries.filter(entry=>entry?.kind==='card'&&!entry.deleting);
  const benefits=entries.filter(entry=>['benefit','membership'].includes(entry?.kind)&&!entry.deleting);
  return rows.map(row=>{
    const {card,ambiguous}=matchCard(row.card,cards);
    const candidates=benefits.filter(entry=>!taken.has(entry.id)&&same(entry.name,row.name)
      &&(!card||!entry.card||entry.card===card.id));
    const match=candidates.length===1?candidates[0]:null;
    if(match)taken.add(match.id);
    return {...row,holder:card,ambiguous,match};
  });
}

// A read credit in the shape the wallet stores. Updating keeps everything about
// the saved entry except what the tracker states: its terms, its notes, its
// link and the card it is filed under are the owner's, not the page's. A credit
// with nothing left in this period is used, which is what takes it off Next
// actions until it resets.
export function creditRecord(row,match=null,holder=null,now=new Date().toISOString()){
  const base=match||{kind:'benefit',name:row.name,source:holder?.name||row.card||row.source||'',value:row.value,
    card:holder?.id||'',cadence:row.cadence,due:'',url:'',notes:row.notes,secret:'',secretHint:''};
  return validateReward({...base,
    // An entry with no terms of its own takes the amount the tracker states;
    // one the owner already has keeps what it says.
    value:base.value||row.value||row.left,
    cadence:base.cadence||row.cadence,
    remaining:row.left,
    state:row.remaining===0?'used':base.state==='used'?'available':base.state||'available'
  },now);
}

// The rest of what a card's page states: the benefits that carry no tracker at
// all.
//
// A tracker is only one kind of thing a benefits page lists. A lounge program,
// hotel elite status, a Global Entry credit, an included subscription, a travel
// or purchase protection — none of them has a "left this period", and the
// credit reading above drops every one of them for lacking the figure that
// makes a credit a credit. They are ordinary wallet entries all the same, and
// for an invitation-only card they are exactly where research is weakest and
// the owner's own page is strongest, so the same press reads them too.
//
// Nothing new is stored: `kind` is the wallet's own `benefit` or `membership`,
// every field passes `validateReward`, and `remaining` is simply absent —
// never invented as zero, which would mark a membership spent.
export function parseBenefitReading(input,source='',now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw Error('Reading that page returned nothing to review.');
  const found=Array.isArray(input.benefits)?input.benefits:[];
  if(found.length>BENEFIT_LIMIT)throw Error(`A page reading returns at most ${BENEFIT_LIMIT} benefits.`);
  const seen=new Set();
  return found.map(row=>{
    const name=text(row?.benefit??row?.name,200);
    // An entry has to say what it is worth, and the page is the only thing
    // that knows: "Priority Pass Select membership", "$120 every four years".
    // A benefit with no value is a name with nothing behind it.
    const value=text(row?.value,200);
    if(!name||!value)return null;
    const already=key(name);
    if(seen.has(already))return null;
    seen.add(already);
    return {name,
      kind:['benefit','membership'].includes(row?.kind)?row.kind:'benefit',
      card:text(row?.card,200),
      source:text(row?.source,200)||text(source,200),
      value,
      // A page can say a benefit still needs enrolling. It cannot say one has
      // been used — that is what a tracker is for — so "used" never arrives
      // from a reading.
      state:row?.state==='activation'?'activation':'available',
      cadence:CADENCES.includes(row?.cadence)?row.cadence:'',
      due:calendarDate(row?.due),url:httpsOnly(row?.url),
      notes:text(row?.notes,400),
      confidence:CONFIDENCE.includes(row?.confidence)?row.confidence:'medium',
      readAt:now};
  }).filter(Boolean);
}

// A read benefit in the shape the wallet stores, through the same validator a
// typed one passes. A benefit the owner already has keeps everything that is
// theirs — its terms, its notes, its link, its status and the card it is filed
// under — and the page fills in only what the entry has not got. One that
// matches nothing is created, which is the whole point of reading a page for
// the benefits research could not find.
export function benefitRecord(row,match=null,holder=null,now=new Date().toISOString()){
  const base=match||{kind:row.kind,name:row.name,source:holder?.name||row.card||row.source||'',
    value:row.value,card:holder?.id||'',cadence:'',due:'',url:'',notes:'',state:row.state,secret:'',secretHint:''};
  return validateReward({...base,
    value:base.value||row.value,
    cadence:base.cadence||row.cadence,
    due:base.due||row.due,
    url:base.url||row.url,
    notes:base.notes||row.notes,
    state:base.state||row.state
  },now);
}
