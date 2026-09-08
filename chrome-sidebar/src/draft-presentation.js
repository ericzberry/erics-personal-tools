import {playerKey,positionKey} from './player-identity.js';
export const rosterPositions=['RB','WR','QB','TE','D/ST','K'];
// Include the opponent currently on the clock; our own selection is not a wait.
export function pickCountdown(session,turn,{blocked=false}={}){
  if(blocked||session?.state!=='drafting'||!Number.isInteger(session.onClock)||session.onClock<1||
    !Number.isInteger(turn?.nextPick)||turn.nextPick<session.onClock)return '';
  const remaining=turn.nextPick-session.onClock;
  if(remaining>0)return `${remaining} ${remaining===1?'pick':'picks'} until you`;
  if(!Number.isInteger(turn.followingPick)||turn.followingPick<=turn.nextPick)return 'Your pick now';
  const between=turn.followingPick-turn.nextPick-1;
  return `Your pick now · ${between===0?'You pick again immediately':`${between} ${between===1?'pick':'picks'} until your next turn`}`;
}
export function rosterCounts(session){
  const counts=Object.fromEntries(rosterPositions.map(p=>[p,0]));
  const seen=new Set();
  for(const pick of session?.picks||[]){
    const key=playerKey(pick),position=positionKey(pick.position);
    if(pick.teamId!==session.teamId||seen.has(key))continue;
    seen.add(key);if(position in counts)counts[position]++;
  }
  return counts;
}
// Current tier means the highest spreadsheet tier with any untaken verified player.
export function currentTierPlayers(players,session){
  const taken=new Set((session?.picks||[]).map(playerKey));
  const remaining=players.filter(p=>!p.identityUnverified&&!taken.has(playerKey(p))&&Number.isInteger(p.tier));
  const tier=Math.min(...remaining.map(p=>p.tier));
  return remaining.filter(p=>p.tier===tier);
}
