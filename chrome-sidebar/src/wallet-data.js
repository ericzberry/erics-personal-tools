// One wallet, one identity per thing in it.
//
// Four stores describe the owner's cards today: the rewards wallet's card
// entries, Best card's rate records, the offer catalogues' card names, and the
// account hints an issuer prints beside a card on its own pages. Each of them
// used to be reconciled again by whichever screen needed it, and each did it a
// little differently. This module is the one reading of "which account is
// that" — a product is not an account, two accounts of one product share its
// terms and nothing else, and the digits an issuer prints are the one thing
// that tells them apart — plus the small typed records the wallet keeps about
// itself: which page name is which account, what a currency is worth to the
// owner, which opportunity was dismissed, and what the owner is saving points
// for. Those records live in `/v1/wallet` through `wallet-offline.js`; this
// file validates them for the device and the Worker alike.
//
// Nothing here writes. The projections read the stores the tools already keep
// and hand back rows a screen can draw; the validator is the only thing that
// decides what a wallet record may contain.
import {walletCards,cardDigits,key,matchCard,cardWords} from './card-data.js';
import {LOYALTY_PROGRAMS,loyaltyProgramNamed} from './loyalty-sites.js';
import {rewardWorth,calendarDate} from './rewards-data.js';

export const WALLET_SCHEMA=2;
// The kinds of record the wallet keeps about itself, each keyed by what it is
// about so a second record for the same thing replaces the first.
export const WALLET_RECORD_KINDS=Object.freeze(['binding','resolution','valuation','goal']);
export const RESOLUTIONS=Object.freeze(['done','not_useful','remind','waiting','check']);
export const RESOLUTION_LABELS={done:'Done',not_useful:'Not useful to me',remind:'Remind me on…',waiting:'Waiting for credit',check:'Check later'};
const UUID=/^[a-f0-9-]{36}$/;
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const text=(value,max,label,required=false)=>{
  const trimmed=String(value??'').replace(/\s+/g,' ').trim();
  if(trimmed.length>max||(required&&!trimmed))fail(`Enter ${label} (up to ${max} characters).`);
  return trimmed;
};
// The name a page prints for a card, reduced to what identifies it: words and
// digits, lower case, one space. "Platinum Card® (-61007)" and "platinum card
// -61007" are one key.
export const bindingKey=value=>key(value);
export function validateWalletRecord(input,previous={}){
  const get=name=>input[name]??previous[name];
  const kind=get('kind');
  if(!WALLET_RECORD_KINDS.includes(kind))fail('Choose what kind of wallet record this is.');
  const record={kind,key:text(get('key'),200,'what this record is about',true)};
  if(kind==='binding'){
    const accountId=text(get('accountId'),36,'the account');
    if(!UUID.test(accountId))fail('A binding names a saved card.');
    return {...record,adapter:text(get('adapter'),40,'the source',true),accountId,label:text(get('label')??'',200,'the account name')};
  }
  if(kind==='resolution'){
    const action=get('action');
    if(!RESOLUTIONS.includes(action))fail('Choose what to do with this opportunity.');
    const until=text(get('until')??'',10,'the date to come back on');
    if(until&&!calendarDate(until))fail('Enter a valid date to come back on.');
    if(['remind','check'].includes(action)&&!until)fail('Say when to come back to it.');
    const at=text(get('at')??'',30,'the time this was decided');
    return {...record,action,until,fingerprint:text(get('fingerprint')??'',200,'the terms this decision was made on'),at:Number.isFinite(Date.parse(at))?at:new Date().toISOString()};
  }
  if(kind==='valuation'){
    const cents=Number(get('cents'));
    if(!Number.isFinite(cents)||cents<=0||cents>100)fail('Enter what a point is worth, in cents, above 0 and up to 100.');
    const asOf=text(get('asOf')??'',10,'the date');
    if(asOf&&!calendarDate(asOf))fail('Enter a valid date for the valuation.');
    return {...record,cents,source:text(get('source')??'',200,'where the value comes from'),asOf};
  }
  const by=text(get('by')??'',10,'the date');
  if(by&&!calendarDate(by))fail('Enter a valid target date.');
  const state=get('state')??'open';
  if(!['open','done'].includes(state))fail('A goal is open or done.');
  return {...record,text:text(get('text'),300,'the goal',true),by,state};
}

