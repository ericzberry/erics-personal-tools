import {rosterCounts,currentTierPlayers} from './draft-presentation.js';
import {fetchEspnCatalog, reconcileRankings, reconcileSession, correctionPlayers} from './espn-catalog.js';
import {createManualDraft, applyManualDraft, setManualPick, setManualProgress} from './manual-draft.js';
import {playerKey} from './player-identity.js';
import {Disclosure, DataTable, RosterCounts, TieredRankings, SelectionRow} from './components/ui.js';
import {selectSession} from './session-selection.js';
import {sessionKey} from './draft-state.js';
import {recommend} from './recommendations.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.storage?.local;
let config, rankings, sourceRankings, catalog, catalogPlayers=[], syncMessage='', sessions = {}, selected = 'auto', manualDrafts = {};
let manualWrites=Promise.resolve();
let lastBoardSignature, lastTierSession, highlightedTab, lastRosterSignature;
let recommendedKeys=[];
const tierStates=new Map();
const liveSession=()=>reconcileSession(selectSession(sessions,selected),catalog);
const currentKey=()=>liveSession()?sessionKey(liveSession()):(selected==='auto'?'league:2026:182527585':selected);
const effectiveSession=()=>reconcileSession(applyManualDraft(liveSession(),manualDrafts[currentKey()]),catalog);
const human = text => text.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const nullLabels = {seasonAcquisitionLimit:'No limit',limit:'No limit',matchupTiebreaker:'None',homeFieldAdvantage:'None'};
const valueLabel = (key,v) => v === null ? (nullLabels[key] || 'Not set') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'string' && key === 'deadline' ? new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET' : typeof v === 'string' ? human(v) : String(v);
function group(title, headers, rows) {
  $('rules').append(Disclosure(title,[DataTable(headers,rows)]));
}
function renderRules() {
  group('Roster positions',['Position','Slots','Maximum'],config.roster.positions.map(p=>[p.label,p.slots,p.maximum]));
  for (const [category,entries] of Object.entries(config.scoring)) group(category,['Scoring event','Points'],entries.map(e=>[e.label,e.points]));
  for (const [key,title] of Object.entries({league:'League settings',draft:'Draft rules',roster:'Roster size',players:'Player rules',transactions:'Waivers & lineups',trades:'Trades',keepers:'Keepers',regularSeason:'Regular season',playoffs:'Playoffs'}))
    group(title,['Rule','Setting'],Object.entries(config[key]).filter(([,v])=>!Array.isArray(v)).map(([k,v])=>[human(k),valueLabel(k,v)]));
}
function renderDraft() {
  const s=effectiveSession();const live=s?.connected && Date.now()-s.lastSeenAt<15000;
  $('dot').classList.toggle('live',!!live);
  $('connection').textContent=s?.manualMode?'Manual board':!extension?'Preview · connection unavailable':!s?'Waiting for ESPN':live?(s.mode==='practice'?'Practice draft connected':'League draft connected'):'Saved draft · disconnected';
  $('status-detail').textContent=s?.manualMode?'Using your corrections. Update picks here as the draft continues.':!extension?'Load the unpacked extension in Chrome to capture draft picks.':!s?'Reload your ESPN draft tab to connect.':`${s.state==='complete'?'Draft complete':s.state==='drafting'?`On the clock: pick ${s.onClock}`:s.state==='waiting'?'Waiting for the first pick':'Draft status unavailable'}. Last checked ${new Date(s.lastSeenAt).toLocaleTimeString()}.`;
  $('pick-count').textContent=s?.picks.length || 0;
  $('round').textContent=s?.onClock ? Math.ceil(s.onClock/s.teams.length) : s?.picks.at(-1)?.round || '—';
  $('my-count').textContent=s?.picks.filter(p=>p.teamId===s.teamId).length || 0;
  const counts=rosterCounts(s),countSignature=JSON.stringify([counts,!!s]);
  if(countSignature!==lastRosterSignature){lastRosterSignature=countSignature;$('roster-counts').replaceChildren(RosterCounts(counts,{known:!!s}));}
  const warning=s?.missing?.length?`${s.missing.length} earlier pick(s) missing. Open ESPN’s Pick History or reload the draft room to recover available history.`:s?.rejected?'Some ESPN pick entries could not be read. Check ESPN’s pick history.':'';
  $('coverage').hidden=!warning;$('coverage').textContent=warning;
  renderAdvice(s);
  const confirmed=!!s&&(s.manualMode||(live&&!s.missing?.length&&!s.rejected&&!s.identityIssues));
  $('spreadsheet-context').textContent=!s?'Connect a draft to confirm availability.':s.manualMode?'Status from your manual board.':confirmed?'Status from captured ESPN picks.':'Saved picks shown; remaining availability is unconfirmed.';
  const key=currentKey();if(key!==lastTierSession){tierStates.clear();lastTierSession=key;}
  const boardSignature=JSON.stringify([key,rankings?.players,s?.picks,s?.teamId,confirmed,recommendedKeys,!!manualDrafts[key]?.active,manualDrafts[key]?.overrides]);
  if(boardSignature!==lastBoardSignature&&rankings){lastBoardSignature=boardSignature;$('spreadsheet-players').replaceChildren(...TieredRankings(rankings.players.map(p=>({...p,key:playerKey(p)})),new Map((s?.picks||[]).map(p=>[playerKey(p),p])),s?.teamId,{confirmed,recommended:recommendedKeys,overrides:manualDrafts[key]?.overrides,tierStates,onSelect:manualDrafts[key]?.active?markPlayer:null}));}
  renderManual();
}
function renderAdvice(session) {
  if (!rankings) return;
  const advice = recommend({rankings, config, session});
  $('advice-context').textContent = session ? `${session.manualMode?'Manual board':`Through #${advice.throughPick}`}${advice.turn.nextPick ? ` · Next #${advice.turn.nextPick}` : ' · Your turn unknown'}${advice.turn.followingPick ? ` · Then #${advice.turn.followingPick}` : ''}` : '';
  $('advice-status').textContent = !session ? 'Connect a draft to see your next pick.' : advice.blocked || '';
  $('advice-status').hidden = !$('advice-status').textContent;
  const candidates=session?advice.candidates:[];
  recommendedKeys=candidates.map(playerKey);
  sendHighlights(session,candidates,session&&!advice.blocked?currentTierPlayers(rankings.players,session):[]);

}

