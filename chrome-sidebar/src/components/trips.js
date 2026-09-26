import {Stack,Section,Heading,Text,Note,Strong,Link,Button,ActionGroup,Disclosure,Form,FormField,Notice,ToolTitle,RowAction,EDIT_GLYPH,DELETE_GLYPH,ResultBlock,money} from './ui.js';
import {rankCandidates,researchCurrent,offerState,tripKey} from '../trip-data.js';
const when=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'';
export function TripsView(){
  return Stack([
    ToolTitle('Travel planning',{actionsId:'trips-actions',statusId:'trips-status'}),
    Stack([],{id:'trips-picker'}),
    Stack([],{id:'trips-result'}),
    Disclosure('Trip request',[
      Form([
        FormField({id:'trips-title',label:'Trip name',kind:'text',required:true,maxLength:120}),
        FormField({id:'trips-kind',label:'Travel',kind:'select',options:[{value:'hotel',text:'Hotel'},{value:'flight',text:'Flights'},{value:'both',text:'Hotel and flights'}]}),
        FormField({id:'trips-request',label:'What you want',kind:'textarea',required:true,maxLength:4000,rows:4}),
        Notice('',{id:'trips-form-status'}),
        ActionGroup([Button('Save trip',{id:'trips-save',variant:'primary',type:'submit'}),Button('Cancel',{id:'trips-cancel',variant:'secondary'})])
      ],{id:'trips-form',className:'form-stack'})
    ],{id:'trips-editor'})
  ],{className:'travel-wallet trip-workspace'});
}
export const TripPicker=(records,selected,onSelect)=>{
  const field=FormField({id:'trips-selected',label:'Saved trips',kind:'select',options:records.map(t=>({value:t.id,text:t.title}))});
  const select=field.querySelector('select');select.value=selected;select.dispatchEvent(new document.defaultView.Event('change'));
  select.addEventListener('change',()=>onSelect(select.value));return field;
};
const fitLabel={match:'Requirements supported',unknown:'Needs verification',mismatch:'Does not meet requirements'};
const checkLabel={match:'Supported',mismatch:'Does not match',unknown:'Not verified'};
const checkRows=(trip,checks)=>trip.criteria.map(c=>{
  const check=checks.find(x=>x.id===c.id);
  return Stack([Strong(c.label),Text(`${checkLabel[check?.status||'unknown']}${c.required?'':' · preference'}${check?.detail?` — ${check.detail}`:''}`),
    check?.source?Link(`Source · ${when(check.checkedAt)}`,check.source):null],{className:'trip-check'});
});
export function TripComparison(trip,{onEdit,onDelete,onCopy,onResolve,busy=false,now=Date.now()}){
  const actions=[RowAction(EDIT_GLYPH,`Edit ${trip.title}`,onEdit,{disabled:busy}),RowAction(DELETE_GLYPH,`Delete ${trip.title}`,()=>{confirm.hidden=false;},{disabled:busy,danger:true})];
  const yes=Button('Delete trip from all devices',{variant:'danger',disabled:busy});yes.addEventListener('click',onDelete);
  const no=Button('Keep trip',{variant:'secondary'});no.addEventListener('click',()=>{confirm.hidden=true;});
  const confirm=Stack([Text(`Delete “${trip.title}” and its saved research?`),ActionGroup([yes,no])],{hidden:true});
  const copy=Button('Copy research request',{variant:'secondary',size:'compact',disabled:busy});copy.addEventListener('click',onCopy);
  const current=researchCurrent(trip);
  const auth=trip.channels.filter(c=>c.status==='login');
  const summary=Stack([
    Stack([Heading(trip.title,2),ActionGroup(actions,{compact:true})],{className:'trip-heading group-line'}),confirm,
    auth.length?Section([Heading('Sign-in needs your help',3),...auth.map(c=>Stack([Notice(`${c.label}: ${c.nextStep||c.note||'Complete sign-in, then resume research.'}`,{tone:'alert'}),c.resumeURL?Link('Open sign-in',c.resumeURL):null],{className:'trip-check'}))],{className:'trip-auth'}):null,
    Text(trip.request),
    trip.start?Note(`${trip.start}${trip.end?` → ${trip.end}`:''}${trip.party?` · ${trip.party.adults} adults${trip.party.childrenAges.length?`, children aged ${trip.party.childrenAges.join(', ')}`:''} · ${trip.party.rooms} room(s)`:''}`):null,
    trip.pending?Notice(trip.conflict?'This trip changed on another device. Choose which version to keep.':'Waiting to sync.',{tone:'alert'}):null,
    trip.conflict?ActionGroup(['local','cloud'].map(choice=>{const b=Button(choice==='local'?'Keep my change':'Use cloud version',{variant:'secondary',disabled:busy});b.addEventListener('click',()=>onResolve(choice));return b;})):null,
    trip.candidates.length&&!current?Note('Previous search — recheck'):null,
    current&&trip.summary?Text(trip.summary):null,
    trip.questions.length?Section([Heading('Needed to finish',3),...trip.questions.map(q=>Text(q))]):null,
    ActionGroup([copy]),
  ],{className:'trip-summary'});
  const candidates=rankCandidates(trip,now);
  const options=candidates.map(candidate=>ResultBlock({title:candidate.name,status:fitLabel[candidate.fit],detail:candidate.description,
    children:[candidate.url?Link('Hotel or itinerary details',candidate.url):null,
      ...candidate.offers.map(offer=>{
        const state=offerState(trip,candidate,offer,now);
        return Section([
          Stack([Strong(offer.channel),offer.total!==null?Strong(`${money(offer.total,offer.currency)}${offer.allIn?' total':' · incomplete total'}`):Strong('Price not checked')],{className:'trip-heading'}),
          Text(offer.product),Note(state),Note(when(offer.observedAt)),
          offer.terms?Text(offer.terms):null,
          offer.benefits?Note(`Conditional benefits: ${offer.benefits}`):null,
          offer.source?Link('Open offer to recheck',offer.source):null,
          Disclosure('Offer evidence',[Text(offer.evidence||'No live offer recorded.'),...checkRows(trip,offer.checks)])
        ],{className:'trip-offer'});
      }),
      !candidate.offers.length?Note('No dated offers'):null,
      Disclosure('Requirements and sources',checkRows(trip,candidate.checks))
    ]}));
  const channels=trip.channels.length?Disclosure('Search coverage',trip.channels.map(c=>Stack([
    Strong(c.label),Text(`${({'not-checked':'Not checked',partial:'Partly checked',checked:'Checked',login:'Sign-in needed',blocked:'Could not check'})[c.status]}${c.note?` — ${c.note}`:''}`),c.checkedAt?Note(when(c.checkedAt)):null,
    c.nextStep?Text(c.nextStep):null,c.resumeURL?Link('Resume on provider',c.resumeURL):null,
    c.contextKey&&c.contextKey!==tripKey(trip)?Note('Request changed — restart this search'):null
  ],{className:'trip-check'}))):null;
  return Stack([summary,...options,!options.length?Note('No research saved'):null,channels],{className:'trip-comparison'});
}
