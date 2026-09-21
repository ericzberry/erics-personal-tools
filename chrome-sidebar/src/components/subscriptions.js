import {Stack,ToolTitle,Disclosure,Form,FormField,Notice,ActionGroup,Button,Note,Strong,Label,UploadField,RecordRow,RowLink,OPEN_GLYPH} from './ui.js';
import {BILLING_CYCLES,SUBSCRIPTION_STATES,annualCost,money} from '../subscription-data.js';
import {ACCEPTED} from '../statement-text.js';
export const subscriptionFields=['name','account','amount','currency','cycle','state','canceledOn','renewal','notice','url','notes'];
// A statement is dropped and read; nothing is asked first. The card it was
// charged to comes off the statement (UI-38), and the text pulled out of it is
// the reading's input, not something to proofread: the file shows as its card
// (UI-47), and the reading starts when it arrives (UI-42). Read is there only
// for a file that could not be read then.
export function SubscriptionsView(){
  const field=(key,label,kind='text',extra={})=>FormField({id:`subscriptions-${key}`,label,kind,...extra});
  return Stack([
    ToolTitle('Subscriptions & renewals',{actionsId:'subscriptions-actions',statusId:'subscriptions-status'}),
    Note('',{id:'subscriptions-total'}),
    // A run of records, so the last one does not close on a rule of its own
    // just above the rule that opens the drawer under it.
    Stack([],{id:'subscriptions-records',className:'record-group'}),
    Disclosure('Read a statement',[
      UploadField({id:'subscriptions-drop',inputId:'subscriptions-file',statusId:'subscriptions-file-status',label:'Drop a statement',formats:'PDF, spreadsheet or image',accept:ACCEPTED.join(','),status:''}),
      Stack([],{id:'subscriptions-attachment',hidden:true}),
      ActionGroup([Button('Read',{id:'subscriptions-read',variant:'primary',size:'compact'})],{compact:true,id:'subscriptions-read-actions',hidden:true}),
      Notice('',{id:'subscriptions-intake-status',role:'status'})
    ],{id:'subscriptions-intake'}),
    Disclosure('Add or edit a subscription',[
      Form([
        field('name','Service'),field('account','Card or account (optional)'),
        field('amount','Price','number',{step:'0.01',min:'0'}),field('currency','Currency','text'),
        field('cycle','Billing cycle','select',{options:Object.entries(BILLING_CYCLES).map(([value,text])=>({value,text}))}),
        field('state','Status','select',{options:SUBSCRIPTION_STATES.map(value=>({value,text:value}))}),
        // Asked only of a canceled service (UI-40): later charges are checked
        // against it.
        field('canceledOn','Cancellation effective','date',{className:'subscriptions-canceled-field'}),
        field('renewal','Next renewal (optional)','date'),field('notice','Days of notice before renewal','number'),
        field('url','Account link (optional)','url'),field('notes','Notes (optional)','textarea',{rows:3}),
        Notice('',{id:'subscriptions-form-status',role:'status'}),
        ActionGroup([Button('Save subscription',{id:'subscriptions-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'subscriptions-cancel',variant:'secondary'})])
      ],{id:'subscriptions-form',className:'form-stack'})
    ],{id:'subscriptions-editor'})
  ],{className:'subscription-list'});
}
// A date reads as one word: "Sep 12, 2026" held together, where an ISO date
// broke at its hyphen.
export const shortDate=iso=>{const d=new Date(`${iso}T12:00:00`);return Number.isNaN(d.getTime())?iso:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).replace(/ /g,'\u00a0');};
// A record's one line under its name: what it costs how often, the card, and
// the next date. What is not known is left off rather than spelled out
// (UI-48), and Active, the ordinary state, is not said at all.
export function subscriptionDetail(r,due){
  const state={Review:'Possible subscription',Canceled:'Canceled','Not recurring':'Not recurring'}[r.state]||'';
  return [state,r.cycle==='unknown'?'':BILLING_CYCLES[r.cycle],r.account,
    r.state==='Canceled'?(r.canceledOn?`Effective ${shortDate(r.canceledOn)}`:'Add the cancellation date to check later charges'):'',
    due?`${r.renewal?'Renews':'Next charge about'} ${shortDate(due)}`:'',
    r.pending?(r.conflict?'Conflict':r.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · ');
}
// Everything a record holds beyond its line, in one drawer named for what is
// in it: the charges it was found from, and cheaper alternatives. `find` is the
// button that looks for them; it is offered only for a service in use, so a
// record with no charges and nothing to look for has no drawer.
export function SubscriptionDetails(record,{find=null,open=false,onToggle}={}){
  const r=record.research,charges=record.charges;
  if(!charges.length&&!find&&!r)return null;
  const title=[charges.length?'Charges':'',find||r?'alternatives':''].filter(Boolean).join(' and ');
  const current=annualCost(record);
  const drawer=Disclosure(title[0].toUpperCase()+title.slice(1),[
    ...[...charges].reverse().map(c=>RecordRow({title:shortDate(c.on),figure:money(c.amount,record.currency),detail:[c.description,c.source].filter(Boolean).join(' · ')})),
    ...(r?[
      Stack([Strong('Cheaper alternatives',{className:'record-name'}),Label(`checked ${shortDate(r.checked)}`,{className:'record-meta'})],{className:'record-head'}),
      ...(r.options.length?[]:[Note(r.summary)]),
      ...r.options.map(o=>{
        const saving=current===null?null:Math.round((current-annualCost(o))*100)/100;
        return RecordRow({title:o.name,figure:money(o.amount,o.currency),
          detail:[BILLING_CYCLES[o.cycle],saving>0?`${money(saving,o.currency)} a year less`:saving!==null?'No saving':''].filter(Boolean).join(' · '),
          extra:[Note(o.terms)],actions:[RowLink(OPEN_GLYPH,`Open the pricing page for ${o.name}`,o.url,{rel:'noopener noreferrer'})]});
      })
    ]:[]),
    ...(find?[ActionGroup([find],{compact:true})]:[])
  ],{className:'subscription-details',...(open?{open:true}:{})});
  drawer.addEventListener('toggle',()=>onToggle?.(drawer.open));
  return drawer;
}
