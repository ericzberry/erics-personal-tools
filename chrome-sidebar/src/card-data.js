export const PURCHASE_CATEGORIES=['Dining','Groceries','Gas','Travel','Transit','Online shopping','Department stores','Drugstores','Entertainment','Other'];
export const PURCHASE_CHANNELS=['Direct','Online','In store','Issuer portal'];
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
const number=(value,max,label)=>{
  if(!['number','string'].includes(typeof value)||(typeof value==='string'&&!value.trim())||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max)fail(`Enter a valid ${label} between 0 and ${max}.`);
  return Number(value);
};
export function rewardRules(value){
  let rules;try{rules=typeof value==='string'?JSON.parse(value):value;}catch{fail('Check the bonus reward rules.');}
  if(!Array.isArray(rules)||rules.length>20)fail('Save up to 20 bonus rules per card.');
  return rules.map(rule=>{
    if(!rule||!PURCHASE_CATEGORIES.includes(rule.category)||!['Any',...PURCHASE_CHANNELS].includes(rule.channel)||typeof rule.active!=='boolean')fail('Choose a category, purchase method, and activation status for each rule.');
    const end=text(rule.end??'',10,'bonus end date');
    if(end&&(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(Date.parse(end))||new Date(end).toISOString().slice(0,10)!==end))fail('Enter a valid bonus end date.');
    return {category:rule.category,channel:rule.channel,rate:number(rule.rate,100,'bonus rate'),remaining:rule.remaining===null?null:number(rule.remaining,10000000,'remaining eligible spend'),active:rule.active,end,condition:text(rule.condition??'',500,'bonus conditions')};
  });
}
export const CARD_MATCH_LIMIT=6;
// Research answers a rough card name with either one identified product or a
// short list of real ones. The owner picks which card they hold; AI never does.
export function parseCardMatches(value){
  if(!Array.isArray(value)||value.length<2||value.length>CARD_MATCH_LIMIT)fail('AI did not return a usable list of matching cards.');
  return value.map(match=>({name:text(match?.name,120,'card name',true),note:text(match?.note??'',200,'what makes the card different')}));
}
export function normalizeCard(input,previous={}){
  const get=key=>input[key]??previous[key];
  const unit=get('unit');if(!['cash','points'].includes(unit))fail('Choose cash back or points.');
  const source=text(get('source')??'',2000,'issuer source URL');
  if(source){let url;try{url=new URL(source);}catch{fail('Enter a full HTTPS issuer source URL.');}if(url.protocol!=='https:'||url.username||url.password)fail('Use an HTTPS issuer source URL without credentials.');}
  const checked=text(get('checked')??'',10,'review date');
  if(checked&&(!/^\d{4}-\d{2}-\d{2}$/.test(checked)||!Number.isFinite(Date.parse(checked))||new Date(checked).toISOString().slice(0,10)!==checked))fail('Enter a valid review date.');
  return {name:text(get('name'),120,'card name',true),unit,base:number(get('base'),100,'base reward rate'),cpp:unit==='cash'?1:number(get('cpp'),100,'point value in cents'),rules:JSON.stringify(rewardRules(get('rules')??'[]')),source,checked,notes:text(get('notes')??'',4000,'reward terms')};
}
// The amount is optional: without one the comparison reports effective rates
// rather than dollars, so a description like "gas" still returns a recommendation.
export function normalizePurchase(input){
  if(!PURCHASE_CATEGORIES.includes(input.category)||!PURCHASE_CHANNELS.includes(input.channel))fail('Choose a purchase category and method.');
  const blank=input.amount===''||input.amount===null||input.amount===undefined;
  const amount=blank?null:number(input.amount,10000000,'purchase amount');
  if(amount!==null&&amount<=0)fail('Enter a purchase amount greater than zero.');
  return {category:input.category,channel:input.channel,amount};
}
export const REFERENCE_AMOUNT=100;
// Money calculations are deterministic. AI never supplies the winning card or rates.
export function compareCards(cards,input,today=new Date().toISOString().slice(0,10)){
  const purchase=normalizePurchase(input);
  // Without a stated amount every card is scored on the same reference spend, so
  // the returned rate is comparable even though the dollars are illustrative.
  const spend=purchase.amount??REFERENCE_AMOUNT;
  return cards.filter(card=>!card.deleting&&!card.conflict).map(raw=>{
    const card={...raw,...normalizeCard(raw)},warnings=[];
    if(!card.checked||Date.parse(today)-Date.parse(card.checked)>90*86400000)warnings.push('Review the reward terms; they are missing a recent review date.');
    if(card.notes)warnings.push(card.notes);
    let units=spend*card.base/100,matched=null;
    for(const [index,rule] of rewardRules(card.rules).entries()){
      if(rule.category!==purchase.category||(rule.channel!=='Any'&&rule.channel!==purchase.channel))continue;
      if(!rule.active){warnings.push('An inactive bonus was excluded.');continue;}
      if(rule.end&&rule.end<today){warnings.push('An expired bonus was excluded.');continue;}
      // Conditional rules require explicit purchase-time confirmation, never a guess.
      if(rule.condition&&!input.confirmed?.includes(`${card.id}:${index}`)){warnings.push(`Bonus excluded until confirmed: ${rule.condition}`);continue;}
      // A remaining cap can only be applied against a stated amount. Without one the
      // bonus is scored in full and the cap is disclosed instead of silently blended.
      const eligible=rule.remaining===null?spend:purchase.amount===null?(rule.remaining>0?spend:0):Math.min(spend,rule.remaining);
      const earned=(eligible*rule.rate+(spend-eligible)*card.base)/100;
      if(earned>units){units=earned;matched=rule;}
    }
    if(matched&&matched.remaining!==null&&purchase.amount===null)warnings.push(`This rate holds only for the $${matched.remaining} of eligible spend left on that bonus.`);
    const dollars=units*card.cpp;
    return {...card,dollars,estimated:purchase.amount!==null,amount:purchase.amount,rate:dollars/spend*100,earned:card.unit==='points'?units*100:units,matched,warnings};
  }).sort((a,b)=>b.dollars-a.dollars||a.name.localeCompare(b.name));
}
export function parseClassification(value){
  if(!value||!PURCHASE_CATEGORIES.includes(value.category)||!['low','medium','high'].includes(value.confidence)||typeof value.reason!=='string'||value.reason.length>800)throw Error('AI returned an invalid category. Choose a category manually or try again.');
  return {category:value.category,confidence:value.confidence,reason:value.reason};
}
// The whole intake is one free-text description, so AI reads the merchant, the
// purchase method and any stated amount out of it. Only the category, confidence
// and reason are required; a malformed extra is dropped rather than failing the
// reading, and every field stays editable before the comparison is trusted.
export function parsePurchaseIntent(value){
  const classification=parseClassification(value);
  const merchant=typeof value.merchant==='string'?value.merchant.trim().slice(0,120):'';
  const channel=PURCHASE_CHANNELS.includes(value.channel)?value.channel:'Direct';
  let amount=null;
  try{amount=normalizePurchase({...classification,channel,amount:value.amount}).amount;}catch{amount=null;}
  return {...classification,merchant,channel,amount};
}

