import test from 'node:test';
import assert from 'node:assert/strict';
import {loyaltySite,loyaltySitePrograms,loyaltyProgramNamed,LOYALTY_PROGRAMS} from '../src/loyalty-sites.js';
import {balanceTotals,readBalance,parseBalanceReading,matchBalances,balanceRecord,BALANCE_LIMIT,BALANCE_UNITS,directoryBalances,programName,UNREAD_BALANCE} from '../src/balance-data.js';
import {nextActions} from '../src/rewards-data.js';
import {pageOffers} from '../src/page-offers.js';

const balance=(name,source,value,updatedAt=new Date().toISOString())=>({id:`${name}-id`,kind:'balance',name,source,value,state:'available',updatedAt});

test('a program is recognized by its own site, over HTTPS and nothing else',()=>{
  assert.equal(loyaltySite('https://www.united.com/en/us/myunited')?.id,'united');
  assert.equal(loyaltySite('https://www.marriott.com/loyalty/myAccount/default.mi')?.unit,'points');
  assert.equal(loyaltySite('http://united.com/'),null,'a balance read over plain HTTP is not this program');
  assert.equal(loyaltySite('https://united.com.example.invalid/'),null,'a lookalike host is not the program');
  assert.equal(loyaltySite('https://example.invalid/'),null);
});

test('every program names itself, its source, and the unit its balance is counted in',()=>{
  const ids=new Set();
  for(const program of LOYALTY_PROGRAMS){
    assert.ok(program.id&&program.label&&program.source,`${program.id} names itself`);
    assert.ok(BALANCE_UNITS.includes(program.unit),`${program.id} counts in a known unit`);
    assert.ok(program.hosts.length,`${program.id} is recognized by a host`);
    assert.equal(ids.has(program.id),false,'program ids are unique');
    ids.add(program.id);
  }
});

// An issuer runs a currency per kind of card, and prints them all on one page.
// Two Amex cards is the case: the points cards earn Membership Rewards and the
// cash-back card earns Reward Dollars, which is money and not points.
test('a site states every currency its issuer runs, not just the first',()=>{
  const amex=loyaltySite('https://global.americanexpress.com/rewards/summary');
  const programs=loyaltySitePrograms(amex);
  assert.deepEqual(programs.map(program=>program.label),['Membership Rewards','Reward Dollars']);
  assert.deepEqual(programs.map(program=>program.unit),['points','dollars']);
  assert.deepEqual(loyaltySitePrograms(loyaltySite('https://www.united.com/')).map(program=>program.id),['united']);
  assert.deepEqual(loyaltySitePrograms(null),[]);
});

test('cash back is kept as money, on a line of its own and never folded into points',()=>{
  const amex=loyaltySitePrograms(loyaltySite('https://global.americanexpress.com/'));
  const rows=parseBalanceReading({balances:[
    {program:'Membership Rewards',source:'American Express',amount:'13,674',unit:'points',confidence:'high'},
    // A reading that calls reward dollars points is still reward dollars: the
    // registry knows what the program counts in, and 125 points would be wrong
    // rather than merely missing.
    {program:'Reward Dollars',source:'American Express',amount:'125.49',unit:'points',confidence:'high'}
  ]},amex);
  assert.deepEqual(rows.map(row=>[row.name,row.unit,row.value]),[
    ['Membership Rewards','points','13,674 points'],
    ['Reward Dollars','dollars','$125.49']
  ]);
  const {totals}=balanceTotals(rows.map(row=>balanceRecord(row,null)));
  assert.deepEqual(totals.map(total=>[total.unit,total.amount]),[['points',13674],['dollars',125.49]],
    'money and points are counted apart');
});

test('a second currency at one issuer never lands on the first one’s entry',()=>{
  const entries=[balance('Membership Rewards','American Express','13,674 points')];
  const amex=loyaltySitePrograms(loyaltySite('https://global.americanexpress.com/'));
  const rows=matchBalances(parseBalanceReading({balances:[
    {program:'Reward Dollars',source:'American Express',amount:'125.49',unit:'dollars'},
    {program:'Membership Rewards',source:'American Express',amount:'14,000',unit:'points'}
  ]},amex),entries);
  assert.equal(rows[0].match,null,'cash back is a new balance, not an overwrite of the points one');
  assert.equal(rows[0].ambiguous,false,'and it is not ambiguous either — the page named it');
  assert.equal(rows[1].match?.id,'Membership Rewards-id','the points figure still updates the points entry');
});

