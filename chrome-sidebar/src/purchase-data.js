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
// The offers a merchant is running, across every catalogue the device holds.
// An offer is the merchant's when the merchant AI read out of the description
// names it, as loosely as the two sides write it — "Dell" is "Dell
// Technologies" — and nothing else is, because an offer at one shop applied at
// another is worse than none. A description that names no merchant matches no
// offer.
export function offersFor(catalogs=[],merchant=''){
  if(!merchantKey(merchant))return [];
  return (catalogs||[]).flatMap(catalog=>(catalog?.offers||[]).filter(offer=>sameMerchant(offer.name,merchant)).map(offer=>{
    const programId=catalog.programId||catalog.id||'';
    return {key:offer.key,program:catalog.label||'',programId,name:offer.name,summary:offer.summary||'',
      card:offer.card||'',badge:offer.badge||'',dates:offer.dates||'',url:offerUrl(programId,offer),terms:offerTerms(offer.summary)};
  }));
}
// An offer as a line of the recommendation: what it comes to, and what has to
// hold for it. An issuer's offer sits on one card and has to be added to it
// before it pays, which the catalogue knows from the issuer's own badge.
function offerLine(offer,amount){
  const {dollars,met}=offerBenefit(offer.terms,amount);
  const conditions=[];
  if(offer.card&&offer.badge!=='Added')conditions.push(`Add the ${offer.name} offer to the card first.`);
  if(offer.terms.minimum!==null)conditions.push(met===false?`Spend ${money(offer.terms.minimum)} or more; this purchase is under it.`:`Spend ${money(offer.terms.minimum)} or more.`);
  if(offer.terms.upTo)conditions.push('Up to that much; the merchant decides.');
  if(offer.dates)conditions.push(offer.dates);
  return {kind:'offer',...offer,dollars,met,conditions};
}
// A credit the wallet files under this card and this merchant. What the
// issuer's own tracker says is left wins over what the card gives, and a
// credit is worth at most the purchase — spending twice does not earn it
// twice. One still to be activated is worth nothing until it is.
function creditLine(perk,amount){
  const worth=rewardWorth(perk);
  const active=perk.state!=='activation';
  const dollars=worth===null?null:!active?0:amount===null?worth:Math.min(worth,amount);
  return {kind:'credit',name:perk.name,detail:perk.remaining?`${perk.remaining} left`:perk.value,dollars,worth,
    conditions:active?[]:[`Activate ${perk.name} first.`]};
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
export function advise({cards=[],wallet=[],catalogs=[],purchase,confirmed=[],today=new Date().toISOString().slice(0,10)}){
  const input=normalizePurchase(purchase);
  const rows=compareCards(cards,{...input,confirmed},today);
  const amount=input.amount,estimated=amount!==null;
  const saved=cards.filter(card=>!card.deleting&&!card.conflict);
  const held=walletCards(wallet,cards);
  const offers=offersFor(catalogs,input.merchant);
  const home=offer=>offer.card?matchCard(offer.card,saved).card?.id??null:'';
  const ranked=rows.map(row=>{
    const walletId=held.find(entry=>entry.card?.id===row.id)?.id||'';
    const credits=merchantPerks(wallet,walletId,input.merchant).map(perk=>creditLine(perk,amount));
    const mine=offers.filter(offer=>home(offer)===row.id).map(offer=>offerLine(offer,amount));
    return {...row,credits,offers:mine,total:estimated?row.dollars+sum([...credits,...mine]):null,
      conditions:[...rateConditions(row),...credits.flatMap(line=>line.conditions),...mine.flatMap(line=>line.conditions)]};
  }).sort((a,b)=>(estimated?b.total-a.total||b.dollars-a.dollars:b.rate-a.rate)||a.name.localeCompare(b.name));
  return {estimated,amount,merchant:input.merchant,rows:ranked,
    shared:offers.filter(offer=>home(offer)==='').map(offer=>offerLine(offer,amount)),
    elsewhere:offers.filter(offer=>home(offer)===null).map(offer=>offerLine(offer,amount)),
    unrated:held.filter(entry=>!entry.card&&!entry.ambiguous).length};
}
