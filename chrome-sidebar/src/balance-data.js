// Points and miles: the shape one balance is stored in, and what a reading of
// an account page may turn into.
//
// A balance is an ordinary wallet entry — kind `balance`, with the program as
// its name and the airline, hotel or issuer as its source — so nothing here
// introduces a second record shape, and every balance saved by hand before
// this existed counts the same as one that was read off a page.
//
// The unit is not a stored field. It is read back out of the entry's own
// value, which is what keeps older entries readable and leaves the record
// shape alone. Miles, points and cash back are different things: a figure
// keeps the unit it was read in and is never restated in another.
import {validateReward} from './rewards-data.js';
import {loyaltyProgramNamed} from './loyalty-sites.js';

// The units a balance is kept in. Anything else a program calls its currency
// is read as the closest of these, because a wallet that named nine
// currencies would be nine vocabularies to learn rather than one.
// `dollars` is cash back a card states in money — Blue Cash's Reward Dollars —
// which is a reward balance like any other and is still not points: it stays
// money wherever it is shown.
export const BALANCE_UNITS=['miles','points','Avios','dollars'];
export const BALANCE_LIMIT=25;
// Loose on purpose: the unit is as often inside the program's own name —
// MileagePlus, Rapid Rewards points — as it is beside the figure. Money is
// asked last, so "125,000 points ($1,250 value)" is points, and only a figure
// that names no other currency is read as cash.
const UNIT_PATTERNS=[[/avios/i,'Avios'],[/mile/i,'miles'],[/point/i,'points'],[/\$|dollar/i,'dollars']];

export const balanceUnit=text=>UNIT_PATTERNS.find(([pattern])=>pattern.test(String(text||'')))?.[1]||'';
// One balance as the wallet's value field holds it: the figure, then the unit —
// or, for money, the figure as money, because "$125.49" says cash back without
// a word beside it and rounding it to the dollar would lose the cents.
export const formatBalance=(amount,unit)=>unit==='dollars'
  ?amount.toLocaleString('en-US',{style:'currency',currency:'USD'})
  :`${Math.round(amount).toLocaleString('en-US')} ${unit||'points'}`;

const text=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const CONFIDENCE=['high','medium','low'];

// One balance as a reading proposes it. A reading is a proposal and nothing
// more: every figure is checked here, shown to the owner, and saved only by a
// press of their own — the same rule a statement reading already follows.
export function parseBalanceReading(input,programs=null,now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw Error('Reading that page returned nothing to review.');
  const found=Array.isArray(input.balances)?input.balances:[];
  if(found.length>BALANCE_LIMIT)throw Error(`A page reading returns at most ${BALANCE_LIMIT} balances.`);
  // The currencies printed on the page this was read from. An issuer runs more
  // than one, so a figure picks its own program by name and only a reading that
  // names none falls back to the first.
  const site=Array.isArray(programs)?programs.filter(Boolean):programs?[programs]:[];
  const seen=new Set();
  return found.map(row=>{
    const amount=Number(String(row?.amount??'').replace(/[,\s]/g,''));
    if(!Number.isFinite(amount)||amount<0||amount>1e12)return null;
    const stated=text(row?.program,200);
    const known=site.find(entry=>key(entry.label)===key(stated))||null;
    const program=known||site[0]||null;
    const name=stated||program?.label||'';
    const source=text(row?.source,200)||program?.source||'';
    if(!name||!source)return null;
    // A program this tool recognizes is counted in the currency the registry
    // says it keeps, not the one the page was read as: Reward Dollars is money
    // whatever a reading calls it, and rounding it into points would be a
    // number that is wrong rather than one that is missing.
    const unit=known?known.unit
      :BALANCE_UNITS.includes(row?.unit)?row.unit:balanceUnit(`${row?.unit} ${name}`)||program?.unit||'points';
    // A page that states the same program twice states one balance; the first
    // reading of it is the one kept, so a second cannot quietly overwrite it.
    const already=`${name}|${source}`.toLowerCase();
    if(seen.has(already))return null;
    seen.add(already);
    return {name,source,amount,unit,value:formatBalance(amount,unit),
      // Where this figure was printed, so the entry it lands on can be opened
      // again without hunting for the page a second time.
      url:program?.url||'',
      notes:text(row?.notes,400),
      confidence:CONFIDENCE.includes(row?.confidence)?row.confidence:'medium',
      readAt:now};
  }).filter(Boolean);
}

