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

// A K-1 dragged out of an open mail message is not a file yet: the page hands
// over a promise of one, and the drop zone has to fetch it or the drag looks
// like it did nothing.
test('an attachment dragged from a message is fetched, checked and named like any file',async()=>{
  const {document,Event}=parseHTML('<button id="zone"></button><input id="file"><p id="status"></p>');
  const zone=document.getElementById('zone'),input=document.getElementById('file'),status=document.getElementById('status');
  const seen=[];let credentials='';
  const fetcher=async(url,options)=>{
    credentials=options.credentials;
    return {ok:true,headers:{get:()=>null},blob:async()=>new Blob([new Uint8Array([1,2,3])],{type:'application/pdf'})};
  };
  const uploader=attachFileDrop({zone,input,status,accept:['.pdf'],fetcher,onFile:async file=>{seen.push(file.name);return 'Filed';}});
  const promise=(spec)=>{
    const drop=new Event('drop',{cancelable:true});
    drop.dataTransfer={files:[],getData:type=>type==='DownloadURL'?spec:''};
    zone.dispatchEvent(drop);
    return new Promise(r=>setTimeout(r,0));
  };
  await promise('application/pdf:K-1 - Synthetic Fund.pdf:https://mail.example.com/att?id=1');
  assert.deepEqual(seen,['K-1 - Synthetic Fund.pdf']);
  assert.equal(status.textContent,'Filed');
  // The attachment URL only resolves for the signed-in reader.
  assert.equal(credentials,'include');
  // A real file still wins outright, and the promise is never consulted.
  const drop=new Event('drop',{cancelable:true});
  drop.dataTransfer={files:[{name:'direct.pdf',size:10}],getData:()=>{throw Error('must not read the promise');}};
  zone.dispatchEvent(drop);await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(seen,['K-1 - Synthetic Fund.pdf','direct.pdf']);
  // Anything that is not an https attachment says so instead of failing silently.
  await promise('application/pdf:x.pdf:file:///etc/passwd');
  assert.match(status.textContent,/Save it to your computer first/);
  // A promised file still has to pass the type check the picker applies.
  await promise('text/plain:notes.txt:https://mail.example.com/att?id=2');
  assert.match(status.textContent,/Use .pdf/);
});
