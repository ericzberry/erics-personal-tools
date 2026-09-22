// What to pay with.
//
// Three tools each know one thing about a purchase. Best card knows what each
// card earns on it. The wallet knows what a card gives back at a merchant — the
// monthly credit, the standing discount — and how much of that is left. The
// reward programs keep the offers a merchant is running, on which card. Each
// answers on its own screen, and the purchase is one question, so this puts
// the three side by side, adds up what it can, and says what has to hold for
// each figure to be real.
//
// AI reads the description and nothing else. Every figure here is arithmetic
// over saved records, the way Best card's comparison already is, and a
// condition — an offer not yet added to the card, a credit still to activate,
// a minimum spend, a date — is said beside the figure rather than assumed.
//
// Two totals, and only one of them is the answer. The supported total counts
// what holds today: the rate, a credit whose tracker has been read, an offer
// already on the card with its minimum met. Everything that could hold after a
// step — adding the offer, activating the credit, reading a tracker — is kept
// as a line of its own and summed separately as what the card could come to,
// so a $50 offer nobody has enrolled in never lifts a card over one that earns
// more right now, and an expired one adds nothing anywhere.
import {compareCards,normalizePurchase,walletCards,merchantPerks,matchCard,sameMerchant,merchantKey} from './card-data.js';
import {rewardWorth} from './rewards-data.js';
import {offerUrl} from './program-data.js';
import {money} from './money.js';