// Which saved entry a read balance is about. A program is matched by its own
// name first and by its source second, so "MileagePlus" read off united.com
// updates the MileagePlus entry already in the wallet instead of adding a
// second one beside it. Nothing else is matched: a benefit or a card is never
// overwritten by a balance reading.
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchBalances(rows=[],entries=[]){
  const balances=entries.filter(entry=>entry?.kind==='balance'&&!entry.deleting);
  const taken=new Set();
  // How many figures this reading found for each provider. Matching on the
  // source alone is what lets "Mileage Plus" land on the MileagePlus entry when
  // the owner spelled it differently — but an issuer that runs two currencies
  // states two figures under one name, and neither may be filed under the
  // other: cash back is not the points balance it was printed beside. Where the
  // reading found more than one for a source, the program's own name decides or
  // nothing does, and what nothing decides is saved as a new balance.
  const perSource=new Map();
  for(const row of rows)perSource.set(key(row.source),(perSource.get(key(row.source))||0)+1);
  // Matching on the source alone is only ever right within one currency. A
  // Reward Dollars reading taken beside a wallet that holds only Membership
  // Rewards used to land on that points entry — the one American Express
  // balance there was — and overwrite 13,674 points with $125.49. So a
  // source-only match has to be the same program where the registry knows
  // both, and counted in the same unit where the entry states one; an entry
  // never read ("Not read yet") states none and stays eligible.
  const compatible=(entry,row)=>{
    const known=loyaltyProgramNamed(entry.name,entry.source),wanted=loyaltyProgramNamed(row.name,row.source);
    if(known&&wanted&&known.id!==wanted.id)return false;
    const unit=balanceUnit(entry.value);
    return !unit||!row.unit||unit===row.unit;
  };
  return rows.map(row=>{
    const candidates=balances.filter(entry=>!taken.has(entry.id)&&
      (key(entry.name)===key(row.name)||(key(entry.source)===key(row.source)&&key(entry.name)===key(row.name))));
    const alone=perSource.get(key(row.source))===1;
    const bySource=candidates.length?candidates
      :alone?balances.filter(entry=>!taken.has(entry.id)&&key(entry.source)===key(row.source)&&compatible(entry,row)):[];
    const match=bySource.length===1?bySource[0]:null;
    if(match)taken.add(match.id);
    return {...row,match,ambiguous:!match&&bySource.length>1};
  });
}

// A read balance in the shape the wallet stores, checked by the same validator
// a typed entry passes. Updating keeps everything about the saved entry except
// the figure and the date it was read: its expiration, its notes, and the card
// it was filed under are the owner's, not the page's.
export function balanceRecord(row,match=null,now=new Date().toISOString()){
  const base=match||{kind:'balance',name:row.name,source:row.source,state:'available',card:'',cadence:'',due:'',url:'',notes:row.notes,secret:'',secretHint:''};
  // A link the owner put there is theirs and is never replaced; an entry that
  // has none takes the program's own page, which is the whole point of holding
  // the program in the wallet at all.
  return validateReward({...base,kind:'balance',value:row.value,url:base.url||row.url||''},now);
}