async function sendHighlights(session,candidates,tierPlayers){
  if(!globalThis.chrome?.tabs?.sendMessage)return;
  const tab=session?.tabId;
  if(highlightedTab!==undefined&&highlightedTab!==tab)chrome.tabs.sendMessage(highlightedTab,{type:'DRAFT_RECOMMENDATIONS',clear:true}).catch(()=>{});
  highlightedTab=tab;
  if(tab===undefined)return;
  try {const response=await chrome.tabs.sendMessage(tab,{type:'DRAFT_RECOMMENDATIONS',leagueId:session.leagueId,seasonId:session.seasonId,teamId:session.teamId,onClock:session.onClock,manualMode:!!session.manualMode,tierPlayers:tierPlayers.map(p=>({espnId:p.espnId,name:p.name,position:p.position,nflTeam:p.nflTeam,tier:p.tier})),candidates:candidates.map(p=>({espnId:p.espnId,name:p.name,position:p.position,nflTeam:p.nflTeam})),expiresAt:Date.now()+12000});
    if(highlightedTab!==tab)return;
    $('espn-highlight-status').textContent=!candidates.length?'':!response?.ok?'Reload the ESPN draft tab to enable page highlights.':!response.active?'ESPN highlights are waiting for the draft feed to catch up.':response.recommended+response.currentTier===0?'No matching players visible on ESPN. Open Players or clear its filters.':response.painted===0?'ESPN players matched, but highlight styles could not be applied.':'';
  }catch {if(highlightedTab===tab)$('espn-highlight-status').textContent=candidates.length?'Reload the ESPN draft tab to reconnect page highlights.':'';}

}