const FIGURE='\\$\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)';
const figure=text=>Number(String(text).replace(/,/g,''));
// What an offer's own sentence promises, read for the three figures a sentence
// like "Spend $599 or more, get $100 back" carries: what comes back, as money
// or as a percentage; what has to be spent first; and the most it can come to.
// A sentence that states none of them — "3 additional points per dollar" — is
// an offer with no figure, which is listed in its own words and added to
// nothing. Nothing is inferred: "up to 20%" is marked as the merchant's to
// decide, because it is.
export function offerTerms(summary=''){
  const text=String(summary||'').replace(/\s+/g,' ');
  const find=pattern=>{const match=pattern.exec(text);return match?figure(match[1]):null;};
  const minimum=find(new RegExp(`(?:spend|spending|purchases?|orders?|minimum)\\s+(?:of\\s+|over\\s+|at least\\s+)?${FIGURE}`,'i'))
    ??find(new RegExp(`\\bon\\s+${FIGURE}\\s*(?:\\+|or more)`,'i'));
  let back=find(new RegExp(`(?:get|earn|receive|enjoy)\\s+(?:a\\s+|an\\s+)?(?:one-time\\s+)?${FIGURE}`,'i'))
    ??find(new RegExp(`${FIGURE}\\s*(?:back|statement credit|credit|off)\\b`,'i'));
  const percentMatch=/(?<!\d)(\d{1,2}(?:\.\d)?)\s?%/.exec(text);
  const percent=percentMatch?Number(percentMatch[1]):null;
  const cap=find(new RegExp(`up to ${FIGURE}`,'i'));
  let upTo=/up to\s+\d{1,2}(?:\.\d)?\s?%/i.test(text);
  // "Up to $50 back" with no percentage is a ceiling, not a promise.
  if(percent===null&&cap!==null&&(back===null||back===cap)){back=cap;upTo=true;}
  return {back,percent,minimum,cap:percent!==null?cap:null,upTo};
}
// What an offer comes to on this purchase. Without an amount a percentage has
// nothing to apply to and a minimum cannot be checked, so only a fixed figure
// is a figure and `met` is unknown rather than assumed.
export function offerBenefit(terms,amount=null){
  if(amount===null)return {dollars:terms.back,met:terms.minimum===null?true:null};
  if(terms.minimum!==null&&amount<terms.minimum)return {dollars:0,met:false};
  if(terms.back!==null)return {dollars:Math.min(terms.back,amount),met:true};
  if(terms.percent!==null){
    const raw=amount*terms.percent/100;
    return {dollars:terms.cap===null?raw:Math.min(raw,terms.cap),met:true};
  }
  return {dollars:null,met:true};
}
// The day an offer stops, read out of what the program printed beside it —
// "Expires 10/15/2026", "Ends Sep 30, 2026", "November 16-18, 2026", or a
// sentence ending "Offer expires on 9/30/2026". The last date stated is the
// one it runs to; a range keeps its last day. An offer with no readable date
// has no known expiry and is not called expired, because a date this cannot
// read is a date to check rather than a reason to drop the offer.
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const iso=(year,month,day)=>{
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString().slice(0,10):'';
};
export function offerExpiry(...texts){
  const text=texts.map(part=>String(part||'')).join(' ');
  const found=[];
  for(const [,m,d,y] of text.matchAll(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?!\d)/g))
    found.push(iso(y.length===2?2000+Number(y):Number(y),Number(m),Number(d)));
  for(const [,month,first,last,year] of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?,?\s+(\d{4})\b/g)){
    const index=MONTHS.indexOf(month.slice(0,3).toLowerCase());
    if(index>=0)found.push(iso(Number(year),index+1,Number(last||first)));
  }
  for(const [,year,month,day] of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))found.push(iso(Number(year),Number(month),Number(day)));
  return found.filter(Boolean).sort().at(-1)||'';
}
export const offerExpired=(offer,today)=>{
  const expiry=offerExpiry(offer?.dates,offer?.summary);
  return !!expiry&&expiry<today;
};
// The offers a merchant is running, across every catalogue the device holds.
// An offer is the merchant's when the merchant AI read out of the description
// names it, as loosely as the two sides write it — "Dell" is "Dell
// Technologies" — and nothing else is, because an offer at one shop applied at
// another is worse than none. A description that names no merchant matches no
// offer. An offer whose stated date has passed is not an offer any more and is
// left out here, counted so the screen can say one was.
export function offersFor(catalogs=[],merchant='',today=new Date().toISOString().slice(0,10)){
  if(!merchantKey(merchant))return [];
  return (catalogs||[]).flatMap(catalog=>(catalog?.offers||[]).filter(offer=>sameMerchant(offer.name,merchant)).map(offer=>{
    const programId=catalog.programId||catalog.id||'';
    return {key:offer.key,program:catalog.label||'',programId,name:offer.name,summary:offer.summary||'',
      card:offer.card||'',badge:offer.badge||'',dates:offer.dates||'',url:offerUrl(programId,offer),terms:offerTerms(offer.summary),
      expiry:offerExpiry(offer.dates,offer.summary),expired:offerExpired(offer,today)};
  }));
}
// An offer as a line of the recommendation: what it comes to, what has to hold
// for it, and whether it holds now. An issuer's offer sits on one card and has
// to be added to it before it pays, which the catalogue knows from the
// issuer's own badge; until then it is a line the card could gain, not one it
// has. A ceiling the merchant decides is not a figure either, and a minimum
// that cannot be checked is a condition rather than an assumption.
function offerLine(offer,amount){
  const {dollars,met}=offerBenefit(offer.terms,amount);
  const conditions=[],pending=[];
  if(offer.card&&offer.badge!=='Added')pending.push(`Add the ${offer.name} offer to the card first.`);
  if(offer.terms.minimum!==null)conditions.push(met===false?`Spend ${money(offer.terms.minimum)} or more; this purchase is under it.`:`Spend ${money(offer.terms.minimum)} or more.`);
  if(met===null)pending.push('Its minimum spend cannot be checked without an amount.');
  if(offer.terms.upTo)pending.push('Up to that much; the merchant decides.');
  if(offer.dates)conditions.push(offer.dates);
  const supported=!pending.length&&met===true;
  // What the step would earn: the figure, once the offer is on the card. A
  // ceiling is not a figure, and a purchase under the minimum earns nothing
  // whatever is done.
  const potential=!supported&&met!==false&&!offer.terms.upTo&&dollars!==null&&dollars>0?dollars:null;
  return {kind:'offer',...offer,dollars,met,supported,potential,conditions:[...pending,...conditions]};
}
// A credit the wallet files under this card and this merchant. What the
// issuer's own tracker says is left is the figure, and a credit is worth at
// most the purchase — spending twice does not earn it twice. One still to be
// activated is worth nothing until it is. One whose tracker has never been
// read has an allowance and no figure: the card gives $200 a year, and how
// much of that is still there this period is not known until the tracker is,
// so it is named as something to verify rather than counted as savings. A
// membership or a protection with no money in it at all is access, said
// beside the card and priced at nothing.
function creditLine(perk,amount){
  const worth=rewardWorth(perk);
  if(worth===null)return {kind:'access',name:perk.name,detail:perk.value,dollars:null,worth:null,supported:false,conditions:[]};
  const active=perk.state!=='activation',verified=!!perk.remaining;
  const capped=amount===null?worth:Math.min(worth,amount);
  const conditions=[...(active?[]:[`Activate ${perk.name} first.`]),...(verified?[]:[`${perk.value} allowance; what is left of it has not been read.`])];
  return {kind:'credit',name:perk.name,detail:verified?`${perk.remaining} left`:perk.value,
    dollars:!active?0:verified?capped:null,worth,supported:active&&verified,
    // Activating a credit whose tracker has been read earns what is left of
    // it; one never read earns an unknown amount, which is not a figure.
    potential:!active&&verified&&capped>0?capped:null,conditions};
}
// What has to hold for the rate the comparison chose. A rule with a
// requirement was confirmed to get here, and it is still a requirement.
function rateConditions(row){
  const rule=row.matched;
  if(!rule)return [];
  return [rule.condition,rule.channel==='Any'?'':`${rule.channel} purchases only.`,rule.end?`Through ${rule.end}.`:'',
    rule.remaining===null?'':`On up to ${money(rule.remaining)} more eligible spend.`].filter(Boolean);
}
const sum=lines=>lines.reduce((total,line)=>total+(line.dollars||0),0);
// Ties. Two cards within half a dollar, or a tenth of a point of rate, are
// the same answer, and a fabricated difference between them would be the one
// thing this screen could get wrong while looking exact.
export const TIE_DOLLARS=0.5,TIE_RATE=0.1;
export const tied=(a,b,estimated)=>Math.abs(a-b)<=(estimated?TIE_DOLLARS:TIE_RATE)+1e-9;
// The value a point would have to carry for a points card to beat the best
// cash return, in cents. A points card's figure rests on the value its terms
// give a point, which is the owner's planning figure and not a fact about the
// purchase, so the answer says where that figure stops mattering: "beats $4
// cash back if you value those points above 1.33¢". Null where there is no
// points card, no cash card, or no points earned to value.
export function breakEven(points,cash){
  if(!points||!cash||points.unit!=='points'||!(points.earned>0))return null;
  const extras=(points.total??points.dollars)-points.dollars;
  const target=(cash.total??cash.dollars)-extras;
  return Math.max(0,Math.round(target/points.earned*100*100)/100);
}
// The recommendation. Cards are ranked the way Best card ranks them, then each
// is given what the wallet and the programs add on this purchase, and with an
// amount the three are one figure. Without one the rate decides and the rest
// is listed beside it, because a $15 credit cannot be added to a percentage.
//
// An issuer's offer is on one card. It joins the card the name fits when that
// card is saved here, goes to `elsewhere` when it is not — an offer on a card
// with no rates cannot be ranked, but it is still an offer — and a program's
// offer that names no card at all is `shared`: it applies whatever is paid
// with, so it moves no card above another.
//
// Two accounts of one product share its terms and nothing else: each is a
// plan of its own, carrying its own credits and the digits that tell it apart.
export function advise({cards=[],wallet=[],catalogs=[],purchase,confirmed=[],today=new Date().toISOString().slice(0,10)}){
  const input=normalizePurchase(purchase);
  const rows=compareCards(cards,{...input,confirmed},today);
  const amount=input.amount,estimated=amount!==null;
  const saved=cards.filter(card=>!card.deleting&&!card.conflict);
  const held=walletCards(wallet,cards);
  const all=offersFor(catalogs,input.merchant,today);
  const offers=all.filter(offer=>!offer.expired);
  const home=offer=>offer.card?matchCard(offer.card,saved).card?.id??null:'';
  const plan=(row,account)=>{
    const credits=merchantPerks(wallet,account?.id||'',input.merchant).map(perk=>creditLine(perk,amount));
    const mine=offers.filter(offer=>home(offer)===row.id).map(offer=>offerLine(offer,amount));
    const lines=[...credits,...mine];
    const supported=lines.filter(line=>line.supported);
    // What could hold after a step: every line that is not supported now and
    // not ruled out either. The card could come to the supported figure plus
    // each of those with a known figure behind its step; a line with none —
    // a ceiling, an unread tracker — is named as a step and adds nothing.
    const pending=lines.filter(line=>!line.supported&&line.kind!=='access'&&line.met!==false);
    const potential=pending.reduce((total,line)=>total+(line.potential||0),0);
    return {...row,hint:account?.digits||'',credits,offers:mine,
      total:estimated?row.dollars+sum(supported):null,
      couldBe:estimated&&potential>0?row.dollars+sum(supported)+potential:null,
      // A purchase under an offer's minimum is told so: the offer holds, and
      // this purchase is not big enough for it.
      conditions:[...rateConditions(row),...supported.flatMap(line=>line.conditions),...lines.filter(line=>line.met===false).flatMap(line=>line.conditions)],
      after:pending.flatMap(line=>line.conditions),
      access:lines.filter(line=>line.kind==='access').map(line=>line.name)};
  };
  const ranked=rows.flatMap(row=>{
    const accounts=held.filter(entry=>entry.card?.id===row.id&&entry.id);
    return accounts.length>1?accounts.map(account=>plan(row,account)):[plan(row,accounts[0]||null)];
  }).sort((a,b)=>(estimated?b.total-a.total||b.dollars-a.dollars:b.rate-a.rate)||a.name.localeCompare(b.name)||a.hint.localeCompare(b.hint));
  // Coverage: the cards this compared, and the ones it could not. A card the
  // wallet holds with no rates here is named, because a recommendation made
  // without a card the owner holds is only "best" among the rest.
  const missing=held.filter(entry=>!entry.card).map(entry=>({name:entry.product,hint:entry.digits,
    reason:entry.ambiguous?'Its name fits more than one saved card.':'No earning rates saved for it.'}));
  const cash=ranked.find(row=>row.unit==='cash'),points=ranked.find(row=>row.unit==='points');
  return {estimated,amount,merchant:input.merchant,rows:ranked,
    shared:offers.filter(offer=>home(offer)==='').map(offer=>offerLine(offer,amount)),
    elsewhere:offers.filter(offer=>home(offer)===null).map(offer=>offerLine(offer,amount)),
    expired:all.length-offers.length,
    missing,unrated:missing.length,
    breakEven:estimated&&cash&&points?{cents:breakEven(points,cash),points:points.name,cash:cash.name,earned:points.earned}:null};
}