// ---------------------------------------------------------------------------
// Which card is which
//
// One card is named differently everywhere it appears. Research calls it "The
// Platinum Card® from American Express", the issuer's own benefits page calls
// it "Platinum Card® (-61007)", and the owner calls it "my amex platinum". So
// cards are told apart on the words that actually distinguish them, and the
// account digits a page prints are not part of the product's name at all —
// they say which of two identical cards it is, which is the one thing the
// product name cannot say.
export const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Words that name no card in particular. Every Amex is an American Express
// card, so matching on those words matches every card the owner holds.
const COMMON=new Set(['card','cards','american','express','from','the','and','with','credit','rewards','preferred','account']);
const words=value=>key(value).split(' ').filter(word=>word.length>2&&!COMMON.has(word));
// The four digits a page prints beside a card's name — "(-61007)", "•••• 72005".
// Only a run long enough to be an account's tail counts, and only the last four
// of it, because that is the part a card is known by wherever it is written down.
const DIGITS=/\d{4,}/g;
const tails=value=>[...String(value||'').matchAll(DIGITS)].map(([run])=>run.slice(-4));
// Which of the owner's cards a name is. The page says "Morgan Stanley Platinum
// Card® (-61007)" and the wallet holds whatever research called it, so they are
// matched on the words that tell one card from another. One card sharing the
// most of them wins; a tie names nothing, because filing a Platinum's credits
// under a Blue Cash is worse than not filing them at all.
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
// The account an issuer prints beside a card's name: "(-61007)", "(...4321)",
// "•••• 4321", "ending in 4321". Only a masked figure counts, so a product name
// that simply ends in a number keeps it.
const MASKED=/\((?:[\s\-–—*x•·.…]*)(\d{3,6})\)|(?:ending(?:\s+in)?|acct\.?|account(?:\s*(?:number|no\.?|#))?)\s*:?\s*#?\s*(\d{3,6})|[*x•·.…]{2,}\s*(\d{3,6})/gi;
export function cardDigits(name){
  const found=[...String(name||'').matchAll(MASKED)].map(match=>match[1]||match[2]||match[3]).filter(Boolean);
  return found.length?found[found.length-1].slice(-4):'';
}
// The card's name with the account taken back off it, which is what research is
// asked about: the product is a real card anyone can look up, the account is
// the owner's and is never sent anywhere.
export const cardProductName=name=>String(name||'').replace(MASKED,' ').replace(/\s{2,}/g,' ').replace(/[\s·•,;:\-–—]+$/,'').trim();
// Whether a card is one this tool already has. A card is the same card when
// every word that tells it apart is in the other name too: "Platinum Card®
// (-61007)" is "The Platinum Card® from American Express (United States)",
// while "Chase Sapphire Reserve" is not "Chase Sapphire Preferred", which
// shares everything but the one word that matters. Scoring the shared words
// the way a credit is filed would call those two the same card, and a card
// wrongly taken for one that is already here is a card the owner never gets
// offered — so this asks for all of them, and errs towards offering a card
// twice rather than never mentioning it.
export const coversCard=(name,other)=>{
  const wanted=words(name),held=words(other);
  return wanted.length>0&&wanted.every(word=>held.includes(word));
};
// The cards the owner is known to hold, whether or not this tool has rates for
// them. Two things in the wallet say a card exists: a card entry, which is the
// card itself, and a benefit read off an issuer's page, which carries the card
// the page filed it under down to the account it belongs to. Neither is a
// reward rate — but a card that has to be typed in again before it can be
// compared is a card the owner already told this app about once.
export function walletCards(entries=[],cards=[]){
  const found=[];
  for(const entry of entries||[]){
    if(!entry||entry.deleting)continue;
    if(entry.kind==='card')found.push({name:String(entry.name||''),digits:/^\d{4}$/.test(String(entry.secretHint||''))?entry.secretHint:cardDigits(entry.name)});
    else if(['benefit','membership'].includes(entry.kind)&&cardDigits(entry.source))found.push({name:String(entry.source||''),digits:cardDigits(entry.source)});
  }
  const held=[];
  for(const row of found){
    const product=cardProductName(row.name);
    // The same card named by the wallet and named again by the page a credit
    // was read from is one card, and the wallet's own name for it wins.
    if(!product||held.some(kept=>coversCard(kept.product,product)||coversCard(product,kept.product)||(kept.digits&&kept.digits===row.digits)))continue;
    held.push({...row,product});
  }
  return held.map(row=>{
    const saved=cards.filter(card=>!card.deleting&&coversCard(row.product,card.name));
    // More than one saved card answers to this name, so cards like it are
    // already here with their rates and offering it again would put a second
    // copy of one of them into the comparison.
    return {...row,card:saved.length===1?saved[0]:null,ambiguous:saved.length>1};
  });
}
