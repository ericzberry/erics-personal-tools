import {DataLibrary,DataRows} from './components/capabilities.js';
export function referenceRows(kind,value){
  if(kind==='ai')return value.map(c=>({title:c.name,lines:[`Provider: ${c.provider}`,'Models selected per task',`API key: ${c.hasApiKey?'Saved on server':'Not set'}`,...(c.baseUrl?[`API URL: ${c.baseUrl}`]:[])]}));
  return value.players.map(p=>({title:`${p.rank}. ${p.name}`,lines:[`${p.position} · ${p.nflTeam} · Tier ${p.tier}`,`Average draft position: ${p.adp??'Unknown'}`]}));
}
export function mountLibrary(root,{kind,load,level=1}){
  const title={rankings:'Player rankings',ai:'AI connections'}[kind];
  root.replaceChildren(DataLibrary({title,id:kind,level}));
  const search=root.querySelector('input'),list=root.querySelector('.data-records'),status=root.querySelector('[role=status]');
  let rows=[],message='',loading=false,error='',generation=0;
  function render(){const term=search.value.trim().toLowerCase();const filtered=rows.filter(r=>`${r.title} ${r.lines.join(' ')}`.toLowerCase().includes(term));list.replaceChildren(...DataRows(filtered));status.textContent=error||(loading?'Loading saved data…':!filtered.length?(rows.length?'No matching records. Clear the search to see all records.':'No saved records.'):(message||''));}
  search.addEventListener('input',render);
  return {async refresh(){const current=++generation;loading=true;error='';render();try{const result=await load();if(current!==generation)return;rows=referenceRows(kind,result.value);message=result.message||'';}catch(failure){if(current!==generation)return;error=failure.message;}finally{if(current===generation){loading=false;render();}}},clear(){generation++;rows=[];loading=false;message='';error='Open Settings to connect this device and download saved details.';render();}};
}
