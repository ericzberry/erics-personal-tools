import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCreditReading,parseBenefitReading,matchCredits,matchCard,creditRecord,benefitRecord,creditAmount,CREDIT_LIMIT} from '../src/credit-data.js';
import {nextActions,validateReward} from '../src/rewards-data.js';

const now=new Date().toISOString();
const card=(id,name)=>validateReward({kind:'card',name,source:'American Express',value:'5x flights',state:'available'},now);
const held=(id,name)=>({...card(id,name),id});
const benefit=(id,name,cardId,extra={})=>({id,kind:'benefit',name,source:'Amex Platinum',value:'$200 per calendar year',
  state:'available',cadence:'annual',card:cardId,notes:'Select one airline in January.',url:'https://amex.example/credit',
  remaining:'',updatedAt:now,...extra});

// The tracker states two figures and they mean opposite things. "$0 Earned /
// $200 To Go" is a credit with all of it left, and reading it the other way
// round would say the owner had spent a credit they have not touched.
test('a tracker is read for what is left, and a credit with no such figure is refused',()=>{
  const rows=parseCreditReading({credits:[
    {credit:'$200 Airline Fee Credit',card:'Morgan Stanley Platinum Card (-61007)',amount:200,remaining:200,cadence:'annual',confidence:'high'},
    {credit:'$300 Digital Entertainment Credit',card:'Morgan Stanley Platinum Card (-61007)',amount:25,remaining:'$25',cadence:'monthly',notes:'$67 earned this year.'},
    {credit:'Hotel Credit',card:'Morgan Stanley Platinum Card (-61007)',amount:200,remaining:'not stated'},
    {credit:'',card:'Morgan Stanley Platinum Card (-61007)',amount:100,remaining:10}
  ]},'American Express');
  assert.deepEqual(rows.map(row=>[row.name,row.left,row.value,row.cadence]),[
    ['$200 Airline Fee Credit','$200','$200','annual'],
    ['$300 Digital Entertainment Credit','$25','$25','monthly']
  ],'a credit whose remaining cannot be worked out is left out, and so is one with no name');
  assert.equal(rows[1].notes,'$67 earned this year.','what the year holds behind a monthly figure is said, not stored as the figure');
});

test('a credit reading reads money as money and refuses what is not a figure',()=>{
  assert.equal(creditAmount('$1,234.50'),1234.5);
  assert.equal(creditAmount('$0 Earned'),0);
  assert.equal(creditAmount('none'),null);
  assert.equal(creditAmount(''),null);
  const credits=Array.from({length:CREDIT_LIMIT+1},(_,index)=>({credit:`C${index}`,amount:1,remaining:1}));
  assert.throws(()=>parseCreditReading({credits}),/at most/);
  // The same credit stated twice is one credit, the first reading of it kept.
  const twice=parseCreditReading({credits:[{credit:'Airline Fee Credit',amount:200,remaining:200},
    {credit:'airline fee credit',amount:200,remaining:0}]});
  assert.deepEqual(twice.map(row=>row.left),['$200']);
});

// The page names the card its trackers belong to, and the wallet holds whatever
// research called it. Filing a Platinum's credits under a Blue Cash is worse
// than filing them under nothing.
test('a credit is filed under the card the page names, and a tie files it under none',()=>{
  const cards=[held('11111111-1111-4111-8111-111111111111','The Platinum Card® from American Express (Morgan Stanley)'),
    held('22222222-2222-4222-8222-222222222222','Blue Cash Preferred® Card from American Express')];
  assert.equal(matchCard('Morgan Stanley Platinum Card® (-61007)',cards).card?.id,'11111111-1111-4111-8111-111111111111');
  assert.equal(matchCard('Blue Cash Preferred® ••••72005',cards).card?.id,'22222222-2222-4222-8222-222222222222');
  // Words every card at the issuer shares name none of them in particular.
  assert.deepEqual(matchCard('American Express Card',cards),{card:null,ambiguous:false});
  assert.equal(matchCard('Platinum Blue',cards).ambiguous,true,'a name that fits both equally files under neither');
});

