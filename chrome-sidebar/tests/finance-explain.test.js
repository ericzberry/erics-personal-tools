import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';
import {staleText,staleNote,sourceLabel} from '../src/components/finance-overview.js';
import {financeSummary,groupFinanceRecords,figuresOn,figureSource,explainTotal,explainBy,ageOn,netWorthSeries,
  markRef,capitalRef,valuationRef,holdingRef,propertyRef,STALE_DAYS} from '../src/finance-data.js';

// A total is only ever a sum of dated figures, so it can always be taken apart
// again: which figures, from where, on what day, and how much of it is older
// than a season. These hold that for every total the ledger draws.

const TODAY='2026-09-22';
const portfolio=(number,name,kind=1,currency='USD')=>({id:`p${number}`,row:'portfolio',revision:'r1',number,name,kind,currency});
const mark=(portfolio,cls,asOf,amount,firm=0)=>{
  const value={row:'mark',portfolio,class:cls,asOf,amount,firm};
  return {...value,id:markRef(value),revision:String(amount)};
};
const holding=(number,portfolio,name,share=10000,follows=0)=>({id:holdingRef(number),row:'holding',revision:'r1',number,portfolio,name,vehicle:1,class:4,stated:0,share,follows});
const capital=entry=>({unfunded:null,contributed:0,distributed:0,commitment:0,...entry,row:'capital',id:capitalRef(entry),revision:'r1'});
const property=(number,portfolio,name)=>({id:propertyRef(number),row:'property',revision:'r1',number,portfolio,name,link:''});
const valuation=entry=>({...entry,row:'valuation',id:valuationRef(entry),revision:'r1'});

const ESTATE='Eric and Ariana Berry Estate',TRUST='Berry 2020 Irrevocable Family Trust',LLC='Berry Holdings LLC';
// The estate read at two firms this week, with a card typed in by hand and a
// correction's zero; the trust unread since May; a general partner's statement
// from June held by the estate and the trust at 35% and 65%; and the LLC's
// house, valued in January with a mortgage against it.
const LEDGER=[
  portfolio(1,ESTATE,1),portfolio(2,TRUST,5),portfolio(3,LLC,6),
  mark(1,10,'2026-09-20',9000000,5),mark(1,10,'2026-09-18',4000000,2),mark(1,3,'2026-09-20',2000000,2),
  mark(1,23,'2026-09-20',15000),mark(1,9,'2026-09-20',0),
  mark(2,10,'2026-05-15',3000000,5),mark(2,3,'2026-05-15',1000000,5),
  holding(1,1,'Synthetic Health Opportunities GP I LLC',3500),holding(2,2,'Synthetic Health Opportunities GP I LLC',6500,1),
  capital({holding:1,asOf:'2026-06-30',value:1000000}),
  property(1,3,'41 Undermountain Road, Sheffield, MA 01257'),
  valuation({property:1,asOf:'2026-01-10',value:1200000,debt:600000,source:1})
];

test('every total is the sum of the figures it explains, and each figure says what stated it',()=>{
  const summary=financeSummary(LEDGER,{currency:'USD',today:TODAY});
  assert.equal(summary.explain.total,summary.net);
  for(const row of [...summary.byClass,...summary.byGroup,...summary.byPortfolio,...summary.byRegistration])
    assert.equal(row.explain.total,row.total,`${row.label} adds up to what it explains`);
  for(const group of groupFinanceRecords(LEDGER,{today:TODAY}))
    assert.equal(group.explain.total,group.total,`${group.portfolio.name} adds up to what it explains`);
  const sources=Object.fromEntries(summary.explain.figures.map(figure=>[`${figure.portfolio}:${figure.class}:${figure.firm??''}:${figure.asOf}`,figure.source]));
  assert.deepEqual(sources,{
    '1:10:5:2026-09-20':'firm-5','1:10:2:2026-09-18':'firm-2','1:3:2:2026-09-20':'firm-2',
    // Typed in, or folded out of a dropped statement: no site named it.
    '1:23:0:2026-09-20':'entered',
    '2:10:5:2026-05-15':'firm-5','2:3:5:2026-05-15':'firm-5',
    '1:4::2026-06-30':'statement','2:4::2026-06-30':'statement',
    // A house is two figures from one valuation: its value and what is owed.
    '3:7::2026-01-10':'valuation-1','3:21::2026-01-10':'valuation-1'
  });
  // A position's figure is its share of the one statement filed for the
  // vehicle, and says so.
  const held=summary.explain.figures.filter(figure=>figure.kind==='position');
  assert.deepEqual(held.map(figure=>[figure.portfolio,figure.amount,figure.share,figure.ref]),
    [[2,650000,6500,'h1-20260630'],[1,350000,3500,'h1-20260630']]);
  const debt=summary.explain.figures.find(figure=>figure.class===21);
  assert.deepEqual([debt.value,debt.ref,figureSource(debt)],[-600000,'r1-20260110','valuation-1']);
});

