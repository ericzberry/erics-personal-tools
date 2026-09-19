// The ledger. Validation is shared with the Worker, so every rule here applies
// to a figure however it arrives.
//
// What is kept is deliberately small. A brokerage page names dozens of things —
// eight brokered CDs, four funds, a sweep account, a stock plan's potential
// value — and almost none of it is worth storing. The question the ledger
// answers is how much is in stocks, in bonds and in cash, in each portfolio, on
// a date. So a stored row is four numbers: portfolio, asset class, date, cents.
// The words live in the registries below and are written once, not copied onto
// every entry — nothing in D1 spells out "WSTRN ALLIANCE PHOENIX AZ CD 4.05%
// 10/30/2026", and a year of weekly figures for six classes is a few thousand
// integers rather than a few thousand sentences.
//
// Three constraints carry over unchanged:
//  - Money is never guessed. A portfolio states its own currency, and
//    currencies are reported side by side and never converted.
//  - A figure is keyed by its as-of date: one amount per portfolio, class and
//    date. Saving that key again replaces it, which makes the write idempotent,
//    so a change queued offline and revalidated by the Worker cannot duplicate
//    an entry.
//  - AI reads and labels; the device adds up. No total in this ledger was
//    computed anywhere but here.
const fail=message=>{throw Object.assign(Error(message),{status:400});};

// The categorizations. A code is what is stored; the label is what is shown.
// Codes are permanent — renaming a label is free, reusing a code is not.
export const UNCLASSIFIED=9;
export const ASSET_CLASSES=[
  {code:1,id:'stocks',label:'Stocks',side:'asset'},
  {code:2,id:'bonds',label:'Bonds',side:'asset'},
  {code:3,id:'cash',label:'Cash',side:'asset'},
  {code:4,id:'pe',label:'Private equity',side:'asset'},
  {code:5,id:'vc',label:'Venture capital',side:'asset'},
  {code:6,id:'hedge',label:'Hedge funds',side:'asset'},
  {code:7,id:'property',label:'Real estate',side:'asset'},
  {code:8,id:'other',label:'Other',side:'asset'},
  // Value that is here but not yet split by class — an account total read off a
  // page that never said how it is invested. It is a class like any other and
  // adds up like any other; the name is what asks to be corrected.
  {code:UNCLASSIFIED,id:'unclassified',label:'Unclassified',side:'asset'},
  {code:21,id:'mortgage',label:'Mortgage',side:'liability'},
  {code:22,id:'loan',label:'Loan',side:'liability'},
  {code:23,id:'credit',label:'Credit',side:'liability'}
];
// How a portfolio is registered — the other thing worth knowing about a figure
// and the other thing not worth retyping. It is one code, not a sentence.
export const REGISTRATIONS=[
  {code:1,id:'taxable',label:'Taxable'},
  {code:2,id:'ira',label:'IRA'},
  {code:3,id:'roth',label:'Roth IRA'},
  {code:4,id:'401k',label:'401(k)'},
  {code:5,id:'trust',label:'Trust'},
  {code:6,id:'entity',label:'Entity'},
  // A minor's money, held for them by an adult. It is taxable, but it is not
  // the holder's own, and a breakdown that says so is the reason it is its own
  // code rather than a taxable portfolio with a child's name on it.
  {code:7,id:'custodial',label:'Custodial'}
];
export const STALE_DAYS=90;
export const MAX_VALUE=1e12;
export const MAX_DATES=240;
export const MAX_PORTFOLIOS=200;
export const assetClass=code=>ASSET_CLASSES.find(entry=>entry.code===Number(code))||null;
export const classById=id=>ASSET_CLASSES.find(entry=>entry.id===id)||null;
export const classLabel=code=>assetClass(code)?.label||`Class ${code}`;
export const classSide=code=>assetClass(code)?.side||'asset';
export const registration=code=>REGISTRATIONS.find(entry=>entry.code===Number(code))||null;
export const registrationById=id=>REGISTRATIONS.find(entry=>entry.id===id)||null;
export const registrationLabel=code=>registration(code)?.label||'';

// Names compared the way a person would compare them: case, punctuation and
// spacing carry no meaning here, so "Charles Schwab", "Schwab Bank" and a bare
// "Schwab" all reduce to the same key.
export const matchKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');