function renderManual(updateFields=false) {
  if(!rankings)return;
  const record=manualDrafts[currentKey()],s=effectiveSession();
  $('capture-picks').checked=!record?.active;
  $('manual-settings').hidden=!record?.active;
  if(updateFields){$('manual-clock').value=record?.onClock??s?.onClock??'';$('manual-slot').value=record?.slot??'';}
  const taken=new Map((s?.picks||[]).map(p=>[playerKey(p),p]));
  const query=$('manual-search').value.toLowerCase().trim();
  const matches=query&&record?.active?catalogPlayers.filter(p=>!p.rank&&`${p.name} ${p.spreadsheetName||''} ${p.position} ${p.nflTeam} ${p.espnId}`.toLowerCase().includes(query)):[];
  const players=matches.slice(0,40);
  $('manual-result-count').textContent=query&&record?.active?(matches.length?`Showing ${players.length} of ${matches.length}`:'No players outside your spreadsheet match.'):'';
  $('espn-sync-status').textContent=syncMessage||`${catalog.players.length.toLocaleString()} ESPN entries · ${rankings.players.filter(p=>!p.identityUnverified).length}/${rankings.players.length} ranks matched · ${new Date(catalog.fetchedAt).toLocaleDateString()}`;
  $('manual-players').replaceChildren(...players.map(p=>{
    const pick=taken.get(playerKey(p)),owner=pick?(pick.teamId===s.teamId?'me':'other'):null;
    return SelectionRow(p,{owner,corrected:!!record?.overrides[playerKey(p)],onSelect:value=>changeManual(r=>setManualPick(r,p,value),`${p.name}: ${value==='undo'?'correction undone':value==='me'?'taken by you':'taken by someone else'}.`)});
  }));
}
function changeManual(update,message='Saved.') {
  const key=currentKey(),source=liveSession();selected=key;
  manualWrites=manualWrites.catch(()=>{}).then(async()=>{
    try {
      const saved=extension?await chrome.storage.local.get('manualDrafts'):{};
      const all=saved.manualDrafts||manualDrafts;
      const updated={...all,[key]:update(all[key]||createManualDraft(source,config))};
      if(extension)await chrome.storage.local.set({manualDrafts:updated});manualDrafts=updated;if(!updated[key].active)selected='auto';
      $('manual-feedback').hidden=false;$('manual-feedback').textContent=message;
      renderDraft();renderManual(true);
    }catch(error){$('manual-feedback').hidden=false;$('manual-feedback').textContent=error.message;}
  });
  return manualWrites;
}
function markPlayer(player,value){if(!manualDrafts[currentKey()]?.active)return;return changeManual(r=>setManualPick(r,player,value),`${player.name}: ${value==='undo'?'correction undone':value==='me'?'taken by you':'taken by someone else'}.`);}
$('draft-settings').addEventListener('toggle',()=>{if($('draft-settings').open)renderManual(true);});
$('capture-picks').addEventListener('change',async()=>{
  const active=!$('capture-picks').checked;$('capture-picks').disabled=true;
  try{await changeManual(r=>({...r,active}),active?'Manual picks enabled. Mark players on the board.':'Using ESPN picks. Manual buttons hidden.');}
  finally{$('capture-picks').disabled=false;renderManual();}
});
function useCatalog(next){catalog=next;rankings=reconcileRankings(sourceRankings,catalog);catalogPlayers=correctionPlayers(rankings,catalog);}
$('sync-espn-players').addEventListener('click',async()=>{
  $('sync-espn-players').disabled=true;syncMessage='Syncing ESPN players…';renderManual();
  try{const next=await fetchEspnCatalog(config.seasonId);if(extension)await chrome.storage.local.set({espnCatalog:next});useCatalog(next);syncMessage='';renderDraft();}
  catch(error){syncMessage=error.message;}
  finally{$('sync-espn-players').disabled=false;renderManual();}
});
$('manual-search').addEventListener('input',()=>renderManual());
$('save-manual-progress').addEventListener('click',()=>{
  const clock=$('manual-clock').value.trim(),slot=$('manual-slot').value;
  changeManual(r=>setManualProgress(r,clock?Number(clock):null,slot?Number(slot):null),'Draft progress saved.');
});
$('search-rules').addEventListener('input',()=>{const query=$('search-rules').value.toLowerCase();let matches=0;for(const d of $('rules').children){const match=d.textContent.toLowerCase().includes(query);d.hidden=!match;if(query)d.open=match;if(match)matches++;}$('no-rules').hidden=matches>0;});
try {
  const response=await fetch('./config/espn-league-2026.json');if(!response.ok)throw Error('League rules could not be loaded.');config=await response.json();renderRules();
  const ranksResponse=await fetch('./config/rankings-2026.json');if(!ranksResponse.ok)throw Error('Rankings could not be loaded.');sourceRankings=await ranksResponse.json();
  const catalogResponse=await fetch('./config/espn-players-2026.json');if(!catalogResponse.ok)throw Error('ESPN player list could not be loaded.');useCatalog(await catalogResponse.json());
  if(extension){
    const saved=await chrome.storage.local.get(['draftSessions','manualDrafts','espnCatalog']);sessions=saved.draftSessions || {};manualDrafts=saved.manualDrafts || {};const activeKey=liveSession()?sessionKey(liveSession()):'league:2026:182527585';if(manualDrafts[activeKey]?.active)selected=activeKey;if(saved.espnCatalog?.seasonId===config.seasonId&&saved.espnCatalog.fetchedAt>catalog.fetchedAt)useCatalog(saved.espnCatalog);
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local')return;
      if(changes.espnCatalog?.newValue?.seasonId===config.seasonId)useCatalog(changes.espnCatalog.newValue);
      if(changes.draftSessions)sessions=changes.draftSessions.newValue || {};
      if(changes.manualDrafts)manualDrafts=changes.manualDrafts.newValue || {};
      renderDraft();
    });
  }
  renderDraft();setInterval(renderDraft,5000);
} catch(error){$('error').hidden=false;$('error').textContent=error.message;}
