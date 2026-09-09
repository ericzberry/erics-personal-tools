import {DataLibrary,DataRows} from './components/capabilities.js';
const human=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const nullLabels={seasonAcquisitionLimit:'No limit',limit:'No limit',matchupTiebreaker:'None',homeFieldAdvantage:'None'};
const label=(key,value)=>value===null?(nullLabels[key]||'Not set'):typeof value==='boolean'?(value?'Yes':'No'):typeof value==='string'&&key==='deadline'?new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':human(value);
export function referenceRows(kind,value){
  if(kind==='rankings')return value.players.map(p=>({title:`${p.rank}. ${p.name}`,lines:[`${p.position} · ${p.nflTeam} · Tier ${p.tier}`,`Average draft position: ${p.adp??'Unknown'}`]}));
  if(kind==='ai')return value.map(c=>({title:c.name,lines:[`Provider: ${c.provider}`,`Default model: ${c.model||'Not set'}`,`API key: ${c.hasApiKey?'Saved on server':'Not set'}`,...(c.baseUrl?[`API URL: ${c.baseUrl}`]:[])]}));
  const rows=[{title:'Roster positions',lines:value.roster.positions.map(p=>`${p.label}: ${p.slots} slots · Maximum ${p.maximum}`)}];
  for(const [category,entries] of Object.entries(value.scoring))rows.push({title:human(category),lines:entries.map(e=>`${e.label}: ${e.points} points`)});
  for(const key of ['league','draft','roster','players','transactions','trades','keepers','regularSeason','playoffs'])rows.push({title:human(key),lines:Object.entries(value[key]).filter(([,v])=>!Array.isArray(v)).map(([k,v])=>`${human(k)}: ${label(k,v)}`)});
  return rows;
}
export function mountLibrary(root,{kind,load}){
  const title={rules:'League rules',rankings:'Player rankings',ai:'AI connections'}[kind];
  root.replaceChildren(DataLibrary({title,id:kind,description:kind==='ai'?'Saved connection details are available offline. Provider requests require internet; API keys stay on the server.':'Saved 2026 reference data · Available offline. Live ESPN capture requires the extension.'}));
  const search=root.querySelector('input'),list=root.querySelector('.data-records'),status=root.querySelector('[role=status]');
  let rows=[];
  function render(){const term=search.value.trim().toLowerCase();const filtered=rows.filter(r=>`${r.title} ${r.lines.join(' ')}`.toLowerCase().includes(term));list.replaceChildren(...DataRows(filtered));if(!filtered.length)status.textContent=rows.length?'No matching records.':'No saved records.';}
  search.addEventListener('input',render);
  return {async refresh(){try{status.textContent='Loading saved data…';const result=await load();rows=referenceRows(kind,result.value);render();status.textContent=result.message||'Saved on this device.';}catch(error){status.textContent=error.message;}},clear(){rows=[];render();status.textContent='Connect this device to download saved connection details.';}};
}
