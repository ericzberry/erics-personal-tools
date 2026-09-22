// Local synthetic fixture for the passkey gate's states. Not copied into
// release builds. The gate, the ledger and their styles are the real modules;
// only the passkey itself is synthetic, so the states a person actually meets —
// waiting for the sheet, a dismissed sheet, and the open section — can be
// inspected at sidebar widths without a passkey provider.
import {mountFinance} from '../src/finance.js';
import {normalizeFinance,markRef,portfolioRef,holdingRef,capitalRef,importRef,firmCode} from '../src/finance-data.js';
import {ACCOUNT_SITES} from '../src/account-sites.js';
// A ledger at the level of detail it actually keeps: a few portfolios, a figure
// per asset class, and a long name to see wrap at 280px.
const portfolio=(number,name,kind)=>({...normalizeFinance({row:'portfolio',number,name,kind,currency:'USD'}),id:portfolioRef(number),revision:'first'});
const figure=(portfolioNumber,cls,asOf,amount)=>{
  const value=normalizeFinance({row:'mark',portfolio:portfolioNumber,class:cls,asOf,amount});
  return {...value,id:markRef(value),revision:String(Math.round(amount*100))};
};
// A direct investment and the capital account statements filed against it, so
// a position's own line — commitment, funded, returned, unfunded, multiple —
// can be read at 280px beside the class figures it sits with.
const invested=(number,name,vehicle,portfolioNumber,stated=0)=>
  ({...normalizeFinance({row:'holding',number,portfolio:portfolioNumber,name,vehicle,class:4,stated}),id:holdingRef(number),revision:'first'});
