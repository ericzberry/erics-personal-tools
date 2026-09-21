import {Stack,Section,Label,Strong,Note,Amount,Heading,GroupTitle,ActionGroup,RecordRow,money} from './ui.js';
import {LineChart,ProportionBar,linkParts,share} from './charts.js';
import {moneyShort} from '../money.js';
import {classSide,classGroup} from '../finance-data.js';
// The ledger read as a whole, on a page of its own. The side panel answers
// what it all comes to and takes new figures in; this is where the owner goes
// to read the detail — every entity, every private position side by side, and
// what the money is doing over time — at a width where a comparison can be a
// column instead of a sentence.
//
// Nothing here fetches or decides. The controller hands each section the
// figures it already worked out, and the verbs a row carries arrive as
// callbacks, so the same ledger reads the same way wherever it is drawn.

// One total: its name above it, and the number itself never broken across two
// lines — the totals grid gives it a column, and a column is either wide enough
// for the number or the figure takes the next row whole. A tone may be several
// words: the page's headline figure is `hero`, and `hero negative` when what
// is owed is more than what is held.
export const Figure=({label,value,id,tone=''})=>Stack([
  Label(label,{className:'figure-label'}),
  Strong(value,{id,className:['figure-value',...tone.split(' ').filter(Boolean).map(name=>`figure-value--${name}`)].join(' ')})
],{className:'figure'});

// One section of the page: a name set above what it names, with what the
// section comes to at the other end of the same line, and a hairline that
// closes the heading across the whole width. Every section opens the same way,
// which on a page this wide is not at all: nothing here has to be put away to
// reach the next thing. UI-35.
export function OverviewSection({id,title,aside=null,children=[],hidden=false,className=''}){
  return Section([
    Stack([Heading(title,2,{className:'overview-title'}),
      aside?Stack([aside].flat(),{className:'overview-aside',id:id?`${id}-aside`:undefined}):Stack([],{className:'overview-aside',id:id?`${id}-aside`:undefined})],
      {className:'overview-head'}),
    ...children
  ],{id,hidden,className:['overview-section',className].filter(Boolean).join(' ')});
}

// The first thing on the page: what it all comes to, the day it stands at and
// what it did since the last quarter that was read in full — and, once there
// are two such quarters, the line they draw. `figures` are the pairs worth a
// second look (assets and what is owed against them), built by the caller.
export function NetWorthHero({net,asOf='',change=null,currency='USD',figures=[],chart=null}){
  return Stack([
    // The figure, the day it stands at and what it did are one statement, so
    // they are one block — the block the side panel's totals are too, read the
    // same way on either host.
    Stack([
      Figure({label:'Net',value:money(net,currency),tone:net<0?'hero negative':'hero'}),
      asOf||change?Stack([
        asOf?Stack([Label('As of',{className:'hero-as-of'}),Label(asOf)],{className:'hero-date'}):null,
        change?Label(changeText(change,currency),{className:'hero-change'}):null
      ],{className:'hero-meta'}):null,
      figures.length?Stack(figures,{className:'hero-figures'}):null
    ],{id:'finance-totals',className:'hero-figure'}),
    chart?Stack([chart],{className:'hero-chart'}):null
  ],{className:`net-worth-hero${chart?' net-worth-hero--charted':''}`});
}
// The line the quarters draw. Only quarters that hold the whole ledger are on
// it — a quarter read while half the accounts were still to be entered is a
// smaller ledger, not a smaller net worth — and each is placed where it falls
// in time, so a quarter nobody read is a gap rather than a step skipped over.
export function NetWorthChart({points=[],currency='USD'}){
  return LineChart({label:'Net worth by quarter',
    points:points.map(point=>({label:point.label,value:point.net,x:point.x})),
    format:value=>money(value,currency),short:value=>moneyShort(value,currency),
    describe:(point,index)=>index?changeText({amount:point.value-points[index-1].net,since:points[index-1].label},currency):''});
}
// A change is said in words, the way the quarterly table says it: which way,
// by how much, and against what. A sign is a shape a reader can miss.
export const changeText=({amount,since},currency='USD')=>
  `${money(Math.abs(amount),currency)} ${amount<0?'lower':'higher'} than ${since}`;

