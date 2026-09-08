import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recommend,turns,replacementLevels,lineupValue,availabilityAt} from '../src/recommendations.js';
import {playerKey} from '../src/player-identity.js';
const load=name=>JSON.parse(readFileSync(new URL(`../config/${name}.json`,import.meta.url)));
const config=load('espn-league-2026'),rankings=load('rankings-2026');
const current=()=>({mode:'league',leagueId:config.leagueId,seasonId:2026,teamId:8,teams:Array.from({length:10},(_,i)=>({id:i+1,name:`Team ${i+1}`})),picks:[],connected:true,lastSeenAt:1000,state:'drafting',onClock:1,rounds:16,missing:[]});
const pick=(p,n=1)=>({player:p.name,position:p.position,nflTeam:p.nflTeam,teamId:8,overall:n,round:Math.ceil(n/10),pickInRound:(n-1)%10+1});
const run=(args={})=>recommend({rankings,config,now:1000,...args});
test('uses the first tab as the empty-roster baseline without invented points',()=>{const a=run();assert.equal(a.candidates[0].name,'Jahmyr Gibbs');assert.equal(a.mode,'rank-proxy');assert.ok(a.candidates[0].rankAdvantage>0);assert.equal(a.turn.slot,null);assert.equal(a.projectionMissing,undefined);});
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
test('rank replacement fills ten starting rosters and assigns FLEX by Combined Ranks',()=>{
  const a=run(),levels=a.replacement;
  assert.equal(levels.QB.positionRank,11);
  assert.equal(levels.RB.positionRank+levels.WR.positionRank+levels.TE.positionRank,63);
  const best=a.candidates[0], replacement=rankings.players.find(p=>p.name===levels[best.position].name);
  assert.equal(best.rankAdvantage,replacement.rank-best.rank);
  assert.ok(best.reasons.some(r=>r.includes('rank slots above')));
});
test('a filled QB slot has zero marginal gain for a lower-ranked backup',()=>{
  const req={QB:1,RB:2,WR:2,TE:1,FLEX:1};
  const values=rankings.players.map(p=>({...p,value:178-p.rank}));
  const levels=replacementLevels(values,req,10);
  const qbs=values.filter(p=>p.position==='QB').sort((a,b)=>a.rank-b.rank);
  const base=lineupValue([qbs[0]],req,levels);
  assert.equal(lineupValue([qbs[0],qbs[1]],req,levels)-base,0);
  const rb=values.find(p=>p.position==='RB');
  assert.ok(lineupValue([qbs[0],rb],req,levels)>base);
});
test('legacy projections cannot override the Combined Ranks proxy',()=>{
  const a=run(),b=run({projections:{players:[{points:99999}]}});
  assert.deepEqual(a,b);assert.ok(a.candidates.every(p=>p.par===undefined));
});
test('ADP changes waiting explanations only with observed draft order',()=>{
  const a=run({session:{...current(),upcomingOwnPicks:[1,20]}});assert.equal(a.turn.followingPick,20);assert.ok(a.candidates[0].reasons.some(r=>r.includes('Remaining ADP order')));
  assert.ok(run().candidates[0].reasons.some(r=>r.includes('unknown')));
});

test('remaining market queue uses taken players, next turn and following turn',()=>{
  const players=Array.from({length:12},(_,i)=>({rank:i+1,name:`Player ${i}`,position:'RB',nflTeam:'BUF',adp:i+1}));
  const next=availabilityAt(players,10,13),following=availabilityAt(players,10,20,1);
  assert.equal(next.get(playerKey(players[0])),'unlikely');
  assert.equal(next.get(playerKey(players[5])),'likely');
  assert.equal(following.get(playerKey(players[5])),'unlikely');
  assert.equal(availabilityAt(players,10,10).get(playerKey(players[0])),'available');
  assert.equal(availabilityAt(players,null,null).get(playerKey(players[0])),'unknown');
  // Same absolute ADP, different remaining pool: earlier selections change survival outlook.
  assert.equal(availabilityAt(players.slice(5),10,13).get(playerKey(players[5])),'unlikely');
});
test('recommendation offers at most two explained options and responds to distance to next turn',()=>{
  const near=run({session:{...current(),upcomingOwnPicks:[1,20]}});
  const far=run({session:{...current(),upcomingOwnPicks:[10,11]}});
  assert.ok(near.candidates.length<=2);assert.ok(far.candidates.length<=2);
  assert.notEqual(near.candidates[0].name,far.candidates[0].name);
  for(const p of far.candidates){assert.ok(p.shortWhy);assert.ok(p.outlook.includes('#10'));assert.ok(p.outlook.includes('#11'));}
});

test('recommendations never mutate the fixed source board',()=>{
  const before=JSON.stringify(rankings);run({session:{...current(),upcomingOwnPicks:[10,11]}});assert.equal(JSON.stringify(rankings),before);
});
