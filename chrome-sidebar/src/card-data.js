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