test('the wallet totals miles and points separately, and never adds them together',()=>{
  const {totals}=balanceTotals([
    balance('MileagePlus','United Airlines','82,431 miles'),
    balance('Mileage Plan','Alaska Airlines','12,000 miles'),
    balance('Bonvoy','Marriott','240,000 points'),
    {kind:'benefit',name:'Dining credit',source:'Amex',value:'$15 per month',updatedAt:new Date().toISOString()}
  ]);
  assert.deepEqual(totals.map(total=>[total.unit,total.amount,total.programs]),
    [['points',240000,1],['miles',94431,2]],'largest first, one line per unit, benefits left out');
});

test('a balance with no figure in it is counted in neither total rather than as zero',()=>{
  const summary=balanceTotals([balance('Gold','Hyatt','Globalist status'),balance('Bonvoy','Marriott','240,000 points')]);
  assert.equal(summary.unread,1);
  assert.deepEqual(summary.totals.map(total=>total.amount),[240000]);
});

test('an entry whose value states no unit takes it from the program name',()=>{
  assert.deepEqual(readBalance(balance('Membership Rewards','American Express','512,000')),{amount:512000,unit:'points'});
  assert.deepEqual(readBalance(balance('MileagePlus','United Airlines','82,431')),{amount:82431,unit:'miles'});
  assert.equal(readBalance({kind:'card',name:'Platinum',source:'Amex',value:'5x flights'}),null);
});

test('a total says how much of it is a month old, because a total is only as current as its oldest figure',()=>{
  const summary=balanceTotals([
    balance('Bonvoy','Marriott','240,000 points','2020-01-01T00:00:00.000Z'),
    balance('MileagePlus','United Airlines','1,000 miles')
  ]);
  assert.equal(summary.stale,1);
});

test('a reading keeps only the figures it can check',()=>{
  const program=loyaltySite('https://www.united.com/');
  const rows=parseBalanceReading({balances:[
    {program:'MileagePlus',source:'United Airlines',amount:'82,431',unit:'miles',confidence:'high'},
    {program:'MileagePlus',source:'United Airlines',amount:'not a number'},
    {program:'PlusPoints',source:'United Airlines',amount:'not a number',unit:'points'},
    {program:'MileagePlus',source:'United Airlines',amount:'100',unit:'miles'}
  ]},program);
  assert.equal(rows.length,1,'an unreadable figure is dropped, and the same program is not read twice');
  assert.deepEqual([rows[0].name,rows[0].value,rows[0].confidence],['MileagePlus','82,431 miles','high']);
});

test('a reading that names no program takes the one whose page it was read from',()=>{
  const program=loyaltySite('https://www.marriott.com/');
  const [row]=parseBalanceReading({balances:[{amount:'240000'}]},program);
  assert.deepEqual([row.name,row.source,row.value],['Bonvoy','Marriott','240,000 points']);
});

test('a reading is refused when it returns more balances than a page could hold',()=>{
  const balances=Array.from({length:BALANCE_LIMIT+1},(_,index)=>({program:`P${index}`,source:'S',amount:'1'}));
  assert.throws(()=>parseBalanceReading({balances}),/at most/);
});

test('a read balance updates the entry already in the wallet instead of adding a second one',()=>{
  const entries=[balance('MileagePlus','United Airlines','70,000 miles'),balance('Bonvoy','Marriott','10 points')];
  const [row]=matchBalances(parseBalanceReading({balances:[{program:'Mileage Plus',source:'United Airlines',amount:'82431',unit:'miles'}]}),entries);
  assert.equal(row.match?.id,'MileagePlus-id','matched by its source when the name is spelled differently');
  const saved=balanceRecord(row,row.match);
  assert.equal(saved.value,'82,431 miles');
  assert.equal(saved.id,row.match.id);
  assert.equal(saved.name,'MileagePlus','the entry keeps the name the owner gave it');
});

test('a balance reading never overwrites a benefit or a card',()=>{
  const entries=[{id:'card-id',kind:'card',name:'MileagePlus Explorer',source:'United Airlines',value:'2x United',state:'available',updatedAt:new Date().toISOString()}];
  const [row]=matchBalances(parseBalanceReading({balances:[{program:'MileagePlus',source:'United Airlines',amount:'1000',unit:'miles'}]}),entries);
  assert.equal(row.match,null);
  assert.equal(balanceRecord(row,null).kind,'balance');
});

