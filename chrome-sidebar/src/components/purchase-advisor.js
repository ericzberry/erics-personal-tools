import {Stack,Section,Heading,Note,Notice,Form,FormField,Button,ActionGroup,Disclosure,Link,Strong,Text,RecordRow,RowLink,OPEN_GLYPH} from './ui.js';
import {money} from '../money.js';
import {PURCHASE_CATEGORIES,PURCHASE_CHANNELS,rewardRules} from '../card-data.js';
import {tied} from '../purchase-data.js';
const options=values=>values.map(value=>({value,text:value}));
const field=(key,label,kind='text',values,extra={})=>FormField({id:`advisor-${key}`,label,kind,options:values,...extra});
// One box, one press. The description is read the way Best card reads it, and
// the reading stays on screen to be corrected; the recommendation is under it.
// Inside Rewards the tab's label is the heading, so the view carries none.
export function AdvisorView({embedded=false}={}){
  return Stack([
    ...(embedded?[]:[Heading('Purchase advisor',1)]),
    Notice('',{id:'advisor-status'}),
    Form([
      field('purchase','What are you buying, and where?','textarea',undefined,{className:'purchase-intake',rows:3,placeholder:'I’m buying a laptop for $2,000'}),
      ActionGroup([Button('Compare',{id:'advisor-recommend',variant:'primary',type:'submit'})]),
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
const rateLabel=row=>row.matched
  ?`${row.matched.rate}${row.unit==='cash'?'%':'×'} ${row.matched.merchant||row.matched.category} bonus`
  :`${row.base}${row.unit==='cash'?'%':'×'} base rate`;
// The account, not only the product: two cards of one product are told apart
// by the digits, and "Pay with" names the one the credit is on.
const nameOf=row=>row.hint?`${row.name} •••• ${row.hint}`:row.name;
const worth=(line,estimated)=>line.dollars===null?'':estimated||line.kind==='credit'||line.dollars>0?money(line.dollars):'';
// One line per thing the card gives here today, each with its figure down the
// right edge, so the total above them is read as the sum it is. Points are
// said in points, with the planning value that turned them into money.
function benefitLines(row,estimated){
  return Stack([
    RecordRow({title:rateLabel(row),figure:estimated?money(row.dollars):percent(row.rate),
      detail:estimated&&row.unit==='points'?`${row.earned.toFixed(0)} points × ${row.cpp}¢ planning value`:''}),
    ...row.credits.filter(line=>line.supported).map(line=>RecordRow({title:line.name,detail:line.detail,figure:worth(line,estimated)})),
    ...row.offers.filter(line=>line.supported).map(line=>offerRow(line,estimated))
  ],{className:'advice-lines'});
}
function offerRow(line,estimated,detail=''){
  return RecordRow({title:`${line.name} · ${line.program}`,detail,notes:line.summary,figure:worth(line,estimated),
    actions:line.url?[RowLink(OPEN_GLYPH,`Open the ${line.name} offer`,line.url)]:[]});
}
const conditions=list=>list.length?[Heading('Conditions',3),...list.map(text=>Text(text,{className:'advice-condition'}))]:[];
// What could hold after a step — an offer to add, a credit to activate, a
// tracker to read — kept apart from what holds now, with the figure the card
// would come to where that figure is known.
function after(best,rows,estimated){
  const lines=[];
  if(best.after.length)lines.push(Text(`${estimated&&best.couldBe!==null?`${money(best.couldBe)} on ${nameOf(best)} · `:''}${best.after.join(' ')}`,{className:'advice-condition'}));
  for(const row of rows){
    if(!row.after.length)continue;
    if(estimated&&(row.couldBe===null||row.couldBe<=best.total))continue;
    lines.push(Text(`${estimated?`${money(row.couldBe)} on `:''}${nameOf(row)}${estimated?'':' could gain more'} · ${row.after.join(' ')}`,{className:'advice-condition'}));
  }
  return lines.length?[Heading('Could be better after…',3),...lines]:[];
}
// What is left off a card's figure: an offer on a card with no rates saved here
// cannot be ranked, but it is still the merchant's offer; a program's offer
// that names no card applies to whatever is paid with.
function others(advice,estimated){
  return [
    ...(advice.shared.length?[Heading('With any card',3),...advice.shared.map(line=>offerRow(line,estimated,line.conditions.join(' ')))]:[]),
    ...(advice.elsewhere.length?[Heading('On cards without rates here',3),...advice.elsewhere.map(line=>offerRow(line,estimated,[line.card,...line.conditions].join(' · ')))]:[])
  ];
}
// Coverage: a recommendation made without a card the owner holds is only
// "best" among the rest, so the cards left out are named, with why.
const coverage=advice=>advice.missing?.length
  ?`Not compared, and could change the answer: ${advice.missing.map(card=>`${card.name}${card.hint?` •••• ${card.hint}`:''} (${card.reason.replace(/\.$/,'')})`).join('; ')}.`
  :'';
// The recommendation: the card to pay with, what it comes to, each thing that
// makes up the figure, and what has to hold for it. Every figure is from saved
// records; the reading above it is the only thing AI supplied.
export function Advice(advice){
  const {rows,estimated,expired,breakEven}=advice;
  const missing=coverage(advice);
  if(!rows.length)return [Note(missing||'No card has earning rates yet. Add them under Card rates.'),...others(advice,estimated)];
  const [best,...rest]=rows;
  const score=row=>estimated?row.total:row.rate;
  const ties=rest.filter(row=>tied(score(row),score(best),estimated));
  const runnerUp=rest.find(row=>!tied(score(row),score(best),estimated));
  const gap=row=>{
    if(tied(score(row),score(best),estimated))return 'Effectively tied.';
    return estimated?`${money(score(best)-score(row))} less.`:`${percent(score(best)-score(row))} less.`;
  };
  const details=[...best.warnings.map(text=>Note(text)),...(best.source?[Link('Issuer terms',best.source)]:[])];
  return [
    Section([
      Strong(ties.length?`Pay with ${nameOf(best)} or ${ties.map(nameOf).join(' or ')}`:`Pay with ${nameOf(best)}`),
      Heading(estimated?`${money(best.total)} back`:`${percent(best.rate)} back`,3),
      benefitLines(best,estimated),
      ...conditions(best.conditions),
      ...(best.access.length?[Note(`Also on this card: ${best.access.join(', ')}.`)]:[]),
      ...(runnerUp?[Note(`${nameOf(runnerUp)} is next: ${gap(runnerUp).replace(/\.$/,'')} here.`,{className:'footnote'})]:[]),
      // Where a points card's figure stops holding: the value a point would
      // have to carry to beat the best cash return.
      ...(breakEven&&breakEven.cents!==null?[Note(`${breakEven.points} earns ${breakEven.earned.toFixed(0)} points here; it beats ${breakEven.cash}’s cash back if you value them above ${breakEven.cents}¢ each.`,{className:'footnote'})]:[]),
      ...(details.length?[Disclosure('Details',details)]:[])
    ],{className:'advice-best'}),
    ...after(best,rest,estimated),
    ...(missing?[Note(missing)]:[]),
    ...(expired?[Note(`${expired} expired offer${expired===1?'':'s'} left out.`)]:[]),
    ...(rest.length?[Disclosure('Other cards',rest.map(row=>RecordRow({title:nameOf(row),figure:estimated?money(row.total):percent(row.rate),
      detail:[rateLabel(row),...row.credits.filter(line=>line.supported).map(line=>line.name),...row.offers.filter(line=>line.supported).map(line=>`${line.name} offer`),gap(row)].join(' · '),
      notes:[row.conditions.join(' '),row.after.length?`Could be better after: ${row.after.join(' ')}`:''].filter(Boolean)})),{className:'advice-others'})]:[]),
    ...others(advice,estimated)
  ];
}
