var EspnPageHighlights = (() => {
  let message=null;
  function refresh(){
    const url=new URL(location.href);
    const valid=message&&message.expiresAt>Date.now()&&url.pathname==='/football/draft'&&Number(url.searchParams.get('leagueId'))===message.leagueId&&Number(url.searchParams.get('seasonId'))===message.seasonId&&Number(url.searchParams.get('teamId'))===message.teamId;
    const snapshot=valid?EspnDraftReader.read(document,location.href):null;
    const current=snapshot&&snapshot.state==='drafting'&&(message.manualMode||snapshot.onClock===message.onClock);
    const matched=EspnRecommendationHighlights.decorate(document,valid&&current?message.candidates:[],valid&&current?(message.tierPlayers||[]):[],valid&&current?(message.scarcityPlayers||[]):[]);
    return {ok:true,active:!!(valid&&current),...matched};
  }
  function receive(next){
    message=!next.clear&&Array.isArray(next.candidates)&&next.candidates.length<=2&&(!next.tierPlayers||(Array.isArray(next.tierPlayers)&&next.tierPlayers.length<=200))&&(!next.scarcityPlayers||(Array.isArray(next.scarcityPlayers)&&next.scarcityPlayers.length<=200))&&Number.isFinite(next.expiresAt)?next:null;
    return refresh();
  }
  chrome.runtime.onMessage.addListener((next,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(next?.type==='ESPN_HIGHLIGHT_DIAGNOSTICS'){respond({version:chrome.runtime.getManifest().version,url:location.href,status:refresh(),advice:message,rows:EspnRecommendationHighlights.diagnostics(document)});return;}
    if(next?.type!=='DRAFT_RECOMMENDATIONS')return;
    const result=receive(next);respond?.(result);
  });
  // Reapply after ESPN replaces virtualized player rows, and expire closed-panel advice.
  setInterval(refresh,1000);
  // React recycles rows on scroll and filtering. Refresh from the current DOM,
  // not cached names or row indices; ignore our own style/class mutations.
  if(typeof MutationObserver==='function'){
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;queued=true;
      setTimeout(()=>{queued=false;refresh();},0);
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-player-id']});
  }
  return {receive};
})();