// The owner's card accounts, one row each, as the one thing every screen
// reads. `id` is the wallet entry's own id where the wallet holds the card,
// and empty where only a page ever named it; `cardId` is the Best card record
// carrying the product's terms, shared by every account of that product.
export function cardAccounts(entries=[],cards=[]){
  return walletCards(entries,cards).map(row=>{
    const entry=row.id?entries.find(other=>other.id===row.id)||null:null;
    return {id:row.id,product:row.product,hint:row.digits,cardId:row.card?.id||null,ambiguous:row.ambiguous,
      name:row.product,source:entry?.source||row.card?.source||'',entry,card:row.card||null};
  });
}
// Which account a page's name for a card is. In order: a binding the owner
// confirmed for that exact name, the digits where exactly one account carries
// them, then the words that tell products apart — and a name whose digits
// match no account with digits is nobody's, however well its words fit,
// because conflicting digits are the one thing that proves two cards differ.
// Missing digits prove nothing either way. A tie is a question, and the
// candidates come back so the screen can ask it once and keep the answer.
export function matchAccount(name,accounts=[],bindings=[],{adapter=''}={}){
  const wanted=bindingKey(name);
  const bound=wanted?bindings.find(binding=>binding.kind==='binding'&&binding.key===wanted&&(!adapter||binding.adapter===adapter)):null;
  const byBinding=bound?accounts.find(account=>account.id===bound.accountId):null;
  if(byBinding)return {account:byBinding,candidates:[],bound:true};
  const digits=cardDigits(name);
  const known=accounts.filter(account=>account.hint);
  if(digits){
    const same=known.filter(account=>account.hint===digits);
    if(same.length===1)return {account:same[0],candidates:[],bound:false};
    if(same.length>1)return {account:null,candidates:same,bound:false};
    if(known.length&&known.length===accounts.length)return {account:null,candidates:[],bound:false,conflict:true};
  }
  // Words decide among the accounts whose digits do not contradict the name.
  const eligible=digits?accounts.filter(account=>!account.hint):accounts;
  const {card,ambiguous}=matchCard(name,eligible.map(account=>({name:account.product,account})));
  if(card)return {account:card.account,candidates:[],bound:false};
  if(!ambiguous)return {account:null,candidates:[],bound:false};
  // The tie: every account sharing the most of the name's distinguishing words.
  const asked=cardWords(name);
  const scored=eligible.map(account=>({account,score:cardWords(account.product).filter(word=>asked.includes(word)).length}));
  const best=Math.max(...scored.map(entry=>entry.score));
  return {account:null,candidates:scored.filter(entry=>entry.score===best).map(entry=>entry.account),bound:false};
}
// Rows a page reading proposed, with the accounts the owner once confirmed
// for their names filled in, so the same question is not asked on every read.
// A row's `holder` is the wallet card entry, as `matchCredits` sets it.
export function applyBindings(rows=[],bindings=[],entries=[],{adapter=''}={}){
  const cards=entries.filter(entry=>entry?.kind==='card'&&!entry.deleting);
  return rows.map(row=>{
    if(!row.card)return row;
    const wanted=bindingKey(row.card);
    const bound=bindings.find(binding=>binding.kind==='binding'&&binding.key===wanted&&(!adapter||binding.adapter===adapter));
    const holder=bound?cards.find(card=>card.id===bound.accountId):null;
    return holder?{...row,holder,ambiguous:false,bound:true}:row;
  });
}
// The binding a choice makes: this page name is that account, on this source.
export const bindingFor=(adapter,pageName,account)=>validateWalletRecord({kind:'binding',adapter,key:bindingKey(pageName),accountId:account.id,label:account.name||account.product||''});

