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
//
// One thing does not reduce to four numbers, and it is not made to. A direct
// investment in a fund, a company or an SPV is a named thing with a history of
// its own: what was committed, how much of that has been called, how much has
// come back, and what the last capital account statement says it is worth.
// Those four travel together or they say nothing — a value with no called
// capital beside it cannot tell you whether it is a win — so a position is its
// own pair of rows: a holding, which is the investment, and one dated capital
// account per statement. Its value still counts in its portfolio and its asset
// class exactly like any other figure, so nothing downstream has to know.
//
// A property is the second thing that does not reduce to four numbers, and it
// asks the same question in different words: what is the house worth, what is
// still owed on it, and what is therefore mine. A class total called Real
// estate can hold the first of those and none of the rest — two houses added
// together lose both addresses, and a mortgage filed beside them as a liability
// is attached to nothing in particular. So a property is its own pair of rows
// as well: the property, which is an address, and one dated valuation per
// reading. Its value counts under Real estate and its debt under Mortgage,
// which is how it reaches every total without anything downstream knowing that
// a house is not a brokerage account.
import {safePublicURL} from './public-url.js';
const fail=message=>{throw Object.assign(Error(message),{status:400});};

// The categorizations. A code is what is stored; the label is what is shown.
// Codes are permanent — renaming a label is free, reusing a code is not.
export const UNCLASSIFIED=9;
//
// Every asset class belongs to one of two groups, and the groups are the
// question actually being asked of the ledger: how much of this could be sold
// this week, and how much is locked up. Cash, stocks, bonds and crypto are
// liquid together — neither cash nor a coin is a security, but both answer the
// same question, and splitting them off would leave the heading meaning less
// than it says. Anything held through a vehicle, a property or a vesting
// schedule is illiquid. Only Unclassified belongs to neither, because value
// nobody has placed cannot be called either one; that is the whole of what the
// name means.
export const ASSET_CLASSES=[
  {code:1,id:'stocks',label:'Stocks',side:'asset',group:'liquid'},
  {code:2,id:'bonds',label:'Bonds',side:'asset',group:'liquid'},
  {code:3,id:'cash',label:'Cash',side:'asset',group:'liquid'},
  // One class for everything held through a fund. It was three — private
  // equity, venture capital, hedge funds — and the split asked a question the
  // owner does not ask: what is in funds, and what can be sold this week. A
  // commitment to a venture fund and one to a buyout fund behave the same way
  // in this ledger, and telling them apart cost a decision on every figure that
  // arrived. Code 4 is kept rather than replaced because every figure already
  // stored under it was private equity, which is a fund investment: the name
  // widens, so nothing already written becomes untrue.
  {code:4,id:'funds',label:'Fund investments',side:'asset',group:'illiquid'},
  {code:7,id:'property',label:'Real estate',side:'asset',group:'illiquid'},
  {code:8,id:'other',label:'Other',side:'asset',group:'illiquid'},
  // Value that is here but not yet placed at all — an account total read off a
  // page that never said what kind of account it is. It is a class like any
  // other and adds up like any other; the name is what asks to be corrected.
  // A securities account total is no longer one of these: it is marketable
  // securities whether or not the page split them, and Liquid securities says
  // that much truthfully without inventing a stocks-and-bonds split.
  {code:UNCLASSIFIED,id:'unclassified',label:'Unclassified',side:'asset',group:''},
  {code:10,id:'liquid',label:'Liquid securities',side:'asset',group:'liquid'},
  // A stock plan holds two different things under one account number, and only
  // one of them is worth a class. What has vested is ordinary marketable stock
  // that could be sold this week, so it is Liquid securities like any other;
  // what has not vested is a schedule, and nothing else in the list says so.
  // Code 11 was Vested stock for part of a day and is retired rather than
  // reused, because a code is what is stored.
  {code:12,id:'unvested',label:'Unvested stock',side:'asset',group:'illiquid'},
  // Coin, held at an exchange or in a wallet. It was filed under Other until
  // now, which is where a vehicle and a piece of furniture go: a balance at
  // Coinbase could not be told from either, and Other is the one class nobody
  // reads a number out of. It sells in a day like a listed share, so it is
  // liquid, and it is its own class because the thing an owner most wants to
  // know about it — how much of the pile is in coin — is exactly what being
  // filed with the furniture took away.
  {code:13,id:'crypto',label:'Crypto',side:'asset',group:'liquid'},
  {code:21,id:'mortgage',label:'Mortgage',side:'liability',group:''},
  {code:22,id:'loan',label:'Loan',side:'liability',group:''},
  {code:23,id:'credit',label:'Credit',side:'liability',group:''}
];
export const CLASS_GROUPS=[
  {id:'liquid',label:'Liquid securities'},
  {id:'illiquid',label:'Illiquid securities'}
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
// What a direct investment is. These three are the distinction the owner makes
// when he decides what he holds, so they are named the way he names them; the
// code is what is stored.
//
// What a document calls itself is kept apart from what the ledger files it as,
// because the two disagree often enough to matter. A vehicle sold as a fund is
// frequently a single-company SPV in a fund's paperwork, and the honest way to
// hold that is to record both: `vehicle` is the settled answer and `stated` is
// what the statement claimed. A position whose two differ says so on its own
// line rather than quietly picking one.
export const VEHICLES=[
  {code:1,id:'fund',label:'Direct Fund Investment',short:'Fund'},
  {code:2,id:'equity',label:'Direct Equity Investment',short:'Equity'},
  {code:3,id:'spv',label:'SPV Investment',short:'SPV'}
];
// Where a property's value came from. The Zestimate is the standing answer —
// it is public, it is dated, it costs nothing to look up, and it is the number
// the owner would reach for anyway — so anything else is a deliberate override
// and the row says which, because a figure somebody chose and a figure Zillow
// published are not the same kind of claim about a house.
export const VALUE_SOURCES=[
  {code:1,id:'zestimate',label:'Zestimate'},
  {code:2,id:'appraisal',label:'Appraisal'},
  {code:3,id:'sale',label:'Sale price'},
  {code:4,id:'owner',label:'Own estimate'}
];
export const STALE_DAYS=90;
export const MAX_VALUE=1e12;
export const MAX_DATES=240;
export const MAX_PORTFOLIOS=200;
export const MAX_HOLDINGS=400;
export const MAX_PROPERTIES=200;
// Venture capital and hedge funds, merged into Fund investments. The codes are
// retired rather than reused — a code is what is stored — and they resolve here
// so that a figure written before the merge reads as what it always was instead
// of as "Class 5". The marks table is migrated; a holding carries its class
// inside an encrypted blob that no SQL pass can reach, so this is the only
// thing standing between such a holding and a name nobody can read.
const MERGED_CLASSES={5:4,6:4};
export const canonicalClass=code=>MERGED_CLASSES[Number(code)]??Number(code);
export const assetClass=code=>ASSET_CLASSES.find(entry=>entry.code===canonicalClass(code))||null;
export const classById=id=>ASSET_CLASSES.find(entry=>entry.id===id)||null;
export const classLabel=code=>assetClass(code)?.label||`Class ${code}`;
export const classSide=code=>assetClass(code)?.side||'asset';
export const classGroup=code=>assetClass(code)?.group||'';
export const classGroupLabel=id=>CLASS_GROUPS.find(entry=>entry.id===id)?.label||'Unclassified';
export const registration=code=>REGISTRATIONS.find(entry=>entry.code===Number(code))||null;
export const registrationById=id=>REGISTRATIONS.find(entry=>entry.id===id)||null;
export const registrationLabel=code=>registration(code)?.label||'';
export const vehicleOf=code=>VEHICLES.find(entry=>entry.code===Number(code))||null;
export const vehicleById=id=>VEHICLES.find(entry=>entry.id===id)||null;
export const vehicleLabel=code=>vehicleOf(code)?.label||'';
export const vehicleShort=code=>vehicleOf(code)?.short||'';
export const valueSource=code=>VALUE_SOURCES.find(entry=>entry.code===Number(code))||null;
export const valueSourceById=id=>VALUE_SOURCES.find(entry=>entry.id===id)||null;
export const valueSourceLabel=code=>valueSource(code)?.label||'';
// The class a property's value counts under, and the class its debt counts
// under. Named once, here, so nothing downstream has to know which codes a
// house reaches the totals through.
export const PROPERTY_CLASS=7;
export const PROPERTY_DEBT_CLASS=21;
// A property's link is a page the ledger shows; a Zillow home-details page is
// one it can also read, because the Zestimate on it is published rather than
// stated and is the standing answer to what the house is worth. Which is which
// is settled here, beside the record that carries the link, so the reader and
// the hosts that offer the reading agree about it without either deciding.
export function zillowHome(link){
  try{
    const url=new URL(link||'');
    return url.protocol==='https:'&&/(^|\.)zillow\.com$/i.test(url.hostname)?url.href:'';
  }catch{return '';}
}

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
//
// One kind of answer is not a title at all. A sign-on can reach money that is
// not the owner's — a company he signs for rather than owns — and that has to
// be named here too, marked `ignore`. Saying nothing about it would not leave
// it out: an account no title claims starts a portfolio of its own, so silence
// files it under its own name instead of skipping it.
export const ACCOUNT_TITLES=[
  {institution:'Schwab',match:['schwab'],owner:'Eric and Ariana Berry Estate',
    byRegistration:{ira:'Eric Berry',roth:'Eric Berry','401k':'Eric Berry'}},
  // Where an institution's cards are titled. A card names a product, never a
  // holder, so nothing on it says whose debt it is — and unlike an asset, the
  // answer is not dangerous to settle once: every card behind this sign-on is
  // the couple's, and a business card in the roster below is matched by its
  // company's name before this is reached.
  {institution:'Chase',match:['chase','jpmorgan','jpmc'],
    cards:{owner:'Eric and Ariana Berry Estate',registration:'taxable'},holders:[
    // The joint accounts are titled three ways on the one sign-on — a nickname
    // that says Joint, and the two names written out in full — and all three
    // are the same estate. The full-name fragments are long on purpose: a
    // child's UTMA is titled to a parent as custodian, so "Ariana" on its own
    // would take that child's money into the estate.
    {owner:'Eric and Ariana Berry Estate',registration:'taxable',
      match:['ericandariana','ericariana','ericzberry','arianacooperberry','joint']},
    // Two irrevocable trusts made the same year, and only one word tells them
    // apart. "Berry 2020" was the family trust's match until it was also the
    // descendants' trust's, which put $4.7M of one into the other; neither
    // fragment names a year on its own any more.
    {owner:'Berry 2020 Irrevocable Family Trust',registration:'trust',
      match:['berry2020irrev','2020irrevfam','irrevocablefamilytrust']},
    {owner:'Berry 2020 Descendants’ Irrevocable Trust',registration:'trust',
      match:['2020descendants','descendants','berry20desc']},
    // The 2021 trust signs its accounts two ways: the trust's full title, and
    // SLAT on the accounts opened under it.
    {owner:'Berry AE 21 Irrevocable Trust',registration:'trust',match:['berryae21','ae21']},
    {owner:'Celsie LLC',registration:'entity',match:['celsie']},
    {owner:'Maisie Ava Berry',registration:'custodial',match:['maisie']},
    {owner:'Celeste Arabella Berry',registration:'custodial',match:['celeste','arabella']},
    // Not the owner's money. It answers to the same password and it is listed
    // beside everything else, which is precisely why it has to be named here:
    // an account nobody claims starts a portfolio of its own, so leaving this
    // one out of the roster files it rather than skipping it.
    {owner:'Bedford Bridge Capital, LLC',ignore:true,match:['bedfordbridge']}
  ]},
  // UBS holds the same family structure as Chase and abbreviates every title on
  // the way to the screen: the joint estate is "Joint Accounts", the two 2020
  // trusts are "Descendants Tst" and "Irrevocable Tst", and the 2021 trust is
  // "AE 2021 Trust". None of those is what the trust is called on its own
  // paperwork, and none of them contains a fragment the Chase roster would
  // recognize — so without this every account number on the page started a
  // portfolio of its own, and twenty-eight accounts arrived as twenty-eight new
  // portfolios with an account number in each name.
  //
  // The owners are spelled exactly as the existing portfolios are, because that
  // spelling is what folds these figures into the trusts already in the ledger
  // rather than beside them. "JT Liquidity" is the joint estate too: a second
  // heading over the same money, not a second holder.
  {institution:'UBS',match:['ubs'],holders:[
    {owner:'Eric and Ariana Berry Estate',registration:'taxable',
      match:['jointaccounts','jtliquidity']},
    {owner:'Berry 2020 Irrevocable Family Trust',registration:'trust',
      match:['irrevocabletst']},
    {owner:'Berry 2020 Descendants\u2019 Irrevocable Trust',registration:'trust',
      match:['descendantstst']},
    // Written out in full, because "ae21" does not appear in "AE 2021 Trust":
    // fragments are matched after spacing and punctuation are dropped, and
    // a-e-2-0-2-1 does not contain a-e-2-1.
    {owner:'Berry AE 21 Irrevocable Trust',registration:'trust',
      match:['ae2021trust']}
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
// A holder marked `ignore` answers the same way and is returned the same way;
// what is done about it is the fold's business, not this function's.
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
// A retirement account says so in its own name, and that outranks a reading
// that forgot to fill the field in. An IRA is registered to one person by law
// and cannot sit inside a joint estate, so "Traditional IRA -4144" must not
// depend on the model having also said "ira" to be filed as one. Roth is tested
// before IRA because a Roth IRA is both.
const ROTH=/\broth\b/i;
const IRA=/\b(ira|sep|simple)\b/i;
const WORKPLACE=/\b(401\s*\(?k\)?|403\s*\(?b\)?|457)\b/i;
export const registrationFromName=name=>registrationById(
  CUSTODIAL.test(name||'')?'custodial'
  :ROTH.test(name||'')?'roth'
  :WORKPLACE.test(name||'')?'401k'
  :IRA.test(name||'')?'ira'
  :TRUST.test(name||'')?'trust'
  :ENTITY.test(name||'')?'entity':'')||null;
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

// Six kinds of row share one record stream, so the offline queue, the conflict
// rules and the Worker's routes stay exactly one of each. A portfolio is
// addressed by `p3`; a figure by the three numbers that identify it; an
// investment by `h3`; one of its capital accounts by the investment and the
// date the statement was struck; a property by `r3`; and one of its valuations
// by the property and the date it was read. The prefixes keep them apart with
// no ambiguity to resolve: only a mark begins with a digit.
export const PORTFOLIO_ID=/^p([1-9]\d{0,3})$/;
export const MARK_ID=/^([1-9]\d{0,3})-(\d{1,2})-(\d{8})$/;
export const HOLDING_ID=/^h([1-9]\d{0,3})$/;
export const CAPITAL_ID=/^h([1-9]\d{0,3})-(\d{8})$/;
export const PROPERTY_ID=/^r([1-9]\d{0,3})$/;
export const VALUATION_ID=/^r([1-9]\d{0,3})-(\d{8})$/;
export const portfolioRef=number=>`p${number}`;
export const markRef=mark=>`${mark.portfolio}-${mark.class}-${dateNumber(mark.asOf)}`;
export const holdingRef=number=>`h${number}`;
export const capitalRef=entry=>`h${entry.holding}-${dateNumber(entry.asOf)}`;
export const propertyRef=number=>`r${number}`;
export const valuationRef=entry=>`r${entry.property}-${dateNumber(entry.asOf)}`;
export const recordRef=record=>record.row==='portfolio'?portfolioRef(record.number)
  :record.row==='holding'?holdingRef(record.number)
  :record.row==='capital'?capitalRef(record)
  :record.row==='property'?propertyRef(record.number)
  :record.row==='valuation'?valuationRef(record)
  :markRef(record);
export function parseRef(ref){
  const portfolio=PORTFOLIO_ID.exec(ref||'');
  if(portfolio)return {row:'portfolio',number:Number(portfolio[1])};
  const holding=HOLDING_ID.exec(ref||'');
  if(holding)return {row:'holding',number:Number(holding[1])};
  const capital=CAPITAL_ID.exec(ref||'');
  if(capital)return {row:'capital',holding:Number(capital[1]),asOf:dateText(capital[2])};
  const property=PROPERTY_ID.exec(ref||'');
  if(property)return {row:'property',number:Number(property[1])};
  const valuation=VALUATION_ID.exec(ref||'');
  if(valuation)return {row:'valuation',property:Number(valuation[1]),asOf:dateText(valuation[2])};
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
  // The investment itself: which portfolio holds it, what it is called, what
  // kind of vehicle it is, and which asset class its value counts under. No
  // figure lives here — a name that changed should not move a total.
  if(row==='holding'){
    const kind=Number(get('vehicle'));
    if(!vehicleOf(kind))fail('Choose whether this is a fund, an equity or an SPV investment.');
    const cls=Number(get('class'));
    if(!assetClass(cls)||classSide(cls)!=='asset')fail('Choose an asset class for this investment.');
    const claimed=Number(get('stated')??0);
    return {row:'holding',number:counting(get('number'),'an investment number',MAX_HOLDINGS),
      portfolio:counting(get('portfolio'),'a portfolio number',MAX_PORTFOLIOS),
      name:text(get('name'),120,'an investment name',true),vehicle:kind,class:cls,
      stated:vehicleOf(claimed)?claimed:0};
  }
  // One capital account statement. Contributions and distributions are held
  // inception-to-date rather than per period, because that is what a statement
  // states and because a quarter that never arrives cannot then corrupt a
  // running total — the newest row answers on its own, and a period's movement
  // is the difference between two rows.
  if(row==='capital'){
    return {row:'capital',holding:counting(get('holding'),'an investment number',MAX_HOLDINGS),
      asOf:date(get('asOf'),'as-of date',true),
      value:amount(get('value'),'capital account value'),
      contributed:amount(get('contributed')??0,'the amount funded to date'),
      distributed:amount(get('distributed')??0,'the amount returned to date'),
      commitment:amount(get('commitment')??0,'the commitment')};
  }
  // The property itself: which portfolio holds it, the address, and the page
  // its value is published on. No figure lives here — an address corrected
  // should not move a total — and no asset class either: a house is real
  // estate, and offering the choice would only be offering a way to be wrong.
  if(row==='property'){
    const link=text(get('link')??'',300,'a link to the property page');
    return {row:'property',number:counting(get('number'),'a property number',MAX_PROPERTIES),
      portfolio:counting(get('portfolio'),'a portfolio number',MAX_PORTFOLIOS),
      name:text(get('name'),160,'the property address',true),
      // A link that is not one is dropped rather than refused: the address is
      // the record, and a mistyped URL should not stop a house being saved.
      link:safePublicURL(link)||''};
  }
  // One dated reading of what a property is worth and what is still owed on it.
  // The two travel together for the same reason a capital account's four do: a
  // value with no debt beside it cannot say what any of it is worth to the
  // owner, and a mortgage filed on its own is attached to no particular house.
  if(row==='valuation'){
    const source=Number(get('source')??VALUE_SOURCES[0].code);
    if(!valueSource(source))fail('Choose where this value came from.');
    return {row:'valuation',property:counting(get('property'),'a property number',MAX_PROPERTIES),
      asOf:date(get('asOf'),'as-of date',true),
      value:amount(get('value'),'the market value'),
      debt:amount(get('debt')??0,'the amount still owed'),source};
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
export const holdingsOf=records=>counted(records).filter(record=>record.row==='holding').sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
export const capitalOf=records=>counted(records).filter(record=>record.row==='capital');
export const propertiesOf=records=>counted(records).filter(record=>record.row==='property').sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
export const valuationsOf=records=>counted(records).filter(record=>record.row==='valuation');
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

// A position is an investment and whichever of its capital accounts is newest
// on or before a date — the same step function the class figures follow, for
// the same reason: a statement states a quarter, and nothing happened between
// two of them that anybody observed.
//
// An investment with no statement yet is still a position. Registering one
// before its first capital account is how a commitment gets recorded on the day
// it is signed, and it counts as nothing until a figure says otherwise.
export function positionsOn(records,when){
  const statements=capitalOf(records);
  return holdingsOf(records).map(holding=>{
    const history=statements.filter(entry=>entry.holding===holding.number&&(!when||entry.asOf<=when))
      .sort((a,b)=>b.asOf.localeCompare(a.asOf));
    const current=history[0]||null;
    const commitment=current?.commitment||0,contributed=current?.contributed||0;
    const distributed=current?.distributed||0,value=current?.value||0;
    return {holding,current,history,commitment,contributed,distributed,value,
      // What is still owed on the commitment. A fund that has called more than
      // it committed is at zero rather than at a negative obligation.
      unfunded:Math.max(0,Math.round((commitment-contributed)*100)/100),
      // What a dollar put in is worth now, counting what has already come back.
      // Undefined until something was actually put in — a multiple of nothing
      // is not infinity, it is a question nobody has asked yet.
      multiple:contributed>0?Math.round(((value+distributed)/contributed)*100)/100:null,
      // Recorded as one kind and sold as another. Kept rather than resolved:
      // which one is true is the owner's call, not this function's.
      disputed:!!holding.stated&&holding.stated!==holding.vehicle};
  });
}
// A position counts exactly like a class figure, because that is what it is —
// a named one. Everything that groups, signs, totals or dates a figure works on
// it unchanged, which is why positions needed no second set of any of that.
const positionFigure=position=>({portfolio:position.holding.portfolio,class:canonicalClass(position.holding.class),
  asOf:position.current.asOf,amount:position.value,holding:position.holding.number});
const livePositions=(records,mine,when)=>positionsOn(records,when)
  .filter(position=>position.current&&mine.has(position.holding.portfolio));

// A property and whichever of its valuations is newest on or before a date —
// the same step function everything else here follows, for the same reason: a
// Zestimate is a reading taken on a day, and nothing observable happened to the
// house between two of them.
//
// A property with no valuation yet is still a property. Recording the address
// the day it is bought is how it gets into the ledger before anyone has looked
// up what it is worth, and it counts as nothing until a figure says otherwise.
export function propertiesOn(records,when){
  const readings=valuationsOf(records);
  return propertiesOf(records).map(property=>{
    const history=readings.filter(entry=>entry.property===property.number&&(!when||entry.asOf<=when))
      .sort((a,b)=>b.asOf.localeCompare(a.asOf));
    const current=history[0]||null;
    const value=current?.value||0,debt=current?.debt||0;
    return {property,current,history,value,debt,source:current?.source||0,
      // What is actually the owner's. The whole reason the debt is kept on the
      // property rather than filed beside it: a house worth twice its mortgage
      // and a house worth a tenth more than its mortgage are the same line in a
      // Real estate total and nothing like each other here.
      equity:Math.round((value-debt)*100)/100};
  });
}
// A property counts as two figures, because it is two: what the house is worth
// under Real estate, and what is owed on it under Mortgage. Both are ordinary
// figures from there on, so the grouping, the signing, the totals and the
// series all work on them unchanged — a mortgage is negative because its class
// says so, not because anything here decided it.
const propertyFigures=entry=>[
  {portfolio:entry.property.portfolio,class:PROPERTY_CLASS,asOf:entry.current.asOf,amount:entry.value,property:entry.property.number},
  ...(entry.debt?[{portfolio:entry.property.portfolio,class:PROPERTY_DEBT_CLASS,asOf:entry.current.asOf,amount:entry.debt,property:entry.property.number}]:[])
];
const liveProperties=(records,mine,when)=>propertiesOn(records,when)
  .filter(entry=>entry.current&&mine.has(entry.property.portfolio));

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
  const held=positionsOn(records).filter(position=>mine.has(position.holding.portfolio));
  const owned=propertiesOn(records).filter(entry=>mine.has(entry.property.portfolio));
  const live=[...heldOn(marksOf(records).filter(mark=>mine.has(mark.portfolio))),
    ...held.filter(position=>position.current).map(positionFigure),
    ...owned.filter(entry=>entry.current).flatMap(propertyFigures)];
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
    // The question the class list cannot answer on its own: how much of this
    // could be sold this week. Liabilities have no liquidity to speak of and
    // are left out of it rather than given a heading of their own.
    byGroup:group(live.filter(mark=>classSide(mark.class)==='asset'),mark=>classGroup(mark.class),classGroupLabel),
    byPortfolio:group(live,mark=>mark.portfolio,id=>mine.get(id)?.name||'—'),
    byRegistration:group(live,mark=>mine.get(mark.portfolio)?.kind,registrationLabel),
    // What the class breakdown cannot say about a private position: how much of
    // the commitment has actually been called, how much has come back, and what
    // is still owed. A value on its own does not answer any of the three.
    positions:{
      count:held.length,
      committed:sum(held.map(position=>position.commitment)),
      contributed:sum(held.map(position=>position.contributed)),
      distributed:sum(held.map(position=>position.distributed)),
      value:sum(held.map(position=>position.value)),
      unfunded:sum(held.map(position=>position.unfunded))
    },
    // What the class breakdown cannot say about a house: the two figures are
    // in two different classes, one of them negative, so nothing in the list
    // above puts them back together into what the property is worth to its
    // owner.
    properties:{
      count:owned.length,
      value:sum(owned.map(entry=>entry.value)),
      debt:sum(owned.map(entry=>entry.debt)),
      equity:sum(owned.map(entry=>entry.equity))
    },
    stale
  };
}

export function netWorthSeries(records,{currency='USD'}={}){
  const mine=new Set(portfoliosOf(records).filter(portfolio=>(portfolio.currency||'USD')===currency).map(portfolio=>portfolio.number));
  const marks=marksOf(records).filter(mark=>mine.has(mark.portfolio));
  // A capital account is a dated figure like any other, so the day a statement
  // was struck is a day the series has a point on.
  const held=new Set(holdingsOf(records).filter(holding=>mine.has(holding.portfolio)).map(holding=>holding.number));
  const statements=capitalOf(records).filter(entry=>held.has(entry.holding));
  // And so is a valuation: the day a Zestimate was read is a day the series has
  // a point on.
  const owned=new Set(propertiesOf(records).filter(property=>mine.has(property.portfolio)).map(property=>property.number));
  const readings=valuationsOf(records).filter(entry=>owned.has(entry.property));
  const dates=[...new Set([...marks.map(mark=>mark.asOf),...statements.map(entry=>entry.asOf),...readings.map(entry=>entry.asOf)])].sort();
  return dates.map(asOf=>{
    const live=[...heldOn(marks,asOf),...livePositions(records,mine,asOf).map(positionFigure),
      ...liveProperties(records,mine,asOf).flatMap(propertyFigures)];
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
  const marks=marksOf(records),positions=positionsOn(records),estates=propertiesOn(records);
  return portfoliosOf(records).map(portfolio=>{
    const mine=marks.filter(mark=>mark.portfolio===portfolio.number);
    const rows=[...new Set(mine.map(mark=>mark.class))]
      .map(cls=>{
        const history=mine.filter(mark=>mark.class===cls).sort((a,b)=>b.asOf.localeCompare(a.asOf));
        return {class:cls,label:classLabel(cls),side:classSide(cls),current:history[0],history};
      })
      .sort((a,b)=>ASSET_CLASSES.findIndex(entry=>entry.code===a.class)-ASSET_CLASSES.findIndex(entry=>entry.code===b.class));
    const held=positions.filter(position=>position.holding.portfolio===portfolio.number);
    const owned=estates.filter(entry=>entry.property.portfolio===portfolio.number);
    return {portfolio,rows,positions:held,properties:owned,
      // A property adds its equity, which is the one arithmetic step a house
      // needs that a position does not: its value and its debt are two figures
      // and the portfolio holds the difference.
      total:sum([...rows.map(row=>signed(row.current)),...held.map(position=>position.value),
        ...owned.map(entry=>entry.equity)])};
  });
}

// What Needs attention asks of the ledger: a portfolio nobody has marked in a
// season, named once rather than once per class.
export function financeAttention(records,{today=new Date().toISOString().slice(0,10)}={}){
  return financeCurrencies(records).flatMap(({currency})=>financeSummary(records,{currency,today}).stale)
    .map(portfolio=>({id:portfolioRef(portfolio.number),name:portfolio.name,asOf:portfolio.asOf}));
}

const optional=(value,label)=>value===null||value===undefined||value===''?null:amount(value,label);

// AI reads pasted text into labelled readings and nothing more: it never sees
// the ledger, never picks the portfolio a figure belongs to, and never adds two
// numbers together. A malformed reading is dropped so one bad row cannot
// discard the rest.
// A reading's class arrives as an id from the model and as a code from the
// Worker, which has already read the reading once on its way through. Taking
// only the id quietly unclassified every figure the model had placed, so a page
// of stocks, cash and a stock plan arrived as one Unclassified total and the
// only classes that ever reached the ledger were the ones the device filled in
// afterwards. Reading a reading twice must not change it.
const readClass=value=>classById(value)?.code??assetClass(value)?.code??UNCLASSIFIED;
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
        class:readClass(draft.class),
        registration:registrationById(draft.registration)?.id||'',
        scope,value:amount(draft.value,'value'),asOf,
        confidence:['low','medium','high'].includes(draft.confidence)?draft.confidence:'low',
        reason:text(draft.reason??'',400,'an explanation')
      }];
    }catch{return [];}
  });
  // A capital account statement says four things about one investment, and it
  // is the only document that says all four in one place. Read as-is: a
  // statement that gives only the period's movement reports the period, and
  // what that adds up to is settled on the device, below.
  const statements=(Array.isArray(value.capital)?value.capital.slice(0,60):[]).flatMap(draft=>{
    try{
      if(!draft||typeof draft!=='object')return [];
      const asOf=isDate(draft.asOf)?draft.asOf:'';
      if(!asOf)return [];
      return [{
        name:text(draft.fund??'',120,'an investment name',true),
        // What the paperwork calls itself, which is not the same as what it is.
        stated:vehicleById(draft.vehicle)?.id||'',
        holder:text(draft.holder??'',120,'a holder'),
        asOf,value:optional(draft.value,'capital account value')??0,
        commitment:optional(draft.commitment,'the commitment'),
        contributed:optional(draft.contributed,'contributions to date'),
        distributed:optional(draft.distributed,'distributions to date'),
        periodContributed:optional(draft.periodContributed,'contributions this period'),
        periodDistributed:optional(draft.periodDistributed,'distributions this period'),
        currency:/^[A-Za-z]{3}$/.test(draft.currency||'')?String(draft.currency).toUpperCase():'',
        confidence:['low','medium','high'].includes(draft.confidence)?draft.confidence:'low',
        reason:text(draft.reason??'',400,'an explanation')
      }];
    }catch{return [];}
  });
  const unread=text(value.unread??'',800,'the unread note');
  if(!readings.length&&!statements.length&&!unread)throw Error('AI did not find any figures in that text. Add more detail, or enter the figure by hand.');
  return {readings,capital:statements,unread};
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
// Which group of figures a reading belongs to. An account it names answers on
// its own; one it does not name joins the single group of unnamed figures,
// rather than each label starting an account of its own. Two things depend on
// that: an account total and the holdings under it are only ever compared
// inside one group, and figures that name no account are told apart by what
// they state rather than by what they are called.
const UNNAMED='\u0000unnamed';
const accountKey=reading=>matchKey(reading.account)||UNNAMED;
// A note about one group of figures names it, when the page gave it a name to
// use. The unnamed group is the institution's, and saying "Net Account Value:"
// in front of a sentence about it named a column rather than an account.
const about=(name,text)=>name?`${name}: ${text}`:text[0].toUpperCase()+text.slice(1);

// One account states one balance, and a page printing the same number under two
// names — a current value and a net value — has stated it twice. The number is
// what says so. Deciding it by name instead, and keeping whichever figure said
// "net" or "total", is how a $122,667 IRA listed beside a $1.6M brokerage
// disappeared: two balances that differ are two balances.
const balances=(totals,dropped)=>{
  const named=/net|total/i,byValue=new Map();
  for(const total of totals){
    const key=total.value.toFixed(2),kept=byValue.get(key);
    if(!kept||(!named.test(kept.label)&&named.test(total.label)))byValue.set(key,total);
  }
  const repeats=totals.length-byValue.size;
  if(repeats)dropped.push(`${repeats} repeated balance${repeats===1?'':'s'}`);
  // The same money, said twice in two different numbers. A bank prints the
  // present balance and the available balance in adjacent columns — what the
  // account holds, and what of it has cleared — and because the two differ by
  // whatever is pending, nothing above catches them: they are two balances, and
  // added together they file a checking account at twice what is in it. The
  // present balance is the ledger's answer, because the ledger is asking what
  // the account holds rather than what could be spent today.
  const kept=[...byValue.values()];
  const settled=kept.filter(total=>PRESENT.test(total.label||''));
  const pending=settled.length?kept.filter(total=>!PRESENT.test(total.label||'')&&AVAILABLE.test(total.label||'')):[];
  if(!pending.length)return kept;
  dropped.push(`${pending.length} available balance${pending.length===1?'':'s'}`);
  return kept.filter(total=>!pending.includes(total));
};
// What an account holds, and what of it has cleared.
const PRESENT=/\b(present|current|posted|statement|ledger)\b/i;
const AVAILABLE=/\bavailable\b/i;
// Read at a bank, but not a bank balance. One sign-on at Chase covers the
// checking account and the managed portfolio beside it, and only one of those
// is cash, so an account that names itself an investment keeps the class the
// reading gave it.
const INVESTED=/\b(invest\w*|brokerage|securities|managed|advisory|portfolio|ira|roth|401\s*\(?k|529|annuity|wealth)\b/i;
// Read at a bank, and owed rather than held. The same sign-on that lists the
// checking account lists the cards against it, and a card balance the reading
// left unclassified would take the site's answer — cash — and be filed as money
// in hand. It is the one class where getting it wrong moves net worth by twice
// the figure, so the heading the page files a card under settles it here.
const CARD=/\bcredit\s?cards?\b/i;

// The digits a page prints in place of an account number — "-4049", "…4144",
// "ending in 8820". They count only behind a marker saying that is what they
// are: a bare run of digits inside a name is a year, and the Berry 2020
// Descendants’ Irrevocable Trust is not account 2020.
const ACCOUNT_DIGITS=/(?:ending in|account(?: number| no\.?| ?#)?|[-–—#]|\bx|\*+|\.{2,}|…)\s*(\d{3,})(?!\d)/gi;
const accountDigits=said=>[...String(said).matchAll(ACCOUNT_DIGITS)].map(found=>found[1]);
// A kind of account, not an account. A bank sorts what it holds into "Bank
// accounts", "Credit cards" and "Investment accounts", and the figure printed
// against one of those headings is every account under it added up — a joint
// estate, four trusts, an LLC and two children's money in a single number.
// Filed as an account it becomes a portfolio called Bank accounts, which is the
// same mistake as the joint estate swallowing a trust and harder to see, since
// no portfolio on the screen is named after anybody at all.
//
// The heading is taken off the front rather than the name thrown away, because
// a reading told to put the heading in front of the account's own name does
// exactly that: "Investment accounts · BERRY 2020 IRREV FAM TR (...5007)" is one
// trust's account and must stay one.
// Naming the kinds one at a time does not end. The list held bank, credit and
// investment, and the page answered with Outstanding, then External accounts,
// then Chase accounts — each a heading over a sum, each read as the name of an
// account nobody holds. What they have in common is not the word in front but
// the word at the end: a heading over a group of accounts says "accounts", and
// an account of one's own almost never does. So the shape is the rule — up to
// two words and then the plural — and the next bank to invent a kind needs no
// new word here.
const CATEGORY=/^(?:[A-Za-z][\w'&-]*[ -]){0,2}(?:accounts|cards)\b[\s·•|–—>›:]*/i;
// What a column is called, which is never what an account is called. These are
// the words left over when a page names a figure but not the account it belongs
// to: Present balance, Net Account Value, Total.
//
// A summary panel's labels are the same kind of word and have to be read the
// same way. "Total investments", "Total cash" and "Liabilities" name what a
// figure covers, not whose it is, and taken for account names under a group
// heading they made one portfolio called Liabilities holding $16.4M — three
// page-level totals added together, which is the one thing this ledger is
// built never to do.
//
// "Outstanding" is one of them, and it is the word that cost a whole reading.
// A bank's dashboard sums its cards under Credit cards and labels the sum
// Outstanding; the heading came off the front as it should, "Outstanding" was
// taken for the name of an account, and a portfolio called OUTSTANDING was
// offered holding the sum of every card — the one figure on a page whose other
// two were correctly refused, which left nothing saying the page could not
// answer.
const BALANCE_WORD=/^(?:my |your |net |gross |available |present |current |total |outstanding |account |ledger |posted |statement |market |cash |owed )*(?:balance|value|amount|assets?|accounts?|cards?|total|equity|outstanding|owed|due|investments?|cash|liabilit(?:y|ies)|deposits?)$/i;
// What this figure says about which account it is, once the heading and the
// column name are off: a name of the account's own, or nothing.
const ownName=name=>{
  const clean=String(name||'').trim().replace(CATEGORY,'').trim();
  return BALANCE_WORD.test(clean)?'':clean;
};
// A figure filed under a kind of account that names no account of its own is
// that heading's total — every account under it added up.
const groupTotal=reading=>CATEGORY.test((reading.account||'').trim())
  &&![reading.account,reading.label].some(name=>ownName(name));
// What a page says about which account a figure belongs to, beyond the name it
// was filed under: the registration it states, and the account number it shows.
const accountMark=reading=>{
  const said=`${reading.account||''} ${reading.label||''}`;
  // The registration the reading states, or the one its own name states when
  // it stated none: a taxable brokerage and a traditional IRA listed under one
  // name are two accounts whether or not the reading filled the field in.
  const kind=reading.registration||registrationFromName(said)?.id||'';
  return `${kind}#${accountDigits(said).join(',')}`;
};

// One name, several accounts.
//
// A reading that named the institution rather than the account — "E*TRADE"
// against the brokerage and the IRA both — files two balances under one name,
// and the rule that one account states one balance then throws the smaller of
// them away. Nothing on the page went wrong; the name did. So a group is
// separated into the accounts it actually holds before that rule runs.
//
// Two things a page says are never true of one account. A registration one
// figure states and another does not share: an IRA is registered to one person
// by law and cannot also be the taxable brokerage beside it. And a different
// account number: four digits behind a dash are the only thing most broker
// dashboards give you to tell two accounts apart.
//
// A figure equal to everything else added up is the institution’s own total
// over them, whatever scope the reading gave it. It is left out and its parts
// are kept, which reaches the same sum with none of the loss — but only when
// the parts can be told apart. Where nothing separates them, the figure that
// covers them all is the one worth keeping, and the group is left as it was.
//
// Holdings cannot follow. A group that lost the account names has nothing left
// saying which account a position sits in, so a separated group keeps each
// total whole and says so.
function separate(account,notes,dropped){
  if(account.totals.length<2)return [account];
  const covers=account.totals.filter(total=>{
    const rest=account.totals.filter(other=>other!==total);
    return rest.length>1&&total.value>0&&Math.abs(sum(rest.map(other=>other.value))-total.value)<=total.value*RECONCILE;
  });
  const totals=covers.length===1?account.totals.filter(total=>total!==covers[0]):account.totals;
  const marks=[...new Set(totals.map(accountMark))];
  if(marks.length<2)return [account];
  if(covers.length===1)dropped.push('a total across accounts');
  notes.push(about(account.name,`${marks.length} accounts were read under one name and counted separately.`));
  if(account.holdings.length)notes.push(about(account.name,'the holdings could not be placed in one of them, so each total was kept whole.'));
  return marks.map(mark=>({...account,totals:totals.filter(total=>accountMark(total)===mark),holdings:[]}));
}
// A change is not a value. A day's gain, a return, a cost basis and an
// unrealized figure are printed in the same column shape as a balance, and the
// reading is told in as many words to leave every one of them out. It does not
// always: a broker's top-movers table states gains and last prices and no
// market value at all, and two readings of the same page reported first one
// column and then the other as the account's holdings. Those never reconciled,
// so nothing was counted wrongly — but a page whose only account-level figure
// came back as "Day's Gain" would have filed $7,036 as the balance of a $1.6M
// account, and nobody reading the ledger a year later could tell. So the device
// refuses a figure that names itself a change, whatever scope it was given.
const NOT_A_VALUE=/\b(gains?|loss|losses|change|returns?|performance|cost basis|unrealized|realized|yield|price)\b/i;
// What a card has left to spend is not money owed and not money held. It is
// printed beside the balance, in the same shape, and it is usually the larger
// of the two: read as a balance it files the whole limit as debt, and a card
// with nothing on it becomes the biggest liability in the ledger.
const HEADROOM=/\b(available credit|credit (limit|line|available)|minimum payment|payment due|amount due)\b/i;
// A credit score is a number in the same range as a small balance and is filed
// beside the accounts by the bank itself — Chase prints one under Credit
// Journey, on the same page as the money. Read as a figure it became $737 of
// cash, which is not wrong by a little: it is not money at all, and nothing
// about its shape says so. Only its name does.
const SCORE=/\b(credit journey|credit score|fico|vantage ?score|experian|transunion|equifax)\b/i;
// A stock plan's two halves, named by the page rather than by the reading: the
// potential, projected or unvested benefit is a schedule, and everything else
// in the account is stock that is held. The class is forced here because it is
// the one thing about a stock plan worth getting right, and a reading that
// called $248,422 of unvested stock an ordinary holding would bury it.
const UNVESTED=/\b(unvested|potential|projected|unexercis\w*)\b/i;
const VESTED=/\bvested\b/i;
// The account that says which half of it a figure is. Only a stock plan states
// a current value and a potential one side by side, and E*TRADE calls the
// vested half "Current Account Value" — a name with nothing in it about vesting
// at all, which left the class to whatever the reading happened to say. What
// has vested is marketable stock and files as Liquid securities; only the
// schedule beside it needs a class of its own.
const STOCK_PLAN=/\b(stock plan|dsp|espp|rsu|equity (award|plan)|restricted stock)\b/i;
// A stock plan's potential benefit is something the account states about
// itself, never a position held inside it. Read as a holding it was compared
// against the account's vested balance, failed to reconcile with it — which it
// never could, being the other half of the same account — and $248,422 was
// dropped. The wording is what says so, so the device says it rather than
// hoping the reading scoped it right.
const PLAN_VALUE=/\b(unvested|potential|projected|unexercis\w*)\b[^\n]*\b(value|benefit|balance|amount)\b/i;
// What an account called Brokerage holds depends on who is holding it. At a
// wealth manager it is where the fund investments sit — the dashboard prints
// one total and never says so — while everywhere else the word means what it
// sounds like. So this is asked per institution rather than of the word, and
// only institutions whose Brokerage accounts have actually been looked at are
// listed here.
//
// Such an account is not purely funds: a few per cent of it is treasuries held
// against the calls. The dashboard states one figure for the account and no
// page beneath it breaks the two apart, so the choice is between filing the
// whole balance as funds and filing it as marketable securities. Funds is wrong
// by the three per cent; liquid securities is wrong by the other ninety-seven.
const FUND_ACCOUNTS={ubs:/\bbrokerage\b/i};
export function foldReadings(readings,portfolios,{institution='',defaultClass=null,today=new Date().toISOString().slice(0,10)}={}){
  const CASH=classById('cash').code,LIQUID=classById('liquid').code;
  // What a figure is in, when the reading did not say. A site answers for its
  // own totals — a bank's balance is cash, a broker's is marketable securities
  // — but the account's own name outranks the site, because one sign-on at a
  // bank covers the checking account and the managed portfolio beside it, and
  // one of those is not cash. A stock plan's wording outranks both.
  // Bonds are marketable securities, and this ledger is asked how much could be
  // sold this week rather than what it is invested in. A municipal ladder in a
  // trust is the same answer to that question as the equities beside it, and a
  // Bonds row of its own split one account across two lines that are read back
  // as one number. What the class exists for — telling liquid from locked up —
  // Liquid securities already says.
  const BONDS=classById('bonds').code;
  const classify=(reading,said='')=>{
    // The stock-plan test reads the figure's own label and nothing around it:
    // the group's text holds every other label too, and one potential benefit
    // value in it would turn the vested balance beside it into a schedule.
    const own=reading.label||'';
    if(UNVESTED.test(own))return classById('unvested').code;
    if(VESTED.test(own)||STOCK_PLAN.test(said))return LIQUID;
    // On this figure's own name, never on the group's. Asked of everything the
    // group says, one card in it made every figure beside it a debt: a page
    // whose accounts could not be told apart put a bank's whole overview into
    // one group, the words "credit cards" were somewhere in it, and $16.4M of
    // assets was offered as -$18,537,244 owed. A card says so on its own row.
    if(CARD.test(`${reading.account||''} ${own}`)&&classSide(reading.class)!=='liability')return classById('credit').code;
    // Forced, like the stock plan above and for the same reason: the page says
    // Brokerage and means funds, so a reading that reports marketable
    // securities is reporting the page faithfully and the ledger wrongly.
    const holds=FUND_ACCOUNTS[matchKey(institution)];
    if(holds&&holds.test(`${reading.account||''} ${own}`))return classById('funds').code;
    if(reading.class===BONDS)return LIQUID;
    if(reading.class!==UNCLASSIFIED)return reading.class;
    if(INVESTED.test(said))return defaultClass===CASH||!defaultClass?LIQUID:defaultClass;
    return defaultClass??reading.class;
  };
  // Everything the fold declined to count, gathered as it goes and said once at
  // the end. Three sentences explaining three omissions is three times the
  // reading it deserves: the figures are on the screen, and the note is only
  // there to say what is not.
  const dropped=[],notes=[];
  const values=readings.filter(reading=>!NOT_A_VALUE.test(reading.label||''));
  const changes=readings.length-values.length;
  if(changes)dropped.push(`${changes} gain${changes===1?'':'s'} or return${changes===1?'':'s'}`);
  const spendable=values.filter(reading=>!HEADROOM.test(reading.label||''));
  const limits=values.length-spendable.length;
  if(limits)dropped.push(`${limits} credit limit${limits===1?'':'s'}`);
  // A score is refused by what it is called, wherever the name sits: the bank
  // files it under a product of its own, so the account is as likely to name it
  // as the figure is.
  const counted=spendable.filter(reading=>!SCORE.test(`${reading.account||''} ${reading.label||''}`));
  const scores=spendable.length-counted.length;
  if(scores)dropped.push(`${scores} credit score${scores===1?'':'s'}`);
  // A total over accounts, however the reading labelled its scope. One says so
  // — scope "all" — and the other says so by naming a kind of account instead of
  // an account, which is what a dashboard's group heading is.
  const usable=counted.filter(reading=>reading.scope!=='all'&&!groupTotal(reading));
  const summed=counted.length-usable.length;
  if(summed)dropped.push('a total across accounts');
  // The two are refused together and mean different things. A headline total
  // is printed over accounts the page also states, so refusing it loses
  // nothing. A kind's total is printed instead of them.
  const kinds=counted.filter(groupTotal).length;
  const accounts=new Map();
  for(const reading of usable){
    const key=accountKey(reading);
    if(!accounts.has(key))accounts.set(key,{name:reading.account||institutionName(institution),totals:[],holdings:[]});
    const holding=reading.scope==='holding'&&!PLAN_VALUE.test(reading.label||'');
    accounts.get(key)[holding?'holdings':'totals'].push(reading);
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
    // A retirement registration the page states outranks everything, because
    // law puts it beyond argument: an IRA is one person's, whatever the account
    // is called or who the roster says holds it. Everything else the roster
    // settles, and the roster outranks the reading — it is the owner's own
    // standing answer about his own structure, and a reading is a guess from
    // the page. Taking the guess first gave one trust two portfolios under one
    // name: its brokerage account read as taxable, its managed account as a
    // trust, and the same name proposed twice because the kinds differed.
    const settled=stated&&['ira','roth','401k'].includes(stated.id)?stated:null;
    // What makes it a card is that it is owed, not that the page happened to
    // print the word. A dashboard that groups its cards under a heading says
    // "credit cards" once and the reading carries it; one that lists them by
    // product does not, and "Prime Visa", "Eric Freedom Card" and "J.P. Morgan
    // Reserve" then each started a portfolio of their own. A debt read at an
    // institution that says where its cards are titled is one of them.
    const owed=readings.some(reading=>classSide(reading.class)==='liability')||CARD.test(said);
    const card=!holder&&owed?titledAccount(institution)?.cards:null;
    const carded=card?registrationById(card.registration||''):null;
    const kind=settled||(holder&&registrationById(holder.registration))||carded||stated||registrationFromName(said)||registrationById('taxable');
    // The institution settles the title, and the registration settles which
    // title: the estate holds what is taxable, a person holds the IRA.
    // A card is not an account anybody is named on twice. Every card behind one
    // sign-on is the same person's debt, so they are titled together rather
    // than each starting a portfolio under the name printed on the plastic —
    // which had put a closed card, a Freedom and a Reserve in three portfolios
    // holding one household's liabilities between them.
    const owner=holder?.owner||card?.owner||titledOwner(institution,kind.id);
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
    // The name a page gave this, which is not always the one it was grouped
    // under: an account listed beneath "Investment accounts" and named nowhere
    // else is still not a portfolio called Investment accounts.
    const own=readings.map(reading=>ownName(reading.account)).find(Boolean)
      ||readings.map(reading=>ownName(reading.label)).find(Boolean);
    const name=owner||own||kind.label;
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
  const named=[...accounts.entries()].some(([key,entry])=>key!==UNNAMED&&entry.totals.length);
  for(const account of [...accounts.values()].flatMap(entry=>separate(entry,notes,dropped))){
    const inside=[...account.totals,...account.holdings];
    // Everything the page called this account, in one string: the name it was
    // grouped under and the labels of the figures inside it. That is what says
    // whose account it is and what it holds.
    const said=[account.name,...inside.map(reading=>reading.label)].filter(Boolean).join(' ');
    // A company the owner signs for rather than owns. It is on the page because
    // it is behind the same password, and it is left out here rather than
    // downstream, so that no figure of it reaches a total on any screen.
    const holder=titledHolder(institution,said);
    if(holder?.ignore){dropped.push(holder.owner);continue;}
    const portfolio=resolve(inside,said);
    const totals=balances(account.totals,dropped);
    const holdings=account.holdings,held=sum(holdings.map(reading=>reading.value));
    // Holdings replace the balances they sit under only when they add up to
    // them. The comparison is against everything the group states, because a
    // group holding two accounts states two balances and the positions listed
    // under it are the positions of both.
    const stated=sum(totals.map(total=>total.value));
    const reconciles=holdings.length&&stated>0&&Math.abs(held-stated)<=stated*RECONCILE;
    // Positions with no account name of their own are what a statement of
    // holdings looks like, and they are counted. On a page that also states an
    // account's balance they are not: they are positions inside one of those
    // accounts, and nothing says which, so counting them adds a figure the page
    // already counted. A broker's top-movers table arrives exactly this way.
    if(holdings.length&&!totals.length&&account.name===institutionName(institution)&&named){
      dropped.push(`${holdings.length} position${holdings.length===1?'':'s'} no account claimed`);
      continue;
    }
    if(holdings.length&&(reconciles||!totals.length)){
      for(const reading of holdings)add(portfolio,classify(reading,`${account.name} ${reading.label}`),reading.asOf,reading.value,[reading.label]);
      continue;
    }
    if(holdings.length)notes.push(about(account.name,`the ${holdings.length} holding${holdings.length===1?'':'s'} shown ${holdings.length===1?'does':'do'} not add up to the total, so it was kept whole.`));
    for(const total of totals)add(portfolio,classify(total,said),total.asOf,total.value,[total.label]);
  }
  // Said once, at the front, in the order a reader would ask it: what did you
  // not count, and why is a figure not split.
  if(dropped.length)notes.unshift(`Left out: ${[...new Set(dropped)].join(', ')}.`);
  // The page is the reason, and the evidence is that nothing on it named an
  // account — not that nothing came of it. One stray figure getting through
  // used to take this sentence away with it, which left the owner holding a
  // single card balance and no idea the twenty accounts were missing at all.
  //
  // It says what is missing rather than where to go, because where to go is
  // not knowable from here. The accounts may be on another page, or on this
  // one inside a group that is shut — a bank's overview prints the sum of a
  // kind on the closed group's own heading, so the page can hold every account
  // and state none of them. Both answer to the same instruction, and telling
  // the owner to go elsewhere would have sent him off the page he wanted.
  const anyAccount=usable.some(reading=>ownName(reading.account)
    ||accountDigits(`${reading.account||''} ${reading.label||''}`).length);
  if(kinds&&!anyAccount)notes.push('Only one total per kind of account reached the reading. Show the accounts themselves on the page, then read again.');
  // Read in the order it will be read back: whose money it is, then what it is
  // in. Sorting by portfolio number put the figures in the order the portfolios
  // happened to be created in, which is no order at all to anyone looking at
  // them, and interleaved two portfolios' classes when a new one was proposed.
  const marks=[...figures.values()].sort((a,b)=>
    a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||a.portfolio-b.portfolio
    ||ASSET_CLASSES.findIndex(entry=>entry.code===a.class)-ASSET_CLASSES.findIndex(entry=>entry.code===b.class));
  return {marks,portfolios:proposed,notes,today};
}

// Turning a capital account statement into what is kept. This is the device's
// arithmetic, against a ledger the model never saw: it matched nothing, chose
// no portfolio and added no two numbers together.
//
// Cumulative figures are what is stored. A statement states them, and a running
// total that is stored cannot be corrupted by a quarter that never arrived —
// the newest row answers what has been called and what has come back entirely
// on its own. A statement that shows only the period's movement is added to the
// position's last filed figure here, and the row it produces says that it was,
// because a derived cumulative is only as good as the row before it.
export function foldCapital(statements,records,{today=new Date().toISOString().slice(0,10)}={}){
  const portfolios=portfoliosOf(records),holdings=holdingsOf(records),filed=capitalOf(records);
  const madePortfolios=[],madeHoldings=[],notes=[],rows=[];
  const nextNumber=(existing,made)=>Math.max(0,...existing.map(entry=>entry.number),...made.map(entry=>entry.number))+1;
  // What a statement names has to answer exactly, or be the only thing it could
  // be — and containment only ever runs one way: the name on the statement may
  // be a shorter form of what the ledger calls the same thing, never a longer
  // one.
  //
  // Both halves of that are load-bearing. "Berry" sits inside the Berry Family
  // Trust, the Berry 2020 Descendants' Irrevocable Trust, Eric Berry and the
  // Eric and Ariana Berry Estate, and nothing about the four says which a
  // statement addressed to "Berry" belongs to. And a holder carrying more
  // identity than the portfolio name — "Maisie Synthetic Berry 2021 Irrevocable
  // Trust" against a portfolio called "Synthetic Berry" — is a different party
  // altogether, however much of the name they share; her capital account in his
  // IRA is a mistake nobody would ever see. The same asymmetry does the same
  // work for the fund: a statement for "Acme Fund III" must not land on the
  // holding called "Acme Fund", while a statement for "Acme Fund" may land on
  // "Acme Fund III, L.P." only if that is the one candidate.
  //
  // Anything short of that names nobody and falls through to proposing. A
  // capital account filed into the wrong trust is invisible from then on; a
  // duplicate sitting in the review, waiting to be pointed at the right one, is
  // not.
  const bestMatch=(name,candidates)=>{
    const key=matchKey(name);
    if(!key)return null;
    const exact=candidates.find(entry=>matchKey(entry.name)===key);
    if(exact)return exact;
    const near=candidates.filter(entry=>matchKey(entry.name).includes(key));
    return near.length===1?near[0]:null;
  };
  // Whose it is. A capital account statement is addressed to its partner by
  // name, so unlike a brokerage page it states the title rather than leaving it
  // to be guessed — and a name that matches no portfolio yet describes one well
  // enough to propose it, because a trust says it is a trust.
  const resolvePortfolio=holder=>{
    const found=holder&&bestMatch(holder,portfolios);
    if(found)return found;
    const already=holder&&bestMatch(holder,madePortfolios);
    if(already)return already;
    // Nothing on the statement says whose it is. One taxable portfolio can take
    // it without a guess; more than one, and it goes to the first rather than
    // inventing a second, with a note saying so and a choice on the row.
    if(!holder){
      const taxable=portfolios.filter(portfolio=>portfolio.kind===registrationById('taxable').code);
      if(taxable.length)return taxable[0];
      if(portfolios.length)return portfolios[0];
    }
    const kind=registrationFromName(holder)||registrationById('taxable');
    const fresh={row:'portfolio',number:nextNumber(portfolios,madePortfolios),
      name:String(holder||kind.label).slice(0,80),kind:kind.code,currency:'USD',isNew:true};
    madePortfolios.push(fresh);
    return fresh;
  };
  // Which investment this statement belongs to. The fund's own name is the tie,
  // and it is the one thing every capital account statement prints.
  const resolveHolding=(statement,portfolio)=>{
    // The same rule, and it matters as much here: "Acme Fund" must not swallow
    // a statement for "Acme Fund III".
    const found=bestMatch(statement.name,holdings);
    if(found)return found;
    const already=bestMatch(statement.name,madeHoldings);
    if(already)return already;
    const said=vehicleById(statement.stated);
    const fresh={row:'holding',number:nextNumber(holdings,madeHoldings),portfolio:portfolio.number,
      name:statement.name.slice(0,120),
      // What it says it is, until the owner says otherwise. Nothing here
      // second-guesses the paperwork; the disagreement is recorded, not decided.
      vehicle:(said||vehicleById('fund')).code,stated:said?said.code:0,
      // Fund investments is the class a private position lands in, because
      // splitting venture from buyout off a fund's name would be a guess. One
      // edit moves it, and the row is where that edit is offered.
      class:classById('funds').code,isNew:true};
    madeHoldings.push(fresh);
    return fresh;
  };
  // The statement before this one, which is what a period's movement is added
  // to. Strictly before: re-filing a quarter must land on the same numbers it
  // landed on the first time, or the write stops being idempotent.
  const preceding=(holding,asOf)=>filed.filter(entry=>entry.holding===holding&&entry.asOf<asOf)
    .sort((a,b)=>b.asOf.localeCompare(a.asOf))[0]||null;
  for(const statement of statements){
    const portfolio=resolvePortfolio(statement.holder);
    const holding=resolveHolding(statement,portfolio);
    const previous=holding.isNew?null:preceding(holding.number,statement.asOf);
    const running=(stated,period,before,what)=>{
      if(stated!==null)return stated;
      if(period===null)return before;
      notes.push(previous
        ? `${statement.name}: the statement showed ${what} for the period only, so it was added to the ${previous.asOf} figure.`
        : `${statement.name}: the statement showed ${what} for the period only, and nothing is filed before it, so that is the whole amount to date.`);
      return Math.round((before+period)*100)/100;
    };
    const contributed=running(statement.contributed,statement.periodContributed,previous?.contributed||0,'contributions');
    const distributed=running(statement.distributed,statement.periodDistributed,previous?.distributed||0,'distributions');
    // A commitment the statement did not restate has not gone away.
    const commitment=statement.commitment??previous?.commitment??0;
    if(statement.currency&&statement.currency!==(portfolio.currency||'USD'))
      notes.push(`${statement.name}: the statement is in ${statement.currency} and ${portfolio.name} is kept in ${portfolio.currency||'USD'}. Nothing was converted.`);
    if(statement.holder&&portfolio.isNew)
      notes.push(`${statement.name}: no portfolio matched “${statement.holder}” closely enough to be sure, so a new one is proposed. Change it on the row if it belongs to one you already have.`);
    if(!holding.isNew&&vehicleById(statement.stated)&&vehicleById(statement.stated).code!==holding.vehicle)
      notes.push(`${statement.name}: the statement calls this ${vehicleById(statement.stated).label.toLowerCase()} and it is filed as ${vehicleLabel(holding.vehicle).toLowerCase()}. Saving does not change how it is filed.`);
    rows.push({holding:holding.number,name:holding.name,vehicle:holding.vehicle,class:holding.class,
      stated:vehicleById(statement.stated)?.code||0,isNew:!!holding.isNew,
      portfolio:portfolio.number,portfolioName:portfolio.name,portfolioKind:portfolio.kind,
      portfolioIsNew:!!portfolio.isNew,currency:portfolio.currency||'USD',
      asOf:statement.asOf,value:statement.value,contributed,distributed,commitment,
      confidence:statement.confidence,from:statement.reason?[statement.reason]:[]});
  }
  return {rows,portfolios:madePortfolios,holdings:madeHoldings,notes,today};
}

// Retrofitting the ledger that came before. Until now a record was one account,
// carrying its type, institution, owner, currency, liquidity, ownership share,
// tags, notes and a JSON array of every figure ever filed for it. All of that
// reduces to a portfolio and a class — two codes — and the record's whole
// history comes across rather than only its newest figure.
export const LEGACY_CLASSES={bank:'cash',brokerage:'liquid',retirement:'liquid',
  private:'funds',business:'funds',realestate:'property',crypto:'other',vehicle:'other','other-asset':'other',
  mortgage:'mortgage',loan:'loan',credit:'credit','other-liability':'loan'};
// What a site's own kind says a figure is when the reading did not say. It is
// the map above with one answer changed, and it is a second map rather than an
// edit to the first because the two are asked different questions. A migration
// is re-runnable only while it writes the same portfolio, class and date twice;
// moving a legacy crypto record from Other to Crypto would write a second row
// beside the one already migrated and count the coin twice. A page being read
// today has no such history, so Coinbase and Kraken answer Crypto.
export const SITE_CLASSES={...LEGACY_CLASSES,crypto:'crypto'};
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