test('a correction’s zero is not a figure a total rests on',()=>{
  const {explain}=financeSummary(LEDGER,{currency:'USD',today:TODAY});
  assert.equal(explain.figures.some(figure=>figure.class===9),false);
  assert.equal(explain.count,10);
  // The step function still counts it, so a quarter's completeness is unchanged.
  assert.equal(financeSummary(LEDGER,{currency:'USD',today:TODAY}).figures,11);
});

test('how much of a total is stale is asked of each figure, not only of its portfolio’s newest date',()=>{
  const summary=financeSummary(LEDGER,{currency:'USD',today:TODAY});
  // The trust's $4M from May, and the LLC's house from January less its
  // mortgage. The estate's June statement is 84 days old and still current.
  assert.equal(summary.explain.stale.total,4000000+1200000-600000);
  assert.equal(summary.explain.stale.count,4);
  assert.equal(summary.explain.stale.oldest,'2026-01-10');
  assert.equal(summary.explain.stale.share,4600000/summary.net);
  // The trust is fresh by its newest date — the June statement — so the
  // portfolio check passes it, and the figures behind it do not.
  assert.deepEqual(summary.stale.map(entry=>entry.name),[LLC]);
  const trust=groupFinanceRecords(LEDGER,{today:TODAY}).find(group=>group.portfolio.number===2);
  assert.equal(trust.explain.stale.total,4000000);
  assert.equal(trust.explain.newest,'2026-06-30');
  assert.deepEqual(trust.explain.figures.map(figure=>[figure.asOf,figure.age,figure.stale]),
    [['2026-05-15',130,true],['2026-05-15',130,true],['2026-06-30',84,false]]);
});

test('stale means more than a season old, measured in whole days, and a future date is no age',()=>{
  assert.equal(ageOn('2026-06-24',TODAY),90);
  assert.equal(ageOn('2026-06-23',TODAY),91);
  assert.equal(ageOn('2026-12-31',TODAY),0);
  const edge=[portfolio(1,ESTATE),mark(1,3,'2026-06-24',100),mark(1,1,'2026-06-23',100)];
  const {explain}=financeSummary(edge,{currency:'USD',today:TODAY});
  assert.deepEqual(explain.figures.map(figure=>[figure.class,figure.stale]).sort(),[[1,true],[3,false]]);
  assert.equal(STALE_DAYS,90);
});

test('a stale part is said in the total’s own terms, and never as more than all of it',()=>{
  const figure=(asOf,amount,cls=3)=>({kind:'mark',portfolio:1,class:cls,asOf,amount,firm:0,ref:`${cls}-${asOf}`});
  assert.deepEqual(explainTotal([figure('2026-09-20',100)],{today:TODAY}).stale,{total:0,count:0,oldest:'',share:0});
  assert.equal(explainTotal([figure('2026-01-01',100)],{today:TODAY}).stale.share,1);
  // Fresh cash against a stale card that is larger than it: the whole of it
  // rests on the card, and more.
  assert.equal(explainTotal([figure('2026-09-20',100),figure('2026-01-01',300,23)],{today:TODAY}).stale.share,1);
  // Nothing left over to be a share of.
  assert.equal(explainTotal([figure('2026-09-20',100),figure('2026-01-01',100,23)],{today:TODAY}).stale.share,null);
});