const statement=(holding,asOf,value,contributed,distributed,commitment)=>{
  const entry=normalizeFinance({row:'capital',holding,asOf,value,contributed,distributed,commitment});
  return {...entry,id:capitalRef(entry),revision:'first'};
};
const records=[
  portfolio(1,'Synthetic and Longer-Named Berry Estate',1),
  portfolio(2,'Synthetic Berry',2),
  figure(1,1,'2026-08-31',1284000),
  figure(1,2,'2026-08-31',412500.25),
  figure(1,3,'2026-08-31',18400.12),
  // Coin, so the class that used to be filed under Other can be read in the
  // breakdown and in the group it now rolls up to.
  figure(1,13,'2026-08-31',64250.4),
  figure(1,1,'2026-05-31',1150000),
  figure(1,21,'2026-08-31',412500),
  figure(2,9,'2026-08-31',622450),
  portfolio(3,'Synthetic Berry Family Irrevocable Trust',5),
  invested(1,'Synthetic Ventures Fund III, L.P.',1,3),
  statement(1,'2026-03-31',1_100_000,800_000,250_000,1_500_000),
  statement(1,'2026-06-30',1_240_000,950_000,310_000,1_500_000),
  // Sold as a fund, filed as the single-company SPV it is: the one position
  // whose line has to say the two disagree.
  invested(2,'Synthetic Opportunity Fund I — Series B Co-Invest',3,3,1),
  statement(2,'2026-06-30',480_000,500_000,0,500_000),
  // Signed, nothing called yet. Worth nothing, and still a record.
  invested(3,'Synthetic Direct Holding, Inc.',2,3)
];
const offline={request:async()=>({records}),resolve:async()=>({records})};
// What a reading has to say before it is saved: the brokerage figure would write
// over a different amount typed by hand for the same day, and the IRA's is the
// same money, to the cent, already filed two days earlier from a Schwab
// statement — the same pile read twice, which would count twice.
const TYPED=Date.UTC(2026,8,1,15,0),DROPPED=Date.UTC(2026,8,2,9,30),SCHWAB=firmCode('schwab');
const traced=(value,importId)=>{const entry=normalizeFinance({row:'mark',...value,importId});return {...entry,id:markRef(entry),revision:'first'};};
const imported=(number,kind,firm,name,lines)=>({...normalizeFinance({row:'import',number,kind,firm,name,lines}),id:importRef(number),revision:String(number)});
const filedBefore=[
  traced({portfolio:1,class:10,asOf:'2026-08-31',amount:1280000},TYPED),
  imported(TYPED,4,0,'',[{ref:'1-10-20260831',amount:1280000}]),
  traced({portfolio:2,class:10,asOf:'2026-08-29',firm:SCHWAB,amount:412000},DROPPED),
  imported(DROPPED,2,SCHWAB,'Synthetic IRA statement.pdf',[{ref:`2-10-20260829-${SCHWAB}`,amount:412000}])
];
// What a signed-in account page reads back as, so the reading prompt and the
// figures it folds into can be inspected without an account or a model call.
const reading={readings:[
  {account:'Synthetic brokerage',label:'Net Account Value',class:'unclassified',registration:'',scope:'account',value:1286400.25,asOf:'2026-08-31',confidence:'high',reason:'Net account value.'},
  {account:'Synthetic rollover IRA with a long account name',label:'Total value',class:'unclassified',registration:'ira',scope:'account',value:412000,asOf:'2026-08-31',confidence:'medium',reason:'Total value.'},
  {account:'',label:'Total Assets',class:'unclassified',registration:'',scope:'all',value:1698400.25,asOf:'2026-08-31',confidence:'high',reason:'Across accounts.'}
],capital:[
  // One statement for an investment the ledger already has, and one for a fund
  // and a trust it has never seen — the review has to show a match and two
  // proposals side by side, since that is the pair a first upload produces.
  {fund:'Synthetic Ventures Fund III, L.P.',vehicle:'fund',holder:'Synthetic Berry Family Irrevocable Trust',
    asOf:'2026-09-30',value:1310000,commitment:1500000,contributed:1050000,distributed:310000,
    confidence:'high',reason:'Q3 capital account statement.'},
  {fund:'Synthetic Co-Invest Series C, LLC',vehicle:'spv',holder:'Maisie Synthetic Berry 2021 Irrevocable Trust',
    asOf:'2026-09-30',value:96000,commitment:100000,periodContributed:100000,
    confidence:'medium',reason:'First capital account; contributions shown for the period only.'}
],unread:''};
// The same page read badly: E*TRADE's complete view, with the reading naming
// the institution instead of each account, so one name arrives holding the
// brokerage, the IRA and the total over both. This is what the fold has to
// separate, and the three lines it writes about doing so are reviewed here.
const merged={readings:[
  {account:'',label:'Total Assets',class:'unclassified',registration:'',scope:'all',value:1791069.16,asOf:'2026-09-18',confidence:'high',reason:'Total assets.'},
  {account:'',label:'Net Account Value',class:'unclassified',registration:'',scope:'account',value:1668402.54,asOf:'2026-09-18',confidence:'high',reason:'Net account value.'},
  {account:'',label:'Net Account Value',class:'unclassified',registration:'',scope:'account',value:122666.62,asOf:'2026-09-18',confidence:'high',reason:'Net account value.'},
  {account:'',label:'Current Account Value',class:'unclassified',registration:'',scope:'account',value:0,asOf:'2026-09-18',confidence:'high',reason:'Stock plan current value.'},
  {account:'',label:'Potential Benefit Value',class:'unclassified',registration:'',scope:'account',value:248422.68,asOf:'2026-09-18',confidence:'high',reason:'Stock plan potential benefit.'},
  {account:'',label:"Day's Gain",class:'unclassified',registration:'',scope:'account',value:7036.71,asOf:'2026-09-18',confidence:'high',reason:"The card states a day's gain."},
  {account:'',label:'DIS Last Price $',class:'stocks',registration:'',scope:'holding',value:102.67,asOf:'2026-09-18',confidence:'low',reason:'Listed among the top movers.'},
  {account:'',label:"DIS Day's Gain $",class:'stocks',registration:'',scope:'holding',value:1318.56,asOf:'2026-09-18',confidence:'low',reason:"The top movers table states a day's gain."}
],capital:[],unread:''};
// One password over a whole family structure, read well: a bank listing twenty
// accounts titled to a couple, four trusts, an LLC, two children and one
// company that is not the owner's money at all. Nothing here is a Berry figure
// — the names are the shape the page has and the numbers are invented — and it
// is on this page because the review panel's real job only shows at this
// length: eight holders, a class or two each, and what it says it left out.
const structure={readings:[
  ...[['BERRY 2020 IRREV FAM TR (...5007)',1200000],['SYNTH Z ROE & ARIANA COOPER ROE (...3004)',900000],
    ['BERRY 2020 DESCENDANTS’ IRREV TR (...4001)',640000],["BERRY 20 DESC' IRR TR (...3004)",310000],
    ['BERRY AE 21 IRREV FAM TR (...7005)',480000],['AE 21 SLAT Brokerage (...4471)',0],
    ['CELSIE LLC (...2006)',0],['Joint Brokerage (...8733)',0]]
    .map(([account,value])=>({account:`Investment accounts · ${account}`,label:'Account value',class:'liquid',
      registration:'',scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:'Account value column.'})),
  ...[['Joint Savings (...8917)',52000.40],['2nd Joint Checking (...1551)',18400.05],
    ['AE 21 SLAT Savings (...2530)',9600],['CELESTE ARABELLA BERRY UTMA ARIANA, COOP (...8557)',4300],
    ['BEDFORD BRIDGE CAPITAL, LLC (...4918)',77000]]
    .map(([account,value])=>({account:`Bank accounts · ${account}`,label:'Present balance',class:'cash',
      registration:'',scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:'Present balance column.'})),
  {account:'Bank accounts · Joint Savings (...8917)',label:'Available balance',class:'cash',registration:'',
    scope:'account',value:51755.90,asOf:'2026-09-20',confidence:'high',reason:'Available balance column.'},
  {account:'Credit cards · SYNTHETIC REWARDS CARD (...1739)',label:'Current balance',class:'unclassified',
    registration:'',scope:'account',value:2410.55,asOf:'2026-09-20',confidence:'high',reason:'Balance owed on the card.'},
  {account:'Credit cards · SYNTHETIC REWARDS CARD (...1739)',label:'Available credit',class:'unclassified',
    registration:'',scope:'account',value:47589.45,asOf:'2026-09-20',confidence:'high',reason:'Credit left on the card.'}
],capital:[],unread:''};
const credentials={get:async()=>'synthetic-preview-token-at-least-32-characters'};
// Each state is one vault, so the three can sit side by side on one page.
const vault=({answer='open'}={})=>{
  let open=false;
  return {idleMs:900000,available:()=>true,unlocked:()=>open,touch(){},lock(){open=false;},
    async key(){
      if(answer==='wait')return new Promise(()=>{});
      if(answer==='dismiss')throw Object.assign(Error('Synthetic dismissal'),{name:'NotAllowedError'});
      open=true;
      return crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'AES-GCM',false,['encrypt','decrypt']);
    },
    async unlockWithRecoveryCode(){open=true;return this.key();},
    recoveryCode:()=>'EV1-SYNTHETIC0000-SYNTHETIC0000-SYNTHETIC0000-0000'};
};
const root=document.getElementById('gate-states');
// The open state is shown once per registered account site, so a site added to
// the registry brings its own snapshot prompt to this page to be reviewed
// rather than sitting behind whichever one happens to be listed first. The last
// two are the quiet arrival — the panel turning to Finance because the tab
// beside it is a finance page — with and without a site it can read, which is
// the difference between offering the snapshot and offering only the intake.
const states=[
  ['Waiting for the passkey sheet','wait',null,false],
  ['Sheet dismissed','dismiss',null,false],
  // The panel beside an ordinary page: no site to name, so reading the page is
  // offered by the one action in Read an update rather than a panel of its own.
  ['Open · beside a page that is not an account site','open',null,false],
  ...ACCOUNT_SITES.map(site=>[`Open · beside a signed-in ${site.label} page`,'open',site,false]),
  ['Open · beside an E*TRADE page that named no account','open',ACCOUNT_SITES.find(site=>site.id==='etrade'),false,merged],
  ['Open · beside a Chase page holding a whole family structure','open',ACCOUNT_SITES.find(site=>site.id==='chase'),false,structure],
  ['Open · beside a page whose figures are already on file','open',null,false,reading,filedBefore],
  ['Quiet · beside a signed-in Schwab page','open',ACCOUNT_SITES.find(site=>site.id==='schwab'),true],
  ['Quiet · beside a finance page with no reader','open',null,true]
];
for(const [label,answer,site,quiet,read=reading,saved=[]] of states){
  const offline={request:async()=>({records:[...records,...saved]}),resolve:async()=>({records:[...records,...saved]})};
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  // Laid out as the side panel lays it out, because that is the host this
  // fixture stands in for; the ledger's own page has its own preview.
  const tool=mountFinance(host,{vault:vault({answer}),credentials,offline,quiet,layout:'panel',openDetails:()=>{},
    // The open state stands in for the sidebar, the one host that sits beside a
    // logged-in account page, so the page action can be reviewed too.
    ...(answer==='open'?{readPage:async()=>({text:'Synthetic balances from the open page',host:'accounts.example',title:'',trimmed:0,tables:1})}:{}),
    remote:async(token,path)=>path.endsWith('/finance-intake')?read:({connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]})});
  // The open state also stands in for arriving at Finance because the tab beside
  // the panel is an account site the owner is already signed in to.
  if(site)tool.site(site);
  // The pane a preview runs in reports itself hidden, which is exactly when the
  // gate declines to raise a sheet, so each state is driven from its button.
  host.querySelector('.vault-gate button')?.click();
}
