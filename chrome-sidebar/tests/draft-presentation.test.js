import test from 'node:test';
import assert from 'node:assert/strict';
import {currentTierPlayers,rosterCounts,pickCountdown} from '../src/draft-presentation.js';
import {turns} from '../src/recommendations.js';
const players=[{name:'A',espnId:1,tier:1},{name:'B',espnId:2,tier:1},{name:'C',espnId:3,tier:2},{name:'D',espnId:4,tier:2,identityUnverified:true}];
test('countdown follows snake reversals and consecutive own picks without an off-by-one',()=>{
 for(const [slot,onClock,expected] of [[5,1,'4 picks until you'],[5,5,'Your pick now · 10 picks until your next turn'],[5,6,'10 picks until you'],[5,15,'1 pick until you'],[5,16,'Your pick now · 8 picks until your next turn'],[5,17,'8 picks until you'],[10,10,'Your pick now · You pick again immediately'],[10,11,'Your pick now · 18 picks until your next turn'],[10,12,'18 picks until you']]){
  const session={state:'drafting',onClock,upcomingOwnPicks:[slot],rounds:16};
  assert.equal(pickCountdown(session,turns(session,10)),expected,`slot ${slot}, pick ${onClock}`);
  assert.equal(pickCountdown({...session,manualMode:true},turns(session,10)),expected);
 }
});
test('countdown does not guess unknown, completed, or blocked draft progress',()=>{
 const session={state:'drafting',onClock:5};
 for(const nextPick of [null,undefined,4])assert.equal(pickCountdown(session,{nextPick}),'');
 for(const state of ['waiting','complete','unknown'])assert.equal(pickCountdown({...session,state},{nextPick:16}),'');
 assert.equal(pickCountdown(session,{nextPick:16},{blocked:true}),'');
 assert.equal(pickCountdown(null,{nextPick:16}),'');
 assert.equal(pickCountdown({...session,onClock:null},{nextPick:16}),'');
});
test('current tier advances only when all verified members are taken, independent of recommendations',()=>{
 assert.deepEqual(currentTierPlayers(players,{picks:[{espnId:1}]}).map(p=>p.espnId),[2]);
 assert.deepEqual(currentTierPlayers(players,{picks:[{espnId:1},{espnId:2}]}).map(p=>p.espnId),[3]);
 assert.deepEqual(currentTierPlayers(players,{picks:[{espnId:1},{espnId:2},{espnId:3}]}),[]);
});
test('roster counts use ownership, include unranked/manual players, normalize defense and avoid duplicates',()=>{
 const picks=[{espnId:1,position:'RB',teamId:8},{espnId:1,position:'RB',teamId:8},{espnId:2,position:'RB',teamId:9},{espnId:3,position:'WR',teamId:8,manual:true},{espnId:4,position:'DST',teamId:8}];
 assert.deepEqual(rosterCounts({teamId:8,picks}),{RB:1,WR:1,QB:0,TE:0,'D/ST':1,K:0});
 assert.equal(rosterCounts(null).RB,0);
});

test('on-clock wait excludes this pick and handles the final turn without inventing another',()=>{
 const session={state:'drafting',onClock:5};
 assert.equal(pickCountdown(session,{nextPick:5,followingPick:7}),'Your pick now · 1 pick until your next turn');
 for(const followingPick of [null,undefined,4,5])assert.equal(pickCountdown(session,{nextPick:5,followingPick}),'Your pick now');
 const final={state:'drafting',onClock:156,upcomingOwnPicks:[5],rounds:16};
 assert.equal(pickCountdown(final,turns(final,10)),'Your pick now');
});
