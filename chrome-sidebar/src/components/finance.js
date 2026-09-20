import * as UI from './ui.js';
import {ASSET_CLASSES,REGISTRATIONS,VEHICLES,VALUE_SOURCES,classLabel,registrationLabel,vehicleLabel,vehicleShort,valueSourceLabel,classSide,signed} from '../finance-data.js';
import {ACCEPTED} from '../statement-text.js';
import {FINANCE_SITES} from '../account-sites.js';
const {Stack,Section,GroupTitle,Note,Notice,Badge,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,Strong,Label,Text,ToolTitle,Link,Tabs,Amount}=UI;
export const {money}=UI;

// Where each institution prints its balances. Reaching the figures is its own
// small errand — a bank's own front page is marketing, and the account summary
// is several presses past it — so the page is held here and opened directly.
// These are links and nothing more: no session is held, nothing is signed in
// to, and an institution the owner does not bank with costs a line in a list
// that is closed until they open it.
const KINDS=[['brokerage','Brokerages'],['bank','Banks'],['credit','Credit cards'],
  ['retirement','Retirement'],['private','Private'],['crypto','Crypto'],['other-asset','Other']];
export function AccountPages(sites=[]){
  return KINDS.flatMap(([kind,label])=>{
    const group=sites.filter(site=>site.kind===kind&&site.url);
    return group.length?[Stack([
      Label(label,{className:'account-pages-kind'}),
      Stack(group.map(site=>Link(site.label,site.url,{className:'account-pages-link'})),
        {className:'account-pages-row'})
    ],{className:'account-pages-group'})]:[];
  });
}

export const Figure=({label,value,id,tone=''})=>Stack([Label(label,{className:'figure-label'}),Strong(value,{id,className:`figure-value${tone?` figure-value--${tone}`:''}`})],{className:'figure'});
export const classOptions=()=>ASSET_CLASSES.map(entry=>({text:`${entry.label}${entry.side==='liability'?' (liability)':''}`,value:String(entry.code)}));
export const registrationOptions=()=>REGISTRATIONS.map(entry=>({text:entry.label,value:String(entry.code)}));
export const vehicleOptions=()=>VEHICLES.map(entry=>({text:entry.label,value:String(entry.code)}));
export const sourceOptions=()=>VALUE_SOURCES.map(entry=>({text:entry.label,value:String(entry.code)}));
// An investment's value is somebody's asset. A liability class would be a
// category error here, so it is not offered.
export const investedClassOptions=()=>ASSET_CLASSES.filter(entry=>entry.side==='asset').map(entry=>({text:entry.label,value:String(entry.code)}));
// What a position cost, beside what it is worth: a value with no called capital
// next to it cannot say whether it is a win, which is the whole reason a
// position is not just a line in the private equity total.
//
// Only the parts that have happened. A direct purchase has no commitment, a
// fund that has distributed nothing has returned nothing, and an investment
// signed last week has none of it — three zeros in a row would say only that
// this is a shape with four slots in it.
export const positionDetail=(position,currency)=>[
  position.commitment?`Commitment ${money(position.commitment,currency)}`:'',
  position.contributed?`Funded ${money(position.contributed,currency)}`:'',
  position.distributed?`Returned ${money(position.distributed,currency)}`:'',
  position.unfunded?`Unfunded ${money(position.unfunded,currency)}`:'',
  position.multiple===null?'':`${position.multiple.toFixed(2)}×`
].filter(Boolean).join(' · ');

// What a property is worth to its owner, beside what it is worth. A house and
// its mortgage reach the totals as two figures in two classes, one of them
// negative, and nothing in a breakdown puts them back together — so the row
// says the three things the value alone cannot: where the number came from,
// what is still owed, and what is left.
//
// Only the parts that exist. A house with nothing owed on it has equity equal
// to its value, and printing that twice would say only that this is a shape
// with three slots in it.
export const propertyDetail=(entry,currency)=>[
  valueSourceLabel(entry.source),
  entry.debt?`Mortgage ${money(entry.debt,currency)}`:'',
  entry.debt?`Equity ${money(entry.equity,currency)}`:''
].filter(Boolean).join(' · ');