// Where the money is, as the question the ledger is really asked: how much of
// it could be sold this week. One bar holds every asset class, the liquid ones
// in forest and the rest in brass; under it each side is a column naming its
// classes, and a third names the kinds of account it is all held in. Pointing
// at a class in either place marks it in both.
//
// `groups` is what can be sold and what cannot, each with its classes, in the
// order they are drawn. A class nobody has placed is a group of its own.
export function Allocation({groups=[],total=0,currency='USD',accounts=null}){
  const runs=groups.map(group=>({tone:group.tone,parts:group.rows.map(row=>({key:row.key,label:row.label,value:row.total}))}));
  const bar=ProportionBar({runs,format:value=>money(value,currency),
    label:groups.map(group=>`${group.label} ${share(group.total/total)}`).join(', ')});
  const columns=groups.filter(group=>group.total>0).map(group=>Section([
    Stack([Label('',{className:`swatch swatch--${group.tone}`,'aria-hidden':'true'}),
      Strong(group.label,{className:'allocation-name'}),
      Label(share(group.total/total),{className:'allocation-share'}),
      Amount(group.total,currency)],{className:'allocation-line allocation-line--group'}),
    ...group.rows.filter(row=>row.total>0).map(row=>Stack([
      Label(row.label,{className:'allocation-name'}),
      Label(share(row.total/total),{className:'allocation-share'}),
      Amount(row.total,currency),
      Stack([Stack([],{className:`allocation-fill allocation-fill--${group.tone}`,style:`width:${Math.max(0.5,row.total/total*100).toFixed(2)}%`})],
        {className:'allocation-track','aria-hidden':'true'})
    ],{className:'allocation-line','data-key':row.key,tabindex:0}))
  ],{className:'allocation-column','aria-label':group.label}));
  // The same money a second way: the kinds of account it is held in. Not a
  // part of the bar above — a trust and an IRA are not sides of anything — so
  // its lines are drawn in ink rather than in either colour, and each is a
  // share of what the accounts hold between them.
  const held=(accounts?.rows||[]).filter(row=>Math.round(row.total*100)>0);
  const whole=held.reduce((sum,row)=>sum+row.total,0);
  const kinds=held.length?Section([
    Stack([Strong(accounts.title,{className:'allocation-name'}),Label(''),Amount(whole,currency)],
      {className:'allocation-line allocation-line--group allocation-line--plain'}),
    ...held.map(row=>Stack([
      Label(row.label,{className:'allocation-name'}),
      Label(share(row.total/whole),{className:'allocation-share'}),
      Amount(row.total,currency),
      Stack([Stack([],{className:'allocation-fill allocation-fill--plain',style:`width:${Math.max(0.5,row.total/whole*100).toFixed(2)}%`})],
        {className:'allocation-track','aria-hidden':'true'})
    ],{className:'allocation-line'}))
  ],{className:'allocation-column allocation-column--accounts','aria-label':accounts.title}):null;
  return linkParts(Stack([bar,Stack([...columns,kinds],{className:'allocation-columns'})],{className:'allocation'}));
}

// What is held, class by class, in the two runs the owner reads it in: what
// could be sold this week, then what could not. Value nobody has placed yet
// belongs to neither and is a run of its own, last, in grey. Within a run the
// biggest class leads. What is owed is not held, and is not here.
const RUNS=[{id:'liquid',label:'Liquid',tone:'liquid'},{id:'illiquid',label:'Illiquid',tone:'illiquid'},
  {id:'',label:'Unclassified',tone:'unplaced'}];
export function allocationGroups(byClass=[]){
  return RUNS.map(run=>{
    const rows=byClass.filter(row=>classSide(row.id)==='asset'&&row.total>0&&classGroup(row.id)===run.id)
      .map(row=>({key:`class-${row.id}`,label:row.label,total:row.total}))
      .sort((a,b)=>b.total-a.total);
    return {...run,rows,total:Math.round(rows.reduce((sum,row)=>sum+row.total,0)*100)/100};
  }).filter(run=>run.rows.length);
}

