import {reconcileRankings,reconcileSession} from './espn-catalog.js';
import {applyManualDraft} from './manual-draft.js';
import {recommend} from './recommendations.js';
import {currentTierPlayers} from './draft-presentation.js';
import {sessionKey} from './draft-state.js';
import {playerKey} from './player-identity.js';
let bundled;
export async function pageAdvice(live,stored,now=Date.now()){
  if(!bundled)bundled=Promise.all(['espn-league-2026','rankings-2026','espn-players-2026'].map(async name=>{
    const response=await fetch(new URL(`../config/${name}.json`,import.meta.url));if(!response.ok)throw Error('Could not load draft advice.');return response.json();
  })).catch(error=>{bundled=null;throw error;});
  const [config,source,fallback]=await bundled;
  const catalog=stored.espnCatalog?.seasonId===config.seasonId&&stored.espnCatalog.fetchedAt>fallback.fetchedAt?stored.espnCatalog:fallback;
  const rankings=reconcileRankings(source,catalog);
  const session=reconcileSession(applyManualDraft(reconcileSession(live,catalog),stored.manualDrafts?.[sessionKey(live)]),catalog);
  const advice=recommend({rankings,config,session,now});
  const player=p=>({espnId:p.espnId,name:p.name,position:p.position,nflTeam:p.nflTeam,tier:p.tier});
  const scarcityKeys=new Set(advice.rosterAlerts.flatMap(a=>a.playerKeys));
  return {type:'DRAFT_RECOMMENDATIONS',leagueId:live.leagueId,seasonId:live.seasonId,teamId:live.teamId,onClock:live.onClock,manualMode:!!session.manualMode,candidates:advice.candidates.map(player),tierPlayers:advice.blocked?[]:currentTierPlayers(rankings.players,session).map(player),scarcityPlayers:rankings.players.filter(p=>scarcityKeys.has(playerKey(p))).map(player),expiresAt:now+15000};
}
