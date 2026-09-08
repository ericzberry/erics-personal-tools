import {nameKey,playerKey,positionKey,teamKey} from './player-identity.js';
const endpoint=season=>`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}`;
const positions={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'D/ST'};
export async function fetchEspnCatalog(season=2026,fetcher=fetch) {
  const request=async(url,headers={})=>{const r=await fetcher(url,{credentials:'omit',headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('ESPN player sync failed. The saved list is still available.');return r.json();};
  const [raw,settings]=await Promise.all([request(`${endpoint(season)}/players?view=players_wl`,{'X-Fantasy-Filter':JSON.stringify({players:{limit:20000}})}),request(`${endpoint(season)}?view=proTeamSchedules_wl`)]);
  if(!Array.isArray(raw)||!Array.isArray(settings?.settings?.proTeams))throw Error('ESPN returned an unreadable player list.');
  const teams=new Map(settings.settings.proTeams.map(t=>[t.id,t.abbrev]));
  const players=raw.filter(p=>positions[p.defaultPositionId]&&Number.isInteger(p.id)&&typeof p.fullName==='string').map(p=>({espnId:p.id,name:p.fullName,position:positions[p.defaultPositionId],nflTeam:teams.get(p.proTeamId)||'FA'}));
  if(players.length<500||new Set(players.map(p=>p.espnId)).size!==players.length)throw Error('ESPN returned an incomplete player list.');
  return {seasonId:season,fetchedAt:Date.now(),source:endpoint(season),players};
}
// ESPN's current NFL player card confirms 16800; its catalog also contains a duplicate Adams row.
// https://www.espn.com/nfl/player/_/id/16800/davante-adams
const verifiedIds={'WR:LAR:davanteadams':16800};
const textKey=p=>playerKey({...p,espnId:undefined});
const indexes=new WeakMap();
const looseKey=p=>`${positionKey(p.position)}:${positionKey(p.position)==='D/ST'?teamKey(p.nflTeam):nameKey(p.name??p.player)}`;
function index(catalog){
  if(indexes.has(catalog))return indexes.get(catalog);
  const result={ids:new Map(),exact:new Map(),loose:new Map()};
  for(const p of catalog.players){result.ids.set(p.espnId,p);for(const [map,key] of [[result.exact,textKey(p)],[result.loose,looseKey(p)]])map.set(key,[...(map.get(key)||[]),p]);}
  indexes.set(catalog,result);return result;
}
export function matchEspnPlayer(player,catalog) {
  const lookup=index(catalog);
  if(Number.isInteger(player.espnId))return lookup.ids.get(player.espnId)||null;
  const exact=lookup.exact.get(textKey(player))||[];
  if(exact.length===1)return exact[0];
  if(exact.length>1)return exact.find(p=>p.espnId===verifiedIds[textKey(player)])||null;
  const possible=lookup.loose.get(looseKey(player))||[];
  return possible.length===1?possible[0]:null;
}
export function reconcileRankings(rankings,catalog) {
  return {...rankings,players:rankings.players.map(p=>{const espn=matchEspnPlayer(p,catalog);return espn?{...p,...espn,identityUnverified:false,spreadsheetName:p.name,spreadsheetTeam:p.nflTeam}:{...p,identityUnverified:true};})};
}
export function reconcileSession(session,catalog) {
  if(!session||!catalog)return session;
  const picks=session.picks.map(p=>{const espn=matchEspnPlayer(p,catalog);return espn?{...p,...espn,identityUnverified:false,player:espn.name}:{...p,identityUnverified:true};});
  return {...session,picks,identityIssues:picks.filter(p=>p.identityUnverified).length};
}
export function correctionPlayers(rankings,catalog) {
  const counts=new Map();for(const p of catalog.players)counts.set(textKey(p),(counts.get(textKey(p))||0)+1);
  const ranked=new Map(rankings.players.filter(p=>p.espnId!==undefined).map(p=>[p.espnId,p]));
  return [...catalog.players.map(p=>({...p,...ranked.get(p.espnId),identityUnverified:counts.get(textKey(p))>1&&verifiedIds[textKey(p)]!==p.espnId})),...rankings.players.filter(p=>p.identityUnverified)]
    .sort((a,b)=>(a.rank??100000)-(b.rank??100000)||a.name.localeCompare(b.name)||a.espnId-b.espnId);
}