// One action group, two kinds of review — extracted rather than written twice
// so the two cannot drift apart.
function ReviewActions({editing,disabled,saveLabel,onSave,onEdit,onDiscard}){
  const action=(label,variant,handler)=>{
    const node=Button(label,{variant,size:'compact',disabled});
    node.addEventListener('click',handler);
    return node;
  };
  // Ruled off from the figures by a gap. Flush against the last amount, Save
  // read as one more row of the reading rather than what to do about it.
  return ActionGroup([
    action(saveLabel,'primary',onSave),
    ...(editing?[]:[action('Edit','secondary',onEdit)]),
    action('Discard','subtle',onDiscard)
  ],{compact:true,className:'action-group action-group--compact review-actions'});
}
// What a reading came to, after the device folded it. A page states an account
// total and the holdings inside it, and those must never be added together; by
// the time a figure reaches this panel that has been settled, so what is shown
// is what would be saved: one amount per portfolio and asset class, every one
// of them editable, because the owner is the only one who can see whether a
// figure is right. Nothing is written by reading.
//
// Whose money it is, then what it is in, then how much: a heading per holder
// and a line per asset class under it, which is the shape the ledger itself is
// read in. It was a flat run of figures, each carrying a line naming the
// portfolio again and the labels it was read off, and an IRA beside a taxable
// brokerage looked the same as two figures in one place.
//
// Nothing explains itself here. The figures are the review, and the status line
// under them already says how many were read and how many were kept.
export function FoldReview({rows=[],editing=false,disabled=false,saveLabel='Save these figures',onSave,onEdit,onDiscard,onAmount}){
  const shared=rows.length&&rows.every(row=>row.asOf===rows[0].asOf)?rows[0].asOf:'';
  // "new" is worth a word when it separates these figures from the ones landing
  // in a portfolio that already exists. The first reading of an institution
  // makes every portfolio in it new, and the word then sits on every heading
  // saying the same thing about all of them, which is what a reader skips.
  const some=rows.some(row=>row.isNew)&&!rows.every(row=>row.isNew);
  // The fold sorts by holder and then by class, so one pass groups them.
  const groups=[];
  for(const [index,row] of rows.entries()){
    const open=groups.at(-1);
    if(open&&open.portfolio===row.portfolio)open.rows.push({row,index});
    else groups.push({portfolio:row.portfolio,name:row.name,isNew:row.isNew,kind:row.kind,rows:[{row,index}]});
  }
  return Stack([
    // The date, and only the date: the figures are counted by being visible,
    // and a row states its own date only when the reading disagreed about one.
    shared?Label(`as of ${shared}`,{className:'snapshot-meta'}):null,
    // What a proposed portfolio is, beside its name. A reading offers half a
    // dozen at once — trusts, a couple's estate, a company, two children — and
    // they arrive as a list of names with nothing saying which is which, while
    // the saved ledger has carried that tag on every heading all along. It is
    // the one thing about a new portfolio the owner cannot check afterwards
    // without opening it.
    ...groups.map(group=>Section([
      Stack([GroupTitle(`${group.name}${group.isNew&&some?' · new':''}`,{className:'record-group-title group-title--name'}),
        group.kind?Badge(registrationLabel(group.kind),{className:'pill portfolio-kind'}):null],{className:'group-name'}),
      ...group.rows.map(({row,index})=>FoldRow(row,{index,editing,dated:!shared,onAmount}))
    ],{className:'record-group snapshot-group'})),
    ReviewActions({editing,disabled,saveLabel,onSave,onEdit,onDiscard})
  ]);
}