// The wallet as a directory of programs. A program the owner holds is a balance
// entry with no figure in it yet: it names the program, says who runs it, and
// carries the page the balance is printed on, so reaching that page is one
// press instead of a search. Reading a balance later fills the same entry in
// through `matchBalances`, and `nextActions` leaves a figureless one alone
// until it has been read once.
//
// Nothing here is saved by building it. A program already in the wallet — by
// its own name, or by the source it is filed under — is never added a second
// time, so seeding an already-seeded wallet adds nothing.
// What an unread program's value says. The wallet already understands a value
// that states no figure — "Gold status" is a balance too, and is counted in no
// total — so a program awaiting its first reading needs no new record shape and
// no change to what a reward is allowed to be. It says plainly that there is no
// figure yet rather than showing a zero that would be a lie.
export const UNREAD_BALANCE='Not read yet';
// What a program is actually called, wherever one is named: the issuer's name
// joins the program's only where the program's own name does not already carry
// the brand. "IHG One Rewards" is already an IHG name and "IHG IHG One
// Rewards" is nobody's, while "Bonvoy" needs its Marriott. The first word is
// what decides it, because that is the word doing the naming — which keeps
// "Choice Privileges" from becoming "Choice Hotels Choice Privileges".
const firstWord=text=>String(text||'').trim().toLowerCase().split(/\s+/)[0]||'';
export function programName(source,name){
  const issuer=String(source||'').trim(),program=String(name||'').trim();
  if(!issuer||!program)return program||issuer;
  return program.toLowerCase().includes(issuer.toLowerCase())||firstWord(program)===firstWord(issuer)
    ?program:`${issuer} ${program}`;
}
// What a program is called in the wallet's own list, which is not the same
// question. The list is read down its figures, so the row says the brand a
// person says out loud — "United", "Marriott", "Amex" — and the registry is
// what knows it. A balance of a program nothing here recognizes says its own
// source, which is the shortest true thing there is about it, and only a
// balance with no source falls back to its name.
//
// Balances only. A card's name is the card — "Platinum Card" is not "Amex" —
// and a benefit's name is the benefit, so both keep what they are called.
export function programShort(entry){
  if(!entry||entry.kind!=='balance')return '';
  return loyaltyProgramNamed(entry.name,entry.source)?.short||String(entry.source||'').trim()||String(entry.name||'').trim();
}
// The runs the wallet is read in, in the order they are shown. A hotel's
// points and an airline's miles are spent on different things, so they are
// listed apart rather than in the order the entries happened to be saved; the
// cards you hold and their benefits are the last run, and anything no registry
// recognizes is the one after that rather than being filed under a guess.
export const WALLET_RUNS=[{key:'airline',title:'Airlines'},{key:'hotel',title:'Hotels'},
  {key:'rail',title:'Rail'},{key:'issuer',title:'Card points'},{key:'cards',title:'Cards'},
  {key:'other',title:'Other'}];
export function walletRun(entry){
  if(entry?.kind==='card')return 'cards';
  if(entry?.kind!=='balance')return 'other';
  return loyaltyProgramNamed(entry.name,entry.source)?.kind||'other';
}
const dirKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function directoryBalances(programs=[],entries=[],now=new Date().toISOString()){
  const held=entries.filter(entry=>entry?.kind==='balance'&&!entry.deleting);
  const names=new Set(held.map(entry=>dirKey(entry.name)));
  const sources=new Set(held.map(entry=>dirKey(entry.source)));
  // Holding the provider is enough to say a program is already there — "Amex
  // points" typed by hand is Membership Rewards — but only where the provider
  // runs one program. An issuer with two currencies would otherwise have its
  // second one answered for by its first.
  const single=new Map();
  for(const program of programs)single.set(dirKey(program.source),(single.get(dirKey(program.source))||0)+1);
  return programs
    .filter(program=>!names.has(dirKey(program.label))
      &&!(single.get(dirKey(program.source))===1&&sources.has(dirKey(program.source))))
    .map(program=>validateReward({
      kind:'balance',name:program.label,source:program.source,value:UNREAD_BALANCE,
      state:'available',card:'',cadence:'',due:'',url:program.url||'',
      notes:'',secret:'',secretHint:''
    },now));
}