test('a program page offers the wallet the reading, and no other page does',()=>{
  const [offer]=pageOffers({url:'https://www.aa.com/loyalty/summary'});
  assert.deepEqual([offer.capability,offer.label],['rewards','Read your AAdvantage balance']);
  assert.equal(pageOffers({url:'https://example.invalid/'}).length,0);
  assert.equal(pageOffers({url:'https://www.aa.com/',active:'rewards'}).length,0,'no offer to go where the owner already is');
});

// The wallet as a directory of programs: every program this tool knows, each
// carrying the page its balance is printed on, so reaching that page is one
// press rather than a search through a marketing site.
test('every program carries the page its balance is printed on',()=>{
  for(const program of LOYALTY_PROGRAMS){
    const url=new URL(program.url);
    assert.equal(url.protocol,'https:',`${program.id} links over HTTPS`);
    assert.ok(!url.username&&!url.password,`${program.id} carries no credentials in its link`);
    assert.ok(program.hosts.some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`)
      ||host.split('.').slice(-2).join('.')===url.hostname.split('.').slice(-2).join('.')),
      `${program.id} links to its own site, not somewhere else`);
  }
});

test('the directory seeds one entry per program, and never a second time',()=>{
  const seeded=directoryBalances(LOYALTY_PROGRAMS,[]);
  assert.equal(seeded.length,LOYALTY_PROGRAMS.length,'every program arrives');
  assert.ok(seeded.every(entry=>entry.kind==='balance'&&entry.url&&entry.value===UNREAD_BALANCE));
  assert.equal(directoryBalances(LOYALTY_PROGRAMS,seeded).length,0,'seeding an already-seeded wallet adds nothing');
  // A program the owner already keeps by hand is theirs; the directory leaves it alone.
  const byHand=[balance('MileagePlus','United Airlines','42,000 miles')];
  const rest=directoryBalances(LOYALTY_PROGRAMS,byHand);
  assert.equal(rest.length,LOYALTY_PROGRAMS.length-1);
  assert.ok(!rest.some(entry=>entry.name==='MileagePlus'),'the saved MileagePlus entry is not duplicated');
  // Holding the provider answers for its program only where it runs one. An
  // issuer with two currencies still owes the wallet its second.
  const amexPoints=[balance('Membership Rewards','American Express','13,674 points')];
  assert.ok(directoryBalances(LOYALTY_PROGRAMS,amexPoints).some(entry=>entry.name==='Reward Dollars'),
    'the issuer’s other currency is still offered');
});

test('a program awaiting its first reading is counted as unread, never as a total or a stale figure',()=>{
  const seeded=directoryBalances(LOYALTY_PROGRAMS,[]);
  const totals=balanceTotals(seeded);
  assert.equal(totals.totals.length,0,'nothing with no figure lands in a total');
  assert.equal(totals.unread,LOYALTY_PROGRAMS.length);
  assert.equal(totals.stale,0);
  // And it never becomes a Next action, however long it sits there: a directory
  // of programs would otherwise arrive as a list of nags a month after it was added.
  const old=seeded.map(entry=>({...entry,updatedAt:new Date('2020-01-01').toISOString()}));
  assert.equal(nextActions(old,new Date()).length,0);
  // A balance that does state a figure is still raised once it goes out of date.
  const read=[{...balance('Bonvoy','Marriott','42,000 points'),updatedAt:new Date('2020-01-01').toISOString()}];
  assert.equal(nextActions(read,new Date())[0]?.reason,'Update this balance');
});

// Every program in the catalogue is named the way its owner would say it, in
// the wallet and in the panel that reads it — which for half of them means the
// issuer is already in the name and must not be said again.
test('a program is named once: the issuer joins its name only where the name lacks it',()=>{
  assert.equal(programName('IHG','IHG One Rewards'),'IHG One Rewards');
  assert.equal(programName('Marriott','Bonvoy'),'Marriott Bonvoy');
  assert.equal(programName('United Airlines','MileagePlus'),'United Airlines MileagePlus');
  assert.equal(programName('Hilton','Hilton Honors'),'Hilton Honors');
  assert.equal(programName('Hyatt','World of Hyatt'),'World of Hyatt');
  // The brand is the word that names the program, so a longer issuer saying
  // the same word adds nothing.
  assert.equal(programName('Choice Hotels','Choice Privileges'),'Choice Privileges');
  assert.equal(programName('','Bonvoy'),'Bonvoy');
  assert.equal(programName('Marriott',''),'Marriott');
  // Nothing in the catalogue comes out saying its brand twice.
  for(const program of LOYALTY_PROGRAMS){
    const name=programName(program.source,program.label);
    const first=name.toLowerCase().split(/\s+/)[0];
    assert.equal(name.toLowerCase().split(/\s+/).filter(word=>word===first).length,1,`${name} repeats its own first word`);
  }
});

test('a reading fills in the directory entry and leaves the owner’s own link alone',()=>{
  const program=LOYALTY_PROGRAMS.find(entry=>entry.id==='united');
  const [row]=parseBalanceReading({balances:[{program:'MileagePlus',source:'United Airlines',amount:42000,unit:'miles'}]},program);
  assert.equal(row.url,program.url,'a reading carries the page it was read from');
  // A new entry takes the program's page.
  assert.equal(balanceRecord(row,null).url,program.url);
  // An entry the owner gave a link of their own keeps it.
  const mine={...balance('MileagePlus','United Airlines','1 mile'),url:'https://example.com/my-own-page',
    card:'',cadence:'',due:'',notes:'',secret:'',secretHint:''};
  assert.equal(balanceRecord(row,mine).url,'https://example.com/my-own-page');
  assert.equal(balanceRecord(row,mine).value,'42,000 miles','the figure is still the one just read');
});

// Every program in the catalogue is named the way its owner would say it, in
// the wallet and in the panel that reads it — which for half of them means the
// issuer is already in the name and must not be said again.
test('a program is named once: the issuer joins its name only where the name lacks it',()=>{
  assert.equal(programName('IHG','IHG One Rewards'),'IHG One Rewards');
  assert.equal(programName('Marriott','Bonvoy'),'Marriott Bonvoy');
  assert.equal(programName('United Airlines','MileagePlus'),'United Airlines MileagePlus');
  assert.equal(programName('Hilton','Hilton Honors'),'Hilton Honors');
  assert.equal(programName('Hyatt','World of Hyatt'),'World of Hyatt');
  // The brand is the word that names the program, so a longer issuer saying
  // the same word adds nothing.
  assert.equal(programName('Choice Hotels','Choice Privileges'),'Choice Privileges');
  assert.equal(programName('','Bonvoy'),'Bonvoy');
  assert.equal(programName('Marriott',''),'Marriott');
  // Nothing in the catalogue comes out saying its brand twice.
  for(const program of LOYALTY_PROGRAMS){
    const name=programName(program.source,program.label);
    const first=name.toLowerCase().split(/\s+/)[0];
    assert.equal(name.toLowerCase().split(/\s+/).filter(word=>word===first).length,1,`${name} repeats its own first word`);
  }
});

// A balance saved before the registry carried a page — typed by hand, or read
// when nothing was stored beside the figure — is still a balance in a program
// this tool knows, so the program is found by the name the entry carries.
test('a saved balance finds its program by the name it carries',()=>{
  assert.equal(loyaltyProgramNamed('MileagePlus','United Airlines')?.id,'united');
  assert.equal(loyaltyProgramNamed('Bonvoy','Marriott')?.id,'marriott');
  assert.equal(loyaltyProgramNamed('IHG One Rewards','IHG')?.id,'ihg');
  // The owner writes the brand into the name as often as not, and spells the
  // provider their own way; the program's own name settles both.
  assert.equal(loyaltyProgramNamed('Marriott Bonvoy','Marriott')?.id,'marriott');
  assert.equal(loyaltyProgramNamed('MileagePlus','United')?.id,'united');
  // A name nothing recognizes falls back to the provider, and an issuer that
  // runs two currencies prints both on one page, so either of them reaches it.
  assert.equal(loyaltyProgramNamed('World of Hyatt — Globalist through February','Hyatt')?.id,'hyatt');
  assert.equal(loyaltyProgramNamed('Amex points','American Express')?.url,
    'https://global.americanexpress.com/rewards/summary');
  // Two programs on two pages settle nothing: Chase runs Ultimate Rewards, and
  // a Chase entry naming neither has no page of its own to go to.
  assert.equal(loyaltyProgramNamed('Priority Pass Select','Amex Platinum'),null);
  assert.equal(loyaltyProgramNamed('',''),null);
});
