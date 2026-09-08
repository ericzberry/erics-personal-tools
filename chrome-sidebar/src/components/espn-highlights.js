/* Reusable page decoration component. No clicks, drafting, or page-content replacement. */
var EspnRecommendationHighlights = (() => {
  const styles='/* Recommendation blue takes precedence over current-tier amber. */\n.eric-current-tier-row > * { background-color: #fff0bc !important; border-top: 2px solid #c28b12 !important; border-bottom: 2px solid #c28b12 !important; }\n.eric-current-tier-row > td:first-child { box-shadow: inset 4px 0 #c28b12; }\n.eric-recommended-row > * { background-color: #d5e6ff !important; border-top: 3px solid #1258d5 !important; border-bottom: 3px solid #1258d5 !important; }\n.eric-recommended-row > td:first-child { box-shadow: inset 6px 0 #1258d5; }\n[data-eric-recommendation]::after, [data-eric-tier]::after { display: inline-block; margin-left: 7px; border-radius: 4px; color: #fff; padding: 3px 6px; font: 700 11px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; white-space: nowrap; }\n[data-eric-recommendation]::after { content: attr(data-eric-recommendation); background: #1258d5; }\n[data-eric-tier]::after { content: attr(data-eric-tier); background: #805900; }\n';
  function ensureStyles(document){
    if(document.querySelector('[data-eric-highlight-styles]'))return;
    const style=document.createElement('style');style.setAttribute('data-eric-highlight-styles','true');style.textContent=styles;(document.head||document.documentElement).append(style);
  }
  const normalize=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’]/g,'').replace(/\b(jr|sr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'').replace(/^kennygainwell$/,'kennethgainwell');
  const team=value=>({JAC:'JAX',WAS:'WSH'}[value]||value);
  const position=value=>value==='DST'?'D/ST':value;
  function decorate(document,candidates,tierPlayers=[]){
    ensureStyles(document);
    for(const el of document.querySelectorAll('[data-eric-recommendation]'))el.removeAttribute('data-eric-recommendation');
    for(const el of document.querySelectorAll('.eric-recommended-row'))el.classList.remove('eric-recommended-row');
    for(const el of document.querySelectorAll('[data-eric-tier]'))el.removeAttribute('data-eric-tier');
    for(const el of document.querySelectorAll('.eric-current-tier-row'))el.classList.remove('eric-current-tier-row');
    let recommended=0,currentTier=0;
    const rowSelector='tr, [role="row"], .Table__TR, .player-row';
    const rows=new Set(document.querySelectorAll(rowSelector));
    for(const name of document.querySelectorAll('.playerinfo__playername, .player-column__athlete, a')){
      if(name.closest('.pick-message__container'))continue;
      const row=name.closest(rowSelector)||name.closest('.player-column');if(row)rows.add(row);
    }
    for(const row of rows){
      if(row.closest('.pick-message__container'))continue;
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
    const getStyle=document.defaultView?.getComputedStyle;
    const painted=typeof getStyle==='function'?[...document.querySelectorAll('.eric-recommended-row,.eric-current-tier-row')].filter(row=>{
      const color=getStyle.call(document.defaultView,row.firstElementChild||row).backgroundColor;
      return color==='rgb(213, 230, 255)'||color==='rgb(255, 240, 188)';
    }).length:null;
    return {recommended,currentTier,painted};
  }
  return {decorate};
})();