// What a capital account statement came to. A statement carries more than a
// figure — the commitment, what has been called against it, what has come back
// and what it is now worth — so the review shows all of it, and every part of
// it is correctable before anything is written. The one thing the owner alone
// can settle is whether the vehicle really is what its paperwork calls itself,
// which is why the kind is a choice here rather than a reading.
export function CapitalReview({rows=[],notes=[],portfolios=[],editing=false,disabled=false,onSave,onEdit,onDiscard,onField}){
  return Stack([
    rows.length?Label(`${rows.length} capital account${rows.length===1?'':'s'}`,{className:'snapshot-meta'}):null,
    ...rows.map((row,index)=>CapitalRow(row,{index,editing,portfolios,onField})),
    ...notes.map(note=>Note(note)),
    ReviewActions({editing,disabled,saveLabel:'Save these capital accounts',onSave,onEdit,onDiscard})
  ]);
}
function CapitalRow(row,{index,editing,portfolios,onField}){
  const where=[
    `${row.portfolioName}${row.portfolioIsNew?' · new portfolio':''}`,
    vehicleShort(row.vehicle),
    row.isNew?'new investment':'',
    `as of ${row.asOf}`
  ].filter(Boolean).join(' · ');
  // An edited field is whatever was typed into it, so every figure is read as
  // a number here rather than assumed to be one.
  const num=key=>Number(row[key])||0;
  const commitment=num('commitment'),contributed=num('contributed'),distributed=num('distributed'),value=num('value');
  const flows=positionDetail({commitment,contributed,distributed,
    unfunded:Math.max(0,Math.round((commitment-contributed)*100)/100),
    multiple:contributed>0?Math.round(((value+distributed)/contributed)*100)/100:null},row.currency);
  // Recorded as one kind, sold as another. Said plainly on the row, because
  // saving the statement does not change how the investment is filed.
  const claimed=row.stated&&row.stated!==row.vehicle?`The statement calls this a ${vehicleLabel(row.stated)}.`:'';
  if(!editing)return Stack([
    Stack([Label(row.name),Amount(value,row.currency)],{className:'snapshot-figure'}),
    Note(where),
    Note(flows),
    claimed?Note(claimed):null
  ],{className:'snapshot-row'});
  const field=(key,label,kind='text',options)=>{
    const node=FormField({id:`finance-capital-${key}-${index}`,label,kind,...(options?{options}:{})});
    const input=node.querySelector(kind==='select'?'select':'input');
    input.value=String(row[key]??'');
    input.addEventListener(kind==='select'?'change':'input',()=>onField(index,key,input.value));
    return node;
  };
  return Stack([
    field('name','Investment'),
    field('vehicle','Kind','select',vehicleOptions()),
    field('class','Asset class','select',investedClassOptions()),
    field('portfolio','Portfolio','select',portfolios),
    field('value','Capital account value'),
    field('commitment','Commitment'),
    field('contributed','Funded to date'),
    field('distributed','Returned to date'),
    field('asOf','As of','date'),
    claimed?Note(claimed):null
  ],{className:'snapshot-row'});
}
// One figure as it would be saved: what it is in, and how much. The holder is
// the heading over it, so the row does not name it again.
//
// A date only when the figures disagree about one: a reading off one page is
// one day's, and that day is stated once above the whole review.
//
// A liability is shown as what it does to the total, the way the ledger already
// shows one. An amount is stored positive and its class carries the sign, so a
// review printing the stored figure put a card's balance on the screen in the
// shape of money held — beside the cash it is owed against, in the same column,
// reading as $15,835 more rather than $15,835 less. The word rides beside it as
// well, because a minus sign is a shape and some readers will not see it.
function FoldRow(row,{index,editing,dated,onAmount}){
  const owed=classSide(row.class)==='liability';
  const what=[classLabel(row.class),owed?'liability':'',dated?`as of ${row.asOf}`:''].filter(Boolean).join(' · ');
  if(!editing)return Stack([
    Stack([Label(what),Amount(signed(row),row.currency)],{className:'snapshot-figure'})
  ],{className:'snapshot-row'});
  // The field holds the figure the way it is stored and saved: a positive
  // amount under a liability class. Its label is what says which that is, so
  // correcting a debt is typing what is owed rather than negating it.
  const field=FormField({id:`finance-fold-value-${index}`,label:what,kind:'text'});
  const input=field.querySelector('input');
  input.value=String(row.amount);
  input.addEventListener('input',()=>onAmount(index,input.value));
  return Stack([field],{className:'snapshot-row'});
}

