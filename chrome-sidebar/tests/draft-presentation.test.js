import test from 'node:test';
import assert from 'node:assert/strict';
import {currentTierPlayers,rosterCounts} from '../src/draft-presentation.js';
const players=[{name:'A',espnId:1,tier:1},{name:'B',espnId:2,tier:1},{name:'C',espnId:3,tier:2},{name:'D',espnId:4,tier:2,identityUnverified:true}];
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
