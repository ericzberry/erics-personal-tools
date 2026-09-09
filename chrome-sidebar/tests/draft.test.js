import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {validateSnapshot,mergeSnapshot,sessionKey} from '../src/draft-state.js';
const source=readFileSync(new URL('../src/draft-reader.js',import.meta.url),'utf8');
const fixture=readFileSync(new URL('./fixtures/espn-practice.html',import.meta.url),'utf8');
const context=vm.createContext({URL});vm.runInContext(source,context);
const url='https://fantasy.espn.com/football/draft?leagueId=1998678762&seasonId=2026&teamId=8';
const read=html=>JSON.parse(JSON.stringify(context.EspnDraftReader.read(parseHTML(html).document,url)));
const complete=()=>({...read(fixture),state:'complete',onClock:null,rounds:16});
test('ESPN DOM: 160 picks, round boundaries, apostrophes and defenses',()=>{
  const s=read(fixture);assert.equal(s.picks.length,160);assert.equal(s.teams.length,10);assert.equal(s.rejected,0);
  assert.equal(s.picks[10].overall,11);assert.equal(s.picks[10].round,2);assert.equal(s.picks[10].pickInRound,1);
  assert.equal(s.picks[1].player,"Ja'Marr Chase");assert.equal(s.picks[146].position,'D/ST');
  assert.equal(s.picks.filter(p=>p.teamId===8).length,16);assert.equal(s.mode,'practice');
  assert.equal(s.onClock,160);assert.equal(s.rounds,16);
});
test('login and unrelated pages do not become draft snapshots',()=>{
  assert.equal(read('<html><body>Log in Required</body></html>'),null);
  assert.equal(context.EspnDraftReader.read(parseHTML(fixture).document,'https://example.com/football/draft?leagueId=1998678762&seasonId=2026'),null);
});
test('malformed pick is rejected without inventing a selection',()=>{
  const s=read(fixture.replace('R1, P1','R1, P99'));assert.equal(s.picks.length,159);assert.equal(s.rejected,1);
});
test('deduplicates snapshots and retains history with partial DOM',()=>{
  const s=complete(),first=mergeSnapshot(null,s,100,1),again=mergeSnapshot(first,s,200,1);
  assert.equal(again.picks.length,160);assert.equal(again.lastPickAt,100);assert.equal(again.lastSeenAt,200);
  const recent=mergeSnapshot(again,{...s,picks:s.picks.slice(-5)},300,1);
  assert.equal(recent.picks.length,160);assert.deepEqual(recent.missing,[]);
});
test('detects missing picks and clears gaps after recovery',()=>{
  const s=complete(),missing=mergeSnapshot(null,{...s,picks:s.picks.slice(1)});
  assert.deepEqual(missing.missing,[1]);assert.deepEqual(mergeSnapshot(missing,s).missing,[]);
});
test('rollback and correction replace old picks; reset clears history',()=>{
  const s=complete(),first=mergeSnapshot(null,s);
  const rollback=mergeSnapshot(first,{...s,state:'drafting',onClock:159});assert.equal(rollback.picks.length,158);
  const updated=mergeSnapshot(rollback,{...s,state:'drafting',onClock:160,picks:[{...s.picks[158],player:'Corrected Player'}]});
  assert.equal(updated.picks.length,159);assert.equal(updated.picks.at(-1).player,'Corrected Player');
  assert.equal(mergeSnapshot(updated,{...s,state:'waiting',onClock:null,picks:[]}).picks.length,0);
});
test('practice and real league sessions stay separate',()=>{
  const s=complete(),league={...s,mode:'league',leagueId:182527585,picks:[]};
  assert.notEqual(sessionKey(s),sessionKey(league));assert.equal(mergeSnapshot(mergeSnapshot(null,s),league).picks.length,0);
});
test('validates sender origin, league, overall number and team',()=>{
  const s=complete();assert.equal(validateSnapshot(s,url),true);
  assert.equal(validateSnapshot(s,url.replace('fantasy.espn.com','evil.example')),false);
  assert.equal(validateSnapshot({...s,leagueId:2},url),false);
  assert.equal(validateSnapshot({...s,picks:[{...s.picks[0],overall:999}]},url),false);
  assert.equal(validateSnapshot({...s,picks:[{...s.picks[0],teamId:999}]},url),false);
  assert.equal(validateSnapshot({...s,mode:'league'},url),false);
});
test('background pipeline saves picks and marks closed tab disconnected',async()=>{
  let listener,closed,data={};
  globalThis.chrome={contextMenus:{onClicked:{addListener(){}}},sidePanel:{setPanelBehavior:async()=>{}},runtime:{onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},storage:{local:{get:async()=>structuredClone(data),set:async v=>{data=structuredClone(v);}}},tabs:{onRemoved:{addListener(fn){closed=fn;}}}};
  const originalFetch=globalThis.fetch;globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  await import('../src/background.js');const s=complete();
  const result=await new Promise(resolve=>listener({type:'DRAFT_SNAPSHOT',snapshot:s},{url,tab:{id:123},frameId:0},resolve));
  assert.equal(result.ok,true);assert.equal(result.highlights.candidates.length,0);assert.equal(data.draftSessions[sessionKey(s)].picks.length,160);
  const drafting={...s,state:'drafting',onClock:6,picks:s.picks.slice(0,5),upcomingOwnPicks:[6,15]};
  const next=await new Promise(resolve=>listener({type:'DRAFT_SNAPSHOT',snapshot:drafting},{url,tab:{id:123},frameId:0},resolve));
  assert.ok(next.highlights.candidates.length>0);assert.ok(next.highlights.tierPlayers.length>0);assert.equal(next.highlights.onClock,6);
  const scarcityDraft={...s,state:'drafting',onClock:16,picks:s.picks.slice(0,15)};
  const scarcity=await new Promise(resolve=>listener({type:'DRAFT_SNAPSHOT',snapshot:scarcityDraft},{url,tab:{id:123},frameId:0},resolve));
  assert.deepEqual(scarcity.highlights.scarcityPlayers,[]); // One RB and WR by round 3 is on track.
  assert.ok(scarcity.highlights.scarcityPlayers.every(p=>['RB','WR'].includes(p.position)&&p.tier===2&&p.espnId));
  const finished=await new Promise(resolve=>listener({type:'DRAFT_SNAPSHOT',snapshot:s},{url,tab:{id:123},frameId:0},resolve));
  assert.deepEqual(finished.highlights.scarcityPlayers,[]);
  globalThis.fetch=originalFetch;
  await closed(123);assert.equal(data.draftSessions[sessionKey(s)].connected,false);delete globalThis.chrome;
});
test('build excludes personal captures, tests and dependencies',()=>{
  const names=readdirSync(new URL('../dist/',import.meta.url));for(const name of ['data','tests','node_modules'])assert.ok(!names.includes(name));
  const manifest=JSON.parse(readFileSync(new URL('../dist/manifest.json',import.meta.url)));assert.deepEqual(manifest.permissions,['sidePanel','storage']);assert.deepEqual(manifest.host_permissions,['<all_urls>']);
});
test('practice picks flow through automatic selection into advice, excluding all taken players',async()=>{
  const {selectSession}=await import('../src/session-selection.js');
  const {recommend}=await import('../src/recommendations.js');
  const {playerKey}=await import('../src/player-identity.js');
  const snapshot={...read(fixture),state:'drafting',onClock:7,upcomingOwnPicks:[7,14]};
  snapshot.picks=snapshot.picks.slice(0,6);
  const session=mergeSnapshot(null,snapshot,1000,123);
  const selected=selectSession({[sessionKey(session)]:session},'auto',1001);
  const config=JSON.parse(readFileSync(new URL('../config/espn-league-2026.json',import.meta.url)));
  const rankings=JSON.parse(readFileSync(new URL('../config/rankings-2026.json',import.meta.url)));
  const advice=recommend({config,rankings,session:selected,now:1001});
  assert.equal(advice.throughPick,6);assert.equal(advice.turn.nextPick,7);
  assert.ok(advice.candidates.length);const taken=new Set(session.picks.map(playerKey));
  for(const candidate of advice.candidates)assert.ok(!taken.has(playerKey(candidate)));
});
test('packaged toolbar icons exist at each declared resolution',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../dist/manifest.json',import.meta.url)));
  for(const [size,path] of Object.entries(manifest.icons)){
    const png=readFileSync(new URL(`../dist/${path}`,import.meta.url));
    assert.equal(png.readUInt32BE(16),Number(size));assert.equal(png.readUInt32BE(20),Number(size));
  }
});
