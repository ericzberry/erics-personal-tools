import {TravelView,TravelRecord,TravelConnection} from './components/travel.js';
import {Note} from './components/ui.js';
export function mountTravel(root,{credentials,request,offline,connectionRoot,onConnectionChange=()=>{},clipboard=globalThis.navigator?.clipboard}) {
  root.replaceChildren(TravelView({connection:!connectionRoot}));
  if(connectionRoot)connectionRoot.replaceChildren(TravelConnection());
  const $=id=>root.querySelector(`#travel-${id}`)||connectionRoot?.querySelector(`#travel-${id}`);
  let token='', records=[], selected=null, newId=crypto.randomUUID(), busy=false, dirty=false, clearNotes=false, feedbackTarget='status';
  const status=(text,target=feedbackTarget)=>{$(target).textContent=text;};
  function controls(){
    for(const node of $('form').querySelectorAll('input,select,button'))node.disabled=busy||!token;
    for(const node of $('list').querySelectorAll('button'))node.disabled=busy||!token;
    $('connect').disabled=busy; $('token').disabled=busy;
    $('refresh').disabled=busy||!token;$('disconnect').disabled=busy||!token;
    $('connection').textContent=token?'Connected · Shared with your other connected devices.':'Connect with the same private access token on each device.';
  }
  function edit(record=null){
    selected=record;newId=crypto.randomUUID();dirty=false;clearNotes=false;
    for(const field of ['name','traveler','expires'])$(field).value=record?.[field]||'';
    $('category').value=record?.category||'Airline';$('number').value='';$('notes').value='';
    $('number').placeholder=record?'Saved — leave blank to keep':'';
    $('notes').placeholder=record?.hasNotes?'Saved — leave blank to keep':'';
    $('editor-title').textContent=record?`Editing ${record.name}`:'New record';
  }
  function render(){
    const term=$('search').value.trim().toLowerCase();
    const matches=records.filter(r=>`${r.name} ${r.category} ${r.traveler}`.toLowerCase().includes(term));
    $('list').replaceChildren(...(matches.length?matches.map(record=>TravelRecord(record,{
      onEdit:()=>{if(busy)return;if(dirty){status('Save or cancel your edits first.');return;}edit(record);$('name').focus();},
      onCopy:()=>copy(record,'number'),onCopyNotes:()=>copy(record,'notes'),
      onResolve:choice=>run(async()=>{if(dirty)throw Error('Save or cancel your edits first.');const result=await offline.resolve(token,record.id,choice);records=result.records;edit();render();status(result.syncMessage);}),
      onDelete:()=>run(async()=>{if(dirty)throw Error('Save or cancel your edits before deleting.');const result=await request(token,`/v1/travel/${record.id}`,{method:'DELETE',value:{revision:record.revision}});records=result.records||records.filter(r=>r.id!==record.id);if(selected?.id===record.id)edit();render();status(result.syncMessage||'Record deleted from all devices.');})
    })):[Note(!token?'Connect to load your travel wallet.':records.length?'No matching records.':'No travel records yet. Add your first one below.')]));
    controls();
  }
  async function run(action,target='status'){if(busy)return;feedbackTarget=target;busy=true;controls();status('Working…');try{await action();}catch(error){status(error.message||'Could not connect. Check your internet connection and try again.');}finally{busy=false;controls();feedbackTarget='status';}}
  async function copy(record,field){
    // Start clipboard work during the click so Safari preserves user activation.
    if(!clipboard?.write || typeof ClipboardItem==='undefined') {status('Copy is unavailable in this browser. Open the installed app or extension in a supported browser.');return;}
    await run(async()=>{
      const value=request(token,`/v1/travel/${record.id}`).then(result=>new Blob([result.record[field]],{type:'text/plain'}));
      await clipboard.write([new ClipboardItem({'text/plain':value})]);status(`${field==='number'?'Number':'Notes'} copied.`);
    });
  }
  async function refresh(){const result=await request(token,'/v1/travel');records=result.records;render();onConnectionChange();return result.syncMessage||'Travel records are up to date.';}
  $('connect').addEventListener('click',()=>run(async()=>{
    if(dirty)throw Error('Save or cancel your edits before reconnecting.');
    const next=$('token').value.trim()||await credentials.get();
    if(token&&next!==token&&await offline?.hasPending(token))throw Error('Sync or resolve pending changes before changing access tokens.');
    const result=await request(next,'/v1/travel');if(token&&next!==token)await offline?.disconnect(token);await credentials.set(next);token=next;records=result.records;
    $('token').value='';$('cloud').open=false;edit();render();status(result.syncMessage||'Connected. Travel records are up to date.');onConnectionChange();
  }));
  $('disconnect').addEventListener('click',()=>run(async()=>{
    if(dirty)throw Error('Save or cancel your edits before disconnecting.');
    await offline?.disconnect(token);await credentials.remove();token='';records=[];$('cloud').open=true;edit();$('token').value='';render();status('Disconnected from this device. Cloud records remain saved.');onConnectionChange();
  }));
  $('refresh').addEventListener('click',()=>run(async()=>{if(dirty)throw Error('Save or cancel your edits before refreshing.');const message=await refresh();edit();status(message);}));
  $('search').addEventListener('input',render);
  $('form').addEventListener('input',()=>{dirty=true;});
  $('cancel').addEventListener('click',()=>{edit();status('Edits canceled.','form-status');});
  $('clear-notes').addEventListener('click',()=>{clearNotes=true;dirty=true;$('notes').value='';status('Notes will be removed when you save.','form-status');});
  $('form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const value={revision:selected?.revision??null};
    for(const field of ['name','category','traveler','expires'])value[field]=$(field).value.trim();
    if(!value.name || value.name.length>100)throw Error('Enter a program or document name up to 100 characters.');
    const number=$('number').value.trim(), notes=$('notes').value.trim();
    if(!selected&&!number)throw Error('Enter your travel number.');
    if(number)value.number=number;if(notes||clearNotes)value.notes=notes;
    const result=await request(token,`/v1/travel/${selected?.id||newId}`,{method:'PUT',value});
    records=result.records||[result.record,...records.filter(r=>r.id!==result.record.id)];edit();render();status(result.syncMessage||'Saved. Available on your other devices when they refresh.');
  },'form-status');});
  // Refresh on foreground/reconnect, without overwriting an in-progress edit.
  const reload=()=>{if(token&&!dirty&&!busy)run(async()=>{status(await refresh());});};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  credentials.subscribe?.(async()=>{
    const current=await credentials.get();
    if(current===token)return;
    token=current;records=[];edit();$('cloud').open=!token;render();
    onConnectionChange();
    if(token&&!busy)run(async()=>status(await refresh()));else if(!token)status('This device was disconnected in another window.');
  });
  render();
  const ready=run(async()=>{token=await credentials.get();$('cloud').open=!token;status(token?await refresh():'Connect once to download your records for offline use.');});
  return {ready,isDirty:()=>dirty};
}
