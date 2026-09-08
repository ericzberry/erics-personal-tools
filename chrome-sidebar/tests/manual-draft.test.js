import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createManualDraft,setManualPick,setManualProgress,applyManualDraft} from '../src/manual-draft.js';
import {reconcileRankings,reconcileSession,correctionPlayers,matchEspnPlayer,fetchEspnCatalog} from '../src/espn-catalog.js';
import {recommend,turns} from '../src/recommendations.js';
import {playerKey} from '../src/player-identity.js';
const load=n=>JSON.parse(readFileSync(new URL(`../config/${n}.json`,import.meta.url)));
const config=load('espn-league-2026'),catalog=load('espn-players-2026'),source=load('rankings-2026'),rankings=reconcileRankings(source,catalog);
test('all static ranks have unique ESPN identities without changing rank or ADP',()=>{
 assert.equal(rankings.players.length,177);assert.ok(rankings.players.every(p=>Number.isInteger(p.espnId)&&!p.identityUnverified));assert.equal(new Set(rankings.players.map(playerKey)).size,177);
 assert.deepEqual(rankings.players.map(p=>[p.rank,p.adp]),source.players.map(p=>[p.rank,p.adp]));
 assert.equal(rankings.players.find(p=>p.name==='Davante Adams').espnId,16800);
});
test('ambiguous names are never guessed; exact IDs and teams distinguish players',()=>{
 const a={espnId:1,name:'Test Player',position:'WR',nflTeam:'NYJ'},b={...a,espnId:2,nflTeam:'NYG'},c={players:[a,b]};
 assert.equal(matchEspnPlayer({...a,espnId:undefined},c),a);assert.equal(matchEspnPlayer({...a,espnId:undefined,nflTeam:'FA'},c),null);
 assert.equal(matchEspnPlayer({...a,espnId:2},c),b);
 assert.equal(matchEspnPlayer({...a,espnId:undefined},{players:[a,{...a,espnId:3}]}),null);
});
test('manual ownership excludes both players and changes own roster; undo restores baseline',()=>{
 let r=createManualDraft(null,config);const [a,b]=rankings.players;
 r=setManualPick(r,a,'me');r=setManualPick(r,b,'other');let s=applyManualDraft(null,r);
 assert.equal(s.picks.length,2);assert.equal(s.picks.filter(p=>p.teamId===8).length,1);
 const advice=recommend({rankings,config,session:s});assert.ok(!advice.blocked);assert.ok(advice.candidates.every(p=>![a.espnId,b.espnId].includes(p.espnId)));
 r=setManualPick(r,a,'other');assert.equal(applyManualDraft(null,r).picks.length,2);
 r=setManualPick(r,a,'undo');assert.equal(applyManualDraft(null,r).picks.length,1);
});
test('captured names reconcile to same identity as manual selections; live updates cannot overwrite manual board',()=>{
 const p=rankings.players[0],base=createManualDraft(null,config).baseline;
 const live=reconcileSession({...base,picks:[{player:p.name,position:p.position,nflTeam:p.nflTeam,overall:1,teamId:1}]},catalog);
 let r=setManualPick(createManualDraft(live,config),p,'me');const newer={...live,picks:[]};
 assert.equal(applyManualDraft(newer,r).picks.length,1);assert.equal(applyManualDraft(newer,r).picks[0].teamId,8);
 r=setManualPick(r,p,'undo');assert.equal(applyManualDraft(newer,r).picks[0].teamId,1);
 assert.equal(applyManualDraft(newer,{...r,active:false}),newer);
});
test('manual draft order is explicit and calculates both snake turns',()=>{
 let r=createManualDraft(null,config);r=setManualPick(r,rankings.players[0],'me');assert.equal(turns(applyManualDraft(null,r),10).slot,null);
 r=setManualProgress(r,19,3);const t=turns(applyManualDraft(null,r),10);assert.equal(t.nextPick,23);assert.equal(t.followingPick,38);
 assert.throws(()=>setManualProgress(r,0,3));assert.throws(()=>setManualProgress(r,19,11));
});
test('ESPN players outside ranks can be marked and unresolved live identities block advice',()=>{
 const all=correctionPlayers(rankings,catalog);assert.ok(all.length>4000);
 assert.ok(all.find(p=>p.espnId===2589699).identityUnverified);
 const p=all.find(p=>!p.rank&&!p.identityUnverified);const r=setManualPick(createManualDraft(null,config),p,'me');assert.equal(applyManualDraft(null,r).picks[0].espnId,p.espnId);
 const s=reconcileSession({...applyManualDraft(null,r),picks:[{player:'Unknown',position:'RB',nflTeam:'FA'}]},catalog);
 assert.match(recommend({rankings,config,session:s}).blocked,/matched to ESPN/);
});
test('failed or partial ESPN refresh is rejected instead of replacing saved catalog',async()=>{
 await assert.rejects(fetchEspnCatalog(2026,async()=>({ok:false})),/sync failed/);
 await assert.rejects(fetchEspnCatalog(2026,async url=>({ok:true,json:async()=>url.includes('/players')?[]:{settings:{proTeams:[]}}})),/incomplete/);
});
