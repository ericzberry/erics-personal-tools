import {Stack,Section,Heading,Note,Notice,Form,FormField,Button,ActionGroup,Disclosure,Link,Strong} from './ui.js';
import {PURCHASE_CATEGORIES,PURCHASE_CHANNELS,rewardRules} from '../card-data.js';
const options=values=>values.map(value=>({value,text:value}));
const field=(key,label,kind='text',values)=>FormField({id:`cards-${key}`,label,kind,options:values});
const button=(label,key,variant='secondary',props={})=>Button(label,{id:`cards-${key}`,variant,...props});
export function CardsView(){
  return Stack([
    Heading('Best card',1),Note('Describe a purchase to compare rewards across your saved cards. No card numbers needed.'),
    Notice('',{id:'cards-status'}),
    Section([Heading('Your purchase',2),Form([
      field('purchase','What are you buying, and where?'),
      field('amount','Purchase amount (USD)','number'),
      field('channel','Purchase method','select',options(PURCHASE_CHANNELS)),
      field('category','Reward category','select',[{value:'',text:'Let AI suggest a category'},...options(PURCHASE_CATEGORIES)]),
      Note('AI suggests the merchant category. Your issuer determines how the transaction actually codes.'),
      ActionGroup([button('Find best card','compare','primary',{type:'submit'}),button('Suggest category','classify')]),
      Notice('',{id:'cards-purchase-status'}),Stack([],{id:'cards-conditions'}),Stack([],{id:'cards-results',className:'comparison-results'})
    ],{id:'cards-purchase-form',className:'form-stack'})],{className:'settings-group'}),
    Section([Heading('Your cards',2),Note('Saved terms and manual comparisons work offline. AI requires internet.'),Stack([],{id:'cards-list'}),ActionGroup([button('Add card','add','primary',{size:'compact'}),button('Refresh cards','refresh','secondary',{size:'compact'})])],{className:'settings-group'}),
    Disclosure('Add or edit a card',[Form([
      field('name','Full card name and country'),
      ActionGroup([button('Look up issuer terms','research')]),
      Notice('',{id:'cards-research-status'}),
      field('unit','Reward type','select',[{value:'cash',text:'Cash back (%)'},{value:'points',text:'Points or miles per dollar'}]),
      field('base','Base reward rate','number'),field('cpp','Redemption value (cents per point)','number'),
      Note('Cash back uses 1. For points, enter your own redemption value before comparing.'),
      Heading('Bonus categories',3),Note('Enter total rates. For capped bonuses, enter remaining eligible spend in USD; leave blank only for unlimited bonuses. Caps are not tracked automatically. Keep inactive bonuses off until enrolled.'),
      Stack([],{id:'cards-rules'}),ActionGroup([button('Add bonus category','add-rule','secondary',{size:'compact'})]),
      field('source','Issuer terms URL'),field('checked','Terms reviewed on','date'),
      field('notes','Limits, exclusions, and shared caps','textarea'),
      Notice('',{id:'cards-form-status'}),
      ActionGroup([button('Save reviewed card','save','primary',{type:'submit'}),button('Cancel edit','cancel')])
    ],{id:'cards-form',className:'form-stack'})],{id:'cards-editor'}),
    Disclosure('AI connection',[Note('Choose a saved OpenAI connection for issuer research. Purchase classification uses the central task model policy.'),field('connection','Saved AI connection','select',[]),button('Refresh connections','connections'),Notice('',{id:'cards-ai-status'})])
  ],{className:'travel-wallet card-tool'});
}
export function BonusRule(rule={},index,onRemove){
  const prefix=`cards-rule-${index}`;
  const f=(key,label,kind='text',values)=>FormField({id:`${prefix}-${key}`,label,kind,options:values});
  const remove=Button('Remove bonus',{variant:'danger-subtle',size:'compact'});remove.addEventListener('click',onRemove);
  const row=Section([Heading(`Bonus ${index+1}`,3),
    f('category','Category','select',options(PURCHASE_CATEGORIES)),f('rate','Total reward rate','number'),
    f('channel','Eligible purchase method','select',options(['Any',...PURCHASE_CHANNELS])),
    f('remaining','Remaining eligible spend (blank = unlimited)','number'),
    f('active','Bonus status','select',[{value:'true',text:'Active'},{value:'false',text:'Inactive / needs activation'}]),
    f('end','Last eligible date (optional)','date'),f('condition','Purchase requirements or exclusions'),
    ActionGroup([remove],{compact:true})
  ],{className:'bonus-rule','data-rule':index});
  for(const [key,value] of Object.entries({category:'Dining',rate:0,channel:'Any',remaining:'',active:true,end:'',condition:'',...rule})){
    const input=row.querySelector(`#${prefix}-${key}`);if(input)input.value=value===null?'':String(value);
  }
  for(const input of row.querySelectorAll('input[type=number]')){input.min='0';input.step='any';}
  return row;
}
export function SavedCard(card,{onEdit,onDelete,onResolve}){
  const edit=Button('Edit',{variant:'subtle',size:'compact'});edit.addEventListener('click',onEdit);
  const remove=Button('Delete',{variant:'danger-subtle',size:'compact'});
  const confirm=Button('Delete saved card',{variant:'danger',size:'compact'}),cancel=Button('Keep card',{variant:'secondary',size:'compact'});
  const confirmation=Stack([Note('Delete this card from your connected devices?'),ActionGroup([confirm,cancel],{compact:true})],{hidden:true});
  remove.addEventListener('click',()=>{confirmation.hidden=false;confirm.focus();});cancel.addEventListener('click',()=>{confirmation.hidden=true;remove.focus();});confirm.addEventListener('click',onDelete);
  const conflicts=card.conflict?['local','cloud'].map(choice=>{const b=Button(choice==='local'?'Keep my change':'Use cloud version',{variant:'secondary',size:'compact'});b.addEventListener('click',()=>onResolve(choice));return b;}):[];
  return Disclosure(card.name,[Note(`${card.base}${card.unit==='cash'?'% cash back':' points per dollar'} base · ${rewardRules(card.rules).length} bonus categories${card.unit==='points'?` · ${card.cpp}¢ per point`:''}`),
    Note(`Reviewed: ${card.checked||'Not yet'}${card.pending?' · Waiting to sync':''}${card.conflict?' · Conflict: excluded from comparisons':''}${card.deleting?' · Pending deletion':''}`),
    ...(card.source?[Link('Review issuer terms',card.source)]:[]),...(card.notes?[Note(card.notes)]:[]),ActionGroup([edit,remove,...conflicts],{compact:true}),confirmation]);
}
export function PurchaseConditions(cards,purchase){
  const fields=cards.filter(c=>!c.deleting&&!c.conflict).flatMap(card=>rewardRules(card.rules).flatMap((rule,index)=>{
    if(!rule.condition||!rule.active||rule.category!==purchase.category||(rule.channel!=='Any'&&rule.channel!==purchase.channel)||(rule.end&&rule.end<new Date().toISOString().slice(0,10)))return [];
    const control=FormField({id:`cards-confirm-${card.id}-${index}`,label:`${card.name}: ${rule.condition}`,kind:'checkbox'});
    control.querySelector('input').setAttribute('data-confirm',`${card.id}:${index}`);return [control];
  }));
  return fields.length?[Note('Confirm only the requirements that this purchase meets. The comparison updates when you check a box.'),...fields]:[];
}
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
export function ComparisonResults(rows){
  if(!rows.length)return [Note('Add a card with reviewed reward rates to compare. Conflicted or deleted cards are excluded.')];
  const top=rows[0].dollars;
  return [Heading('Estimated rewards',2),Note('Based on saved terms and the selected category. Excludes interest, fees, signup bonuses, and unentered offers. Comparing does not deduct spending caps.'),...rows.map(row=>Section([
    Strong(`${Math.abs(row.dollars-top)<0.000001?(rows.filter(r=>Math.abs(r.dollars-top)<0.000001).length>1?'Tied best · ':'Best return · '):''}${row.name}`),
    Heading(`${money(row.dollars)} · ${row.rate.toFixed(2)}%`,3),
    Note(row.unit==='points'?`${row.earned.toFixed(2)} points × ${row.cpp}¢ redemption value`:'Estimated cash back'),
    Disclosure('Calculation and conditions',[Note(row.matched?`${row.matched.rate}${row.unit==='cash'?'%':'×'} bonus${row.matched.remaining===null?'':` on up to $${row.matched.remaining} remaining eligible spend`}; ${row.base}${row.unit==='cash'?'%':'×'} base on the rest.`:`${row.base}${row.unit==='cash'?'%':'×'} base rate used.`),...row.warnings.map(w=>Note(w)),...(row.source?[Link('Issuer terms',row.source)]:[])])
  ],{className:Math.abs(row.dollars-top)<0.000001?'comparison-result comparison-best':'comparison-result'}))];
}
