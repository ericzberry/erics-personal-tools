import {TripsView,TripPicker,TripComparison} from './components/trips.js';
import {Button,Note,setStatus} from './components/ui.js';
import {normalizeTrip} from './trip-data.js';

export function mountTrips(root,{credentials,offline,onSettings=()=>{},clipboard=globalThis.navigator?.clipboard,research=null}){
  root.replaceChildren(TripsView());
  const $=id=>root.querySelector(`#trips-${id}`);
  let researchAbort=null;
  let records=[],selected='',editing=null,busy=false,loaded=false,tokenUsed='',generation=0;
  const status=(s,t='')=>setStatus($('status'),s,t);
  function edit(record=null){
    editing=record;
    for(const key of ['title','kind','request'])$(key).value=record?.[key]??(key==='kind'?'hotel':'');
    $('kind').dispatchEvent(new document.defaultView.Event('change'));
    setStatus($('form-status'),'');$('editor').open=true;$('title').focus();
  }
  function render(){
    if(!records.some(r=>r.id===selected))selected=records[0]?.id||'';
    const current=records.find(r=>r.id===selected);
    $('picker').replaceChildren(...(records.length?[TripPicker(records,selected,id=>{selected=id;$('editor').open=false;render();})]:[]));
    $('result').replaceChildren(current?TripComparison(current,{busy:busy||!!researchAbort,researching:!!researchAbort,onResearch:research?channel=>startResearch(current,channel):null,onStop:()=>researchAbort?.abort(),onEdit:()=>edit(current),onDelete:()=>remove(current),onCopy:async()=>{
      try{await clipboard.writeText(`Research the saved Travel planning trip ${current.id} in Eric’s Tools. Follow docs/TRAVEL_PLANNING.md and use the Eric Chrome profile.\n\n${current.request}`);status('Research request copied.','success');}
      catch{status('Copy failed. Select the trip request instead.','error');}
    },onResolve:choice=>run(token=>offline.resolve(token,current.id,choice))}):Note(loaded?'No trips saved. Add a trip to start.':''));
    const add=Button('New trip',{variant:'secondary',size:'compact',disabled:busy||!!researchAbort||!loaded});add.addEventListener('click',()=>edit());
    const refresh=Button(loaded?'Refresh saved research':'Connection settings',{variant:'secondary',size:'compact',disabled:busy||!!researchAbort});refresh.addEventListener('click',loaded?load:onSettings);
    $('actions').replaceChildren(...(loaded?[add,refresh]:[refresh]));
    for(const key of ['title','kind','request','save'])$(key).disabled=busy||!!researchAbort||!loaded;
    $('cancel').disabled=busy;
  }
  async function run(operation){
    if(busy)return false;
    busy=true;const epoch=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(tokenUsed&&token!==tokenUsed){clear();throw Error('Connection changed. Refresh before editing.');}
      tokenUsed=token;
      const result=await operation(token);
      if(epoch!==generation)return false;
      if(result?.records){records=result.records;loaded=true;}
      status(result?.syncMessage||'',result?.syncMessage?'alert':'');return true;
    }catch(error){if(epoch===generation){if($('editor').open){status('');setStatus($('form-status'),error?.message||'Try again.','error');}else status(error?.message||'Could not load or save the trip.','error');}return false;}
    finally{if(epoch===generation){busy=false;render();}}
  }
  async function startResearch(trip,channel){
    if(busy||researchAbort)return;researchAbort=new AbortController();const signal=researchAbort.signal,epoch=generation;render();
    try{const result=await research({trip,channel,signal,onProgress:message=>status(message,'progress'),save:async value=>{
      if(epoch!==generation)throw Error('Connection changed.');
      const token=await credentials.get();if(token!==tokenUsed)throw Error('Connection changed.');
      const result=await offline.request(token,`/v1/trips/${trip.id}`,{method:'PUT',value});
      if(epoch!==generation)throw Error('Connection changed.');
      records=result.records;render();
      const saved=records.find(r=>r.id===trip.id);if(!saved||saved.pending)throw Error('Reconnect and sync before continuing browser research.');return saved;
    }});if(epoch===generation){const checkpoint=result?.channels?.find(c=>c.id===channel);if(checkpoint?.status==='blocked')status(checkpoint.note,signal.aborted?'':'error');else if(checkpoint?.status==='login')status('');else if(result?.questions?.length)status('Review the details needed below.','alert');else status('Browser pass saved. Review the remaining checks.','success');}}
    catch(error){if(epoch===generation)status(error.message||'Search could not continue.','error');}
    finally{if(epoch===generation){researchAbort=null;render();}}
  }
  async function load(){status('Loading saved research…','progress');await run(token=>offline.request(token,'/v1/trips'));}
  async function remove(record){status('Deleting trip…','progress');await run(token=>offline.request(token,`/v1/trips/${record.id}`,{method:'DELETE',value:record}));}
  function clear(){researchAbort?.abort();researchAbort=null;generation++;records=[];selected='';loaded=false;tokenUsed='';busy=false;editing=null;$('editor').open=false;for(const key of ['title','request'])$(key).value='';status('');render();}
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!loaded)return;
    try{
      const value=normalizeTrip(Object.fromEntries(['title','kind','request'].map(key=>[key,$(key).value])),editing||{});
      const id=editing?.id||crypto.randomUUID();
      status('Saving trip…','progress');
      if(await run(token=>offline.request(token,`/v1/trips/${id}`,{method:'PUT',value:{...value,id,revision:editing?.revision??null}}))){selected=id;$('editor').open=false;editing=null;render();}
    }catch(error){setStatus($('form-status'),error?.message||'Check the trip request.','error');}
  });
  $('cancel').addEventListener('click',()=>{$('editor').open=false;editing=null;});
  const reload=()=>{if(!$('editor').open&&!busy&&!researchAbort)load();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();load();});
  clear();load();
  return {refresh:reload,clear};
}
