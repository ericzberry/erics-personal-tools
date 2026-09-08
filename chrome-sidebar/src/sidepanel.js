import {selectSession} from './session-selection.js';
import {sessionKey} from './draft-state.js';
import {recommend, validateProjections} from './recommendations.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.storage?.local;
let config, rankings, projections = null, sessions = {}, selected = 'auto';
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const human = text => text.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const nullLabels = {seasonAcquisitionLimit:'No limit',limit:'No limit',matchupTiebreaker:'None',homeFieldAdvantage:'None'};
const valueLabel = (key,v) => v === null ? (nullLabels[key] || 'Not set') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'string' && key === 'deadline' ? new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET' : typeof v === 'string' ? human(v) : String(v);
function table(headers,rows) {
  const t = node('table'), head = node('thead'), tr = node('tr');
  headers.forEach(s=>tr.append(node('th',s))); head.append(tr); t.append(head);
  const body = node('tbody'); rows.forEach(row=>{const r=node('tr');row.forEach(v=>r.append(node('td',String(v))));body.append(r);});t.append(body);return t;
}
function group(title, headers, rows) {
  const details = node('details'); details.append(node('summary',title),table(headers,rows)); $('rules').append(details);
}
function renderRules() {
  group('Roster positions',['Position','Slots','Maximum'],config.roster.positions.map(p=>[p.label,p.slots,p.maximum]));
  for (const [category,entries] of Object.entries(config.scoring)) group(category,['Scoring event','Points'],entries.map(e=>[e.label,e.points]));
  for (const [key,title] of Object.entries({league:'League settings',draft:'Draft rules',roster:'Roster size',players:'Player rules',transactions:'Waivers & lineups',trades:'Trades',keepers:'Keepers',regularSeason:'Regular season',playoffs:'Playoffs'}))
    group(title,['Rule','Setting'],Object.entries(config[key]).filter(([,v])=>!Array.isArray(v)).map(([k,v])=>[human(k),valueLabel(k,v)]));
}
function refreshSessionMenu() {
  const menu=$('session');menu.replaceChildren();const auto=node('option','Auto · follow live draft');auto.value='auto';menu.append(auto);const base=node('option','2026 league draft');base.value='league:2026:182527585';menu.append(base);
  for(const s of Object.values(sessions).filter(s=>s.mode==='practice').sort((a,b)=>b.lastSeenAt-a.lastSeenAt)) { const o=node('option',`Practice · ${new Date(s.lastSeenAt).toLocaleDateString()} · ${s.leagueId}`);o.value=sessionKey(s);menu.append(o); }
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
  const oldTeam=$('team').value;$('team').replaceChildren();const all=node('option','All teams');all.value='all';$('team').append(all);
  for (const team of s?.teams || []) {const option=node('option',team.name);option.value=String(team.id);$('team').append(option);}
  $('team').value=[...$('team').options].some(o=>o.value===oldTeam)?oldTeam:'all';
  const search=$('search-picks').value.toLowerCase();
  const picks=(s?.picks || []).filter(p=>($('team').value==='all'||String(p.teamId)===$('team').value)&&`${p.player} ${p.team} ${p.position}`.toLowerCase().includes(search)).toReversed();
  $('picks').replaceChildren();
  for(const p of picks){const row=node('li',undefined,`pick${p.teamId===s.teamId?' mine':''}`);const detail=node('div');detail.append(node('div',p.player,'pick-name'),node('div',`R${p.round} · P${p.pickInRound} · ${p.nflTeam}`,'pick-meta'),node('div',p.team,'pick-meta'));row.append(node('span',p.overall,'pick-number'),detail,node('span',p.position,'position'));$('picks').append(row);}
  $('empty').hidden=picks.length>0;
  if(s?.picks.length && !picks.length)$('empty').textContent='No picks match your filters.';
  else $('empty').textContent='Picks will appear as ESPN announces them.';
  $('export').disabled=!s?.picks.length;
  renderAdvice(s);
}
function renderAdvice(session) {
  if (!rankings) return;
  const advice = recommend({rankings, config, session, projections});
  $('advice-mode').textContent = advice.mode === 'points' ? 'PROJECTED POINTS' : 'RANK ESTIMATES';
  $('advice-context').textContent = session ? `Through pick ${advice.throughPick}${advice.turn.nextPick ? ` · Your turn #${advice.turn.nextPick}` : ''}` : '';
  $('advice-status').textContent = !session ? 'Connect a draft to see your next pick.' : advice.blocked || (advice.mode !== 'points' ? 'Rank + roster + ADP · no point projections' : '');
  $('advice-status').hidden = !$('advice-status').textContent;
  $('recommendations').replaceChildren();
  (session ? advice.candidates : []).forEach((p,i) => {
    const card = node('article', undefined, 'recommendation');
    card.append(node('p', i === 0 ? 'PICK NEXT' : 'ALTERNATIVE', 'eyebrow'),node('h3', `${p.name} · ${p.position}`));
    card.append(node('p', `Rank #${p.rank} · ADP ${p.adp ?? '—'}`, 'pick-meta'));
    if (i === 0) {
      const why = p.reasons.find(r => !r.startsWith('Your overall rank'));
      if (why) card.append(node('p', why, 'pick-meta'));
      const details = node('details'); details.append(node('summary','Why this pick'));
      const reasons = node('ul'); p.reasons.forEach(reason => reasons.append(node('li', reason)));
      details.append(reasons); card.append(details);
    }
    $('recommendations').append(card);
  });
  $('clear-projections').hidden = !projections;
  $('projection-status').textContent = projections ? `Source: ${projections.source}. ${advice.projectionMissing ?? 0} ranked offensive players missing projections.` : 'No projections loaded.';
}
$('projections-file').addEventListener('change', async event => {
  try {
    const file=event.target.files[0];if(!file)return;if(file.size>1000000)throw Error('Projection file must be smaller than 1 MB.');
    const data=JSON.parse(await file.text());validateProjections(data,config,rankings.players);
    if(extension)await chrome.storage.local.set({leagueProjections:data});projections=data;$('error').hidden=true;renderDraft();
  } catch(error) {$('error').hidden=false;$('error').textContent=error.message;} finally {event.target.value='';}
});
$('clear-projections').addEventListener('click',async()=>{try{if(extension)await chrome.storage.local.remove('leagueProjections');projections=null;renderDraft();}catch(error){$('error').hidden=false;$('error').textContent=error.message;}});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b===button));$('draft-view').hidden=button.dataset.view!=='draft';$('rules-view').hidden=button.dataset.view!=='rules';});
$('session').addEventListener('change',()=>{selected=$('session').value;$('team').value='all';renderDraft();});
$('team').addEventListener('change',renderDraft);$('search-picks').addEventListener('input',renderDraft);
$('search-rules').addEventListener('input',()=>{const query=$('search-rules').value.toLowerCase();let matches=0;for(const d of $('rules').children){const match=d.textContent.toLowerCase().includes(query);d.hidden=!match;if(query)d.open=match;if(match)matches++;}$('no-rules').hidden=matches>0;});
$('export').addEventListener('click',()=>{const s=selectSession(sessions,selected);if(!s)return;const {tabId,connected,...data}=s;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=`espn-${s.mode}-${s.seasonId}-${s.leagueId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
try {
  const response=await fetch('./config/espn-league-2026.json');if(!response.ok)throw Error('League rules could not be loaded.');config=await response.json();renderRules();
  const ranksResponse=await fetch('./config/rankings-2026.json');if(!ranksResponse.ok)throw Error('Rankings could not be loaded.');rankings=await ranksResponse.json();
  if(extension){const saved=await chrome.storage.local.get(['draftSessions','leagueProjections']);sessions=saved.draftSessions || {};if(saved.leagueProjections){validateProjections(saved.leagueProjections,config,rankings.players);projections=saved.leagueProjections;}chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.draftSessions)sessions=changes.draftSessions.newValue || {};if(changes.leagueProjections)projections=changes.leagueProjections.newValue || null;refreshSessionMenu();renderDraft();});}
  refreshSessionMenu();renderDraft();setInterval(renderDraft,5000);
} catch(error){$('error').hidden=false;$('error').textContent=error.message;}
