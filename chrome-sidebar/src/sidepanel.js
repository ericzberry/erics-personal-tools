import {Option, Disclosure, DataTable, PickRow, RecommendationCard, downloadFile} from './components/ui.js';
import {selectSession} from './session-selection.js';
import {sessionKey} from './draft-state.js';
import {recommend} from './recommendations.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.storage?.local;
let config, rankings, sessions = {}, selected = 'auto';
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
  const s=selectSession(sessions,selected);const live=s?.connected && Date.now()-s.lastSeenAt<15000;
  $('dot').classList.toggle('live',!!live);
  $('connection').textContent=!extension?'Preview · connection unavailable':!s?'Waiting for ESPN':live?(s.mode==='practice'?'Practice draft connected':'League draft connected'):'Saved draft · disconnected';
  $('status-detail').textContent=!extension?'Load the unpacked extension in Chrome to capture draft picks.':!s?'Reload your ESPN draft tab to connect.':`${s.state==='complete'?'Draft complete':s.state==='drafting'?`On the clock: pick ${s.onClock}`:s.state==='waiting'?'Waiting for the first pick':'Draft status unavailable'}. Last checked ${new Date(s.lastSeenAt).toLocaleTimeString()}.`;
  $('pick-count').textContent=s?.picks.length || 0;
  $('round').textContent=s?.onClock ? Math.ceil(s.onClock/s.teams.length) : s?.picks.at(-1)?.round || '—';
  $('my-count').textContent=s?.picks.filter(p=>p.teamId===s.teamId).length || 0;
  const warning=s?.missing.length?`${s.missing.length} earlier pick(s) missing. Open ESPN’s Pick History or reload the draft room to recover available history.`:s?.rejected?'Some ESPN pick entries could not be read. Check ESPN’s pick history.':'';
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
}
function renderAdvice(session) {
  if (!rankings) return;
  const advice = recommend({rankings, config, session});
  $('advice-mode').textContent = 'YOUR BOARD';
  $('advice-context').textContent = session ? `Through #${advice.throughPick}${advice.turn.nextPick ? ` · Next #${advice.turn.nextPick}` : ' · Your turn unknown'}${advice.turn.followingPick ? ` · Then #${advice.turn.followingPick}` : ''}` : '';
  $('advice-status').textContent = !session ? 'Connect a draft to see your next pick.' : advice.blocked || '';
  $('advice-status').hidden = !$('advice-status').textContent;
  const top = session && !advice.blocked ? advice.candidates[0] : null;
  $('next-pick-name').textContent = top ? `${top.name} · ${top.position}` : session?.state === 'complete' ? 'Draft complete' : 'Waiting for live draft';
  $('next-pick-chip').classList.toggle('has-pick', !!top);
  $('recommendations').replaceChildren();
  $('recommendations').append(...(session ? advice.candidates : []).map((p,i)=>RecommendationCard(p,{primary:i===0})));
}
$('session').addEventListener('change',()=>{selected=$('session').value;$('team').value='all';renderDraft();});
$('team').addEventListener('change',renderDraft);$('search-picks').addEventListener('input',renderDraft);
$('search-rules').addEventListener('input',()=>{const query=$('search-rules').value.toLowerCase();let matches=0;for(const d of $('rules').children){const match=d.textContent.toLowerCase().includes(query);d.hidden=!match;if(query)d.open=match;if(match)matches++;}$('no-rules').hidden=matches>0;});
$('export').addEventListener('click',()=>{const s=selectSession(sessions,selected);if(!s)return;const {tabId,connected,...data}=s;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));downloadFile({url,filename:`espn-${s.mode}-${s.seasonId}-${s.leagueId}.json`});setTimeout(()=>URL.revokeObjectURL(url),1000);});
try {
  const response=await fetch('./config/espn-league-2026.json');if(!response.ok)throw Error('League rules could not be loaded.');config=await response.json();renderRules();
  const ranksResponse=await fetch('./config/rankings-2026.json');if(!ranksResponse.ok)throw Error('Rankings could not be loaded.');rankings=await ranksResponse.json();
  if(extension){
    const saved=await chrome.storage.local.get(['draftSessions']);sessions=saved.draftSessions || {};
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local')return;
      if(changes.draftSessions)sessions=changes.draftSessions.newValue || {};
      refreshSessionMenu();renderDraft();
    });
  }
  refreshSessionMenu();renderDraft();setInterval(renderDraft,5000);
} catch(error){$('error').hidden=false;$('error').textContent=error.message;}
