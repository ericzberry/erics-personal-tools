var EspnPageHighlights = (() => {
  let message=null;
  function refresh(){
    const url=new URL(location.href);
    const valid=message&&message.expiresAt>Date.now()&&url.pathname==='/football/draft'&&Number(url.searchParams.get('leagueId'))===message.leagueId&&Number(url.searchParams.get('seasonId'))===message.seasonId&&Number(url.searchParams.get('teamId'))===message.teamId;
    const snapshot=valid?EspnDraftReader.read(document,location.href):null;
    const current=snapshot&&snapshot.state==='drafting'&&(message.manualMode||snapshot.onClock===message.onClock);
    const matched=EspnRecommendationHighlights.decorate(document,valid&&current?message.candidates:[],valid&&current?(message.tierPlayers||[]):[]);
    return {ok:true,active:!!(valid&&current),...matched};
  }
  function receive(next){
    message=!next.clear&&Array.isArray(next.candidates)&&next.candidates.length<=2&&(!next.tierPlayers||(Array.isArray(next.tierPlayers)&&next.tierPlayers.length<=200))&&Number.isFinite(next.expiresAt)?next:null;
    return refresh();
  }
  chrome.runtime.onMessage.addListener((next,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||next?.type!=='DRAFT_RECOMMENDATIONS')return;
    const result=receive(next);respond?.(result);
  });
  // Reapply after ESPN replaces virtualized player rows, and expire closed-panel advice.
  setInterval(refresh,1000);
  return {receive};
})();
