import {playerKey} from './player-identity.js';
import {turns} from './recommendations.js';
export function createManualDraft(session,config) {
  const baseline=session?structuredClone(session):{mode:'league',leagueId:config.leagueId,seasonId:config.seasonId,teamId:config.teamId||8,teams:Array.from({length:config.league.teamCount},(_,i)=>({id:i+1,name:`Team ${i+1}`})),picks:[],rounds:config.roster.size,onClock:null};
  return {active:true,baseline,overrides:{},onClock:baseline.onClock||null,slot:turns(baseline,config.league.teamCount).slot,updatedAt:Date.now()};
}
export function setManualPick(record,player,owner) {
  if(player.identityUnverified&&owner!=='undo')throw Error('This player identity needs verification before selection.');
  if(!['me','other','undo'].includes(owner))throw Error('Choose Me or Someone else.');
  const next=structuredClone(record),key=playerKey(player);
  if(owner==='undo')delete next.overrides[key];
  else next.overrides[key]={player:{name:player.name,position:player.position,nflTeam:player.nflTeam,espnId:player.espnId},owner};
  return {...next,active:true,updatedAt:Date.now()};
}
export function setManualProgress(record,onClock,slot) {
  const total=record.baseline.teams.length*(record.baseline.rounds||16);
  if(onClock!==null&&(!Number.isInteger(onClock)||onClock<1||onClock>total+1))throw Error(`Current pick must be 1–${total+1}.`);
  if(slot!==null&&(!Number.isInteger(slot)||slot<1||slot>record.baseline.teams.length))throw Error('Choose a valid draft position.');
  return {...record,active:true,onClock,slot,updatedAt:Date.now()};
}
export function applyManualDraft(live,record) {
  if(!record?.active)return live;
  const base=record.baseline;
  const picks=new Map(base.picks.map(p=>[playerKey(p),{...p}]));
  for(const [key,edit] of Object.entries(record.overrides)){
    const previous=picks.get(key);
    picks.set(key,{...previous,espnId:edit.player.espnId,player:edit.player.name,position:edit.player.position,nflTeam:edit.player.nflTeam,teamId:edit.owner==='me'?base.teamId:0,team:edit.owner==='me'?'You':'Someone else',manual:true,overall:previous?.overall??null,round:previous?.round??null,pickInRound:previous?.pickInRound??null});
  }
  const upcoming=[];
  if(record.slot&&record.onClock)for(let r=1;r<=(base.rounds||16);r++){
    const n=(r-1)*base.teams.length+(r%2?record.slot:base.teams.length+1-record.slot);if(n>=record.onClock)upcoming.push(n);
  }
  return {...base,picks:[...picks.values()].sort((a,b)=>(a.overall??Infinity)-(b.overall??Infinity)),onClock:record.onClock,upcomingOwnPicks:upcoming,manualSlot:record.slot,manualMode:true,connected:false,lastSeenAt:record.updatedAt,missing:[],rejected:0,state:record.onClock>base.teams.length*(base.rounds||16)?'complete':'drafting'};
}
