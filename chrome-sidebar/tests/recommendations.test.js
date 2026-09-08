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

test('all border-defined tiers match the supplied screenshots, including both sides of every break',()=>{
 const ends=[8,16,24,41,59,79,98,124,141,154,177];let start=1;
 ends.forEach((end,i)=>{for(let rank=start;rank<=end;rank++)assert.equal(rankings.players[rank-1].tier,i+1,`rank ${rank}`);start=end+1;});
});
const tierBoard={players:[
 {rank:1,tier:1,name:'Top WR',position:'WR',nflTeam:'BUF',adp:1},
 {rank:2,tier:2,name:'Best RB',position:'RB',nflTeam:'DET',adp:2},
 {rank:3,tier:2,name:'Best TE',position:'TE',nflTeam:'KC',adp:3},
 {rank:4,tier:2,name:'Next RB',position:'RB',nflTeam:'NYJ',adp:4},
 {rank:5,tier:4,name:'Deep TE',position:'TE',nflTeam:'BAL',adp:5}
]};
const withRoster=(positions,round)=>({...current(),onClock:(round-1)*10+1,upcomingOwnPicks:[(round-1)*10+1],picks:positions.map((position,i)=>({player:`Owned ${i}`,position,nflTeam:'FA',teamId:8,overall:null}))});
test('a higher tier wins over an ordinary roster-fit bonus',()=>{
 const a=run({rankings:tierBoard,session:withRoster([],1)});assert.equal(a.candidates[0].name,'Top WR');assert.match(a.candidates[0].shortWhy,/Tier 1/);
});
test('first RB takes priority at round 2 even over a higher-tier WR',()=>{
 const a=run({rankings:tierBoard,session:withRoster(['WR'],2)});assert.equal(a.candidates[0].name,'Best RB');assert.match(a.candidates[0].shortWhy,/first RB by round 2/);
});
test('second RB takes priority at round 4, and taking it switches priority to TE',()=>{
 let a=run({rankings:tierBoard,session:withRoster(['WR','RB','QB'],4)});assert.equal(a.candidates[0].name,'Best RB');assert.match(a.candidates[0].shortWhy,/second RB by round 4/);
 a=run({rankings:tierBoard,session:withRoster(['RB','RB','WR'],4)});assert.equal(a.candidates[0].name,'Best TE');assert.match(a.candidates[0].shortWhy,/Fill TE by round 4/);
});
test('round 3 reserves remaining choices for RB and TE, and satisfied targets stop bonuses',()=>{
 const a=run({rankings:tierBoard,session:withRoster(['WR','RB'],3)});assert.ok(['RB','TE'].includes(a.candidates[0].position));
 const b=run({rankings:tierBoard,session:withRoster(['RB','RB','TE'],4)});assert.equal(b.candidates[0].name,'Top WR');assert.equal(b.candidates[0].targetPriority,0);
});
test('TE target avoids a multi-tier reach and deadline pressure stops after round 4',()=>{
 const board={players:tierBoard.players.filter(p=>p.name!=='Best TE')};
 const a=run({rankings:board,session:withRoster(['RB','RB','WR'],4)});assert.equal(a.candidates[0].name,'Top WR');
 const b=run({rankings:tierBoard,session:withRoster(['WR','WR','QB','TE'],5)});assert.equal(b.candidates[0].name,'Top WR');assert.equal(b.candidates[0].targetPriority,0);
});
test('target deadlines use the next own pick round rather than the current opponent round',()=>{
 const session={...withRoster(['WR'],1),onClock:10,upcomingOwnPicks:[12,29]};
 const a=run({rankings:tierBoard,session});assert.equal(a.targetRound,2);assert.equal(a.candidates[0].position,'RB');
});

