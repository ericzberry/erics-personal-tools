import {fetchEspnCatalog, reconcileRankings, reconcileSession, correctionPlayers} from './espn-catalog.js';
import {createManualDraft, applyManualDraft, setManualPick, setManualProgress} from './manual-draft.js';
import {playerKey} from './player-identity.js';
import {Option, Disclosure, DataTable, PickRow, RecommendationCard, SelectionRow, downloadFile} from './components/ui.js';
import {selectSession} from './session-selection.js';
import {sessionKey} from './draft-state.js';
import {recommend} from './recommendations.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.storage?.local;
let config, rankings, sourceRankings, catalog, catalogPlayers=[], syncMessage='', sessions = {}, selected = 'auto', manualDrafts = {};
let manualWrites=Promise.resolve();
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
function refreshSessionMenu() {
  const menu=$('session');menu.replaceChildren();const auto=Option('Auto · follow live draft');auto.value='auto';menu.append(auto);const base=Option('2026 league draft');base.value='league:2026:182527585';menu.append(base);
  for(const s of Object.values(sessions).filter(s=>s.mode==='practice').sort((a,b)=>b.lastSeenAt-a.lastSeenAt)) { const o=Option(`Practice · ${new Date(s.lastSeenAt).toLocaleDateString()} · ${s.leagueId}`);o.value=sessionKey(s);menu.append(o); }
  if (![...menu.options].some(o=>o.value===selected)) selected='auto';
  menu.value=selected;
}
function renderDraft() {
  const s=effectiveSession();const live=s?.connected && Date.now()-s.lastSeenAt<15000;
  $('dot').classList.toggle('live',!!live);
  $('connection').textContent=s?.manualMode?'Manual board':!extension?'Preview · connection unavailable':!s?'Waiting for ESPN':live?(s.mode==='practice'?'Practice draft connected':'League draft connected'):'Saved draft · disconnected';
  $('status-detail').textContent=s?.manualMode?'Using your corrections. Update picks here as the draft continues.':!extension?'Load the unpacked extension in Chrome to capture draft picks.':!s?'Reload your ESPN draft tab to connect.':`${s.state==='complete'?'Draft complete':s.state==='drafting'?`On the clock: pick ${s.onClock}`:s.state==='waiting'?'Waiting for the first pick':'Draft status unavailable'}. Last checked ${new Date(s.lastSeenAt).toLocaleTimeString()}.`;
  $('pick-count').textContent=s?.picks.length || 0;
  $('round').textContent=s?.onClock ? Math.ceil(s.onClock/s.teams.length) : s?.picks.at(-1)?.round || '—';
  $('my-count').textContent=s?.picks.filter(p=>p.teamId===s.teamId).length || 0;
  const warning=s?.missing?.length?`${s.missing.length} earlier pick(s) missing. Open ESPN’s Pick History or reload the draft room to recover available history.`:s?.rejected?'Some ESPN pick entries could not be read. Check ESPN’s pick history.':'';
  $('coverage').hidden=!warning;$('coverage').textContent=warning;
  const oldTeam=$('team').value;$('team').replaceChildren();const all=Option('All teams');all.value='all';$('team').append(all);
  for (const team of s?.teams || []) {const option=Option(team.name);option.value=String(team.id);$('team').append(option);}
  $('team').value=[...$('team').options].some(o=>o.value===oldTeam)?oldTeam:'all';
  const search=$('search-picks').value.toLowerCase();
  const picks=(s?.picks || []).filter(p=>($('team').value==='all'||String(p.teamId)===$('team').value)&&`${p.player} ${p.team} ${p.position}`.toLowerCase().includes(search)).toReversed();
  $('picks').replaceChildren();
  $('picks').append(...picks.map(p=>PickRow(p,s.teamId)));
  $('empty').hidden=picks.length>0;
  if(s?.picks.length && !picks.length)$('empty').textContent='No picks match your filters.';
  else $('empty').textContent='Picks will appear as ESPN announces them.';
  $('export').disabled=!s?.picks.length;
  renderAdvice(s);
  if(!$('corrections-view').hidden)renderManual();
}
function renderAdvice(session) {
  if (!rankings) return;
  const advice = recommend({rankings, config, session});
  $('advice-mode').textContent = 'YOUR BOARD';
  $('advice-context').textContent = session ? `${session.manualMode?'Manual board':`Through #${advice.throughPick}`}${advice.turn.nextPick ? ` · Next #${advice.turn.nextPick}` : ' · Your turn unknown'}${advice.turn.followingPick ? ` · Then #${advice.turn.followingPick}` : ''}` : '';
  $('advice-status').textContent = !session ? 'Connect a draft to see your next pick.' : advice.blocked || '';
  $('advice-status').hidden = !$('advice-status').textContent;
  const top = session && !advice.blocked ? advice.candidates[0] : null;
  $('next-pick-name').textContent = top ? `${top.name} · ${top.position}` : session?.state === 'complete' ? 'Draft complete' : 'Waiting for live draft';
  $('next-pick-chip').classList.toggle('has-pick', !!top);
  $('recommendations').replaceChildren();
  $('recommendations').append(...(session ? advice.candidates : []).map((p,i)=>RecommendationCard(p,{primary:i===0})));
}

