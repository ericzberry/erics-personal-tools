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
    for(const name of document.querySelectorAll('.playerinfo__playername')){
      const row=name.closest('tr');
      if(!row||name.closest('.pick-message__container'))continue;
      const draftButton=[...row.querySelectorAll('button')].find(b=>/^draft$/i.test(b.textContent.trim()));
      if(!draftButton)continue;
      const link=name.closest('a')||name.querySelector('a');
      const href=link?.getAttribute('href')||'';
      const id=Number(href.match(/(?:\/id\/|[?&]playerId=)(\d+)/)?.[1]);
      const pos=position(row.querySelector('.playerinfo__playerpos')?.textContent.trim());
      const nflTeam=team(row.querySelector('.playerinfo__playerteam')?.textContent.trim());
      const matches=p=>id?Number(p.espnId)===id:normalize(name.textContent)===normalize(p.name)&&pos===position(p.position)&&nflTeam===team(p.nflTeam);
      const index=candidates.findIndex(matches);
      const tierPlayer=tierPlayers.find(matches);
      if(tierPlayer&&index<0){row.classList.add('eric-current-tier-row');name.setAttribute('data-eric-tier',`Tier ${tierPlayer.tier}`);}
      if(index<0)continue;
      row.classList.add('eric-recommended-row');name.setAttribute('data-eric-recommendation',`Eric’s pick ${index+1}`);
    }
  }
  return {decorate};
})();