test('a total comes apart by source, by entity and by class, and the parts add back up to it',()=>{
  const live=figuresOn(LEDGER,{currency:'USD'});
  const whole=explainTotal(live,{today:TODAY}).total;
  for(const by of ['source','portfolio','class']){
    const groups=explainBy(live,by,{today:TODAY});
    assert.equal(Math.round(groups.reduce((total,group)=>total+group.total,0)*100)/100,whole,by);
    assert.deepEqual(groups.map(group=>Math.abs(group.total)),groups.map(group=>Math.abs(group.total)).sort((a,b)=>b-a),`${by} leads with the largest`);
  }
  const bySource=explainBy(live,'source',{today:TODAY});
  assert.deepEqual(bySource.map(group=>[group.id,group.total,group.stale.total]),[
    ['firm-5',13000000,4000000],['firm-2',6000000,0],['statement',1000000,0],['valuation-1',600000,600000],['entered',-15000,0]]);
  assert.throws(()=>explainBy(live,'colour'));
  // Currencies are never mixed: a figure in euros explains no dollar total.
  const euro=[...LEDGER,portfolio(4,'Euro account',1,'EUR'),mark(4,3,'2026-09-20',500)];
  assert.equal(figuresOn(euro,{currency:'USD'}).some(figure=>figure.portfolio===4),false);
  assert.equal(figuresOn(euro,{currency:'EUR'}).length,1);
});

test('the series is drawn from the same figures, unchanged',()=>{
  assert.deepEqual(netWorthSeries(LEDGER,{currency:'USD',since:''}).map(point=>[point.asOf,point.net]),[
    ['2026-01-10',600000],['2026-05-15',4600000],['2026-06-30',5600000],['2026-09-18',9600000],['2026-09-20',20585000]]);
});

test('what is stale is said in money, once, and not at all when nothing is',()=>{
  const {explain}=financeSummary(LEDGER,{currency:'USD',today:TODAY});
  assert.equal(staleText(explain),'$4,600,000 of this, 22%, rests on figures more than 90 days old.');
  assert.equal(staleText({...explain,stale:{...explain.stale,share:1}}),'All of this rests on figures more than 90 days old.');
  assert.equal(staleText({...explain,stale:{total:0,count:0,share:0,oldest:''}}),'');
  const trust=groupFinanceRecords(LEDGER,{today:TODAY}).find(group=>group.portfolio.number===2).explain;
  assert.equal(staleNote(trust),'$4,000,000 over 90 days old');
  const llc=groupFinanceRecords(LEDGER,{today:TODAY}).find(group=>group.portfolio.number===3).explain;
  assert.equal(staleNote(llc),'over 90 days old','the whole of a group is not restated as its own total');
  assert.deepEqual(['firm-5','firm-2','statement','valuation-1','valuation-2','entered'].map(sourceLabel),
    ['UBS','Chase','Capital accounts','Zestimate','Appraisal','Dropped or entered']);
});

// The page and the panel, drawn by the real controller.
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function unlockedVault(){
  let key=null;
  return {idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
    async key(){key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'AES-GCM',false,['encrypt','decrypt']);return key;},
    async open(id,envelope){return openSecret(await this.key(),id,envelope);},
    async unlockWithRecoveryCode(){return this.key();},recoveryCode:()=>'EV1-SYNTHETIC'};
}
// linkedom's <select> value is read-only; the app sets it like a browser does.
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){
    for(const option of this.options)option.selected=option.value===value;
  }});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
let restore=()=>{};
const setup=()=>{
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  restore();restore=selectValues(window);
  return document;
};
const mount=(document,records,options={})=>mountFinance(document.querySelector('main'),{
  vault:unlockedVault(),credentials:{get:async()=>'token'},remote:async()=>({connections:[]}),
  offline:{request:async()=>({records})},today:()=>TODAY,...options});
const text=node=>node.textContent.replace(/\s+/g,' ').trim();
// A figure's line as it is read: its name, its amount, and what qualifies it.
const line=row=>[row.querySelector('.record-name').textContent,row.querySelector('.record-figure strong').textContent,
  row.querySelector(':scope>.footnote')?.textContent||''].join(' | ');