// Whose holding it is, when the institution already settles that. Titling is a
// standing fact about where an account is held — everything at Schwab is held
// in the Eric and Ariana Berry Estate — and not something a statement restates
// on every page. No reading can be relied on to supply it, and none should: the
// model that reads a page is told never to guess an owner, because a guessed
// one is worse than a blank. So the answer is kept here, once, and a reading
// that has to name a portfolio names it from here rather than from the page.
//
// Registration can override the title, because law does. An IRA is registered
// to one person and cannot sit inside a joint estate, so the same institution
// answers differently for a retirement account than for a taxable one.
//
// `institution` is the one spelling this application uses for the place. A page
// may call itself Charles Schwab or Schwab Bank; both match, and both are
// recorded as Schwab.
//
// Some places hold one title and some hold several. Everything at Schwab is the
// estate's, so Schwab answers with one name. Chase is a single sign-on over a
// whole family structure — a joint account, several irrevocable trusts, an LLC
// and a child's account each sit behind it — so it answers with a roster, and
// the account in front of the reader says which of them it is. A place with a
// roster has no default title: an account whose holder is not on the list is
// filed on its own rather than joined to somebody else's portfolio, because a
// trust's balance added into the joint estate is the one mistake here that
// nobody can see afterwards.
export const ACCOUNT_TITLES=[
  {institution:'Schwab',match:['schwab'],owner:'Eric and Ariana Berry Estate',
    byRegistration:{ira:'Eric Berry',roth:'Eric Berry','401k':'Eric Berry'}},
  {institution:'Chase',match:['chase','jpmorgan','jpmc'],holders:[
    {owner:'Eric and Ariana Berry Estate',registration:'taxable',match:['ericandariana','ericariana','joint']},
    {owner:'Berry 2020 Descendants’ Irrevocable Trust',registration:'trust',match:['berry2020','2020descendants','descendants']},
    {owner:'Berry AE 21 Irrevocable Trust',registration:'trust',match:['berryae21','ae21']},
    {owner:'Celsie LLC',registration:'entity',match:['celsie']},
    {owner:'Maisie Ava Berry',registration:'custodial',match:['maisie']},
    {owner:'Celeste Arabella Berry',registration:'custodial',match:['celeste','arabella']}
  ]}
];
export const titledAccount=institution=>{
  const key=matchKey(institution);
  return (key&&ACCOUNT_TITLES.find(title=>title.match.some(name=>key.includes(name))))||null;
};
export const titledOwner=(institution,registrationId='')=>{
  const entry=titledAccount(institution);
  return entry?(entry.byRegistration?.[registrationId]??entry.owner??''):'';
};
// Which of an institution's titles this account is. The fragments are matched
// the way every other name here is — case, punctuation and spacing carry no
// meaning — so each one has to be distinctive: every title in the Chase roster
// contains "Berry", and none of them is found by it. The longest fragment that
// appears wins, so a name contained in another name cannot take its accounts.
export function titledHolder(institution,said){
  const entry=titledAccount(institution),key=matchKey(said);
  if(!entry?.holders?.length||!key)return null;
  return entry.holders
    .flatMap(holder=>holder.match.filter(name=>key.includes(name)).map(name=>({holder,length:name.length})))
    .sort((a,b)=>b.length-a.length)[0]?.holder||null;
}
// Does this place hold accounts for more than one title? Where it does, an
// account nobody recognized keeps its own name instead of falling into the one
// portfolio that happens to be registered the same way.
export const holdsManyTitles=institution=>!!titledAccount(institution)?.holders?.length;
// A title that states its own registration. A trust is a trust and an LLC is an
// entity wherever they are read, so a holder the roster does not name still
// lands beside its own kind rather than in the taxable pile.
const TRUST=/\b(trust|irrevocable|revocable)\b/i;
const ENTITY=/\b(llc|lp|llp|inc|corp|ltd)\b/i;
const CUSTODIAL=/\b(utma|ugma|custodial|custodian)\b/i;
export const registrationFromName=name=>registrationById(
  CUSTODIAL.test(name||'')?'custodial':TRUST.test(name||'')?'trust':ENTITY.test(name||'')?'entity':'')||null;
// The name to record for a place, whatever the page in front of the owner calls
// it. One institution, one spelling.
export const institutionName=institution=>titledAccount(institution)?.institution||String(institution||'').trim().slice(0,120);

