// What a card earns, read off the card's own rewards page.
//
// A card's terms are the one part of it that no owner enjoys typing and that
// research is least sure of. `cards.research` reads the issuer's public pages,
// which is the right answer for a product anyone can apply for and the wrong
// one for a product nobody can: the J.P. Morgan Reserve is invitation-only, its
// pages are thin, and the page that states its rates plainly is the one the
// owner is signed in to and looking at — "8x on Chase Travel", "4x on flights
// and hotels booked direct", "3x on dining", and what everything else earns.
//
// Those four lines are exactly what `rewardRules` in card-data.js already
// holds, so nothing here is a new record: a rate is a bonus rule on a card the
// owner already saved, proposed against the rules that card already has, and
// written only by a press of theirs through the same validator and the same
// route as a card edited by hand.
import {PURCHASE_CATEGORIES,PURCHASE_CHANNELS,rewardRules,normalizeCard} from './card-data.js';
import {matchCard} from './credit-data.js';

// A card holds at most 20 bonus rules, so a page proposing more than that is
// not a rewards page.
export const RATE_LIMIT=20;
// Where the rate applies. "8x on Chase Travel" is Travel through an Issuer
// portal; "4x on flights and hotels booked direct" is Travel, Direct; "3x on
// dining" is Dining, Any.
export const RATE_CHANNELS=['Any',...PURCHASE_CHANNELS];
// Points per dollar, or a percent back. Which one a card is kept in is the
// card's own `unit`, and the two are never read as each other.
export const RATE_UNITS=['points','cash'];
const CONFIDENCE=['high','medium','low'];
const text=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// The number inside whatever the page called it: 8, "8x", "8X", "3%", "1.5".
const FIGURE=/\d+(\.\d+)?/;
function rateOf(value){
  const [found]=FIGURE.exec(String(value??''))||[];
  if(found===undefined)return null;
  const rate=Number(found);
  return Number.isFinite(rate)&&rate>=0&&rate<=100?rate:null;
}
// How a rate reads on screen, in the unit the card counts in.
export const formatRate=(rate,unit)=>unit==='cash'?`${rate}%`:`${rate}×`;

// One earning rate as a reading proposes it: the page's own wording, and the
// rule it implies. Every field is checked here, shown to the owner, and saved
// only by a press of theirs — the rule a balance and a credit reading both
// already follow.
export function parseRateReading(input,source='',now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw Error('Reading that page returned nothing to review.');
  const found=Array.isArray(input.rates)?input.rates:[];
  if(found.length>RATE_LIMIT)throw Error(`A page reading returns at most ${RATE_LIMIT} earning rates.`);
  const seen=new Set();
  return found.map(row=>{
    const label=text(row?.label,200);
    const rate=rateOf(row?.rate);
    if(!label||rate===null)return null;
    // "All other earnings" is the card's base rate, not a bonus on a category
    // the page never named. Filing it as one would put a rule on the wallet's
    // "Other" and leave the base at whatever it was.
    const base=row?.base===true;
    // A bonus names the category it applies to, and nothing is filed under a
    // category the page did not state: a rate whose category was guessed is a
    // rate that would change which card the comparison picks.
    const category=PURCHASE_CATEGORIES.includes(row?.category)?row.category:'';
    if(!base&&(!category||rate===0))return null;
    const channel=RATE_CHANNELS.includes(row?.channel)?row.channel:'Any';
    // One rate per card per category and purchase method. A page that states
    // the same one twice states it once; the first reading of it is kept.
    const already=base?`${key(row?.card)}|base`:`${key(row?.card)}|${category}|${channel}`;
    if(seen.has(already))return null;
    seen.add(already);
    return {label,
      // The card the page states it against, as the page names it. Which of
      // the owner's cards that is stays on the device.
      card:text(row?.card,200),
      source:text(row?.source,200)||text(source,200),
      base,category:base?'':category,channel:base?'Any':channel,rate,
      unit:RATE_UNITS.includes(row?.unit)?row.unit:'points',
      // What the reward is restricted to, in the page's own terms. A narrow
      // reward filed under a broad category has to carry what narrows it, or
      // the comparison will spend it on purchases it was never good for.
      condition:text(row?.condition,500),
      notes:text(row?.notes,400),
      confidence:CONFIDENCE.includes(row?.confidence)?row.confidence:'medium',readAt:now};
  }).filter(Boolean);
}

// Which of the owner's saved cards a rate belongs to, and what saving it would
// do to that card's terms. The card is matched the way a credit's is — on the
// words that tell one card from another, and on the last four digits where the
// page prints them — and a rate that matches nothing is reported rather than
// given a card to land on.
export function matchRates(rows=[],cards=[]){
  const held=cards.filter(card=>card&&!card.deleting&&!card.conflict);
  return rows.map(row=>{
    const {card,ambiguous}=matchCard(row.card,held);
    // A rate counted in points cannot be written onto a card the owner keeps
    // in cash back: 8 and 8% are different numbers, and the card's own unit is
    // what the comparison reads them with. Saying so beats storing a figure
    // that would quietly pick the wrong card.
    const mismatch=!!card&&card.unit!==row.unit;
    const holder=mismatch?null:card;
    const rules=holder?rewardRules(holder.rules||'[]'):[];
    // The rule this one would replace, so the review can say which rates are
    // changes to terms the card already holds and which are new.
    const existing=!holder?null:row.base?{base:true,rate:Number(holder.base)}
      :rules.find(rule=>rule.category===row.category&&rule.channel===row.channel)||null;
    return {...row,holder,ambiguous,mismatch,existing};
  });
}

// The cards one reading would change, one record each. A rate with no card of
// the owner's to land on changes nothing, so it forms no group and is left on
// screen to be read.
export function rateCards(rows=[]){
  const groups=new Map();
  for(const row of rows){
    if(!row.holder)continue;
    const group=groups.get(row.holder.id)||{holder:row.holder,rows:[]};
    group.rows.push(row);
    groups.set(row.holder.id,group);
  }
  return [...groups.values()];
}

// A card's terms with what the page states folded into them, checked by the
// same validator a card edited by hand passes. A rule the card already holds
// for the same category and purchase method is that rule at a new rate, never
// a second one beside it, and everything else about it — its remaining cap, its
// end date, whether it needs activating — is the owner's and is left alone.
export function rateCardRecord(holder,rows=[],today=new Date().toISOString().slice(0,10)){
  const rules=rewardRules(holder.rules||'[]');
  let base=holder.base;
  for(const row of rows){
    if(row.base){base=row.rate;continue;}
    const index=rules.findIndex(rule=>rule.category===row.category&&rule.channel===row.channel);
    if(index>=0)rules[index]={...rules[index],rate:row.rate,condition:row.condition||rules[index].condition};
    else rules.push({category:row.category,channel:row.channel,rate:row.rate,remaining:null,active:true,end:'',condition:row.condition});
  }
  // The owner has just read these terms off the issuer's own page and pressed
  // save, which is what a review date says.
  return normalizeCard({...holder,base,rules:JSON.stringify(rules),checked:today},holder);
}