// The page in front of you, whatever it is. A recognized account site names
// itself and reads under its own name; any other page the host can read is
// offered the same errand. The heading above this says which, so nothing in
// here repeats it.
// What the last reading actually took off the page, kept closed.
//
// The owner and this reader look at the same screen and do not always see the
// same page: a bank drew twenty accounts in front of him out of components, and
// what arrived here was the summary panel and nothing else. From the panel the
// two are indistinguishable, and every guess about which it was cost a round
// trip through his browser. So the reading brings its own evidence — what the
// page was built out of, and the text that was sent — and it sits behind a
// disclosure, because it is for the times something is wrong and for nobody's
// ordinary reading.
export function PageSource({text='',shape=null,trimmed=0}){
  if(!text&&!shape)return null;
  const built=shape?`${shape.elements} elements · ${shape.roots} root${shape.roots===1?'':'s'} · ${shape.grids} grid${shape.grids===1?'':'s'} · ${shape.frames} frame${shape.frames===1?'':'s'}`:'';
  const sent=`${text.split('\n').filter(Boolean).length} lines · ${text.length.toLocaleString('en-US')} characters${trimmed?` · ${trimmed.toLocaleString('en-US')} left out`:''}`;
  const source=document.createElement('pre');
  source.className='page-source-text';
  source.textContent=text;
  return Disclosure('What was read',[Stack([
    Label(built,{className:'page-source-shape'}),
    Label(sent,{className:'page-source-shape'}),
    source
  ],{className:'page-source'})],{id:'finance-page-source'});
}
export function PagePanel({site,rows=[],editing=false,disabled=false,source=null,onRead,onSave,onEdit,onDiscard,onAmount}){
  const read=Button(site?`Read my ${site.label} accounts`:'Read the accounts on this page',{id:'finance-page-read',variant:'primary',size:'compact',disabled});
  read.addEventListener('click',onRead);
  return Stack([
    ...(rows.length?[FoldReview({rows,editing,disabled,onSave,onEdit,onDiscard,onAmount})]:[
      // The button says what it does and the heading says which page. A
      // sentence underneath repeating both is a paragraph nobody reads twice.
      ActionGroup([read],{compact:true})
    ]),
    ...(source?[PageSource(source)].filter(Boolean):[])
  ],{className:'snapshot-reading'});
}

