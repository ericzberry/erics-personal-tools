export const sessionKey = s => `${s.mode}:${s.seasonId}:${s.leagueId}`;
export function validateSnapshot(s, senderUrl) {
  try {
    const url = new URL(senderUrl);
    if (url.origin !== 'https://fantasy.espn.com' || url.pathname !== '/football/draft') return false;
    if (!s || s.leagueId !== Number(url.searchParams.get('leagueId')) || s.seasonId !== Number(url.searchParams.get('seasonId'))) return false;
    if (!Number.isSafeInteger(s.leagueId) || s.leagueId < 1 || !Number.isInteger(s.seasonId) || s.seasonId < 2020 || s.seasonId > 2100) return false;
    if (!['league', 'practice'].includes(s.mode) || (s.mode === 'league' && (s.leagueId !== 182527585 || s.seasonId !== 2026))) return false;
    if (typeof s.title !== 'string' || s.title.length > 300 || (s.mode === 'practice' && !/Practice Draft|Mock Draft/i.test(s.title))) return false;
    if (!['waiting', 'drafting', 'complete', 'unknown'].includes(s.state)) return false;
    if (s.upcomingOwnPicks !== undefined && (!Array.isArray(s.upcomingOwnPicks) || s.upcomingOwnPicks.length > 100 || !s.upcomingOwnPicks.every(n => Number.isInteger(n) && n > 0 && n <= 2000))) return false;
    if (s.onClock !== null && (!Number.isInteger(s.onClock) || s.onClock < 1 || s.onClock > 2001)) return false;
    if (s.rounds !== null && (!Number.isInteger(s.rounds) || s.rounds < 1 || s.rounds > 100)) return false;
    if (!Array.isArray(s.teams) || s.teams.length < 2 || s.teams.length > 20 || !Array.isArray(s.picks) || s.picks.length > 2000) return false;
    const str = v => typeof v === 'string' && v.length > 0 && v.length <= 150;
    if (!s.teams.every(t => Number.isInteger(t.id) && t.id > 0 && str(t.name)) || new Set(s.teams.map(t => t.id)).size !== s.teams.length) return false;
    return s.picks.every(p => Number.isInteger(p.round) && p.round >= 1 && p.round <= 100 &&
      Number.isInteger(p.pickInRound) && p.pickInRound >= 1 && p.pickInRound <= s.teams.length &&
      p.overall === (p.round - 1) * s.teams.length + p.pickInRound && str(p.player) && str(p.position) && str(p.nflTeam) &&
      s.teams.some(t => t.id === p.teamId && t.name === p.team));
  } catch { return false; }
}
export function mergeSnapshot(previous, incoming, now = Date.now(), tabId = null) {
  const same = previous && sessionKey(previous) === sessionKey(incoming);
  const picks = new Map((same ? previous.picks : []).map(p => [p.overall, p]));
  // A commissioner undo/reset moves the clock back. Discard rolled-back picks.
  if (incoming.state === 'waiting') picks.clear();
  if (incoming.onClock) for (const n of picks.keys()) if (n >= incoming.onClock) picks.delete(n);
  for (const p of incoming.picks) {
    if (incoming.state !== 'waiting' && (!incoming.onClock || p.overall < incoming.onClock)) picks.set(p.overall, p);
  }
  const sorted = [...picks.values()].sort((a, b) => a.overall - b.overall);
  const totalRounds = incoming.rounds || (same ? previous.rounds : null);
  const expected = incoming.state === 'complete' && totalRounds ? totalRounds * incoming.teams.length :
    incoming.onClock ? incoming.onClock - 1 : sorted.at(-1)?.overall || 0;
  const missing = Array.from({length: expected}, (_, i) => i + 1).filter(n => !picks.has(n));
  const changed = !same || JSON.stringify(previous.picks) !== JSON.stringify(sorted);
  return {...incoming, rounds: totalRounds, picks: sorted, missing, lastSeenAt: now,
    lastPickAt: changed ? now : previous.lastPickAt, tabId, connected: true};
}