const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
const amount=(value,label)=>{
  if(!['number','string'].includes(typeof value)||(typeof value==='string'&&!value.trim())||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>MAX_VALUE)fail(`Enter a valid ${label} between 0 and ${MAX_VALUE.toLocaleString('en-US')}.`);
  // Two decimal places: money, not a float with a tail. Cents are what D1 holds.
  return Math.round(Number(value)*100)/100;
};
const counting=(value,label,max)=>{
  const number=Number(value);
  if(!Number.isInteger(number)||number<1||number>max)fail(`Enter ${label}.`);
  return number;
};
export const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const date=(value,label,required=false)=>{
  const clean=text(value??'',10,label,required);
  if(clean&&!isDate(clean))fail(`Enter a valid ${label} as YYYY-MM-DD.`);
  return clean;
};
// A date stored as one number rather than ten characters, and still readable in
// a raw query: 2026-09-19 is 20260919, which sorts and compares like the text.
export const dateNumber=value=>Number(String(value).replace(/-/g,''));
export const dateText=value=>{const digits=String(value).padStart(8,'0');return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;};
export const toCents=value=>Math.round(Number(value)*100);
export const fromCents=value=>Math.round(Number(value))/100;

// Two kinds of row share one record stream, so the offline queue, the conflict
// rules and the Worker's routes stay exactly one of each. A portfolio is
// addressed by `p3`; a figure by the three numbers that identify it.
export const PORTFOLIO_ID=/^p([1-9]\d{0,3})$/;
export const MARK_ID=/^([1-9]\d{0,3})-(\d{1,2})-(\d{8})$/;
export const portfolioRef=number=>`p${number}`;
export const markRef=mark=>`${mark.portfolio}-${mark.class}-${dateNumber(mark.asOf)}`;
export const recordRef=record=>record.row==='portfolio'?portfolioRef(record.number):markRef(record);
export function parseRef(ref){
  const portfolio=PORTFOLIO_ID.exec(ref||'');
  if(portfolio)return {row:'portfolio',number:Number(portfolio[1])};
  const mark=MARK_ID.exec(ref||'');
  if(!mark)return null;
  return {row:'mark',portfolio:Number(mark[1]),class:Number(mark[2]),asOf:dateText(mark[3])};
}

export function normalizeFinance(input,previous={}){
  const get=key=>input[key]??previous[key];
  const row=text(get('row')??'mark',10,'a row type',true);
  if(row==='portfolio'){
    const kind=Number(get('kind'));
    if(!registration(kind))fail('Choose how this portfolio is registered.');
    const currency=text(get('currency')??'USD',3,'a currency code',true).toUpperCase();
    if(!/^[A-Z]{3}$/.test(currency))fail('Enter a three-letter currency code, such as USD.');
    return {row:'portfolio',number:counting(get('number'),'a portfolio number',MAX_PORTFOLIOS),name:text(get('name'),80,'a portfolio name',true),kind,currency};
  }
  if(row!=='mark')fail('Unknown ledger row.');
  const cls=Number(get('class'));
  if(!assetClass(cls))fail('Choose an asset class.');
  return {row:'mark',portfolio:counting(get('portfolio'),'a portfolio number',MAX_PORTFOLIOS),
    class:cls,asOf:date(get('asOf'),'as-of date',true),amount:amount(get('amount'),'amount')};
}

// Records still queued for deletion, or waiting on a conflict decision, are left
// out of every total: a figure nobody has agreed on should not move net worth.
const counted=records=>records.filter(record=>!record.deleting&&!record.conflict);
export const portfoliosOf=records=>counted(records).filter(record=>record.row==='portfolio').sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
export const marksOf=records=>counted(records).filter(record=>record.row==='mark');
const sum=values=>Math.round(values.reduce((total,value)=>total+value,0)*100)/100;
const byTotal=(a,b)=>Math.abs(b.total)-Math.abs(a.total)||a.label.localeCompare(b.label);

// A step function: on any date a portfolio holds whatever its most recent
// figure on or before that date says it holds, per class, and nothing before
// its first one. Interpolating between figures would report amounts that were
// never observed.
export function heldOn(marks,when){
  const newest=new Map();
  for(const mark of marks){
    if(when&&mark.asOf>when)continue;
    const key=`${mark.portfolio}-${mark.class}`;
    const current=newest.get(key);
    if(!current||mark.asOf>current.asOf)newest.set(key,mark);
  }
  // Every class counts, including Unclassified. No figure is ever quietly
  // dropped from a total: a class that is stale says so by its date, and the
  // way to stop counting one is to mark it zero, which is visible in history.
  return [...newest.values()];
}
export const signed=mark=>classSide(mark.class)==='liability'?-mark.amount:mark.amount;

