import * as UI from './ui.js';
import {CADENCE_LABELS} from '../rewards-data.js';
import {programName} from '../balance-data.js';
import {formatRate} from '../rate-data.js';
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
            // Two ways in, one row: a card the wallet has never heard of is
            // named here, and the cards it already holds are looked up in one
            // press. The second appears only once there are cards to look up.
            ActionGroup([Button('Find card benefits',{id:'reward-card-find',variant:'primary',type:'submit'}),
              Button('Look up my saved cards',{id:'reward-card-sweep',variant:'secondary',type:'button',hidden:true})]),
            Notice('',{id:'reward-card-status'}),
            Stack([],{id:'reward-card-matches'}),
            Stack([],{id:'reward-card-review'})
          ],{id:'reward-card-form',className:'form-stack'})
        ],{id:'reward-card-intake'}),
        Disclosure('Add or edit a reward',[
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
            UI.ProtectedField({id:'reward-secret',label:'Card details (optional)'}),
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
// What research came back with, for one card or for every card the owner holds.
// A card is a block of its own — its name, what it earns, and each benefit
// under it — and the actions are one row under all of them, because a sweep of
// six cards reviewed with six Save buttons is six decisions where the owner
// made one.
export function CardBenefits(input,{onSave,onDiscard}){
  const results=(Array.isArray(input)?input:[input]).filter(Boolean);
  if(!results.length)return [];
  // The verb stands alone. The cards and their benefits are listed above it,
  // so "Save this card and 12 benefits" only counted what the reader was
  // looking at, and grew a clause for every way a save could have gone.
  const save=Button('Save',{variant:'primary',size:'compact'});
  const discard=Button('Discard',{variant:'subtle',size:'compact'});
  save.addEventListener('click',onSave);discard.addEventListener('click',onDiscard);
  // Each line has one job and one weight: the name, then what it is worth in
  // ink, then the fine print smaller and muted, so a premium card's two dozen
  // benefits read down as names and amounts rather than a wall of terms. The
  // page it came from sits with the card it describes, not after the last
  // benefit. No box around it: the editor it sits in is already the boundary.
  return [...results.map(({card,benefits})=>Section([
    Strong(card.name),
    Note([card.source,card.value].filter(Boolean).join(' · '),{className:'footnote reward-found-value'}),
    ...(card.notes?[Note(card.notes,{className:'footnote reward-found-notes'})]:[]),
    ...(card.url?[Link('Issuer page used',card.url)]:[]),
    ...benefits.map(benefit=>Stack([Strong(benefit.name),Note(benefitLine(benefit),{className:'footnote reward-found-value'}),
      ...(benefit.notes?[Note(benefit.notes,{className:'footnote reward-found-notes'})]:[])],{className:'reward-found'}))
  ],{className:'reward-ingest'})),ActionGroup([save,discard],{compact:true})];
}

// What one snapshot of the page came back with, said in one line. A card's own
// page answers four questions at once, so the counts go here where they can
// wrap, and the actions below stay two stable words.
export function readingSummary({rows=[],credits=[],rates=[],benefits=[]}={}){
  const count=(list,one,many)=>list.length?`${list.length} ${list.length===1?one:many}`:'';
  return [count(rows,'balance','balances'),count(credits,'credit','credits'),
    count(rates,'rate','rates'),count(benefits,'benefit','benefits')].filter(Boolean);
}
// Offered when the tab beside the panel is a loyalty program's or a card's own
// site. Before anything is read it is one action; afterwards it is what came
// off the page, because every figure is the owner's to check before it is
// saved. `programs` is every currency that site prints, which is more than one
// wherever an issuer runs a currency per kind of card.
export function BalancePanel({site,programs=[],rows=[],credits=[],rates=[],benefits=[],disabled=false,onRead,onSave,onDiscard}){
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
  const found=readingSummary({rows,credits,rates,benefits});
  const heading=Stack([
    Strong(title),
    found.length?Label(`${found.join(' · ')} read · nothing saved yet`,{className:'snapshot-meta'}):null
  ],{className:'snapshot-heading'});
  // One press reads the page for everything it states — the balances, the
  // credit trackers, what the card earns, the benefits with no figure — so the
  // action is named after the page rather than after one of the four.
  if(!found.length)return Section([heading,ActionGroup([action('Read this page','primary',onRead)],{compact:true})],{className:'record-row'});
  // The heading has just named what was read, so a row says only what tells it
  // from its siblings: nothing at all where there is one program, and its own
  // currency where an issuer runs two. A reading from somewhere else than the
  // page's own issuer still names itself in full.
  const rowLabel=row=>programName(row.source,row.name)===title?''
    :row.source===site.source?row.name:programName(row.source,row.name);
  // The rows above already say what would be saved and that nothing is yet, so
  // the action is one stable verb rather than a sentence that grows a clause
  // per kind of row the page turned out to state.
  return Section([heading,...rows.map(row=>BalanceRow(row,rowLabel(row))),
    ...credits.map(CreditRow),...rates.map(RateRow),...benefits.map(PageBenefitRow),ActionGroup([
    action('Save','primary',onSave),
    action('Discard','subtle',onDiscard)
  ],{compact:true})],{className:'record-row'});
}
// Where a read row would land, and how sure the reading was. A row that would
// land nowhere says so here rather than being quietly filed under a card it
// might not belong to.
const landing=(row,noun)=>[row.match?`Updates ${row.match.name}`:row.holder?`New ${noun} on ${row.holder.name}`
  :row.ambiguous?'Several of your cards match — saves without one':row.card?`New ${noun} · ${row.card}`:`New ${noun}`,
  row.confidence==='high'?'':`${row.confidence} confidence`].filter(Boolean).join(' · ');
// What the card earns, in the page's own wording, and the rule it would become.
// A rate with no saved card to land on is shown all the same: the owner can see
// what the page states and add the card, which is better than dropping the one
// line that says what it earns.
function RateRow(row){
  const target=row.holder?[row.existing?`Updates ${row.holder.name}`:`New rate on ${row.holder.name}`,
      row.confidence==='high'?'':`${row.confidence} confidence`].filter(Boolean).join(' · ')
    :row.mismatch?`${row.unit==='cash'?'Percent back':'Points'} on a card saved as ${row.unit==='cash'?'points':'cash back'} — not saved`
    :row.ambiguous?'Several of your cards match — not saved'
    :`No saved card matches${row.card?` ${row.card}`:''} — not saved`;
  return Stack([
    Stack([Label(row.label),Strong(formatRate(row.rate,row.unit))],{className:'snapshot-figure'}),
    Note([row.base?'All other purchases':`${row.category}${row.channel==='Any'?'':` · ${row.channel}`}`,target].filter(Boolean).join(' · ')),
    ...(row.condition?[Note(row.condition)]:[])
  ],{className:'snapshot-row'});
}
// A benefit the page states with no tracker against it — a lounge program,
// elite status, an included subscription. What it is worth is a sentence rather
// than a figure, so it reads down the line the way a researched benefit does
// instead of being squeezed into the column a balance's number sits in.
function PageBenefitRow(row){
  return Stack([
    Strong(row.name),
    Note([...benefitLine(row).split(' · '),landing(row,row.kind==='membership'?'membership':'benefit')].filter(Boolean).join(' · ')),
    ...(row.notes?[Note(row.notes)]:[])
  ],{className:'snapshot-row'});
}
// A credit the issuer's own tracker states, and where it would land. What is
// left in the period is the figure, because it is the one that decides whether
// the owner does anything before it resets.
function CreditRow(row){
  // Which card it belongs to is said once, in the line that says where the
  // credit would land. Carried on the name as well it was the longest thing in
  // the panel, repeated down every row of a card that has a dozen of them.
  const target=landing(row,'credit');
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
