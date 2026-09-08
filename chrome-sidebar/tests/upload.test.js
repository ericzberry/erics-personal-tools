import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {attachFileDrop} from '../src/components/file-drop.js';
import {rankingsFromRows,validateRankings} from '../src/ranking-import.js';
const rows=[['','Rank','Name','Pos','Team','ADP'],[null,1,'Player One','RB','BUF',3],[null,2,'Player Two','DST','NE',null]];
test('Combined Ranks rows preserve overall order, position and ADP',()=>{
  const a=rankingsFromRows(rows,'board.xlsx');assert.equal(a.players[0].adp,3);assert.equal(a.players[1].position,'D/ST');
  assert.throws(()=>rankingsFromRows([...rows,rows[1]],'x'),/Duplicate/);
  assert.throws(()=>validateRankings({seasonId:2025,scoring:'half-ppr',players:[]}),/season/);
});
test('drop and picker share parsing, type/size checks and error feedback',async()=>{
  const {document,Event}=parseHTML('<button id="zone"></button><input id="file"><p id="status"></p>');
  const zone=document.getElementById('zone'),input=document.getElementById('file'),status=document.getElementById('status');let calls=0;
  const uploader=attachFileDrop({zone,input,status,onFile:async()=>{calls++;return 'Loaded board';}});
  const drop=new Event('drop',{cancelable:true});drop.dataTransfer={files:[{name:'board.xlsx',size:100}]};zone.dispatchEvent(drop);await new Promise(r=>setImmediate(r));
  assert.equal(calls,1);assert.equal(status.textContent,'Loaded board');assert.equal(drop.defaultPrevented,true);
  Object.defineProperty(input,'files',{value:[{name:'board.json',size:100}]});input.dispatchEvent(new Event('change'));await new Promise(r=>setImmediate(r));assert.equal(calls,2);
  await uploader.receive([{name:'bad.txt',size:2}]);assert.equal(status.dataset.state,'error');assert.equal(calls,2);
  await uploader.receive([{name:'board.xlsx',size:6000000}]);assert.match(status.textContent,/too large/);
  await uploader.receive([{name:'a.json',size:2},{name:'b.json',size:2}]);assert.match(status.textContent,/one file/);
});
