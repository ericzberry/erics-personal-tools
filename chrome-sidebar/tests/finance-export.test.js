import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerRows,financeSummary,markRef,capitalRef,valuationRef,holdingRef,propertyRef} from '../src/finance-data.js';
import {writeXlsx,zipStored,columnName} from '../src/xlsx-write.js';

// The ledger as a table is what a class opens down to and what the export
// writes, so it has to add up to the same totals the page draws, and say for
// each figure whose it is, what it is and where it is held.

const TODAY='2026-09-22';
const portfolio=(number,name,kind=1)=>({id:`p${number}`,row:'portfolio',revision:'r1',number,name,kind,currency:'USD'});
const mark=(portfolio,cls,asOf,amount,firm=0)=>{const value={row:'mark',portfolio,class:cls,asOf,amount,firm};return {...value,id:markRef(value),revision:'r'};};
const holding=(number,portfolio,name,vehicle=2,cls=14)=>({id:holdingRef(number),row:'holding',revision:'r1',number,portfolio,name,vehicle,class:cls,stated:0,share:10000,follows:0});
const LEDGER=[
  portfolio(1,'Eric and Ariana Berry Estate',1),portfolio(2,'Berry 2020 Irrevocable Family Trust',5),
  mark(1,10,'2026-09-20',9000000,5),mark(2,3,'2026-05-15',1000000,2),mark(1,23,'2026-09-20',15000),
  holding(1,2,'Synthetic Robotics Inc. Series B'),
  {row:'capital',id:capitalRef({holding:1,asOf:'2026-06-30'}),revision:'r',holding:1,asOf:'2026-06-30',value:250000,contributed:200000,distributed:0,commitment:0,unfunded:null,importId:7},
  {row:'import',id:'i7',revision:'r',number:7,kind:1,firm:31,print:'',name:'Q2 statement.pdf',note:''},
  {row:'property',id:propertyRef(1),revision:'r',number:1,portfolio:1,name:'41 Undermountain Road',link:''},
  {row:'valuation',id:valuationRef({property:1,asOf:'2026-01-10'}),revision:'r',property:1,asOf:'2026-01-10',value:1200000,debt:600000,source:1}
];

test('every figure is a row that says whose it is, what it is and where it is held',()=>{
  const rows=ledgerRows(LEDGER,{currency:'USD',today:TODAY,firmName:code=>({5:'UBS',2:'Chase',31:'Carta'})[code]||''});
  const summary=financeSummary(LEDGER,{currency:'USD',today:TODAY});
  assert.equal(Math.round(rows.reduce((sum,row)=>sum+row.value,0)*100)/100,summary.net,'the rows add up to the net worth');
  const stock=rows.find(row=>row.assetClass==='Private stock');
  assert.equal(stock.asset,'Synthetic Robotics Inc. Series B');
  assert.equal(stock.entity,'Berry 2020 Irrevocable Family Trust');
  assert.equal(stock.accountType,'Trust');
  assert.equal(stock.liquidity,'Illiquid');
  assert.equal(stock.heldAt,'Carta','a statement read off Carta is held at Carta');
  assert.equal(stock.readFrom,'Q2 statement.pdf');
  assert.equal(stock.contributed,200000);
  const cash=rows.find(row=>row.assetClass==='Cash');
  assert.equal(cash.heldAt,'Chase');assert.equal(cash.stale,true);assert.equal(cash.liquidity,'Liquid');
  const mortgage=rows.find(row=>row.assetClass==='Mortgage');
  assert.equal(mortgage.asset,'41 Undermountain Road');assert.equal(mortgage.value,-600000);assert.equal(mortgage.liquidity,'Owed');
  assert.equal(rows.find(row=>row.assetClass==='Credit').source,'Entered or dropped');
});

// Read a stored zip back, entry by entry, the way a spreadsheet program does.
const unzip=bytes=>{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files={};
  for(let at=0;view.getUint32(at,true)===0x04034b50;){
    const size=view.getUint32(at+18,true),nameLength=view.getUint16(at+26,true),extra=view.getUint16(at+28,true);
    const name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLength));
    files[name]=new TextDecoder().decode(bytes.subarray(at+30+nameLength+extra,at+30+nameLength+extra+size));
    at+=30+nameLength+extra+size;
  }
  return files;
};

test('the workbook is a zip of the parts Excel needs, with numbers kept as numbers',()=>{
  const bytes=writeXlsx([{name:'Net worth',columns:[{key:'name',label:'Asset'},{key:'value',label:'Value',format:'money'},{key:'asOf',label:'As of',format:'date'}],
    rows:[{name:'Fund <A> & Co',value:1234.5,asOf:'2026-09-28'},{name:'Cash',value:-10,asOf:''}]}]);
  const files=unzip(bytes);
  assert.deepEqual(Object.keys(files).sort(),['[Content_Types].xml','_rels/.rels','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/workbook.xml','xl/worksheets/sheet1.xml']);
  const sheet=files['xl/worksheets/sheet1.xml'];
  assert.match(sheet,/Fund &lt;A&gt; &amp; Co/);
  assert.match(sheet,/<c r="B2" s="2"><v>1234.5<\/v><\/c>/,'money is a number with the money format');
  assert.match(sheet,/<c r="C2" s="3"><v>46293<\/v><\/c>/,'a date is a serial with the date format');
  assert.doesNotMatch(sheet,/r="C3"/,'an empty cell is left out');
  assert.match(sheet,/autoFilter ref="A1:C3"/);
  assert.match(files['xl/workbook.xml'],/name="Net worth"/);
});

test('a zip entry carries the CRC of its bytes, and columns run past Z',()=>{
  const zip=zipStored([['a.txt','hello']]);
  assert.equal(new DataView(zip.buffer).getUint32(14,true),0x3610a686);
  assert.deepEqual([0,25,26,27,701,702].map(columnName),['A','Z','AA','AB','ZZ','AAA']);
});
