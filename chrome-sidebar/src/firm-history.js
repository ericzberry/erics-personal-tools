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
// Quarterly, because that is the grain a firm is judged on. A row per reading
// would be a log of when a browser tab happened to be open; four numbers a year
// is what tells you whether a place is earning its keep. Each quarter is what
// the firm held at the end of it, which is the ledger's own step function
// applied to one firm's figures: an account read in March and not since still
// counts in December at its March figure, exactly as it counts towards net
// worth. That is the whole reason this is computed rather than written down at
// the moment of reading — a stored sum could only ever hold the reading it came
// from, so re-reading half the accounts would read as a collapse.
//
// A firm appears in a quarter only when it was actually read in it. A quarter
// nobody looked at is not a flat line, it is a question nobody asked, and
// drawing it as a repeat of the quarter before would invent an observation.
//
// Figures stated by hand, or folded out of a dropped statement, carry no firm.
// Nothing in a file says which place it came from, and they are left out rather
// than gathered under a heading that would name nowhere.
import {firmLabel} from './account-sites.js';
import {marksOf,portfoliosOf,heldOn,signed,quarterNumber,quarterName,quarterEnded} from './finance-data.js';

const sum=values=>Math.round(values.reduce((total,value)=>total+value,0)*100)/100;

export function firmQuarters(records,{currency='USD',limit=12}={}){
  // Currencies are never added together, here as everywhere else: a firm
  // holding two of them is two series, and the panel shows the one being read.
  const mine=new Set(portfoliosOf(records).filter(portfolio=>(portfolio.currency||'USD')===currency).map(portfolio=>portfolio.number));
  const firms=new Map();
  for(const mark of marksOf(records)){
    const firm=Number(mark.firm||0);
    if(!firm||!mine.has(mark.portfolio))continue;
    firms.set(firm,[...(firms.get(firm)||[]),mark]);
  }
  return [...firms].map(([firm,own])=>{
    const points=[...new Set(own.map(mark=>quarterNumber(mark.asOf)))].sort((a,b)=>a-b)
      .map(period=>{
        // One firm's figures only, so the step function is asked the same
        // question the totals ask it, about a narrower set of rows.
        const live=heldOn(own,quarterEnded(period));
        return {period,label:quarterName(period),amount:sum(live.map(signed)),figures:live.length,
          asOf:live.map(mark=>mark.asOf).sort().at(-1)||''};
      });
    // The newest quarter carries every figure this firm has, because a figure
    // stands until a later one replaces it. So it is the measure of a full
    // picture, and an older quarter is partial exactly when it holds fewer —
    // the ledger was still being filled in then, and subtracting a smaller
    // ledger from a larger one reports a rise nobody earned.
    const whole=points.at(-1).figures;
    let previous=null;
    const quarters=points.slice(-limit).map(point=>{
      const complete=point.figures>=whole;
      const change=complete&&previous?Math.round((point.amount-previous.amount)*100)/100:null;
      if(complete)previous=point;
      return {...point,complete,change,whole,
        // A quarter read in its closing month is a quarter-end figure. One read
        // in its first week is that quarter's best available answer and
        // something else, so the row says when it was struck rather than
        // letting the heading claim a date nobody read.
        struck:point.asOf.slice(5,7)===String((point.period%10)*3).padStart(2,'0')?'':point.asOf};
    });
    // Firms are read in the order they matter, which is how much is at them.
    return {firm,label:firmLabel(firm),quarters,latest:quarters.at(-1)?.amount??0};
  }).sort((a,b)=>Math.abs(b.latest)-Math.abs(a.latest)||a.label.localeCompare(b.label));
}