// The same split, small enough for the side panel: the bar, and one line per
// side saying what it comes to. The classes are on the page behind it.
export function LiquiditySummary({groups=[],total=0,currency='USD'}){
  const runs=groups.map(group=>({tone:group.tone,parts:group.rows.map(row=>({key:row.key,label:row.label,value:row.total}))}));
  return linkParts(Stack([
    ProportionBar({runs,format:value=>money(value,currency),
      label:groups.map(group=>`${group.label} ${share(group.total/total)}`).join(', ')}),
    Stack(groups.filter(group=>group.total>0).map(group=>Stack([
      Label('',{className:`swatch swatch--${group.tone}`,'aria-hidden':'true'}),
      Label(group.label,{className:'liquidity-name'}),
      Label(share(group.total/total),{className:'allocation-share'}),
      Amount(group.total,currency)
    ],{className:'liquidity-line'})),{className:'liquidity-legend'})
  ],{className:'liquidity-summary'}));
}

// Every private position side by side. In the side panel a position was a
// block of its own under a line in its portfolio, four flows hung under a
// legal name; here, where there is room, they are columns — which is the only
// way to see that one fund has called most of its commitment and another
// almost none of it, or which of them is ahead.
//
// A row reads as the owner reads it: the name, then which portfolio holds it
// and what kind of vehicle it is, then what was committed, what was paid in,
// what came back, what is left to call, what it is worth and what a dollar put
// in has become. A kind with no commitment leaves those columns empty rather
// than printing a zero that would claim something was committed. Under the
// name, how far the commitment has been called, as a hairline filling in.
export function PositionsTable({rows=[],totals=null,currency='USD'}){
  const head=['Investment','Committed','Funded','Returned','Unfunded','Value','Multiple',''];
  const cell=(value,label,className='')=>Stack(value===null||value===undefined||value===''?[Label('—',{className:'overview-none'})]:[typeof value==='string'?Label(value):value],
    {className:`overview-cell ${className}`.trim(),role:'cell','data-label':label});
  const line=row=>Stack([
    Stack([
      Strong(row.name,{className:'overview-name'}),
      Label(row.meta,{className:'overview-meta'}),
      row.called===null?null:Stack([Stack([],{className:'called-fill',style:`width:${Math.min(100,row.called*100).toFixed(1)}%`})],
        {className:'called-track',title:`${share(row.called)} of the commitment called`,'aria-hidden':'true'}),
      ...row.notes.map(text=>Note(text))
    ],{className:'overview-cell overview-cell--name',role:'rowheader'}),
    cell(row.committed?Amount(row.committed,currency):null,'Committed'),
    cell(row.contributed?Amount(row.contributed,currency):null,row.flows[0]),
    cell(row.distributed?Amount(row.distributed,currency):null,row.flows[1]),
    cell(row.unfunded?Amount(row.unfunded,currency):null,'Unfunded'),
    cell(Amount(row.value,currency),'Value','overview-cell--value'),
    cell(row.multiple===null?null:`${row.multiple.toFixed(2)}×`,'Multiple'),
    Stack(row.actions,{className:'overview-cell overview-cell--actions',role:'cell'})
  ],{className:`overview-row${row.pending?' overview-row--pending':''}`,role:'row'});
  return Stack([
    Stack(head.map((text,index)=>Label(text,{className:`overview-cell overview-cell--head${index===0?' overview-cell--name':''}`,role:'columnheader'})),
      {className:'overview-row overview-row--head',role:'row'}),
    ...rows.map(line),
    totals?Stack([
      Stack([Strong('Total',{className:'overview-name'})],{className:'overview-cell overview-cell--name',role:'rowheader'}),
      cell(totals.committed?Amount(totals.committed,currency):null,'Committed'),
      cell(totals.contributed?Amount(totals.contributed,currency):null,'Funded'),
      cell(totals.distributed?Amount(totals.distributed,currency):null,'Returned'),
      cell(totals.unfunded?Amount(totals.unfunded,currency):null,'Unfunded'),
      cell(Amount(totals.value,currency),'Value','overview-cell--value'),
      cell(totals.multiple===null?null:`${totals.multiple.toFixed(2)}×`,'Multiple'),
      Stack([],{className:'overview-cell overview-cell--actions',role:'cell'})
    ],{className:'overview-row overview-row--total',role:'row'}):null
  ],{className:'overview-table overview-table--positions',role:'table','aria-label':'Private investments'});
}