// How fresh a fact has to be before a recommendation may lean on it. Public
// terms hold a month; what a tracker said was left, and which offers a card
// has, a week; a balance a month for reading and a week when points are about
// to be spent; enrollment a quarter. These are the product's defaults, not a
// promise: a changed period or a contradicting page invalidates sooner.
export const FRESH_DAYS=Object.freeze({terms:30,credits:7,offers:7,balance:30,redemption:7,access:90});
const DAY=86400000;
// Whole calendar days between a recorded date and today, on the date the
// record carries: a reading dated the 20th is two days old on the 22nd
// wherever the device is.
const daysSince=(at,now)=>{
  const day=String(at||'').slice(0,10);
  if(!calendarDate(day))return null;
  return Math.round((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.parse(day))/DAY);
};
const state=(at,limit,now)=>{
  const days=daysSince(at,now);
  return days===null?'missing':days>limit?'stale':'read';
};
// The programs an issuer's card earns into. One currency per issuer is the
// usual case and is answered outright; an issuer running two — Membership
// Rewards and Reward Dollars — is answered by the card's own terms where Best
// card keeps them in cash or in points, and otherwise not answered at all.
export function accountPrograms(account){
  const issuer=key(account.source);
  const mine=LOYALTY_PROGRAMS.filter(program=>program.kind==='issuer'&&key(program.source)===issuer);
  if(mine.length<=1)return mine;
  const unit=account.card?.unit;
  if(!unit)return mine;
  return mine.filter(program=>unit==='cash'?program.unit==='dollars':program.unit!=='dollars');
}
// What the wallet knows about one account, kind by kind, and what it has not
// got: the terms it earns on, what its trackers last said, the offers read for
// it, and the balance it earns into. Each kind says when it was last read and
// whether that is recent enough to lean on. An attempt that failed advances
// nothing; only a save does, which is what `updatedAt` records.
export function accountCoverage(account,{entries=[],catalogs=[]}={},now=new Date()){
  const kinds=[];
  const terms=account.card;
  kinds.push({kind:'terms',label:'Earning terms',
    state:!terms?'missing':state(terms.checked||'',FRESH_DAYS.terms,now),
    at:terms?.checked||'',
    next:terms?'':'Add its earning rates under Pay.'});
  const credits=entries.filter(entry=>!entry?.deleting&&entry.card===account.id&&['benefit','membership'].includes(entry.kind)&&entry.state!=='used'&&rewardWorth(entry)!==null);
  if(credits.length){
    const read=credits.filter(entry=>entry.remaining);
    const newest=read.map(entry=>entry.updatedAt).sort().at(-1)||'';
    const freshness=state(newest,FRESH_DAYS.credits,now);
    kinds.push({kind:'credits',label:'Credit trackers',
      state:!read.length?'missing':read.length<credits.length?'partial':freshness,
      at:newest?newest.slice(0,10):'',
      detail:`${read.length} of ${credits.length} read`,
      next:read.length<credits.length||freshness!=='read'?'Open the card’s benefits page and read it.':''});
  }
  const mine=catalogs.filter(catalog=>(catalog?.offers||[]).some(offer=>offer.card&&sameAccount(offer.card,account)));
  const offerCount=mine.reduce((count,catalog)=>count+catalog.offers.filter(offer=>sameAccount(offer.card,account)).length,0);
  const readAt=mine.map(catalog=>catalog.readAt||catalog.updatedAt||'').sort().at(-1)||'';
  kinds.push({kind:'offers',label:'Offers',
    state:!mine.length?'missing':state(readAt,FRESH_DAYS.offers,now),
    at:readAt?readAt.slice(0,10):'',
    detail:offerCount?`${offerCount} read${mine.every(catalog=>catalog.complete)?'':', list may be partial'}`:'',
    next:mine.length?'':'Open the issuer’s offers page for this card and read it.'});
  const programs=accountPrograms(account);
  if(programs.length===1){
    const [program]=programs;
    const balance=entries.find(entry=>entry?.kind==='balance'&&!entry.deleting&&loyaltyProgramNamed(entry.name,entry.source)?.id===program.id);
    const figure=!!balance&&/\d/.test(String(balance.value||''));
    kinds.push({kind:'balance',label:program.label,
      state:!figure?'missing':state(balance.updatedAt,FRESH_DAYS.balance,now),
      at:figure?String(balance.updatedAt||'').slice(0,10):'',
      next:figure?'':`Open the ${program.source} rewards page and read it.`});
  }else if(programs.length>1){
    kinds.push({kind:'balance',label:'Points program',state:'unknown',at:'',
      next:`Which of ${programs.map(program=>program.label).join(' and ')} this card earns into is not confirmed; add its earning rates under Pay.`});
  }
  return {account,kinds};
}
// Whether a catalogue's card name is this account. Digits first, then the
// product; a name whose digits contradict the account's is not it.
export function sameAccount(pageName,account){
  const digits=cardDigits(pageName);
  if(digits&&account.hint)return digits===account.hint;
  return matchCard(pageName,[{...account,name:account.product}]).card!==null;
}
const WORDS={read:'read',stale:'read',partial:'partly read',missing:'not read',unknown:'not confirmed'};
// The one line the wallet says about an account: "credit trackers read
// 2026-09-20 · offers not read · Membership Rewards read 2026-09-01".
export function coverageLine(coverage,now=new Date()){
  return coverage.kinds.map(kind=>{
    const when=kind.at?daysSince(kind.at,now):null;
    const age=when===null?'':when<=0?'today':when===1?'yesterday':`${when} days ago`;
    return [kind.label.toLowerCase(),WORDS[kind.state],kind.state==='read'||kind.state==='stale'||kind.state==='partial'?age:''].filter(Boolean).join(' ');
  }).join(' · ');
}
// What the wallet has not got, across every account: one row per missing or
// stale kind, with the page that would supply it. This is what Update wallet
// lists instead of pretending to connect to an issuer.
export function walletGaps(accounts=[],{entries=[],catalogs=[]}={},now=new Date()){
  return accounts.flatMap(account=>accountCoverage(account,{entries,catalogs},now).kinds
    .filter(kind=>kind.state!=='read')
    .map(kind=>({account,kind:kind.kind,label:kind.label,state:kind.state,at:kind.at,next:kind.next||`Read it again; the last reading is ${kind.at}.`})));
}
