import * as UI from './ui.js';
import {CADENCE_LABELS} from '../rewards-data.js';
import {programName} from '../balance-data.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,ToolTitle,Section,Strong,Link,Label,Tabs}=UI;
const CADENCE_OPTIONS=[{text:'Does not reset',value:''},...Object.entries(CADENCE_LABELS).map(([value,text])=>({text,value}))];
export function RewardsView(){
  const field=(key,label,kind='text',options,placeholder)=>UI.FormField({id:`reward-${key}`,label,kind,options,placeholder});
  // Three things, and they are not the same question: what is on the page in
  // front of you, what you hold, and what the programs are currently offering.
  // Run down one page, a catalogue of a hundred offers sat between the wallet
  // and the drawer that adds to it. Each is a tab now, and the tab's label is
  // its heading.
  return Stack([ToolTitle('Rewards & benefits',{actionsId:'rewards-connection',statusId:'rewards-status'}),
    Tabs({id:'rewards-tabs',label:'Rewards',items:[
      {key:'page',label:'This page',hidden:true,content:
        Stack([Stack([],{id:'balance-body'}),Notice('',{id:'balance-status'})],{id:'balance-panel',className:'balance-panel'})},
      {key:'wallet',label:'Wallet',content:[
        UI.SettingsGroup({title:'Next actions',level:2,children:[Stack([],{id:'rewards-actions'})]}),
        UI.SettingsGroup({actionsId:'wallet-actions',children:[
          UI.FormField({id:'rewards-search',label:'Find a program or benefit',kind:'search',placeholder:'Airline, card, merchant, membership…'}),
          Stack([],{id:'rewards-list'})]}),
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
          ],{id:'reward-card-form',className:'form-stack'})
        ],{id:'reward-card-intake'}),
        Disclosure('Add or edit a reward',[
          Note('No passwords or security codes.'),
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
              help:'Encrypted on this device. Never the security code.'}),
            Notice('',{id:'reward-form-status'}),
            ActionGroup([Button('Save reward',{id:'reward-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'reward-cancel',variant:'secondary'})])
          ],{id:'reward-form',className:'form-stack'})
        ],{id:'reward-editor'})
      ]},
      // What the programs publish is its own reading, with its own search: the
      // wallet's filter narrows what you hold, and this one narrows what is on
      // offer. The tab is there only while a catalogue has been read.
      {key:'offers',label:'Offers',hidden:true,content:
        UI.SettingsGroup({children:[
          UI.FormField({id:'programs-search',label:'Find an offer',kind:'search',placeholder:'Airline, hotel, merchant…'}),
          Stack([],{id:'programs-filter'}),
          Notice('',{id:'programs-status'}),
          Stack([],{id:'programs-list',className:'program-offers'})]})}
    ]})
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

// Offered when the tab beside the panel is a loyalty program's own site.
// Before anything is read it is one action; afterwards it is what came off the
// page, because a figure is the owner's to check before it is saved. `programs`
// is every currency that site prints, which is more than one wherever an issuer
// runs a currency per kind of card.
export function BalancePanel({site,programs=[],rows=[],credits=[],disabled=false,onRead,onSave,onDiscard}){
  const action=(label,variant,handler)=>{
    const node=Button(label,{variant,size:'compact',disabled});
    node.addEventListener('click',handler);
    return node;
  };
  // One press reads every currency the site states, so the heading names them
  // all: an issuer running two of them is the case where naming only the first
  // would promise half the page.
  // The issuer leads that heading only where the programs' own names do not
  // already carry it: reading IHG One Rewards is not reading IHG IHG One
  // Rewards.
  const currencies=(programs.length?programs:[site]).map(program=>program.label);
  const named=currencies.map(label=>programName(site.source,label));
  const title=named.every((label,i)=>label===currencies[i])
    ?currencies.join(' and '):`${site.source} ${currencies.join(' and ')}`;
  const found=[rows.length?`${rows.length} balance${rows.length===1?'':'s'}`:'',
    credits.length?`${credits.length} credit${credits.length===1?'':'s'}`:''].filter(Boolean);
  const heading=Stack([
    Strong(title),
    found.length?Label(`${found.join(' and ')} read · nothing saved yet`,{className:'snapshot-meta'}):null
  ],{className:'snapshot-heading'});
  if(!found.length)return Section([heading,ActionGroup([action(`Read my balance${currencies.length>1?'s':''}`,'primary',onRead)],{compact:true})],{className:'record-row'});
  // The heading has just named what was read, so a row says only what tells it
  // from its siblings: nothing at all where there is one program, and its own
  // currency where an issuer runs two. A reading from somewhere else than the
  // page's own issuer still names itself in full.
  const rowLabel=row=>programName(row.source,row.name)===title?''
    :row.source===site.source?row.name:programName(row.source,row.name);
  return Section([heading,...rows.map(row=>BalanceRow(row,rowLabel(row))),
    ...credits.map(CreditRow),ActionGroup([
    action(`Save ${found.join(' and ')}`,'primary',onSave),
    action('Discard','subtle',onDiscard)
  ],{compact:true})],{className:'record-row'});
}
// A credit the issuer's own tracker states, and where it would land. What is
// left in the period is the figure, because it is the one that decides whether
// the owner does anything before it resets.
function CreditRow(row){
  // Which card it belongs to is said once, in the line that says where the
  // credit would land. Carried on the name as well it was the longest thing in
  // the panel, repeated down every row of a card that has a dozen of them.
  const target=[row.match?`Updates ${row.match.name}`:row.holder?`New credit on ${row.holder.name}`
    :row.ambiguous?'Several of your cards match — saves without one':row.card?`New credit · ${row.card}`:'New credit',
    row.confidence==='high'?'':`${row.confidence} confidence`].filter(Boolean).join(' · ');
  return Stack([
    Stack([Label(row.name),Strong(`${row.left} left`)],{className:'snapshot-figure'}),
    Note([CADENCE_LABELS[row.cadence]||'',target].filter(Boolean).join(' · ')),
    ...(row.notes?[Note(row.notes)]:[])
  ],{className:'snapshot-row'});
}
// A read balance names the entry it would land on, and nothing more is implied
// until it is saved.
function BalanceRow(row,label=''){
  const target=[row.match?`Updates ${row.match.name}`:row.ambiguous?'Several balances match — saves as a new entry':'New balance',
    row.confidence==='high'?'':`${row.confidence} confidence`].filter(Boolean).join(' · ');
  return Stack([
    Stack([label?Label(label):Note(target),Strong(row.value)],{className:'snapshot-figure'}),
    ...(label?[Note(target)]:[]),
    ...(row.notes?[Note(row.notes)]:[])
  ],{className:'snapshot-row'});
}
