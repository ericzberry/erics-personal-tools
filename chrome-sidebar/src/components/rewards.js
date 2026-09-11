import * as UI from './ui.js';
import {CADENCE_LABELS} from '../rewards-data.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,ToolTitle,Section,Strong,Link}=UI;
const CADENCE_OPTIONS=[{text:'Does not reset',value:''},...Object.entries(CADENCE_LABELS).map(([value,text])=>({text,value}))];
export function RewardsView(){
  const field=(key,label,kind='text',options,placeholder)=>UI.FormField({id:`reward-${key}`,label,kind,options,placeholder});
  return Stack([ToolTitle('Rewards & benefits',{actionsId:'rewards-connection',statusId:'rewards-status'}),
    UI.SettingsGroup({title:'Next actions',level:2,children:[Stack([],{id:'rewards-actions'})]}),
    UI.SettingsGroup({title:'Your wallet',level:2,children:[
      UI.FormField({id:'rewards-search',label:'Find a program or benefit',kind:'search',placeholder:'Airline, card, merchant, membership…'}),
      Stack([],{id:'rewards-list'})]}),
    UI.SettingsGroup({title:'Program offers',level:2,children:[
      Stack([],{id:'programs-filter'}),
      Notice('',{id:'programs-status'}),
      Stack([],{id:'programs-list'})]}),
    UI.SettingsGroup({title:'Protected values',level:2,children:[
      Notice('',{id:'vault-status'}),
      ActionGroup([],{id:'vault-actions',compact:true}),
      Stack([],{id:'vault-code'}),
      Stack([
        UI.FormField({id:'vault-recovery-code',label:'Recovery code',kind:'text',placeholder:'EV1-…'}),
        ActionGroup([Button('Unlock with this code',{id:'vault-recovery-submit',variant:'secondary',size:'compact'}),
          Button('Cancel',{id:'vault-recovery-cancel',variant:'secondary',size:'compact'})],{compact:true})
      ],{id:'vault-recovery',hidden:true}),
      Note('',{id:'vault-detail'})
    ]}),
    // Naming a card is the whole intake: research reads the issuer's current
    // pages and brings back the card and every benefit it carries, which is work
    // no owner finishes by hand.
    Disclosure('Add a card you hold',[
      UI.Form([
        UI.FormField({id:'reward-card-name',label:'Which card do you have?',placeholder:'amex platinum, blue cash, jp morgan reserve'}),
        ActionGroup([Button('Find card benefits',{id:'reward-card-find',variant:'primary',type:'submit'})]),
        Notice('',{id:'reward-card-status'}),
        Stack([],{id:'reward-card-matches'}),
        Stack([],{id:'reward-card-review'})
      ],{id:'reward-card-form',className:'form-stack'}),
      UI.FormField({id:'reward-card-connection',label:'Saved AI connection',kind:'select',options:[]})
    ],{id:'reward-card-intake'}),
    Disclosure('Add or edit a reward',[
      Note('A membership with no balance — a perks portal or partner program — is a membership entry: name it, say who provides it, and describe what it gets you.'),
      Note('Do not enter passwords or security codes.'),
      UI.Form([
        field('kind','Entry type','select',[{text:'Points or miles balance',value:'balance'},{text:'Credit, discount, or offer',value:'benefit'},{text:'Membership or program access',value:'membership'},{text:'Credit card you hold',value:'card'}]),
        field('name','Program or benefit name',undefined,undefined,'Airline miles, dining credit, or perks program'),
        field('source','Card, airline, or benefit source',undefined,undefined,'The card, airline, or company that provides it'),
        field('card','Which of your cards?','select',[{text:'Not a card benefit',value:''}]),
        field('value','Balance or benefit',undefined,undefined,'42,000 miles · $50 credit · Member offers'),
        field('due','Expiration or use-by date (optional)','date'),
        field('cadence','Resets','select',CADENCE_OPTIONS),
        field('state','Status','select',[{text:'Available',value:'available'},{text:'Needs activation',value:'activation'},{text:'Used',value:'used'}]),
        field('url','Official account or offer URL (optional)','url'),
        UI.FormField({id:'reward-notes',label:'Terms, eligibility, and next step (optional)',kind:'textarea',rows:3}),
        UI.ProtectedField({id:'reward-secret',label:'Card details (optional)',
          help:'Encrypted with your passkey before it leaves this device, so the cloud stores only unreadable text. Never enter the security code (CVV).'}),
        Notice('',{id:'reward-form-status'}),
        ActionGroup([Button('Save reward',{id:'reward-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'reward-cancel',variant:'secondary'})])
      ],{id:'reward-form',className:'form-stack'})
    ],{id:'reward-editor'})
  ],{className:'travel-wallet rewards-wallet'});
}
// A card you hold and the benefits filed under it read as one block: the card
// names itself, and its benefits stay inside it so a dozen credits do not bury
// the rest of the wallet.
export function RewardGroup({title,detail,open=false,children=[]}){
  const group=Disclosure(title,children,{className:'reward-group'});
  group.open=open;
  const summary=group.querySelector('summary');
  summary.textContent='';
  summary.append(Strong(title),Note(detail));
  return group;
}
const benefitLine=benefit=>[benefit.value,CADENCE_LABELS[benefit.cadence]||'',
  benefit.state==='activation'?'needs enrollment':'',benefit.due?`by ${benefit.due}`:''].filter(Boolean).join(' · ');
// What research found, laid out the way it will be saved, so every benefit can
// be read before any of it reaches the wallet.
export function CardBenefits(result,{onSave,onDiscard}){
  if(!result)return [];
  const {card,benefits,cardSaved}=result;
  const count=`${benefits.length} benefit${benefits.length===1?'':'s'}`;
  // After a save that stopped part way the card is already in the wallet, so the
  // action says what is actually left to do.
  const save=Button(cardSaved?`Save the remaining ${count}`:`Save this card and ${count}`,{variant:'primary',size:'compact'});
  const discard=Button('Discard',{variant:'subtle',size:'compact'});
  save.addEventListener('click',onSave);discard.addEventListener('click',onDiscard);
  return [Section([
    Strong(card.name),
    Note(`${card.source} · ${card.value}`),
    ...(card.notes?[Note(card.notes)]:[]),
    ...benefits.map(benefit=>Stack([Strong(benefit.name),Note(benefitLine(benefit)),...(benefit.notes?[Note(benefit.notes)]:[])],{className:'reward-found'})),
    ...(card.url?[Link('Issuer page used',card.url)]:[]),
    ActionGroup([save,discard],{compact:true})
  ],{className:'reward-ingest'})];
}
