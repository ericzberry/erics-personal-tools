/* Reusable page decoration component. No clicks, drafting, or page-content replacement. */
var EspnRecommendationHighlights = (() => {
  // Direct CSSOM updates work even when the host blocks injected stylesheets.
  // Remember only the property we own; leave layout and all other styles intact.
  const backgrounds=new Map();
  function restoreBackgrounds(){
    for(const [element,previous] of backgrounds){
      if(previous.value)element.style.setProperty('background-color',previous.value,previous.priority);
      else element.style.removeProperty('background-color');
    }
    backgrounds.clear();
  }
  const cellSelector='td, [role="cell"], .Table__TD, [class*="fixedDataTableCell"]';
  const rowSelector='tr, [role="row"], .Table__TR, .player-row, .public_fixedDataTableRow_main, .fixedDataTableRowLayout_main';
  function paintRow(row,color){
    const surfaces=new Set([row,...row.children,...row.querySelectorAll(cellSelector)]);
    for(const element of surfaces){
      if(!backgrounds.has(element))backgrounds.set(element,{value:element.style.getPropertyValue('background-color'),priority:typeof element.style.getPropertyPriority==='function'?element.style.getPropertyPriority('background-color'):''});
      element.style.setProperty('background-color',color,'important');
    }
  }
  const normalize=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.'’]/g,'').replace(/\b(jr|sr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'').replace(/^kennygainwell$/,'kennethgainwell');
  const team=value=>({JAC:'JAX',WAS:'WSH'}[value]||value);
  const position=value=>value==='DST'?'D/ST':value;
  function decorate(document,candidates,tierPlayers=[]){
    restoreBackgrounds();
    for(const style of document.querySelectorAll('[data-eric-highlight-styles]'))style.remove();
    for(const el of document.querySelectorAll('[data-eric-recommendation]'))el.removeAttribute('data-eric-recommendation');
    for(const el of document.querySelectorAll('.eric-recommended-row'))el.classList.remove('eric-recommended-row');
    for(const el of document.querySelectorAll('[data-eric-tier]'))el.removeAttribute('data-eric-tier');
    for(const el of document.querySelectorAll('.eric-current-tier-row'))el.classList.remove('eric-current-tier-row');
    let recommended=0,currentTier=0;
    const rows=new Set(document.querySelectorAll(rowSelector));
    for(const name of document.querySelectorAll('.playerinfo__playername, .player-column__athlete, a')){
      if(name.closest('.pick-message__container'))continue;
      const row=name.closest(rowSelector)||name.closest('.player-column');if(row)rows.add(row);
    }
    for(const row of rows){
      if(row.closest('.pick-message__container'))continue;
      const names=[...row.querySelectorAll('a, .playerinfo__playername, .player-column__athlete')];
      const tokens=[row,...row.querySelectorAll('span, div')].flatMap(el=>(el.textContent||'').toUpperCase().split(/[^A-Z/]+/));
      const matches=p=>{
        for(const name of names){
          const href=name.getAttribute('href')||name.querySelector('a')?.getAttribute('href')||'';
          const id=Number(href.match(/(?:\/id\/|[?&]playerId=)(-?\d+)/)?.[1]);
          if(id){if(Number(p.espnId)===id){return true;}continue;}
          const pos=position(row.querySelector('.playerinfo__playerpos')?.textContent.trim());
          const nflTeam=team(row.querySelector('.playerinfo__playerteam')?.textContent.trim());
          const teamMatches=nflTeam?nflTeam===team(p.nflTeam):tokens.some(t=>team(t)===team(p.nflTeam));
          const positionMatches=pos?pos===position(p.position):tokens.some(t=>position(t)===position(p.position));
          if(normalize(name.textContent)===normalize(p.name)&&positionMatches&&teamMatches){return true;}
        }
        return false;
      };
      const index=candidates.findIndex(matches);
      const tierPlayer=index<0?tierPlayers.find(matches):null;
      if(tierPlayer&&index<0){currentTier++;row.classList.add('eric-current-tier-row');paintRow(row,'#fff0bc');}
      if(index<0)continue;
      recommended++;row.classList.add('eric-recommended-row');paintRow(row,'#d5e6ff');
    }
    const getStyle=document.defaultView?.getComputedStyle;
    const painted=typeof getStyle==='function'?[...document.querySelectorAll('.eric-recommended-row,.eric-current-tier-row')].filter(row=>{
      const expected=row.classList.contains('eric-recommended-row')?'rgb(213, 230, 255)':'rgb(255, 240, 188)';
      const name=row.querySelector('.playerinfo__playername, .player-column__athlete, a');
      const rect=name?.getBoundingClientRect();
      if(!rect||!rect.width||!rect.height)return false;
      let surface=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      if(!surface||!row.contains(surface))return false;
      while(surface&&row.contains(surface)){
        const color=getStyle.call(document.defaultView,surface).backgroundColor;
        if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color===expected;
        surface=surface.parentElement;
      }
      return false;
    }).length:null;
    return {recommended,currentTier,painted};
  }
  function diagnostics(document){
    const describe=element=>{
      const rect=element.getBoundingClientRect?.();
      return {tag:element.tagName,className:element.getAttribute('class'),text:(element.textContent||'').trim().slice(0,250),href:element.getAttribute('href'),background:document.defaultView?.getComputedStyle?.(element).backgroundColor,rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null};
    };
    const nodes=[...document.querySelectorAll('a, .playerinfo__playername, .player-column__athlete')].filter(el=>!el.closest('.pick-message__container')&&(el.closest('tr,[role="row"],.Table__TR,.player-row,.player-column')||/player/i.test(el.getAttribute('class')||''))).slice(0,35);
    return nodes.map(el=>{const ancestors=[];let parent=el.parentElement;for(let i=0;parent&&i<5;i++,parent=parent.parentElement)ancestors.push({...describe(parent),children:[...parent.children].slice(0,12).map(describe)});return {node:describe(el),ancestors};});
  }
  return {decorate,diagnostics};
})();
