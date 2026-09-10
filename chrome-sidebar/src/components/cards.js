import {Stack,Section,Heading,Note,Notice,Form,FormField,Button,ActionGroup,Disclosure,Link,Strong} from './ui.js';
import {PURCHASE_CATEGORIES,PURCHASE_CHANNELS,rewardRules} from '../card-data.js';
const options=values=>values.map(value=>({value,text:value}));
const field=(key,label,kind='text',values,extra={})=>FormField({id:`cards-${key}`,label,kind,options:values,...extra});
const button=(label,key,variant='secondary',props={})=>Button(label,{id:`cards-${key}`,variant,...props});
export function CardsView(){
  return Stack([
    Heading('Best card',1),
    Notice('',{id:'cards-status'}),
    Section([Heading('Your purchase',2),Form([
      field('purchase','What are you buying, and where?','textarea',undefined,{className:'purchase-intake',rows:3}),
      ActionGroup([button('Find best card','compare','primary',{type:'submit'})]),
      Notice('',{id:'cards-purchase-status'}),
      Stack([],{id:'cards-reading'}),
      Disclosure('Adjust what AI read',[
        field('category','Reward category','select',[{value:'',text:'Not selected'},...options(PURCHASE_CATEGORIES)]),
        field('channel','Purchase method','select',options(PURCHASE_CHANNELS)),
        field('amount','Purchase amount (USD, optional)','number')
      ],{id:'cards-adjust',hidden:true}),
      Stack([],{id:'cards-conditions'}),Stack([],{id:'cards-results',className:'comparison-results'})
    ],{id:'cards-purchase-form',className:'form-stack'})],{className:'settings-group'}),
    Section([Heading('Your cards',2),Stack([],{id:'cards-list'}),ActionGroup([button('Add card','add','primary',{size:'compact'}),button('Refresh cards','refresh','secondary',{size:'compact'})])],{className:'settings-group'}),
    Disclosure('Add or edit a card',[
      Form([
        field('find','Which card do you have?','text',undefined,{placeholder:'chase sapphire, amex gold, my citi 2% card'}),
        ActionGroup([button('Find card and rewards','research','primary',{type:'submit'})]),
        Notice('',{id:'cards-research-status'}),
        Stack([],{id:'cards-matches'}),Stack([],{id:'cards-summary'})
      ],{id:'cards-find-form',className:'form-stack'}),
      Form([
        Disclosure('Card terms',[
          field('name','Full card name and country'),
          field('unit','Reward type','select',[{value:'cash',text:'Cash back (%)'},{value:'points',text:'Points or miles per dollar'}]),
          field('base','Base reward rate','number'),field('cpp','Redemption value (cents per point)','number'),
          Note('Cash back uses 1. For points, enter your own redemption value before comparing.'),
          Heading('Bonus categories',3),Note('Enter total rates. For capped bonuses, enter remaining eligible spend in USD; leave blank only for unlimited bonuses.'),
          Stack([],{id:'cards-rules'}),ActionGroup([button('Add bonus category','add-rule','secondary',{size:'compact'})]),
          field('source','Issuer terms URL'),field('checked','Terms reviewed on','date'),
          field('notes','Limits, exclusions, and shared caps','textarea')
        ],{id:'cards-details'}),
        Notice('',{id:'cards-form-status'}),
        ActionGroup([button('Save card','save','primary',{type:'submit'}),button('Cancel edit','cancel')])
      ],{id:'cards-form',className:'form-stack'})
    ],{id:'cards-editor'}),
    Disclosure('AI connection',[field('connection','Saved AI connection','select',[]),button('Refresh connections','connections'),Notice('',{id:'cards-ai-status'})])
  ],{className:'travel-wallet card-tool'});
}
// A rough name can name more than one real card, so research answers with the
// products it could be. Choosing one is the only way a card gets researched.
export function CardMatches(matches,onPick){
  if(!matches.length)return [];
  return [Note('Which one do you have?'),...matches.map(match=>{
    const pick=Button(match.name,{variant:'secondary',size:'compact'});
    pick.addEventListener('click',()=>onPick(match.name));
    return Section([pick,...(match.note?[Note(match.note)]:[])],{className:'card-match'});
  })];
}
// What research put in the form, so the owner can check every rate it ingested
// without opening the terms below.
export function CardIngest(card){
  if(!card)return [];
  const rules=rewardRules(card.rules||'[]');
  const rate=value=>`${value}${card.unit==='cash'?'%':'×'}`;
  const detail=rule=>[`${rate(rule.rate)} ${rule.category}`,rule.channel==='Any'?'':rule.channel,
    rule.active?'':'needs activation',rule.remaining===null?'':`enter your remaining $${rule.remaining} cap`,
    rule.end?`through ${rule.end}`:'',rule.condition].filter(Boolean).join(' · ');
  return [Section([
    Strong(card.name),
    Note(`${rate(card.base)} base · ${rules.length} bonus ${rules.length===1?'category':'categories'}${card.unit==='points'?` · ${card.cpp>0?`${card.cpp}¢ per point`:'redemption value needed'}`:''}`),
    ...rules.map(rule=>Note(detail(rule),{className:'footnote card-ingest-rule'})),
    ...(card.notes?[Note(card.notes)]:[]),
    ...(card.source?[Link('Issuer terms used',card.source)]:[])
  ],{className:'purchase-reading card-ingest'})];
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
const percent=value=>`${value.toFixed(2)}%`;
// What AI read out of the description, shown before the recommendation so the
// reading can be checked and corrected before any number is trusted.
export function PurchaseReading(reading){
  if(!reading)return [];
  const detail=[reading.merchant,reading.category,reading.channel,reading.amount===null?null:money(reading.amount)].filter(Boolean).join(' · ');
  return [Section([
    Strong(detail),
    ...(reading.reason?[Note(reading.reason)]:[]),
    ...(reading.confidence==='low'?[Note('Low confidence in this reading. Check the category before relying on the result.',{className:'footnote purchase-reading-warning'})]:[]),
    Note(reading.manual?'You set these values.':'Read from your description. Adjust below to change it.')
  ],{className:'purchase-reading'})];
}
const near=(a,b)=>Math.abs(a-b)<0.000001;
// The winning program is always computed from saved terms, never chosen by AI.
// Each row therefore names the reward program that applied and how far apart the
// cards actually are.
export function ComparisonResults(rows){
  if(!rows.length)return [Note('Add a card with reviewed reward rates to compare. Conflicted or deleted cards are excluded.')];
  const top=rows[0].dollars,tied=rows.filter(row=>near(row.dollars,top)).length>1,runnerUp=rows.find(row=>!near(row.dollars,top));
  const estimated=rows[0].estimated;
  const program=row=>row.matched
    ?`${row.matched.rate}${row.unit==='cash'?'%':'×'} ${row.matched.category} bonus${row.matched.channel==='Any'?'':` · ${row.matched.channel} only`}`
    :`${row.base}${row.unit==='cash'?'%':'×'} base rate · no bonus program matched`;
  const why=row=>{
    if(!near(row.dollars,top))return `Behind by ${percent(rows[0].rate-row.rate)}${estimated?` · ${money(top-row.dollars)} less`:''}.`;
    if(tied)return 'Tied at the same effective rate. Either card earns the same here.';
    if(!runnerUp)return 'The only card with reviewed terms that applies to this purchase.';
    return `Beats ${runnerUp.name} by ${percent(row.rate-runnerUp.rate)}${estimated?` · ${money(row.dollars-runnerUp.dollars)} more`:''}.`;
  };
  return [Heading('Recommended card',2),
    Note(estimated?'Computed from your saved terms and the reading above. Excludes interest, fees, signup bonuses, and unentered offers. Comparing does not deduct spending caps.':'Effective rates from your saved terms. Add an amount to your description for dollar estimates. Excludes interest, fees, signup bonuses, and unentered offers.'),
    ...rows.map(row=>Section([
      Strong(`${near(row.dollars,top)?(tied?'Tied best · ':'Best return · '):''}${row.name}`),
      Heading(estimated?`${money(row.dollars)} · ${percent(row.rate)}`:percent(row.rate),3),
      Note(program(row)),
      Note(why(row),{className:'footnote comparison-why'}),
      ...(estimated&&row.unit==='points'?[Note(`${row.earned.toFixed(2)} points × ${row.cpp}¢ redemption value`)]:[]),
      Disclosure('Calculation and conditions',[Note(row.matched?`${row.matched.rate}${row.unit==='cash'?'%':'×'} bonus${row.matched.remaining===null?'':` on up to $${row.matched.remaining} remaining eligible spend`}; ${row.base}${row.unit==='cash'?'%':'×'} base on the rest.`:`${row.base}${row.unit==='cash'?'%':'×'} base rate used.`),...row.warnings.map(w=>Note(w)),...(row.source?[Link('Issuer terms',row.source)]:[])])
    ],{className:near(row.dollars,top)?'comparison-result comparison-best':'comparison-result'}))];
}
