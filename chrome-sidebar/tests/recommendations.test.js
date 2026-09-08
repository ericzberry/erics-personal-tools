import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recommend,turns,replacementLevels,validateProjections} from '../src/recommendations.js';
import {playerKey} from '../src/player-identity.js';
const load=name=>JSON.parse(readFileSync(new URL(`../config/${name}.json`,import.meta.url)));
const config=load('espn-league-2026'),rankings=load('rankings-2026');
const current=()=>({mode:'league',leagueId:config.leagueId,seasonId:2026,teamId:8,teams:Array.from({length:10},(_,i)=>({id:i+1,name:`Team ${i+1}`})),picks:[],connected:true,lastSeenAt:1000,state:'drafting',onClock:1,rounds:16,missing:[]});
const pick=(p,n=1)=>({player:p.name,position:p.position,nflTeam:p.nflTeam,teamId:8,overall:n,round:Math.ceil(n/10),pickInRound:(n-1)%10+1});
const run=(args={})=>recommend({rankings,config,now:1000,...args});
test('uses the first tab as the empty-roster baseline without invented points',()=>{const a=run();assert.equal(a.candidates[0].name,'Jahmyr Gibbs');assert.equal(a.mode,'rank');assert.equal(a.candidates[0].par,null);assert.equal(a.turn.slot,null);assert.equal(a.projectionMissing,154);});
test('normalizes ESPN names, suffixes, defense labels and team abbreviations',()=>{
  for(const [a,b] of [[{name:'James Cook',position:'RB',nflTeam:'BUF'},{player:'James Cook III',position:'RB',nflTeam:'BUF'}],[{name:'Kenneth Gainwell',position:'RB',nflTeam:'TB'},{name:'Kenny Gainwell',position:'RB',nflTeam:'TB'}],[{name:'Jaguars Defense',position:'DST',nflTeam:'JAC'},{name:'Jaguars D/ST',position:'D/ST',nflTeam:'JAX'}]])assert.equal(playerKey(a),playerKey(b));
  const session=current();session.picks=[pick(rankings.players[0])];session.onClock=2;assert.ok(!run({session}).candidates.some(p=>p.name==='Jahmyr Gibbs'));
});
test('uses actual own picks or upcoming pick evidence, never team ID as draft slot',()=>{
  assert.equal(turns(current(),10).slot,null);
  assert.equal(turns({...current(),upcomingOwnPicks:[3,18]},10).slot,3);
  const a=turns({...current(),picks:[{teamId:8,overall:18}],onClock:19},10);assert.equal(a.slot,3);assert.equal(a.nextPick,23);assert.equal(a.followingPick,38);
});
test('stale, incomplete and completed drafts cannot produce actionable advice',()=>{
  for(const session of [{...current(),connected:false},{...current(),lastSeenAt:-20000},{...current(),missing:[1]},{...current(),state:'complete'}]){const a=run({session});assert.ok(a.blocked);assert.equal(a.candidates.length,0);}
});
test('starter need can beat a nearby backup quarterback in ranking mode',()=>{
  const q={rank:1,name:'Backup QB',position:'QB',nflTeam:'BUF',adp:100},r={rank:2,name:'Starting RB',position:'RB',nflTeam:'DET',adp:101};
  const session={...current(),picks:[{player:'Existing QB',position:'QB',nflTeam:'KC',teamId:8,overall:1,round:1,pickInRound:1}],onClock:2};
  const a=run({rankings:{players:[q,r]},session});assert.equal(a.candidates[0].name,'Starting RB');
});
test('position limits and final mandatory starter slots are respected',()=>{
  const session=current();session.picks=Array.from({length:4},(_,i)=>({player:`Owned QB ${i}`,position:'QB',nflTeam:'BUF',teamId:8,overall:i+1}));session.onClock=5;
  assert.ok(run({session,rankings:{players:[{rank:1,name:'QB',position:'QB',nflTeam:'BUF',adp:50},{rank:2,name:'RB',position:'RB',nflTeam:'DET',adp:50}]}}).candidates.every(p=>p.position!=='QB'));
  session.picks=['QB','RB','RB','WR','WR','TE','RB','D/ST',...Array(7).fill('WR')].map((position,i)=>({player:`Owned ${i}`,position,nflTeam:'BUF',teamId:8,overall:i+1}));
  session.onClock=16;assert.ok(run({session}).candidates.every(p=>p.position==='K'));
});
function projectedFixture(){
  const players=[];for(let i=1;i<=40;i++)for(const pos of ['QB','RB','WR','TE'])players.push({rank:players.length+1,name:`${pos} ${i}`,position:pos,nflTeam:'BUF',adp:players.length+1});
  const data={leagueId:config.leagueId,seasonId:2026,scoring:'half-ppr',units:'season_total_points',source:'Synthetic regression data',players:players.map(p=>({...p,points:({QB:400,RB:400,WR:320,TE:250}[p.position])-Number(p.name.split(' ')[1])*({QB:2,RB:8,WR:3,TE:4}[p.position])}))};
  return {rankings:{players},data};
}
test('replacement uses 10 starting QBs, 20 RBs/WRs, 10 TEs and 10 FLEX slots',()=>{
  const {data}=projectedFixture();const levels=replacementLevels(data.players,{QB:1,RB:2,WR:2,TE:1,FLEX:1},10);
  assert.equal(levels.QB.positionRank,11);
  assert.equal(levels.RB.positionRank+levels.WR.positionRank+levels.TE.positionRank,20+20+10+10+3);
});
test('points mode values scarce RB lineup gains above abundant QB alternatives',()=>{
  const {rankings,data}=projectedFixture();const a=run({rankings,projections:data});
  assert.equal(a.mode,'points');assert.equal(a.candidates[0].position,'RB');assert.ok(a.candidates[0].par>100);assert.ok(a.candidates[0].lineupGain>100);
  const session={...current(),picks:[pick(rankings.players[0])],onClock:2};
  const owned=run({rankings,projections:data,session});const qb=owned.candidates.find(p=>p.position==='QB');if(qb)assert.equal(qb.lineupGain,0);
});
test('partial/mismatched projections never silently become points estimates',()=>{
  const {rankings,data}=projectedFixture();assert.equal(run({rankings,projections:{...data,players:data.players.slice(1)}}).mode,'rank');
  assert.throws(()=>validateProjections({...data,scoring:'ppr'},config,rankings.players));
  assert.throws(()=>validateProjections({...data,players:[...data.players,data.players[0]]},config,rankings.players));
  assert.throws(()=>validateProjections({...data,players:[{...data.players[0],points:NaN}]},config,rankings.players));
});
test('ADP changes waiting explanations only with observed draft order',()=>{
  const a=run({session:{...current(),upcomingOwnPicks:[1,20]}});assert.equal(a.turn.followingPick,20);assert.ok(a.candidates[0].reasons.some(r=>r.includes('ADP is before')));
  assert.ok(run().candidates[0].reasons.some(r=>r.includes('unknown')));
});
