import {Stack,Section,Heading,Note,Notice,Form,FormField,Button,ActionGroup,Disclosure,Link,Strong,Text,RecordRow,RowLink,OPEN_GLYPH} from './ui.js';
import {money} from '../money.js';
import {PURCHASE_CATEGORIES,PURCHASE_CHANNELS,rewardRules} from '../card-data.js';
const options=values=>values.map(value=>({value,text:value}));
const field=(key,label,kind='text',values,extra={})=>FormField({id:`advisor-${key}`,label,kind,options:values,...extra});
// One box, one press. The description is read the way Best card reads it, and
// the reading stays on screen to be corrected; the recommendation is under it.
export function AdvisorView(){
  return Stack([
    Heading('Purchase advisor',1),
    Notice('',{id:'advisor-status'}),
    Form([
      field('purchase','What are you buying, and where?','textarea',undefined,{className:'purchase-intake',rows:3,placeholder:'I’m buying a laptop for $2,000'}),
      ActionGroup([Button('Recommend',{id:'advisor-recommend',variant:'primary',type:'submit'})]),
      Notice('',{id:'advisor-purchase-status'}),
      Stack([],{id:'advisor-reading'}),
      Disclosure('Adjust what AI read',[
        field('category','Reward category','select',[{value:'',text:'Not selected'},...options(PURCHASE_CATEGORIES)]),
        field('channel','Purchase method','select',options(PURCHASE_CHANNELS)),
        field('amount','Purchase amount (USD, optional)','money')
      ],{id:'advisor-adjust',hidden:true}),
      Stack([],{id:'advisor-conditions'}),
      Stack([],{id:'advisor-result',className:'advice'}),
      Notice('',{id:'advisor-ai-status'})
    ],{id:'advisor-form',className:'form-stack'})
  ],{className:'travel-wallet card-tool advisor-tool'});
}
// The bonus requirements this purchase may or may not meet, one box each.
// Best card asks the same question with its own ids; a second tool in the same
// panel cannot share a control's id, so these carry this tool's.
export function AdviceConditions(cards,purchase,today=new Date().toISOString().slice(0,10)){
  const fields=cards.filter(card=>!card.deleting&&!card.conflict).flatMap(card=>rewardRules(card.rules).flatMap((rule,index)=>{
    if(!rule.condition||!rule.active||(rule.end&&rule.end<today))return [];
    if(rule.merchant?!purchase.merchant:rule.category!==purchase.category)return [];
    if(rule.channel!=='Any'&&rule.channel!==purchase.channel)return [];
    const control=FormField({id:`advisor-confirm-${card.id}-${index}`,label:`${card.name}: ${rule.condition}`,kind:'checkbox'});
    control.querySelector('input').setAttribute('data-confirm',`${card.id}:${index}`);return [control];
  }));
  return fields;
}
const percent=value=>`${Number(value.toFixed(2))}%`;
const near=(a,b)=>Math.abs(a-b)<0.000001;
const rateLabel=row=>row.matched
  ?`${row.matched.rate}${row.unit==='cash'?'%':'×'} ${row.matched.merchant||row.matched.category} bonus`
  :`${row.base}${row.unit==='cash'?'%':'×'} base rate`;
const worth=(line,estimated)=>line.dollars===null?'':estimated||line.kind==='credit'||line.dollars>0?money(line.dollars):'';
// One line per thing the card gives here, each with its figure down the right
// edge, so the total above them is read as the sum it is.
function benefitLines(row,estimated){
  return Stack([
    RecordRow({title:rateLabel(row),figure:estimated?money(row.dollars):percent(row.rate),
      detail:estimated&&row.unit==='points'?`${row.earned.toFixed(0)} points × ${row.cpp}¢`:''}),
    ...row.credits.map(line=>RecordRow({title:line.name,detail:line.detail,figure:worth(line,estimated)})),
    ...row.offers.map(line=>offerRow(line,estimated))
  ],{className:'advice-lines'});
}
function offerRow(line,estimated,detail=''){
  return RecordRow({title:`${line.name} · ${line.program}`,detail,notes:line.summary,figure:worth(line,estimated),
    actions:line.url?[RowLink(OPEN_GLYPH,`Open the ${line.name} offer`,line.url)]:[]});
}
const conditions=list=>list.length?[Heading('Conditions',3),...list.map(text=>Text(text,{className:'advice-condition'}))]:[];
// What is left off a card's figure: an offer on a card with no rates saved here
// cannot be ranked, but it is still the merchant's offer; a program's offer
// that names no card applies to whatever is paid with.
function others(advice,estimated){
  return [
    ...(advice.shared.length?[Heading('With any card',3),...advice.shared.map(line=>offerRow(line,estimated,line.conditions.join(' ')))]:[]),
    ...(advice.elsewhere.length?[Heading('On cards without rates here',3),...advice.elsewhere.map(line=>offerRow(line,estimated,[line.card,...line.conditions].join(' · ')))]:[])
  ];
}
// The recommendation: the card to pay with, what it comes to, each thing that
// makes up the figure, and what has to hold for it. Every figure is from saved
// records; the reading above it is the only thing AI supplied.
export function Advice(advice){
  const {rows,estimated,unrated}=advice;
  const missing=unrated?`${unrated} card${unrated===1?'':'s'} in your wallet ${unrated===1?'has':'have'} no rates yet, so ${unrated===1?'it was':'they were'} not compared.`:'';
  if(!rows.length)return [Note(missing||'No card has reward rates yet. Add them in Best card.'),...others(advice,estimated)];
  const [best,...rest]=rows;
  const score=row=>estimated?row.total:row.rate;
  const tied=rest.filter(row=>near(score(row),score(best)));
  const runnerUp=rest.find(row=>!near(score(row),score(best)));
  const gap=row=>{
    if(near(score(row),score(best)))return 'Ties the best.';
    return estimated?`${money(score(best)-score(row))} less.`:`${percent(score(best)-score(row))} less.`;
  };
  const details=[...best.warnings.map(text=>Note(text)),...(best.source?[Link('Issuer terms',best.source)]:[])];
  return [
    Section([
      Strong(tied.length?`Pay with ${best.name} or ${tied.map(row=>row.name).join(' or ')}`:`Pay with ${best.name}`),
      Heading(estimated?`${money(best.total)} back`:`${percent(best.rate)} back`,3),
      benefitLines(best,estimated),
      ...conditions(best.conditions),
      ...(runnerUp?[Note(`${runnerUp.name} is next: ${gap(runnerUp).replace(/\.$/,'')} here.`,{className:'footnote'})]:[]),
      ...(details.length?[Disclosure('Details',details)]:[])
    ],{className:'advice-best'}),
    ...(missing?[Note(missing)]:[]),
    ...(rest.length?[Disclosure('Other cards',rest.map(row=>RecordRow({title:row.name,figure:estimated?money(row.total):percent(row.rate),
      detail:[rateLabel(row),...row.credits.map(line=>line.name),...row.offers.map(line=>`${line.name} offer`),gap(row)].join(' · '),
      notes:row.conditions.join(' ')})),{className:'advice-others'})]:[]),
    ...others(advice,estimated)
  ];
}