test('a read credit updates the benefit already in the wallet and keeps what is the owner’s',()=>{
  const cardId='11111111-1111-4111-8111-111111111111';
  const entries=[held(cardId,'The Platinum Card® from American Express (Morgan Stanley)'),
    benefit('airline-id','Airline Fee Credit',cardId)];
  const [row]=matchCredits(parseCreditReading({credits:[
    {credit:'$200 Airline Fee Credit',card:'Morgan Stanley Platinum Card (-61007)',amount:200,remaining:75,cadence:'annual'}
  ]},'American Express'),entries);
  assert.equal(row.match?.id,'airline-id','the amount the page writes into the title is still the same credit');
  const saved=creditRecord(row,row.match,row.holder);
  assert.equal(saved.id,'airline-id');
  assert.equal(saved.remaining,'$75');
  assert.equal(saved.value,'$200 per calendar year','the card’s terms are not replaced by this period’s figure');
  assert.equal(saved.notes,'Select one airline in January.','and neither are the owner’s notes');
  assert.equal(saved.url,'https://amex.example/credit');
  assert.equal(saved.state,'available');
});

test('a credit with nothing left is used until it resets, and never raised in Next actions meanwhile',()=>{
  const cardId='11111111-1111-4111-8111-111111111111';
  const entries=[held(cardId,'The Platinum Card® from American Express (Morgan Stanley)'),
    benefit('airline-id','Airline Fee Credit',cardId)];
  const spent=creditRecord(...(([row])=>[row,row.match,row.holder])(
    matchCredits(parseCreditReading({credits:[{credit:'Airline Fee Credit',card:'Morgan Stanley Platinum',amount:200,remaining:0}]}),entries)));
  assert.equal(spent.state,'used');
  assert.equal(spent.remaining,'$0');
  assert.equal(nextActions([spent],new Date()).length,0,'a credit with nothing left is nothing to do');
  // And the next reading, once the period has turned over, gives it back.
  const [again]=matchCredits(parseCreditReading({credits:[{credit:'Airline Fee Credit',card:'Morgan Stanley Platinum',amount:200,remaining:200}]}),[...entries.slice(0,1),{...spent,id:'airline-id'}]);
  assert.equal(creditRecord(again,again.match,again.holder).state,'available');
});

test('a credit the page files under no card still says where it came from',()=>{
  const [row]=matchCredits(parseCreditReading({credits:[{credit:'Uber Cash',amount:15,remaining:15,cadence:'monthly'}]},'American Express'),[]);
  const saved=creditRecord(row,null,null);
  assert.equal(saved.source,'American Express');
  assert.equal(saved.card,'','it is filed loose rather than under a card it might not belong to');
  assert.equal(saved.value,'$15');
  assert.equal(saved.cadence,'monthly');
});

test('a credit reading never overwrites a balance or a card',()=>{
  const entries=[{id:'balance-id',kind:'balance',name:'Membership Rewards',source:'American Express',value:'13,674 points',state:'available',updatedAt:now},
    held('33333333-3333-4333-8333-333333333333','Membership Rewards Card')];
  const [row]=matchCredits(parseCreditReading({credits:[{credit:'Membership Rewards',card:'Membership Rewards Card',amount:100,remaining:100}]}),entries);
  assert.equal(row.match,null,'a balance of the same name is not a credit');
  assert.equal(creditRecord(row,null,row.holder).kind,'benefit');
});

