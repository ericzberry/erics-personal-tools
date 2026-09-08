/* Selectors verified against ESPN's 2026 league-specific practice draft. */
var EspnDraftReader = (() => {
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  function read(document, href) {
    const url = new URL(href);
    const leagueId = Number(url.searchParams.get('leagueId'));
    const seasonId = Number(url.searchParams.get('seasonId'));
    if (url.origin !== 'https://fantasy.espn.com' || url.pathname !== '/football/draft' ||
        !Number.isSafeInteger(leagueId) || leagueId < 1 || seasonId < 2020 || seasonId > 2100) return null;
    const title = clean(document.querySelector('h1')?.textContent);
    if (!title.startsWith('ESPN Fantasy Football Draft')) return null;
    const teams = Array.from(document.querySelectorAll('.roster__dropdown select option'))
      .map(el => ({id: Number(el.value), name: clean(el.textContent)}))
      .filter(t => Number.isSafeInteger(t.id) && t.id > 0 && t.name);
    if (teams.length < 2) return null;
    const teamMap = new Map(teams.map(t => [t.name, t.id]));
    const body = document.body.innerText || document.body.textContent;
    const clock = body.match(/ON THE CLOCK:\s*PICK\s+(\d+)/i);
    const rounds = body.match(/RND\s+\d+\s+OF\s+(\d+)/i);
    const completed = /(?:your draft is complete|draft complete|draft has ended)/i.test(body);
    const state = completed ? 'complete' : clock ? 'drafting' : /DRAFTING IN/i.test(body) ? 'waiting' : 'unknown';
    const picks = [];
    let rejected = 0;
    for (const el of document.querySelectorAll('.pick-message__container')) {
      const info = clean(el.querySelector('.pick-info')?.textContent).match(/^R(\d+),\s*P(\d+)\s*-\s*(.+)$/);
      const player = clean(el.querySelector('.playerinfo__playername')?.textContent);
      if (!info || !player) { rejected++; continue; }
      const round = Number(info[1]), pickInRound = Number(info[2]), team = info[3];
      if (round < 1 || round > 100 || pickInRound < 1 || pickInRound > teams.length || !teamMap.has(team)) { rejected++; continue; }
      picks.push({overall: (round - 1) * teams.length + pickInRound, round, pickInRound,
        player, position: clean(el.querySelector('.playerinfo__playerpos')?.textContent),
        nflTeam: clean(el.querySelector('.playerinfo__playerteam')?.textContent), team, teamId: teamMap.get(team)});
    }
    const upcomingOwnPicks = Array.from(document.querySelectorAll('.own-pick .pick-number'))
      .map(el => Number(clean(el.textContent).match(/^PICK (\d+)$/i)?.[1]))
      .filter(n => Number.isInteger(n) && n > 0).sort((a,b) => a-b);
    return {leagueId, seasonId, teamId: Number(url.searchParams.get('teamId')) || null, upcomingOwnPicks,
      title, mode: /Practice Draft|Mock Draft/i.test(title) ? 'practice' : 'league', teams,
      state, onClock: clock ? Number(clock[1]) : null, rounds: rounds ? Number(rounds[1]) : null,
      picks, rejected};
  }
  return {read};
})();
