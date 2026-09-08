export const positionKey = p => p === 'DST' ? 'D/ST' : p;
export const teamKey = t => ({JAC:'JAX',WAS:'WSH'}[t] || t);
export function nameKey(name) {
  const key=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’]/g,'').replace(/\b(jr|sr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
  return key==='kennygainwell'?'kennethgainwell':key;
}
export function playerKey(p) {
  const pos=positionKey(p.position), team=teamKey(p.nflTeam);
  return `${pos}:${team}:${pos==='D/ST'?'defense':nameKey(p.name ?? p.player)}`;
}