// Every house, with what it is worth, what is owed on it and what is left.
// The hairline under the address fills with the owner's equity, so a house
// worth twice its mortgage and one worth a tenth more than it look as
// different as they are.
export function PropertiesTable({rows=[],totals=null,currency='USD'}){
  const head=['Property','Value','Owed','Equity','As of',''];
  const cell=(value,label,className='')=>Stack(value===null||value===undefined||value===''?[Label('—',{className:'overview-none'})]:[typeof value==='string'?Label(value):value],
    {className:`overview-cell ${className}`.trim(),role:'cell','data-label':label});
  const line=row=>Stack([
    Stack([
      Strong(row.name,{className:'overview-name'}),
      Label(row.meta,{className:'overview-meta'}),
      row.value>0?Stack([Stack([],{className:'called-fill',style:`width:${Math.max(0,Math.min(100,row.equity/row.value*100)).toFixed(1)}%`})],
        {className:'called-track',title:`${share(Math.max(0,row.equity)/row.value)} equity`,'aria-hidden':'true'}):null
    ],{className:'overview-cell overview-cell--name',role:'rowheader'}),
    cell(row.value?Amount(row.value,currency):null,'Value'),
    cell(row.debt?Amount(-row.debt,currency):null,'Owed'),
    cell(row.value?Amount(row.equity,currency):null,'Equity','overview-cell--value'),
    cell(row.asOf||null,'As of','overview-cell--date'),
    Stack(row.actions,{className:'overview-cell overview-cell--actions',role:'cell'})
  ],{className:`overview-row${row.pending?' overview-row--pending':''}`,role:'row'});
  return Stack([
    Stack(head.map((text,index)=>Label(text,{className:`overview-cell overview-cell--head${index===0?' overview-cell--name':''}`,role:'columnheader'})),
      {className:'overview-row overview-row--head',role:'row'}),
    ...rows.map(line),
    totals&&rows.length>1?Stack([
      Stack([Strong('Total',{className:'overview-name'})],{className:'overview-cell overview-cell--name',role:'rowheader'}),
      cell(Amount(totals.value,currency),'Value'),
      cell(totals.debt?Amount(-totals.debt,currency):null,'Owed'),
      cell(Amount(totals.equity,currency),'Equity','overview-cell--value'),
      Stack([],{className:'overview-cell overview-cell--date',role:'cell'}),
      Stack([],{className:'overview-cell overview-cell--actions',role:'cell'})
    ],{className:'overview-row overview-row--total',role:'row'}):null
  ],{className:'overview-table overview-table--properties',role:'table','aria-label':'Real estate'});
}


// A return in words a reader already knows: a sign they can see, one decimal,
// and a real minus rather than a hyphen. It is not money, so it takes no
// parentheses — what is owed is written that way, and a fund that lost 2% owes
// nobody anything.
export const returnText=value=>value===null||value===undefined?'—'
  :`${value<0?'\u2212':'+'}${Math.abs(value*100).toFixed(1)}%`;
const DAY=86400000;