function renderManual(updateFields=false) {
  if(!rankings)return;
  const record=manualDrafts[currentKey()],s=effectiveSession();
  $('manual-session-label').textContent=`${currentKey().startsWith('practice:')?'Practice draft':'2026 league draft'} · ${s?.picks.length||0} taken`;
  $('manual-mode-note').textContent=record?.active?'Manual board active. Your corrections drive recommendations; live updates are kept separate.':'Using live feed. Mark a player to start a manual board from the captured picks.';
  $('enable-manual').disabled=!!record?.active;$('disable-manual').disabled=!record?.active;
  if(updateFields){$('manual-clock').value=record?.onClock??s?.onClock??'';$('manual-slot').value=record?.slot??'';}
  const taken=new Map((s?.picks||[]).map(p=>[playerKey(p),p]));
  const query=$('manual-search').value.toLowerCase().trim();
  const matches=catalogPlayers.filter(p=>`${p.name} ${p.spreadsheetName||''} ${p.position} ${p.nflTeam} ${p.espnId}`.toLowerCase().includes(query));
  const players=matches.slice(0,40);
  $('manual-result-count').textContent=`Showing ${players.length} of ${matches.length} · Search to narrow the list`;
  $('espn-sync-status').textContent=syncMessage||`${catalog.players.length.toLocaleString()} ESPN entries · ${rankings.players.filter(p=>!p.identityUnverified).length}/${rankings.players.length} ranks matched · ${new Date(catalog.fetchedAt).toLocaleDateString()}`;
  $('manual-players').replaceChildren(...players.map(p=>{
    const pick=taken.get(playerKey(p)),owner=pick?(pick.teamId===s.teamId?'me':'other'):null;
    return SelectionRow(p,{owner,corrected:!!record?.overrides[playerKey(p)],onSelect:value=>changeManual(r=>setManualPick(r,p,value),`${p.name}: ${value==='undo'?'correction undone':value==='me'?'taken by you':'taken by someone else'}.`)});
  }));
}
function changeManual(update,message='Saved.') {
  const key=currentKey(),source=liveSession();
  manualWrites=manualWrites.catch(()=>{}).then(async()=>{
    try {
      const saved=extension?await chrome.storage.local.get('manualDrafts'):{};
      const all=saved.manualDrafts||manualDrafts;
      const updated={...all,[key]:update(all[key]||createManualDraft(source,config))};
      if(extension)await chrome.storage.local.set({manualDrafts:updated});manualDrafts=updated;
      $('manual-feedback').hidden=false;$('manual-feedback').textContent=message;
      renderDraft();renderManual(true);
    }catch(error){$('manual-feedback').hidden=false;$('manual-feedback').textContent=error.message;}
  });
  return manualWrites;
}
$('open-corrections').addEventListener('click',()=>{
  if(!config||!rankings)return;
  selected=currentKey();refreshSessionMenu();
  $('draft-view').hidden=true;$('rules-view').hidden=true;$('corrections-view').hidden=false;renderManual(true);$('manual-search').focus();
});
$('close-corrections').addEventListener('click',()=>{$('corrections-view').hidden=true;$('draft-view').hidden=false;$('rules-view').hidden=false;renderDraft();$('open-corrections').focus();});
function useCatalog(next){catalog=next;rankings=reconcileRankings(sourceRankings,catalog);catalogPlayers=correctionPlayers(rankings,catalog);}
$('sync-espn-players').addEventListener('click',async()=>{
  $('sync-espn-players').disabled=true;syncMessage='Syncing ESPN players…';renderManual();
  try{const next=await fetchEspnCatalog(config.seasonId);if(extension)await chrome.storage.local.set({espnCatalog:next});useCatalog(next);syncMessage='';renderDraft();}
  catch(error){syncMessage=error.message;}
  finally{$('sync-espn-players').disabled=false;renderManual();}
});
$('manual-search').addEventListener('input',()=>renderManual());
$('enable-manual').addEventListener('click',()=>changeManual(r=>({...r,active:true}),'Manual board active.'));
$('disable-manual').addEventListener('click',()=>changeManual(r=>({...r,active:false}),'Using live feed. Corrections remain saved.'));
$('save-manual-progress').addEventListener('click',()=>{
  const clock=$('manual-clock').value.trim(),slot=$('manual-slot').value;
  changeManual(r=>setManualProgress(r,clock?Number(clock):null,slot?Number(slot):null),'Draft progress saved.');
});
$('session').addEventListener('change',()=>{selected=$('session').value;$('team').value='all';renderDraft();});
$('team').addEventListener('change',renderDraft);$('search-picks').addEventListener('input',renderDraft);
$('search-rules').addEventListener('input',()=>{const query=$('search-rules').value.toLowerCase();let matches=0;for(const d of $('rules').children){const match=d.textContent.toLowerCase().includes(query);d.hidden=!match;if(query)d.open=match;if(match)matches++;}$('no-rules').hidden=matches>0;});
$('export').addEventListener('click',()=>{const s=effectiveSession();if(!s)return;const {tabId,connected,...data}=s;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));downloadFile({url,filename:`espn-${s.mode}-${s.seasonId}-${s.leagueId}.json`});setTimeout(()=>URL.revokeObjectURL(url),1000);});
try {
  const response=await fetch('./config/espn-league-2026.json');if(!response.ok)throw Error('League rules could not be loaded.');config=await response.json();renderRules();
  const ranksResponse=await fetch('./config/rankings-2026.json');if(!ranksResponse.ok)throw Error('Rankings could not be loaded.');sourceRankings=await ranksResponse.json();
  const catalogResponse=await fetch('./config/espn-players-2026.json');if(!catalogResponse.ok)throw Error('ESPN player list could not be loaded.');useCatalog(await catalogResponse.json());
  if(extension){
    const saved=await chrome.storage.local.get(['draftSessions','manualDrafts','espnCatalog']);sessions=saved.draftSessions || {};manualDrafts=saved.manualDrafts || {};if(saved.espnCatalog?.seasonId===config.seasonId&&saved.espnCatalog.fetchedAt>catalog.fetchedAt)useCatalog(saved.espnCatalog);
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local')return;
      if(changes.espnCatalog?.newValue?.seasonId===config.seasonId)useCatalog(changes.espnCatalog.newValue);
      if(changes.draftSessions)sessions=changes.draftSessions.newValue || {};
      if(changes.manualDrafts)manualDrafts=changes.manualDrafts.newValue || {};
      refreshSessionMenu();renderDraft();
    });
  }
  refreshSessionMenu();renderDraft();setInterval(renderDraft,5000);
} catch(error){$('error').hidden=false;$('error').textContent=error.message;}
