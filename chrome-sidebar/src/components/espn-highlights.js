/* Reusable page decoration component. No clicks, drafting, or page-content replacement. */
var EspnRecommendationHighlights = (() => {
  const normalize=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’]/g,'').replace(/\b(jr|sr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'').replace(/^kennygainwell$/,'kennethgainwell');
  const team=value=>({JAC:'JAX',WAS:'WSH'}[value]||value);
  const position=value=>value==='DST'?'D/ST':value;
  function decorate(document,candidates,tierPlayers=[]){
    for(const el of document.querySelectorAll('[data-eric-recommendation]'))el.removeAttribute('data-eric-recommendation');
    for(const el of document.querySelectorAll('.eric-recommended-row'))el.classList.remove('eric-recommended-row');
    for(const el of document.querySelectorAll('[data-eric-tier]'))el.removeAttribute('data-eric-tier');
    for(const el of document.querySelectorAll('.eric-current-tier-row'))el.classList.remove('eric-current-tier-row');
    let recommended=0,currentTier=0;
    for(const row of document.querySelectorAll('tr, [role="row"]')){
      if(row.closest('.pick-message__container')||!row.querySelector('td, [role="cell"]'))continue;
      const names=[...row.querySelectorAll('a, .playerinfo__playername, .player-column__athlete')];
      const tokens=[row,...row.querySelectorAll('span, div')].flatMap(el=>(el.textContent||'').toUpperCase().split(/[^A-Z/]+/));
      let matchedName=null;
      const matches=p=>{
        for(const name of names){
          const href=name.getAttribute('href')||name.querySelector('a')?.getAttribute('href')||'';
          const id=Number(href.match(/(?:\/id\/|[?&]playerId=)(-?\d+)/)?.[1]);
          if(id){if(Number(p.espnId)===id){matchedName=name;return true;}continue;}
          const pos=position(row.querySelector('.playerinfo__playerpos')?.textContent.trim());
          const nflTeam=team(row.querySelector('.playerinfo__playerteam')?.textContent.trim());
          const teamMatches=nflTeam?nflTeam===team(p.nflTeam):tokens.some(t=>team(t)===team(p.nflTeam));
          const positionMatches=pos?pos===position(p.position):tokens.some(t=>position(t)===position(p.position));
          if(normalize(name.textContent)===normalize(p.name)&&positionMatches&&teamMatches){matchedName=name;return true;}
        }
        return false;
      };
      const index=candidates.findIndex(matches);
      const recommendationName=matchedName;
      const tierPlayer=index<0?tierPlayers.find(matches):null;
      const name=index>=0?recommendationName:matchedName;
      if(tierPlayer&&index<0){currentTier++;row.classList.add('eric-current-tier-row');name.setAttribute('data-eric-tier',`Tier ${tierPlayer.tier}`);}
      if(index<0)continue;
      recommended++;row.classList.add('eric-recommended-row');name.setAttribute('data-eric-recommendation',`Eric’s pick ${index+1}`);
    }
    return {recommended,currentTier};
  }
  return {decorate};
})();
