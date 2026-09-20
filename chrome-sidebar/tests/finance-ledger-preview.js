// Local synthetic fixture for the Net worth block. Not copied into release
// builds. The view, the controller and the styles are the real modules; only
// the records, the vault and the connection are synthetic, so the states a
// person actually meets can be inspected at sidebar widths without a
// connection and without their own figures on the screen.
import {mountFinance} from '../src/finance.js';
import {markRef,capitalRef,holdingRef,propertyRef,valuationRef} from '../src/finance-data.js';

const vault={idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
  async key(){return null;},async open(){return '';},async unlockWithRecoveryCode(){return null;},recoveryCode:()=>'EV1-SYNTHETIC'};
const portfolio=(number,name,kind,currency='USD')=>({id:`p${number}`,row:'portfolio',revision:'r1',number,name,kind,currency});
const mark=(portfolio,cls,asOf,amount)=>{
  const value={row:'mark',portfolio,class:cls,asOf,amount};
  return {...value,id:markRef(value),revision:String(amount)};
};
const holding=(number,portfolio,name,vehicle,cls,share=10000)=>({id:holdingRef(number),row:'holding',revision:'r1',number,portfolio,name,vehicle,class:cls,stated:0,share});
const capital=(entry)=>({...entry,row:'capital',id:capitalRef(entry),revision:String(entry.value)});
const property=(number,portfolio,name,link='')=>({id:propertyRef(number),row:'property',revision:'r1',number,portfolio,name,link});
const valuation=(entry)=>({...entry,row:'valuation',id:valuationRef(entry),revision:String(entry.value)});

// The ledger halfway through being filled in — the state this block had to be
// honest about. One day's reading was filed Unclassified before anyone said
// what was in the account; the next day corrected it with a zero under the same
// key and the real figures beside it.
const FILLING=[
  portfolio(1,'Eric and Ariana Berry Estate',1),
  portfolio(2,'Eric Berry',2),
  mark(1,3,'2026-09-19',0.54),
  mark(1,9,'2026-09-19',0),
  mark(1,10,'2026-09-20',1668402.54),
  mark(1,12,'2026-09-20',248422.68),
  mark(2,9,'2026-09-19',0),
  mark(2,10,'2026-09-20',122666.62)
];

// A ledger with some years behind it: liabilities, a private position, a
// portfolio nobody has marked since last spring, and enough dated figures for
// the quarterly table to have rows in it.
const SETTLED=[
  portfolio(1,'Eric and Ariana Berry Estate',1),
  portfolio(2,'Eric Berry',2),
  portfolio(3,'Berry Children’s Custodial Account with a Very Long Name',7),
  ...['2025-03-31','2025-06-30','2025-09-30','2025-12-31','2026-03-31','2026-06-30','2026-09-20']
    .flatMap((asOf,index)=>[
      mark(1,10,asOf,1400000+index*45000),
      mark(1,3,asOf,60000+index*1500),
      mark(1,21,asOf,780000-index*9000),
      mark(2,10,asOf,96000+index*4200)
    ]),
  mark(3,10,'2026-03-31',41250),
  holding(1,1,'Vantage Point Partners Fund IV, L.P.',1,4),
  capital({holding:1,asOf:'2026-06-30',value:1100000,contributed:800000,distributed:250000,commitment:1000000}),
  // A general partner held in part: the statement states the whole vehicle and
  // the row has to say which share of it these figures are, beside a position
  // that is the whole of its fund and says nothing.
  holding(2,1,'Synthetic Health Opportunities GP I LLC',1,4,3500),
  capital({holding:2,asOf:'2026-09-20',value:850000,contributed:850000,distributed:0,commitment:2119150}),
  // Two houses: one owned outright, one with a mortgage against it, so the
  // row that has an equity to state sits beside the one that does not.
  property(1,1,'118 Riverside Drive, Apt 7B, New York, NY 10024','https://www.zillow.com/homedetails/synthetic/1234_zpid/'),
  ...['2026-03-31','2026-06-30','2026-09-20'].map((asOf,index)=>
    valuation({property:1,asOf,value:2380000+index*22000,debt:0,source:1})),
  property(2,1,'41 Undermountain Road, Sheffield, MA 01257'),
  ...['2026-03-31','2026-06-30','2026-09-20'].map((asOf,index)=>
    valuation({property:2,asOf,value:1185000+index*9000,debt:642000-index*4100,source:1}))
];

// A house entered with the page its value is published on and no figure typed
// against it: what the ledger looks like in the moment before it has read the
// Zestimate off that page, and what the reading says while it runs.
const AWAITING=[
  portfolio(1,'Eric and Ariana Berry Estate',1),
  mark(1,3,'2026-09-20',69000),
  property(1,1,'220 Riverside Blvd, Apartment 11J, New York, NY 10069','https://www.zillow.com/homedetails/synthetic/1234_zpid/')
];

const states=[
  ['Still being filled in — one full reading, one partial',FILLING],
  ['Years of figures, liabilities, a position and a stale portfolio',SETTLED],
  ['A house with its page saved and no figure yet',AWAITING],
  ['Nothing recorded yet',[portfolio(1,'Eric and Ariana Berry Estate',1)]]
];

// The host's ability to read a house's own page, which only the extension
// really has. Synthetic here: no tab is opened and no page is read, so the row
// action and the line it puts up while it runs can be looked at.
const readZestimate=async(link,address)=>{
  await new Promise(resolve=>setTimeout(resolve,1200));
  return {value:2424000,address,url:link};
};

const root=document.getElementById('ledger-states');
for(const [label,records] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:20px 0 6px;color:#666';
  const host=document.createElement('div');
  host.style.cssText='border:1px solid #dedfd5;border-radius:10px;background:#f7f6f2;overflow:hidden';
  root.append(heading,host);
  // Every state is a whole Finance tool, so the ids repeat down the page as
  // they do in the other fixtures. Each controller is handed its own host and
  // looks no further, so each fills its own.
  mountFinance(host,{
    vault,credentials:{get:async()=>'synthetic-preview-token-at-least-32-characters'},
    remote:async()=>({connections:[]}),readZestimate,
    offline:{request:async()=>({records})}
  });
}
// The disclosures start closed, and this page exists to look at what is inside
// them.
setTimeout(()=>{for(const panel of root.querySelectorAll('details'))if(panel.id?.includes('breakdown')||panel.id?.includes('trend'))panel.open=true;},50);