export function FinanceView(){
  return Stack([
    ToolTitle('Finance',{actionsId:'finance-actions',statusId:'finance-status'}),
    // Three scopes, one at a time: the page in front of you, what the whole
    // ledger comes to, and the ways of putting a figure in. They used to run
    // down one page, so reaching the ledger meant scrolling past a reading that
    // had nothing to do with it, and "Position" sitting under "E*TRADE" read as
    // E*TRADE's position when it was the estate's. Each is now a tab, and the
    // tab's label is its heading — nothing inside repeats it.
    //
    // This page leads the row, because a panel opened beside a bank page is
    // there for that page. It appears only where there is a page to read, and
    // the ledger appears once it has been asked for, so a quiet arrival shows
    // the reading and the ways in, and nothing of what the owner is worth.
    //
    // Every label names a view. "Add" among them named an action instead, and a
    // row mixing a verb with two nouns read as a row of buttons; "New figures"
    // then named what the owner leaves with rather than what is under the
    // label, and nobody arrives here holding figures — they arrive holding a
    // statement, a number, or nothing but the bank's web address.
    Tabs({id:'finance-tabs',label:'Finance',items:[
      {key:'page',label:'This page',hidden:true,content:
        SettingsGroup({id:'finance-page-block',className:'settings-group snapshot-panel',children:[
          Stack([],{id:'finance-snapshot-body'}),
          Notice('',{id:'finance-snapshot-status'}),
          // A capital account statement read off this page is reviewed here,
          // beside the reading it came from, rather than under a heading about
          // something else.
          Stack([],{id:'finance-capital-page'})
        ]})},
      {key:'ledger',label:'Net worth',content:
        SettingsGroup({id:'finance-ledger',children:[
          Stack([],{id:'finance-currency-switch',className:'currency-switch',hidden:true}),
          Stack([],{id:'finance-totals',className:'finance-totals'}),
          Notice('',{id:'finance-stale',hidden:true}),
          Disclosure('Breakdown',[Stack([],{id:'finance-breakdown'})],{id:'finance-breakdown-panel',className:'ledger-panel'}),
          Disclosure('Value over time',[
            Stack([],{id:'finance-trend'})
          ],{id:'finance-trend-panel',className:'ledger-panel'}),
          Stack([],{id:'finance-list',className:'travel-list'})
        ]})},
      {key:'add',label:'Figures',content:
        SettingsGroup({id:'finance-add',children:[
          UI.UploadField({id:'finance-drop',inputId:'finance-file',statusId:'finance-file-status',
            label:'Drop a statement',formats:'PDF, CSV, XLSX or image',accept:ACCEPTED.join(','),
            status:'',resetId:'finance-file-clear',resetLabel:'Remove file'}),
          Stack([],{id:'finance-attachment',hidden:true}),
          Note('',{id:'finance-ai-status',role:'status'}),
          ActionGroup([Button('Read this',{id:'finance-read',variant:'primary',size:'compact'}),Button('Clear',{id:'finance-intake-clear',variant:'secondary',size:'compact'})],{compact:true}),
          Notice('',{id:'finance-intake-status',role:'status'}),
          Stack([],{id:'finance-drafts'}),
          Stack([],{id:'finance-capital-drafts'}),
          // Three records, one errand. A figure is a class and an amount; a
          // private investment is a name, a kind and the four figures a capital
          // account states; a property is an address and what is owed on it. They
          // stay three forms, because folding them together would make one form
          // that is mostly hidden whichever way it is used — but they are not
          // three separate offers. Stacked as three closed drawers under a fourth,
          // they read as a run of unexplained boundaries, and the one being looked
          // for is found only by reading all of them. So which record is being
          // entered is a switch inside one drawer, chosen where it applies, the way
          // the currency and the trend period already are.
          Disclosure('Enter by hand',[
            Stack([],{id:'finance-entry-switch',className:'currency-switch entry-switch'}),
            Form([
            Strong('New figure',{id:'finance-editor-title'}),
            FormField({id:'finance-portfolio',label:'Portfolio',kind:'select',options:[]}),
            Stack([
              FormField({id:'finance-name',label:'Portfolio name',kind:'text',placeholder:'e.g. Eric and Ariana Berry Estate'}),
              FormField({id:'finance-kind',label:'Registration',kind:'select',options:registrationOptions()}),
              FormField({id:'finance-currency',label:'Currency',kind:'text',placeholder:'USD'})
            ],{id:'finance-portfolio-fields',hidden:true}),
            Stack([
              FormField({id:'finance-class',label:'Asset class',kind:'select',options:classOptions()}),
              FormField({id:'finance-amount',label:'Amount',kind:'text',placeholder:'0.00'}),
              FormField({id:'finance-asOf',label:'As of',kind:'date'})
            ],{id:'finance-figure-fields'}),
            Notice('',{id:'finance-form-status',role:'status'}),
            ActionGroup([Button('Save figure',{id:'finance-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'finance-cancel',variant:'secondary'})])
            ],{id:'finance-form',className:'form-stack'}),
            Form([
            Strong('New investment',{id:'finance-inv-title'}),
            FormField({id:'finance-inv-portfolio',label:'Portfolio',kind:'select',options:[]}),
            FormField({id:'finance-inv-name',label:'Investment',kind:'text',placeholder:'e.g. Acme Ventures Fund III, L.P.'}),
            FormField({id:'finance-inv-vehicle',label:'Kind',kind:'select',options:vehicleOptions()}),
            FormField({id:'finance-inv-class',label:'Asset class',kind:'select',options:investedClassOptions()}),
            FormField({id:'finance-inv-commitment',label:'Commitment',kind:'text',placeholder:'0.00'}),
            FormField({id:'finance-inv-value',label:'Capital account value',kind:'text',placeholder:'0.00'}),
            FormField({id:'finance-inv-funded',label:'Funded to date',kind:'text',placeholder:'0.00'}),
            FormField({id:'finance-inv-returned',label:'Returned to date',kind:'text',placeholder:'0.00'}),
            FormField({id:'finance-inv-asOf',label:'As of',kind:'date'}),
            Notice('',{id:'finance-inv-status',role:'status'}),
            ActionGroup([Button('Save investment',{id:'finance-inv-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'finance-inv-cancel',variant:'secondary'})])
            ],{id:'finance-inv-form',className:'form-stack',hidden:true}),
            Form([
            Strong('New property',{id:'finance-prop-title'}),
            FormField({id:'finance-prop-portfolio',label:'Portfolio',kind:'select',options:[]}),
            FormField({id:'finance-prop-name',label:'Address',kind:'text',placeholder:'e.g. 123 Example St, Town ST 00000'}),
            FormField({id:'finance-prop-link',label:'Zillow page',kind:'text',placeholder:'https://www.zillow.com/homedetails/…'}),
            FormField({id:'finance-prop-value',label:'Market value',kind:'text',placeholder:'0.00'}),
            FormField({id:'finance-prop-source',label:'Value from',kind:'select',options:sourceOptions()}),
            FormField({id:'finance-prop-debt',label:'Still owed',kind:'text',placeholder:'0.00'}),
            FormField({id:'finance-prop-asOf',label:'As of',kind:'date'}),
            Notice('',{id:'finance-prop-status',role:'status'}),
            ActionGroup([Button('Save property',{id:'finance-prop-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'finance-prop-cancel',variant:'secondary'})])
            ],{id:'finance-prop-form',className:'form-stack',hidden:true})
          ],{id:'finance-entry'}),
          // Closed until it is wanted. Getting to the figures is a way of putting
          // one in the ledger, which is the scope this tab already has.
          Disclosure('Open an account page',AccountPages(FINANCE_SITES),{id:'finance-account-pages'})
        ]})}
    ]})
  ],{className:'finance-ledger'});
}

// One portfolio, its own total, and a line per asset class. The date sits with
// the figure it belongs to, because a portfolio whose cash was marked last week
// and whose stocks were marked last year is two different ages of information.
// The portfolio's own verbs ride on its heading line beside the total, the way
// a figure's do on its own line, rather than trailing the run as a stray row of
// words that reads as one more figure.
// What kind of account it is rides on the heading as a tag, beside the name it
// qualifies. "Taxable" set as a grey word under the heading belonged to
// nothing the eye could find — it read as a label for the figures below it
// rather than as what the account is.
//
// The date is stated once, above, for the whole ledger. A portfolio repeats it
// only when its own newest figure is older than that, and a line inside it only
// when that line is older still. A date printed on every line was the same fact
// written six times, and it was what made the list unreadable.
export function PortfolioGroup({name,kind='',meta,total,currency,rows,actions=[]}){
  return Section([
    Stack([
      Stack([GroupTitle(name,{className:'record-group-title group-title--name'}),
        kind?Badge(kind,{className:'pill portfolio-kind'}):null],{className:'group-name'}),
      // The total and the portfolio's verbs are one block, so a narrow sidebar
      // drops them under the name together instead of stranding the actions on
      // a line of their own.
      Stack([Amount(total,currency),
        ActionGroup(actions,{compact:true,className:'action-group action-group--compact record-actions'})],{className:'group-figure'})
    ],{className:'breakdown-row group-line'}),
    meta?Note(meta):null,
    ...rows
  ],{className:'record-group'});
}

// A breakdown is a proportion, so every line shows the one it is: its share
// drawn behind the row, and the percentage beside the amount. Without it the
// list was four columns of money that the reader had to divide in their head
// against a total further up the screen.
//
// A line that comes to nothing is left out. The ledger never deletes a figure —
// a reading corrected later is superseded by a zero under the same portfolio,
// class and date — so a zeroed class is a figure no longer held, not a holding
// worth nothing, and it has no place in a breakdown of what is held.
//
// `shares` is off where the rows are not parts of one whole: what a private
// investment committed, funded, returned and is worth do not add up to
// anything, and a percentage of their sum would be arithmetic about nothing.
export function BreakdownList(title,rows,currency,{shares=true}={}){
  const live=rows.filter(row=>Math.round(row.total*100)!==0);
  const whole=shares?live.reduce((total,row)=>total+Math.max(0,row.total),0):0;
  return Stack([
    GroupTitle(title,{className:'record-group-title'}),
    ...(live.length?live.map(row=>{
      const share=whole>0&&row.total>0?row.total/whole:0;
      return Stack([
        Label(row.label,{className:'breakdown-name'}),
        share?Label(share<0.005?'<1%':`${Math.round(share*100)}%`,{className:'breakdown-share'}):null,
        Amount(row.total,currency)
      ],{className:'breakdown-row breakdown-line',...(share?{style:`--share:${(share*100).toFixed(1)}%`}:{})});
    }):[Note('Nothing recorded yet.')])
  ],{className:'breakdown-group'});
}

export const quarterOf=asOf=>`${asOf.slice(0,4)} Q${Math.floor((Number(asOf.slice(5,7))-1)/3)+1}`;

// Value over time, read off a ledger that is still being filled in.
//
// Two dated points are only comparable when the same figures stand behind both.
// A reading taken while half the accounts were still to be entered is not a
// smaller net worth, it is a smaller ledger, and subtracting one from the other
// announced a two-million-dollar rise that never happened. So every point says
// how much of the ledger it covers, and a change is drawn only between two
// points that cover all of it.
//
// Quarterly, and only quarterly: that is the grain these figures have. A
// quarter is shown by its last reading — the one with everything in it — and
// the part-filled days spent getting there stop being rows of their own. A
// daily grain was offered beside it and answered nothing a quarter did not;
// when there is enough history to be worth a shape, it gets a chart, not a
// second list of the same numbers.
export function TrendTable(series,currency){
  if(!series.length)return Note('No dated figures yet.');
  // The newest point carries every figure the ledger holds, because a figure
  // stands until a later one replaces it. So it is the measure of a full
  // reading, and an older point is partial exactly when it holds fewer.
  const whole=series.at(-1).figures;
  // A later reading in the same quarter replaces the earlier one in the map,
  // so each quarter keeps the last reading taken in it.
  const points=[...new Map(series.map(point=>[quarterOf(point.asOf),point])).values()];
  const rows=points.slice(-12).map(point=>({...point,label:quarterOf(point.asOf),complete:point.figures>=whole}));
  const full=rows.filter(row=>row.complete);
  const change=full.length>1?full.at(-1).net-full[0].net:null;
  const headline=change!==null
    ?`${money(change,currency)} ${change<0?'lower':'higher'} than ${full[0].label}.`
    :rows.length>1?`Earlier readings covered part of the ledger, so ${full.at(-1)?.label||rows.at(-1).label} is the first full picture.`:'';
  let previous=null;
  return Stack([
    headline?Note(headline):null,
    ...rows.map(row=>{
      const delta=row.complete&&previous?row.net-previous.net:null;
      if(row.complete)previous=row;
      return Stack([
        Label(row.label),
        Amount(row.net,currency),
        // Partial coverage is said in words, never in a colour: this point is
        // missing figures the newest one has, and that is why no change is
        // drawn against it.
        Note(row.complete?(delta===null?'':`${delta>=0?'+':''}${money(delta,currency)}`)
          :`${row.figures} of ${whole} figures`)
      ],{className:`trend-row${row.complete?'':' trend-row--partial'}`});
    })
  ],{className:'trend-table'});
}

// What the device pulled out of a file or a page, stated plainly before it is
// read. A poor extraction has to be visible here — the owner deciding "that is
// garbage, I will paste it instead" is the whole point of showing it.
export function AttachmentCard({label,detail,note,tone,onRemove}){
  const remove=Button('Remove',{variant:'subtle',size:'compact'});
  remove.addEventListener('click',onRemove);
  return Section([
    Stack([Strong(label),Text(detail,{className:'footnote'})]),
    note?Notice(note,{tone}):null,
    ActionGroup([remove],{compact:true})
  ],{className:'record-row'});
}
