// Local synthetic fixture for the ledger's own page — what Open details in the
// side panel opens, and what the phone shows as its Finance tool. Not copied
// into release builds. The view, the controller and the styles are the real
// modules and the page loads the sheets finance.html loads; only the records,
// the vault and the connection are synthetic, so the page can be read at a
// desktop width and a phone's without anyone's own figures on the screen.
//
// ?state= picks one: `today` (one quarter read in full, so no line yet),
// `year` (five quarters, so the line is drawn), `sparse` (one entity, nothing
// private and no houses) and `empty`.
import {mountFinance} from '../src/finance.js';
import {CapabilityPicker} from '../src/components/capabilities.js';
import {markRef,capitalRef,holdingRef,propertyRef,valuationRef,flowRef} from '../src/finance-data.js';

const vault={idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
  async key(){return null;},async open(){return '';},async unlockWithRecoveryCode(){return null;},recoveryCode:()=>'EV1-SYNTHETIC'};
const portfolio=(number,name,kind,currency='USD')=>({id:`p${number}`,row:'portfolio',revision:'r1',number,name,kind,currency});
const mark=(portfolio,cls,asOf,amount,firm=0)=>{
  const value={row:'mark',portfolio,class:cls,asOf,amount,firm};
  return {...value,id:markRef(value),revision:String(amount)};
};
const holding=(number,portfolio,name,vehicle,cls,share=10000,follows=0)=>({id:holdingRef(number),row:'holding',revision:'r1',number,portfolio,name,vehicle,class:cls,stated:0,share,follows});
const capital=entry=>({unfunded:null,...entry,row:'capital',id:capitalRef(entry),revision:String(entry.value)});
const property=(number,portfolio,name,link='')=>({id:propertyRef(number),row:'property',revision:'r1',number,portfolio,name,link});
const valuation=entry=>({...entry,row:'valuation',id:valuationRef(entry),revision:String(entry.value)});
const flow=(firm,asOf,amount)=>({row:'flow',firm,asOf,amount,id:flowRef({firm,asOf}),revision:String(Math.round(amount*100))});

const PORTFOLIOS=[
  portfolio(1,'Eric and Ariana Berry Estate',1),
  portfolio(2,'Berry 2020 Irrevocable Family Trust',5),
  portfolio(3,'Berry 2020 Descendants’ Irrevocable Trust',5),
  portfolio(4,'Eric Berry',2),
  portfolio(5,'Eric Berry Roth',3),
  portfolio(6,'Berry Holdings LLC',6),
  portfolio(7,'Berry Children’s Custodial Account',7)
];
// Each quarter the ledger was read in full, and how far the markets had moved
// by then — enough of a shape for the line to have something to say.
const drift=[1,1.024,1.011,1.052,1.071];
function ledger(dates){
  const records=[...PORTFOLIOS];
  dates.forEach((asOf,index)=>{
    const f=drift[index];
    records.push(
      // The cash recorded below reaches the balances it went into, so the
      // cards have something true to take back out.
      mark(1,10,asOf,Math.round(9318774*f)+(dates.length>1&&index>=1?500000:0),5),mark(1,10,asOf,Math.round(4102885*f),2),
      mark(1,3,asOf,2101804+index*38000-(dates.length>1&&index>=2?250000:0),2),mark(1,23,asOf,15834+index*1200),
      mark(2,10,asOf,Math.round(3090776*f),5),mark(2,4,asOf,967173+index*21000,5),
      mark(3,10,asOf,Math.round(3082837*f),5),mark(3,3,asOf,418250+index*9000,5),
      mark(4,10,asOf,Math.round(1122666*f),1),mark(4,12,asOf,248422+index*31000,1),
      mark(5,10,asOf,Math.round(186400*f)+(dates.length>1&&index>=3?20000:0),4),
      mark(6,3,asOf,640000-index*12000,2),mark(6,13,asOf,Math.round(212000*(1+(index%2?.18:-.06))),33),
      mark(7,10,asOf,Math.round(41250*f),4),mark(7,3,asOf,18400+index*500,4),
      capital({holding:1,asOf,value:1100000+index*38000,contributed:800000+index*40000,distributed:250000+index*15000,commitment:1000000}),
      capital({holding:2,asOf,value:850000+index*26000,contributed:850000,distributed:0,commitment:2119150}),
      capital({holding:4,asOf,value:340000+index*9000,contributed:341370,distributed:3500,commitment:500000,unfunded:167130}),
      capital({holding:5,asOf,value:600000+index*70000,contributed:250000,distributed:0,commitment:0}),
      valuation({property:1,asOf,value:2380000+index*22000,debt:0,source:1}),
      valuation({property:2,asOf,value:1185000+index*9000,debt:642000-index*4100,source:1})
    );
  });
  records.push(
    holding(1,1,'Vantage Point Partners Fund IV, L.P.',1,4),
    holding(2,1,'Synthetic Health Opportunities GP I LLC',1,4,3500),
    holding(3,2,'Synthetic Health Opportunities GP I LLC',1,4,6500,2),
    holding(4,6,'Vista Equity Partners Fund VIII, L.P.',1,4),
    holding(5,4,'Northwind Robotics, Inc. Series B Preferred',2,14),
    property(1,1,'118 Riverside Drive, Apt 7B, New York, NY 10024','https://www.zillow.com/homedetails/synthetic/1234_zpid/'),
    property(2,6,'41 Undermountain Road, Sheffield, MA 01257'));
  // Cash that moved: a wire into UBS in the second quarter, a withdrawal from
  // Chase, one deposit at Chase made before it was first read in full — so it
  // is before the record starts — and one at UBS after its latest reading,
  // which waits for the next one.
  if(dates.length>1)records.push(flow(5,'2026-11-14',500000),flow(2,'2027-02-10',-250000),
    flow(2,'2026-09-02',100000),flow(5,'2027-09-25',150000),flow(4,'2027-05-01',20000));
  return records;
}
const STATES={
  today:ledger(['2026-09-20']),
  year:ledger(['2026-09-30','2026-12-31','2027-03-31','2027-06-30','2027-09-20']),
  sparse:[portfolio(1,'Eric and Ariana Berry Estate',1),mark(1,10,'2026-09-20',1668402.54),mark(1,3,'2026-09-20',248422.68)],
  empty:[portfolio(1,'Eric and Ariana Berry Estate',1)]
};
const state=new URLSearchParams(location.search).get('state')||'year';
document.getElementById('preview-states').append(...Object.keys(STATES).flatMap(key=>{
  const link=Object.assign(document.createElement('a'),{href:`?state=${key}`,textContent:key});
  if(key===state)link.style.fontWeight='700';
  link.style.marginRight='12px';
  return [link];
}));
const readZestimate=async(link,address)=>{
  await new Promise(resolve=>setTimeout(resolve,1200));
  return {value:2424000,address,url:link};
};
document.getElementById('finance-navigation').replaceChildren(CapabilityPicker());
mountFinance(document.getElementById('finance-root'),{
  vault,credentials:{get:async()=>'synthetic-preview-token-at-least-32-characters'},
  remote:async()=>({connections:[]}),readZestimate,
  offline:{request:async()=>({records:STATES[state]})}
});