const scarcityBoard={players:[
 {rank:1,tier:1,name:'Owned RB A',position:'RB',nflTeam:'DET',adp:1},
 {rank:2,tier:1,name:'Owned RB B',position:'RB',nflTeam:'BUF',adp:2},
 {rank:3,tier:1,name:'Owned WR A',position:'WR',nflTeam:'DET',adp:3},
 {rank:4,tier:1,name:'Owned WR B',position:'WR',nflTeam:'BUF',adp:4},
 {rank:5,tier:2,name:'Last RB',position:'RB',nflTeam:'KC',adp:5},
 {rank:6,tier:2,name:'Last WR',position:'WR',nflTeam:'KC',adp:6},
 {rank:7,tier:2,name:'Tier TE',position:'TE',nflTeam:'KC',adp:100},
 ...Array.from({length:30},(_,i)=>({rank:i+8,tier:3,name:`Market QB ${i}`,position:'QB',nflTeam:'FA',adp:i+8})),
 {rank:38,tier:9,name:'Depth RB',position:'RB',nflTeam:'FA',adp:100},
 {rank:39,tier:9,name:'Depth WR',position:'WR',nflTeam:'FA',adp:101}
]};
function scarcityRun({owned=[1,3,4],clock=41,next=41,board=scarcityBoard,extra=[],sessionChanges={}}={}){
 const picks=board.players.filter(p=>p.rank<=4||extra.includes(p.rank)).map(p=>({...pick(p,null),teamId:owned.includes(p.rank)?8:2}));
 return run({rankings:board,session:{...current(),manualMode:true,picks,onClock:clock,upcomingOwnPicks:next?[next]:[],...sessionChanges}});
}
test('a missing quality RB triggers a tier warning if waiting loses every same-tier option',()=>{
 const a=scarcityRun();assert.equal(a.rosterAlerts.length,1);
 const alert=a.rosterAlerts[0];assert.equal(alert.position,'RB');assert.equal(alert.tier,2);assert.equal(alert.owned,1);assert.equal(alert.target,2);assert.equal(alert.stage,'following');assert.equal(alert.pick,60);
 assert.deepEqual(alert.playerKeys,[playerKey(scarcityBoard.players[4])]);assert.match(alert.message,/RB getting thin/);
});
test('WR shortages and loss before the next own pick are highlighted separately',()=>{
 const a=scarcityRun({owned:[1,2,3],clock:41,next:50});
 assert.equal(a.rosterAlerts.length,1);assert.equal(a.rosterAlerts[0].position,'WR');assert.equal(a.rosterAlerts[0].stage,'next');assert.equal(a.rosterAlerts[0].pick,50);
});
test('quality coverage clears alerts, while later-tier depth does not hide the shortage',()=>{
 assert.deepEqual(scarcityRun({owned:[1,2,3,4]}).rosterAlerts,[]);
 const a=scarcityRun({owned:[1,3,4,38],extra:[38]});assert.equal(a.rosterAlerts[0].owned,1);
});
test('no warning when a same-tier alternative is likely to survive, including consecutive snake picks',()=>{
 const board={players:scarcityBoard.players.map(p=>p.name==='Last RB'?{...p,adp:150}:p)};
 assert.deepEqual(scarcityRun({board}).rosterAlerts,[]);
 assert.deepEqual(scarcityRun({clock:20,next:20}).rosterAlerts,[]);
});
test('exhausted positions do not raise non-actionable warnings',()=>{
 assert.deepEqual(scarcityRun({extra:[5]}).rosterAlerts,[]);
});
test('unknown order, waiting, blocked and expired feeds suppress scarcity advice',()=>{
 assert.deepEqual(scarcityRun({next:null}).rosterAlerts,[]);
 for(const sessionChanges of [{state:'waiting'},{state:'complete'},{missing:[1]},{identityIssues:true},{manualMode:false,connected:false},{manualMode:false,lastSeenAt:-20000}])assert.deepEqual(scarcityRun({sessionChanges}).rosterAlerts,[]);
 assert.deepEqual(run().rosterAlerts,[]);
});
test('missing ADP and unverified options do not manufacture scarcity',()=>{
 for(const change of [{adp:null},{identityUnverified:true}]){
  const board={players:scarcityBoard.players.map(p=>p.name==='Last RB'?{...p,...change}:p)};
  assert.deepEqual(scarcityRun({board}).rosterAlerts,[]);
 }
});
test('starter replacement prevents later depth from counting as quality even in the current tier',()=>{
 const values=scarcityBoard.players.map(p=>({...p,tier:p.rank>=38?2:p.tier}));
 const smallConfig={...config,league:{...config.league,teamCount:1},roster:{...config.roster,positions:[{code:'RB',slots:2},{code:'WR',slots:2},{code:'BE',slots:12}]}};
 const session={...current(),teams:[{id:8}],manualMode:true,onClock:3,upcomingOwnPicks:[3],picks:[...values.filter(p=>p.rank<=4).map(p=>({...pick(p,null),teamId:2})),{...pick(values.find(p=>p.rank===38),null),teamId:8}]};
 const a=run({rankings:{players:values},config:smallConfig,session});
 assert.deepEqual(a.rosterAlerts,[]);
});

test('first-pick screenshot scenario stays quiet with empty RB and WR slots',()=>{
 const taken=rankings.players.filter(p=>p.tier===1&&p.position==='RB').map(p=>({...pick(p,null),teamId:2}));
 const a=run({session:{...current(),manualMode:true,picks:taken,onClock:5,upcomingOwnPicks:[5,16]}});
 assert.deepEqual(a.rosterAlerts,[]);
});
test('starter deadlines permit normal early roster building',()=>{
 assert.deepEqual(scarcityRun({clock:21,next:21}).rosterAlerts,[]); // One RB in round 3 is on track.
 assert.deepEqual(scarcityRun({owned:[1,2,3],clock:31,next:31}).rosterAlerts,[]); // One WR in round 4 is on track.
 assert.equal(scarcityRun({owned:[3,4],clock:11,next:11}).rosterAlerts[0].position,'RB');
 assert.equal(scarcityRun({owned:[1,2],clock:21,next:21}).rosterAlerts[0].position,'WR');
});
test('broad tiers and uncertainty alone do not trigger urgent scarcity',()=>{
 const board={players:[...scarcityBoard.players,...[40,41].map(rank=>({rank,tier:2,name:`Extra RB ${rank}`,position:'RB',nflTeam:'FA',adp:7}))]};
 assert.deepEqual(scarcityRun({board}).rosterAlerts,[]);
 const uncertain={players:scarcityBoard.players.map(p=>p.name==='Last RB'?{...p,adp:24}:p)};
 assert.deepEqual(scarcityRun({board:uncertain}).rosterAlerts,[]);
});
test('only the most urgent position gets a warning',()=>{
 const a=scarcityRun({owned:[1,3]});assert.equal(a.rosterAlerts.length,1);assert.equal(a.rosterAlerts[0].position,'RB');
});