// Each institution, as the owner judges one: what is there now, what it has
// returned since it was first read in full with the cash that moved taken out
// of it, how much of the change it earned and how much it was handed, the line
// that return has drawn, each quarter's share of it, and the cash itself.
//
// `firm` is what firmPerformance returns, with the verbs added by the caller:
// `actions` on the card (record cash in or out), and `actions`/`extra` on each
// flow (edit, delete and the confirmation delete raises).
export function InstitutionCard(firm,{currency='USD'}={}){
  const total=firm.total;
  const drawn=firm.points.filter(point=>point.index!==null);
  const flows=firm.flows||[];
  return Section([
    Stack([
      Stack([Heading(firm.label,3,{className:'firm-name'}),
        Label(firm.asOf?`as of ${firm.asOf}`:'not read yet',{className:'overview-meta'})],{className:'firm-title'}),
      Stack([firm.value===null?null:Amount(firm.value,currency),
        ActionGroup(firm.actions||[],{compact:true,className:'action-group action-group--compact record-actions'})],{className:'firm-figure'})
    ],{className:'firm-head'}),
    total?Stack([
      Stack([Strong(returnText(total.return),{className:`firm-return${total.return<0?' firm-return--down':''}`}),
        Label(`since ${firm.from}`,{className:'overview-meta'})],{className:'firm-return-line'}),
      Stack([
        Label(`${money(Math.abs(total.gain),currency)} ${total.gain<0?'lost':'earned'}`),
        total.flow?Label(`${money(Math.abs(total.flow),currency)} ${total.flow<0?'taken out':'added'}`):null
      ],{className:'firm-split'})
    ],{className:'firm-performance'})
      // One reading is a balance, not a return; the second one starts the line.
      :firm.asOf?Note('A return starts with the next reading.'):null,
    drawn.length>1?LineChart({label:`${firm.label}, return since ${firm.from}`,height:84,marks:'last',axis:'ends',zero:true,
      points:drawn.map(point=>({label:point.asOf,value:(point.index-1)*100,x:Date.parse(point.asOf)/DAY})),
      format:value=>returnText(value/100),
      short:value=>`${value>0?'+':value<0?'\u2212':''}${Number.isInteger(Math.round(value*1e6)/1e6)?Math.abs(Math.round(value)):Math.abs(value).toFixed(1)}%`}):null,
    firm.quarters.length?Stack([
      Stack(['Quarter','Value','Added','Earned','Return'].map(text=>Label(text)),{className:'firm-quarter firm-quarter--head','aria-hidden':'true'}),
      ...[...firm.quarters].reverse().map(quarter=>Stack([
        Stack([Label(quarter.label),quarter.struck?Label(quarter.struck,{className:'trend-struck'}):null],{className:'firm-quarter-when'}),
        Amount(quarter.value,currency),
        quarter.flow?Amount(quarter.flow,currency):Label('—',{className:'overview-none'}),
        Amount(quarter.gain,currency),
        Label(returnText(quarter.return),{className:quarter.return<0?'firm-return--down':''})
      ],{className:'firm-quarter','aria-label':`${quarter.label}: value ${money(quarter.value,currency)}, `
        +`${quarter.flow?`${money(quarter.flow,currency)} moved, `:''}${money(quarter.gain,currency)} earned, return ${returnText(quarter.return)}`}))
    ],{className:'firm-quarters'}):null,
    flows.length?Section([
      GroupTitle('Cash in and out',{className:'record-group-title'}),
      ...flows.map(entry=>RecordRow({title:entry.flow.asOf,figure:Amount(entry.flow.amount,currency),
        // Money out reads as money out: in parentheses and red, the way the
        // ledger writes anything leaving, and in words beside it.
        // The caption stays short — it never wraps — so where the movement
        // stands against the readings is a line of its own under it.
        meta:[entry.flow.amount<0?'taken out':'added',entry.flow.pending?'waiting to sync':''].filter(Boolean).join(' · '),
        notes:[entry.before?'Before the first full reading, so not counted.':entry.waiting?'Counts from the next reading.':''],
        actions:entry.actions||[],extra:entry.extra||[]}))
    ],{className:'record-group firm-cash'}):null
  ],{className:'firm-card','aria-label':firm.label});
}
export const Institutions=(firms=[],options={})=>Stack(firms.map(firm=>InstitutionCard(firm,options)),{className:'firm-cards'});
