import {Stack,ToolTitle,SettingsGroup,Disclosure,Form,FormField,Notice,ActionGroup,Button,Note,UploadField,RecordRow,RowLink,OPEN_GLYPH} from './ui.js';
import {BILLING_CYCLES,SUBSCRIPTION_STATES,annualCost,money} from '../subscription-data.js';
export const subscriptionFields=['name','account','amount','currency','cycle','state','canceledOn','renewal','notice','url','notes'];
export function SubscriptionsView(){
  const field=(key,label,kind='text',extra={})=>FormField({id:`subscriptions-${key}`,label,kind,...extra});
  return Stack([
    ToolTitle('Subscriptions & renewals',{actionsId:'subscriptions-actions',statusId:'subscriptions-status'}),
    Note('',{id:'subscriptions-total'}),Stack([],{id:'subscriptions-records'}),
    Disclosure('Read a statement',[
      field('import-account','Account nickname (no account number)', 'text',{placeholder:'e.g. Everyday card'}),
      UploadField({id:'subscriptions-drop',inputId:'subscriptions-file',statusId:'subscriptions-file-status',label:'Drop a statement',formats:'PDF, spreadsheet, text or image',accept:'.pdf,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp',status:''}),
      field('text','Statement text to read','textarea',{rows:5}),
      Notice('',{id:'subscriptions-intake-status',role:'status'}),
      ActionGroup([Button('Find recurring charges',{id:'subscriptions-read',variant:'primary'}),Button('Clear statement',{id:'subscriptions-clear-statement',variant:'secondary'})])
    ],{id:'subscriptions-intake'}),
    Disclosure('Add or edit a subscription',[
      Form([
        field('name','Service'),field('account','Account nickname (optional)'),
        field('amount','Price per billing period','number',{step:'0.01',min:'0'}),field('currency','Currency','text'),
        field('cycle','Billing cycle','select',{options:Object.entries(BILLING_CYCLES).map(([value,text])=>({value,text}))}),
        field('state','Status','select',{options:SUBSCRIPTION_STATES.map(value=>({value,text:value}))}),
        field('canceledOn','Cancellation effective date (for canceled services)','date'),
        field('renewal','Confirmed next renewal / decision date (optional)','date'),field('notice','Days of advance notice','number'),
        field('url','Account or cancellation link (optional)','url'),field('notes','Notes (optional)','textarea',{rows:3}),
        Notice('',{id:'subscriptions-form-status',role:'status'}),
        ActionGroup([Button('Save subscription',{id:'subscriptions-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'subscriptions-cancel',variant:'secondary'})])
      ],{id:'subscriptions-form',className:'form-stack'})
    ],{id:'subscriptions-editor'}),
    SettingsGroup({title:'Find cheaper alternatives',level:2,children:[
      field('country','Country / market','text',{placeholder:'e.g. United States'}),
      field('requirements','Features you need to keep (optional)','textarea',{rows:2}),
      Notice('',{id:'subscriptions-research-status',role:'status'})
    ]})
  ]);
}
export function SubscriptionEvidence(record){
  return Disclosure(`Charge evidence (${record.charges.length})`,record.charges.length?record.charges.map(c=>RecordRow({title:`${c.on} · ${money(c.amount,record.currency)}`,detail:c.description,notes:c.source})): [Note('Entered by hand; no imported charges.')]);
}
export function SubscriptionResearch(record){
  const r=record.research;if(!r)return null;
  const current=annualCost(record);
  return Disclosure(`Alternatives · checked ${r.checked}`,[Note(`${r.country} · ${r.summary}`),...(r.requirements?[Note(`Required features: ${r.requirements}`)]:[]),...r.options.map(o=>{
    const alternative=annualCost(o),saving=current===null?null:Math.round((current-alternative)*100)/100;
    return RecordRow({title:o.name,detail:`${money(o.amount,o.currency)} · ${BILLING_CYCLES[o.cycle]}${saving>0?` · Potential ${money(saving,o.currency)}/year less`:saving!==null?' · No annual price saving':''}`,notes:o.terms,actions:[RowLink(OPEN_GLYPH,`Open the pricing page for ${o.name}`,o.url,{rel:'noopener noreferrer'})]});
  }),Note('Listed ongoing prices. Check features, taxes and eligibility before switching.')]);
}