const lines=group=>[...group.querySelectorAll('.record-row')].map(line);

test('the page says how much of its figure is stale and opens every total down to its figures',async()=>{
  const document=setup();
  const tool=mount(document,LEDGER);
  await settle(()=>!document.getElementById('finance-sources-panel').hidden);
  assert.equal(text(document.getElementById('finance-stale')),'$4,600,000 of this, 22%, rests on figures more than 90 days old.');
  // Each entity says how much of its own total is stale before it is opened.
  const headings=Object.fromEntries([...document.querySelectorAll('#finance-list .portfolio-group')]
    .map(group=>[group.querySelector('.group-title').textContent,text(group.querySelector('.group-name'))]));
  assert.match(headings[TRUST],/\$4,000,000 over 90 days old/);
  assert.match(headings[LLC],/as of 2026-01-10 · over 90 days old/);
  assert.equal(headings[ESTATE].includes('days old'),false);
  // Sources: by what stated each figure, largest first.
  const groups=()=>[...document.querySelectorAll('#finance-sources .portfolio-group')];
  assert.deepEqual(groups().map(group=>group.querySelector('.group-title').textContent),
    ['UBS','Chase','Capital accounts','Zestimate','Dropped or entered']);
  const ubs=groups()[0];
  assert.match(text(ubs.querySelector('summary')),/\$4,000,000 over 90 days old.*\$13,000,000/);
  assert.deepEqual(lines(ubs),[
    `Liquid securities | $9,000,000 | ${ESTATE}`,
    `Liquid securities | $3,000,000 | ${TRUST} · 2026-05-15 · 130 days old`,
    `Cash | $1,000,000 | ${TRUST} · 2026-05-15 · 130 days old`]);
  // A statement is named for the investment, and says whose share of it this is.
  assert.equal(lines(groups()[2])[0],`Synthetic Health Opportunities GP I LLC | $650,000 | ${TRUST} · 65% of the vehicle`);
  // Nothing here is edited: a figure is corrected where it is held.
  assert.equal(document.querySelectorAll('#finance-sources .record-actions button').length,0);
  // The same figures by entity, then by class, each retotalled.
  const by=label=>[...document.querySelectorAll('#finance-sources-by button')].find(button=>button.textContent===label);
  by('Entity').click();
  assert.equal(by('Entity').getAttribute('aria-pressed'),'true');
  assert.deepEqual(groups().map(group=>[group.querySelector('.group-title').textContent,text(group.querySelector('.group-figure'))]),
    [[ESTATE,'74%$15,335,000'],[TRUST,'23%$4,650,000'],[LLC,'3%$600,000']]);
  assert.ok(lines(groups()[0]).includes('Liquid securities | $4,000,000 | Chase · 2026-09-18'));
  by('Class').click();
  const mortgage=groups().find(group=>group.querySelector('.group-title').textContent==='Mortgage');
  assert.deepEqual(lines(mortgage),[`41 Undermountain Road, Sheffield, MA 01257 | ($600,000) | ${LLC} · Zestimate`]);
  tool.stop();
});

test('a ledger with nothing stale says nothing about it, and the side panel keeps only the sentence',async()=>{
  const fresh=[portfolio(1,ESTATE),mark(1,10,'2026-09-20',1000,5)];
  let document=setup();
  let tool=mount(document,fresh);
  await settle(()=>!document.getElementById('finance-sources-panel').hidden);
  assert.equal(document.getElementById('finance-stale').hidden,true);
  assert.equal(document.querySelector('#finance-list .group-name').textContent.includes('days old'),false);
  tool.stop();
  document=setup();
  tool=mount(document,LEDGER,{layout:'panel'});
  await settle(()=>document.getElementById('finance-totals').textContent.includes('Net'));
  assert.match(document.getElementById('finance-stale').textContent,/^\$4,600,000 of this, 22%/);
  // UI-45: which figures they are is detail, and the detail is the page's.
  assert.equal(document.getElementById('finance-sources'),null);
  tool.stop();
});
