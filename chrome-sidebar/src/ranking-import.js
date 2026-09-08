import {playerKey, positionKey} from './player-identity.js';
export function validateRankings(data, seasonId=2026) {
  if (data?.seasonId !== seasonId || data?.scoring !== 'half-ppr' || !Array.isArray(data.players) || !data.players.length || data.players.length>1000) throw Error('Use a Combined Ranks board for this season and half-PPR scoring.');
  const keys=new Set(), ranks=new Set();
  const players=data.players.map(p=>{
    const position=positionKey(p.position);
    if(!Number.isInteger(p.rank)||p.rank<1||p.rank>1000||typeof p.name!=='string'||!p.name.trim()||p.name.length>150||typeof p.nflTeam!=='string'||!p.nflTeam.trim()||p.nflTeam.length>10||!['QB','RB','WR','TE','K','D/ST'].includes(position))throw Error('Each player needs a rank, name, position and NFL team.');
    if(p.adp!=null && (typeof p.adp!=='number'||!Number.isFinite(p.adp)||p.adp<=0))throw Error('ADP must be a positive number or blank.');
    const key=playerKey(p);if(keys.has(key)||ranks.has(p.rank))throw Error('Duplicate player or rank.');keys.add(key);ranks.add(p.rank);
    return {rank:p.rank,name:p.name.trim(),position,nflTeam:p.nflTeam.trim(),adp:p.adp??null};
  }).sort((a,b)=>a.rank-b.rank);
  if(players.some((p,i)=>p.rank!==i+1))throw Error('Combined ranks must run consecutively from 1.');
  return {schemaVersion:1,seasonId,scoring:'half-ppr',source:typeof data.source==='string'?data.source.slice(0,150):'Combined Ranks',players};
}
export function rankingsFromRows(rows, source, seasonId=2026) {
  const players=rows.slice(1).filter(row=>row[2]!=null).map(row=>({rank:row[1],name:row[2],position:row[3],nflTeam:row[4],adp:row[5]}));
  return validateRankings({seasonId,scoring:'half-ppr',source,players},seasonId);
}