export function financeCurrencies(records){
  const counts=new Map();
  for(const portfolio of portfoliosOf(records))counts.set(portfolio.currency||'USD',(counts.get(portfolio.currency||'USD')||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([currency,count])=>({currency,count}));
}

// Totals for one currency. Currencies are never combined: without a rate source
// this application can defend, a single cross-currency net worth would be
// invented rather than calculated.
export function financeSummary(records,{currency='USD',today=new Date().toISOString().slice(0,10)}={}){
  const portfolios=portfoliosOf(records).filter(portfolio=>(portfolio.currency||'USD')===currency);
  const mine=new Map(portfolios.map(portfolio=>[portfolio.number,portfolio]));
  const live=heldOn(marksOf(records).filter(mark=>mine.has(mark.portfolio)));
  const assets=live.filter(mark=>classSide(mark.class)==='asset');
  const liabilities=live.filter(mark=>classSide(mark.class)==='liability');
  const group=(list,key,label)=>{
    const groups=new Map();
    for(const mark of list){
      const id=key(mark);
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(mark);
    }
    return [...groups].map(([id,items])=>({id,label:label(id),total:sum(items.map(signed)),count:items.length})).sort(byTotal);
  };
  // Staleness is a portfolio's question, not a class's: a ledger where cash was
  // marked last week and stocks last year is one portfolio to go and look at.
  const stale=portfolios.map(portfolio=>{
    const dates=live.filter(mark=>mark.portfolio===portfolio.number).map(mark=>mark.asOf).sort();
    return {...portfolio,asOf:dates.at(-1)||''};
  }).filter(portfolio=>!portfolio.asOf||Date.parse(today)-Date.parse(portfolio.asOf)>STALE_DAYS*86400000)
    .sort((a,b)=>(a.asOf||'').localeCompare(b.asOf||''));
  return {
    currency,portfolios:portfolios.length,figures:live.length,
    assets:sum(assets.map(mark=>mark.amount)),
    liabilities:sum(liabilities.map(mark=>mark.amount)),
    net:sum(live.map(signed)),
    byClass:group(live,mark=>mark.class,classLabel),
    byPortfolio:group(live,mark=>mark.portfolio,id=>mine.get(id)?.name||'—'),
    byRegistration:group(live,mark=>mine.get(mark.portfolio)?.kind,registrationLabel),
    stale
  };
}

export function netWorthSeries(records,{currency='USD'}={}){
  const mine=new Set(portfoliosOf(records).filter(portfolio=>(portfolio.currency||'USD')===currency).map(portfolio=>portfolio.number));
  const marks=marksOf(records).filter(mark=>mine.has(mark.portfolio));
  const dates=[...new Set(marks.map(mark=>mark.asOf))].sort();
  return dates.map(asOf=>{
    const live=heldOn(marks,asOf);
    return {
      asOf,figures:live.length,
      assets:sum(live.filter(mark=>classSide(mark.class)==='asset').map(mark=>mark.amount)),
      liabilities:sum(live.filter(mark=>classSide(mark.class)==='liability').map(mark=>mark.amount)),
      net:sum(live.map(signed))
    };
  });
}

// The ledger as it is read: each portfolio, with its live figure per class and
// the date that figure was observed. This is what the list shows, and it is
// where a class's own history is reached from.
export function groupFinanceRecords(records){
  const marks=marksOf(records);
  return portfoliosOf(records).map(portfolio=>{
    const mine=marks.filter(mark=>mark.portfolio===portfolio.number);
    const rows=[...new Set(mine.map(mark=>mark.class))]
      .map(cls=>{
        const history=mine.filter(mark=>mark.class===cls).sort((a,b)=>b.asOf.localeCompare(a.asOf));
        return {class:cls,label:classLabel(cls),side:classSide(cls),current:history[0],history};
      })
      .sort((a,b)=>ASSET_CLASSES.findIndex(entry=>entry.code===a.class)-ASSET_CLASSES.findIndex(entry=>entry.code===b.class));
    return {portfolio,rows,total:sum(rows.map(row=>signed(row.current)))};
  });
}

// What Needs attention asks of the ledger: a portfolio nobody has marked in a
// season, named once rather than once per class.
export function financeAttention(records,{today=new Date().toISOString().slice(0,10)}={}){
  return financeCurrencies(records).flatMap(({currency})=>financeSummary(records,{currency,today}).stale)
    .map(portfolio=>({id:portfolioRef(portfolio.number),name:portfolio.name,asOf:portfolio.asOf}));
}

// AI reads pasted text into labelled readings and nothing more: it never sees
// the ledger, never picks the portfolio a figure belongs to, and never adds two
// numbers together. A malformed reading is dropped so one bad row cannot
// discard the rest.
export function parseFinanceUpdates(value){
  if(!value||typeof value!=='object')throw Error('AI did not return any readable figures. Add more detail, or enter the figure by hand.');
  const list=Array.isArray(value.readings)?value.readings.slice(0,120):[];
  const readings=list.flatMap(draft=>{
    try{
      if(!draft||typeof draft!=='object')return [];
      const asOf=isDate(draft.asOf)?draft.asOf:'';
      if(!asOf)return [];
      const scope=['account','holding','all'].includes(draft.scope)?draft.scope:'account';
      return [{
        label:text(draft.label??'',120,'a label',true),
        account:text(draft.account??'',120,'an account'),
        class:classById(draft.class)?.code??UNCLASSIFIED,
        registration:registrationById(draft.registration)?.id||'',
        scope,value:amount(draft.value,'value'),asOf,
        confidence:['low','medium','high'].includes(draft.confidence)?draft.confidence:'low',
        reason:text(draft.reason??'',400,'an explanation')
      }];
    }catch{return [];}
  });
  const unread=text(value.unread??'',800,'the unread note');
  if(!readings.length&&!unread)throw Error('AI did not find any figures in that text. Add more detail, or enter the figure by hand.');
  return {readings,unread};
}

// Turning what was read into what is kept. This is the whole point of the
// ledger's shape, and it happens here, on the device, against portfolios AI
// never sees.
//
// A page states two kinds of figure and they must not be added together: an
// account's own total, and the holdings inside it. Holdings are used only when
// they reconcile with the account total that covers them — a page listing three
// brokered CDs beside a $1.6M net account value is not telling you the account
// holds $300. When they do not reconcile, the account total is kept whole, as
// an unsplit figure, and the split is left for a page that shows all of it.
const RECONCILE=0.01;
const accountKey=reading=>matchKey(reading.account)||matchKey(reading.label);
// Read at a bank, but not a bank balance. One sign-on at Chase covers the
// checking account and the managed portfolio beside it, and only one of those
// is cash, so an account that names itself an investment keeps the class the
// reading gave it.
const INVESTED=/\b(invest\w*|brokerage|securities|managed|advisory|portfolio|ira|roth|401\s*\(?k|529|annuity|wealth)\b/i;
export function foldReadings(readings,portfolios,{institution='',defaultClass=null,today=new Date().toISOString().slice(0,10)}={}){
  // A site says what it is: a bank's account total is cash whether or not the
  // page uses the word. A reading that did classify itself is never overridden,
  // and neither is an account whose own name says it holds investments.
  const classify=(reading,said='')=>reading.class===UNCLASSIFIED&&defaultClass&&!INVESTED.test(said)?defaultClass:reading.class;
  const notes=[],usable=readings.filter(reading=>reading.scope!=='all');
  if(usable.length<readings.length)notes.push('A total across accounts was left out; the accounts it covers are counted individually.');
  const accounts=new Map();
  for(const reading of usable){
    const key=accountKey(reading);
    if(!accounts.has(key))accounts.set(key,{name:reading.account||reading.label,totals:[],holdings:[]});
    accounts.get(key)[reading.scope==='holding'?'holdings':'totals'].push(reading);
  }
  // A portfolio is chosen, never invented on a hunch: an account says how it is
  // registered, and the institution says what a new portfolio would be called.
  const next=()=>Math.max(0,...portfolios.map(portfolio=>portfolio.number),...proposed.map(portfolio=>portfolio.number))+1;
  const proposed=[];
  const resolve=(readings,said='')=>{
    // Whose account this is. Where the institution holds one title it answers
    // for every account; where it holds several, the account's own name says
    // which of them, and that answer outranks everything below it.
    const holder=titledHolder(institution,said);
    const stated=registrationById(readings.find(reading=>reading.registration)?.registration||'');
    // The registration the page states wins — an IRA is registered to one
    // person by law, whatever else the account is called — then the roster's,
    // then what the title itself says, and taxable only when nothing does.
    const kind=stated||(holder&&registrationById(holder.registration))||registrationFromName(said)||registrationById('taxable');
    // The institution settles the title, and the registration settles which
    // title: the estate holds what is taxable, a person holds the IRA.
    const owner=holder?.owner||titledOwner(institution,kind.id);
    // A portfolio the account names outright. Several portfolios answering to
    // one name is not a match but a coin flip — six of these names are "Berry
    // something" — so the most specific name wins and a tie falls through to
    // the titling rather than picking one of them.
    const named=readings.map(reading=>matchKey(reading.account)).filter(Boolean);
    const alike=portfolios.filter(portfolio=>named.some(key=>key.includes(matchKey(portfolio.name))||matchKey(portfolio.name).includes(key)))
      .sort((a,b)=>matchKey(b.name).length-matchKey(a.name).length);
    const byName=alike.length===1||(alike.length>1&&matchKey(alike[0].name).length>matchKey(alike[1].name).length)?alike[0]:null;
    // A roster answer outranks that: a portfolio whose name merely appears
    // inside the account's is not the child's account because both say Berry.
    if(byName&&!holder)return byName;
    const titled=owner?[...portfolios,...proposed].find(portfolio=>matchKey(portfolio.name)===matchKey(owner)&&portfolio.kind===kind.code):null;
    if(titled)return titled;
    // An institution that holds one title can answer for an account that named
    // nobody. One that holds several cannot, so its unrecognized account starts
    // its own portfolio under the name the page gave it — visible, and renamed
    // in one press — rather than disappearing into the estate.
    const byKind=portfolios.filter(portfolio=>portfolio.kind===kind.code);
    if(!owner&&!holdsManyTitles(institution)&&byKind.length===1)return byKind[0];
    const name=owner||readings[0]?.account||kind.label;
    const already=proposed.find(portfolio=>matchKey(portfolio.name)===matchKey(name)&&portfolio.kind===kind.code);
    if(already)return already;
    const fresh={row:'portfolio',number:next(),name:String(name).slice(0,80),kind:kind.code,currency:'USD',isNew:true};
    proposed.push(fresh);
    return fresh;
  };
  const figures=new Map();
  const add=(portfolio,cls,asOf,value,from)=>{
    const key=`${portfolio.number}-${cls}-${asOf}`;
    // A figure carries enough of its portfolio to make it: a proposal that
    // lost the registration would be filed as an ordinary taxable account.
    const current=figures.get(key)||{portfolio:portfolio.number,class:cls,asOf,amount:0,from:[],
      name:portfolio.name,kind:portfolio.kind,currency:portfolio.currency||'USD',isNew:!!portfolio.isNew};
    figures.set(key,{...current,amount:Math.round((current.amount+value)*100)/100,from:[...current.from,...from]});
  };
  for(const account of accounts.values()){
    const inside=[...account.totals,...account.holdings];
    // Everything the page called this account, in one string: the name it was
    // grouped under and the labels of the figures inside it. That is what says
    // whose account it is and what it holds.
    const said=[account.name,...inside.map(reading=>reading.label)].filter(Boolean).join(' ');
    const portfolio=resolve(inside,said);
    // One account states one balance. A page that prints several account-level
    // figures for the same account — a current value and a net value — is
    // describing one balance twice, so the one that says it is the total wins.
    const stated=account.totals.sort((a,b)=>Number(/net|total/i.test(b.label))-Number(/net|total/i.test(a.label))||b.value-a.value)[0]||null;
    if(account.totals.length>1)notes.push(`${account.name}: ${account.totals.length} account-level figures were read and ${stated.label} was used.`);
    const holdings=account.holdings,held=sum(holdings.map(reading=>reading.value));
    const reconciles=holdings.length&&stated&&stated.value>0&&Math.abs(held-stated.value)<=stated.value*RECONCILE;
    if(holdings.length&&(reconciles||!stated)){
      for(const reading of holdings)add(portfolio,classify(reading,`${account.name} ${reading.label}`),reading.asOf,reading.value,[reading.label]);
      continue;
    }
    if(holdings.length&&stated)notes.push(`${account.name}: the ${holdings.length} holdings shown do not add up to the account total, so the total was kept whole rather than split by them.`);
    if(stated)add(portfolio,classify(stated,said),stated.asOf,stated.value,[stated.label]);
  }
  const marks=[...figures.values()].sort((a,b)=>a.portfolio-b.portfolio||a.class-b.class);
  return {marks,portfolios:proposed,notes,today};
}

// Retrofitting the ledger that came before. Until now a record was one account,
// carrying its type, institution, owner, currency, liquidity, ownership share,
// tags, notes and a JSON array of every figure ever filed for it. All of that
// reduces to a portfolio and a class — two codes — and the record's whole
// history comes across rather than only its newest figure.
export const LEGACY_CLASSES={bank:'cash',brokerage:'unclassified',retirement:'unclassified',
  private:'pe',business:'pe',realestate:'property',crypto:'other',vehicle:'other','other-asset':'other',
  mortgage:'mortgage',loan:'loan',credit:'credit','other-liability':'loan'};
// A brokerage or retirement account states a total and not what is inside it,
// so it arrives Unclassified rather than guessed into stocks. Reading the
// account's own page is what splits it, and until then the figure is counted in
// full under a name that asks to be corrected.
export function legacyRegistration(record){
  const name=`${record.name||''} ${record.notes||''}`;
  if(record.kind==='retirement')return registrationById(/roth/i.test(name)?'roth':/401\s*\(?\s*k/i.test(name)?'401k':'ira');
  return registrationFromName(record.owner||'')||registrationById('taxable');
}
// A portfolio is named by who holds it. The old ledger already wrote that on
// every record, so the migration follows it rather than re-deriving it; where a
// record has no owner the registry answers, per registration, which is how a
// retirement account ends up titled to a person and a taxable one to the
// estate. That is the whole consolidation: eight accounts in one estate are one
// estate, and the IRA beside them is its own.
export const legacyPortfolioName=(record,kind)=>
  String(record.owner||titledOwner(record.institution,kind.id)||record.institution||record.name||kind.label).slice(0,80);
const legacyHistory=record=>{
  try{
    const parsed=typeof record.history==='string'?JSON.parse(record.history||'[]'):(record.history||[]);
    const entries=(Array.isArray(parsed)?parsed:[]).filter(entry=>entry&&isDate(entry.asOf)&&Number.isFinite(Number(entry.value)));
    return entries.length?entries:(isDate(record.asOf)?[{asOf:record.asOf,value:Number(record.value)||0}]:[]);
  }catch{return isDate(record.asOf)?[{asOf:record.asOf,value:Number(record.value)||0}]:[];}
};
export function legacyLedger(records){
  const portfolios=[],figures=new Map(),moved=[];
  for(const record of records){
    const kind=legacyRegistration(record);
    const cls=classById(LEGACY_CLASSES[record.kind]||'other');
    const name=legacyPortfolioName(record,kind);
    const currency=String(record.currency||'USD').toUpperCase();
    let portfolio=portfolios.find(entry=>matchKey(entry.name)===matchKey(name)&&entry.kind===kind.code&&entry.currency===currency);
    if(!portfolio){portfolio={row:'portfolio',number:portfolios.length+1,name,kind:kind.code,currency};portfolios.push(portfolio);}
    const history=legacyHistory(record);
    for(const entry of history){
      // The ownership share weighted a partial interest. It is applied once,
      // here, rather than carried into a model that has no such field.
      const amount=Math.round(Number(entry.value)*(Number(record.ownership??100)/100)*100)/100;
      const key=`${portfolio.number}-${cls.code}-${entry.asOf}`;
      const current=figures.get(key);
      figures.set(key,{row:'mark',portfolio:portfolio.number,class:cls.code,asOf:entry.asOf,amount:Math.round(((current?.amount||0)+amount)*100)/100});
    }
    moved.push({from:record.name,institution:record.institution||'',legacyKind:record.kind,
      portfolio:portfolio.name,registration:kind.label,class:cls.label,dates:history.length});
  }
  return {portfolios,marks:[...figures.values()].sort((a,b)=>a.portfolio-b.portfolio||a.class-b.class||a.asOf.localeCompare(b.asOf)),moved};
}
