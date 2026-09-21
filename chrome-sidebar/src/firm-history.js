// How each firm is doing, quarter by quarter.
//
// The ledger answers what the owner is worth, and until recently it answered
// nothing at all about where that is held: a figure is filed under whose money
// it is, so the estate's securities at Chase and the estate's securities at UBS
// were one portfolio, one asset class and — fatally — one key, which is how
// $3M of Chase disappeared under a UBS reading taken the same day. A figure now
// carries the firm it was read at, which fixes that and makes this question
// answerable in the same stroke: how UBS is doing, as against Morgan Stanley.
//
// Quarterly, because that is the grain a firm is judged on: four numbers a year
// is what tells you whether a place is earning its keep. What the firm holds at
// any moment is the ledger's own step function applied to that firm's figures —
// an account read in March and not since still counts in December at its March
// figure, exactly as it counts towards net worth — which is why this is
// computed rather than written down at the moment of reading: a stored sum could
// only ever hold the reading it came from, so re-reading half the accounts
// would read as a collapse.
//
// A firm appears in a quarter only when it was actually read in it. A quarter
// nobody looked at is not a flat line, it is a question nobody asked, and
// drawing it as a repeat of the quarter before would invent an observation.
//
// Figures stated by hand, or folded out of a dropped statement, carry no firm.
// Nothing in a file says which place it came from, and they are left out rather
// than gathered under a heading that would name nowhere.
import {firmLabel} from './account-sites.js';
import {marksOf,portfoliosOf,flowsOf,financeCurrencies,heldOn,signed,quarterNumber,quarterName,fromHistoryStart} from './finance-data.js';

const sum=values=>Math.round(values.reduce((total,value)=>total+value,0)*100)/100;

// How each firm has actually performed: what it earned, with the money the
// owner put in or took out taken back out of it.
//
// A balance that rose by $500,000 in a quarter in which $500,000 was wired in
// earned nothing, and a balance on its own cannot tell the two apart. So
// the cash that moved is recorded as its own row — a flow, dated, per firm —
// and every figure here is net of it.
//
// The periods run between readings rather than between quarter ends. A firm is
// only ever observed when one of its pages is read, and a return measured
// between two observations is a return somebody saw; one measured to a quarter
// end nobody read would be the step function's guess dressed up as a result.
// Inside a period the cash is weighted by how long it was there (Modified
// Dietz): a deposit the day after one reading worked for the whole period, one
// made the day before the next barely at all. The periods are then chained, so
// a return over a quarter or since the first reading is time-weighted — it
// says how the firm did with the money it had, not how much money it was given.
//
// Only readings that hold every figure the newest one does are observations:
// while a firm's accounts are still being entered, a smaller total is a
// smaller ledger, not a loss. A reading from before the first full one, and
// cash moved before it, are simply before the record starts. Cash moved since
// the newest reading waits for the next one, which is the first to have seen
// it.
//
// Quarters are what a firm is judged on, so the periods are also added up by
// the quarter they end in; the line is drawn through every observation, because
// that is where the firm was actually seen.
const DAY=86400000;
const days=asOf=>Date.parse(`${asOf}T00:00:00Z`)/DAY;
const chain=returns=>returns.some(value=>value===null)?null
  :Math.round((returns.reduce((total,value)=>total*(1+value),1)-1)*1e6)/1e6;

export function firmPerformance(records,{currency='USD',since}={}){
  const mine=new Set(portfoliosOf(records).filter(portfolio=>(portfolio.currency||'USD')===currency).map(portfolio=>portfolio.number));
  const marks=new Map(),moves=new Map();
  for(const mark of marksOf(records)){
    const firm=Number(mark.firm||0);
    if(!firm||!mine.has(mark.portfolio))continue;
    marks.set(firm,[...(marks.get(firm)||[]),mark]);
  }
  // Cash carries no currency of its own: it is recorded in the ledger's main
  // one, the currency most portfolios are kept in, and counts only there. A
  // firm's second-currency series is judged on its balances alone.
  const main=financeCurrencies(records)[0]?.currency||'USD';
  if(currency===main)for(const flow of flowsOf(records))moves.set(flow.firm,[...(moves.get(flow.firm)||[]),flow]);
  return [...new Set([...marks.keys(),...moves.keys()])].map(firm=>{
    const own=marks.get(firm)||[],cash=moves.get(firm)||[];
    const seen=[...new Set(own.map(mark=>fromHistoryStart(mark.asOf,since)))].sort().map(asOf=>{
      const live=heldOn(own,asOf);
      return {asOf,value:sum(live.map(signed)),figures:live.length};
    });
    const whole=seen.at(-1)?.figures??0;
    const observed=seen.slice(Math.max(0,seen.findIndex(point=>point.figures>=whole)));
    const periods=observed.slice(1).map((end,index)=>{
      const start=observed[index];
      const inside=cash.filter(flow=>flow.asOf>start.asOf&&flow.asOf<=end.asOf);
      const span=days(end.asOf)-days(start.asOf);
      const flow=sum(inside.map(entry=>entry.amount));
      const weighted=inside.reduce((total,entry)=>total+entry.amount*(days(end.asOf)-days(entry.asOf))/span,0);
      const gain=Math.round((end.value-start.value-flow)*100)/100;
      const base=start.value+weighted;
      // A firm that holds nothing, or only what is owed to it — a card, a
      // margin loan — has no return to speak of, whatever its balance did.
      return {from:start.asOf,to:end.asOf,start:start.value,value:end.value,flow,gain,
        return:base>0?Math.round(gain/base*1e6)/1e6:null};
    });
    let index=1;
    const points=observed.map((point,at)=>{
      if(at){const period=periods[at-1];index=period.return===null||index===null?null:index*(1+period.return);}
      return {asOf:point.asOf,value:point.value,index:index===null?null:Math.round(index*1e6)/1e6};
    });
    const byQuarter=new Map();
    for(const period of periods){
      const key=quarterNumber(period.to);
      byQuarter.set(key,[...(byQuarter.get(key)||[]),period]);
    }
    const quarters=[...byQuarter].sort((a,b)=>a[0]-b[0]).map(([period,list])=>({period,label:quarterName(period),
      value:list.at(-1).value,asOf:list.at(-1).to,flow:sum(list.map(entry=>entry.flow)),
      gain:sum(list.map(entry=>entry.gain)),return:chain(list.map(entry=>entry.return)),
      // A quarter last read before its closing month is that quarter's best
      // available answer and not its end, so the row says the day it was
      // struck rather than letting the heading claim a date nobody read.
      struck:list.at(-1).to.slice(5,7)===String((period%10)*3).padStart(2,'0')?'':list.at(-1).to}));
    const first=observed[0]?.asOf||'',last=observed.at(-1)?.asOf||'';
    return {firm,label:firmLabel(firm),value:observed.at(-1)?.value??null,asOf:last,from:first,points,periods,quarters,
      total:periods.length?{flow:sum(periods.map(entry=>entry.flow)),gain:sum(periods.map(entry=>entry.gain)),
        return:chain(periods.map(entry=>entry.return))}:null,
      // Every flow recorded for the firm, newest first, each saying whether the
      // figures above count it yet.
      flows:[...cash].reverse().map(flow=>({flow,counted:!!first&&flow.asOf>first&&flow.asOf<=last,
        waiting:!first||flow.asOf>last,before:!!first&&flow.asOf<=first}))};
  }).sort((a,b)=>Math.abs(b.value??0)-Math.abs(a.value??0)||a.label.localeCompare(b.label));
}