// A tracker is only one kind of thing a card's benefits page lists. A lounge
// program, elite status, a Global Entry credit, an included subscription — none
// of them has a "left this period", and for an invitation-only card they are
// exactly what research against public pages is worst at finding.
test('a benefit with no tracker is read and created rather than dropped for having no figure',()=>{
  const cardId='11111111-1111-4111-8111-111111111111';
  const entries=[held(cardId,'The Platinum Card® from American Express (Morgan Stanley)')];
  const rows=parseBenefitReading({benefits:[
    {benefit:'Priority Pass Select',card:'Morgan Stanley Platinum Card (-61007)',kind:'membership',
      value:'Priority Pass Select membership',state:'activation',url:'https://amex.example/lounge',notes:'Enroll once.'},
    {benefit:'Global Entry credit',card:'Morgan Stanley Platinum Card (-61007)',kind:'benefit',
      value:'$120 every four years',cadence:'nonsense',due:'not a date',url:'http://insecure.example'},
    {benefit:'Nothing stated',card:'Morgan Stanley Platinum Card (-61007)',kind:'benefit',value:''}
  ]},'American Express');
  assert.deepEqual(rows.map(row=>[row.name,row.kind,row.value,row.state]),[
    ['Priority Pass Select','membership','Priority Pass Select membership','activation'],
    ['Global Entry credit','benefit','$120 every four years','available']
  ],'a benefit with nothing stated for what it is worth is left out; the rest keep their kind');
  assert.equal(rows[1].cadence,'','a reset period the wallet does not know is dropped, not stored');
  assert.equal(rows[1].due,'');
  assert.equal(rows[1].url,'','and a link that is not HTTPS never reaches a record');

  const matched=matchCredits(rows,entries);
  const lounge=benefitRecord(matched[0],null,matched[0].holder);
  assert.equal(lounge.kind,'membership');
  assert.equal(lounge.card,cardId,'it is filed under the card the page names');
  assert.equal(lounge.state,'activation','a benefit that still needs enrolling says so');
  assert.equal(lounge.remaining,'','and a membership is never given a remaining of zero, which would mark it spent');
  assert.equal(lounge.url,'https://amex.example/lounge');
  assert.equal(nextActions([lounge],new Date()).some(entry=>entry.reason==='Activate before using'),true);
});

test('a benefit already in the wallet is filled in rather than duplicated or overwritten',()=>{
  const cardId='11111111-1111-4111-8111-111111111111';
  const saved=benefit('lounge-id','Priority Pass Select',cardId,{kind:'membership',value:'Lounge access',
    notes:'Mine, typed by hand.',url:'https://mine.example/lounge',cadence:'',state:'available'});
  const entries=[held(cardId,'The Platinum Card® from American Express (Morgan Stanley)'),saved];
  const [row]=matchCredits(parseBenefitReading({benefits:[
    {benefit:'Priority Pass Select',card:'Morgan Stanley Platinum Card (-61007)',kind:'membership',
      value:'Priority Pass Select membership',state:'activation',url:'https://amex.example/lounge',notes:'Enroll once.'}
  ]},'American Express'),entries);
  assert.equal(row.match?.id,'lounge-id');
  const record=benefitRecord(row,row.match,row.holder);
  assert.equal(record.id,'lounge-id','one entry, not two');
  assert.equal(record.value,'Lounge access','what the owner wrote stands');
  assert.equal(record.notes,'Mine, typed by hand.');
  assert.equal(record.url,'https://mine.example/lounge');
  assert.equal(record.state,'available','and the page does not decide a status the owner already set');
});

// One press, two lists, one wallet. A saved entry may be claimed by a credit or
// by an untracked benefit, never by both.
test('a credit and a benefit never claim the same saved entry',()=>{
  const cardId='11111111-1111-4111-8111-111111111111';
  const entries=[held(cardId,'The Platinum Card® from American Express (Morgan Stanley)'),
    benefit('airline-id','Airline Fee Credit',cardId)];
  const claimed=new Set();
  const [credit]=matchCredits(parseCreditReading({credits:[
    {credit:'$200 Airline Fee Credit',card:'Morgan Stanley Platinum',amount:200,remaining:75,cadence:'annual'}]}),entries,claimed);
  const [extra]=matchCredits(parseBenefitReading({benefits:[
    {benefit:'Airline Fee Credit',card:'Morgan Stanley Platinum',kind:'benefit',value:'$200 per calendar year'}]}),entries,claimed);
  assert.equal(credit.match?.id,'airline-id');
  assert.equal(extra.match,null,'the second list finds the entry already claimed and proposes a new record instead');
});

test('a page stating benefits but no rates still gives up its benefits',()=>{
  const rows=parseBenefitReading({balances:[],credits:[],rates:[],benefits:[
    {benefit:'Hyatt Discoverist',kind:'membership',value:'Discoverist status',card:'J.P. Morgan Reserve'}
  ]},'Chase');
  assert.deepEqual(rows.map(row=>[row.name,row.kind]),[['Hyatt Discoverist','membership']]);
  assert.equal(rows[0].source,'Chase');
  assert.deepEqual(parseBenefitReading({rates:[]},'Chase'),[],'and a page stating none returns none');
});
