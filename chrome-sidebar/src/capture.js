import {CaptureField} from './components/capture.js';
import {Button} from './components/ui.js';
import {localDate} from './reminder-data.js';
// Types a note, gets a record. The reading happens in the cloud, but the write
// goes through the same offline store the tool itself uses, so a captured
// record queues and syncs exactly like a typed one.
//
// Nothing is confirmed before saving: the line it reads back afterwards is
// built from the record that was actually stored, and Undo is right there.
// A confirmation step would make the owner check a reading that is usually
// right, and would still need the same undo when it is not.
export function mountCapture(root,{credentials,remote,stores,onSaved=()=>{},today=localDate,placeholder,timeoutMs=60000}={}){
  root.replaceChildren(CaptureField(placeholder?{placeholder}:{}));
  const $=name=>root.querySelector(`#capture-${name}`);
  const undo=Button('Undo',{variant:'subtle',size:'compact',hidden:true});
  $('actions').append(undo);
  let busy=false,connection='',last=null;
  const status=text=>{$('status').textContent=text||'';};
  function render(){
    $('note').disabled=busy;$('add').disabled=busy;undo.disabled=busy;undo.hidden=!last;
  }
  async function run(operation){
    if(busy)return;
    busy=true;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Connect this device in Settings first.');
      await operation(token);
    }catch(error){
      status(error?.message||'That did not save.');
    }finally{busy=false;render();}
  }
  // The connection is remembered for the session only: quick add uses whichever
  // saved connection can answer, and never asks which one before reading a note.
  async function connectionId(token){
    if(connection)return connection;
    const result=await remote(token,'/v1/ai-connections');
    const usable=(result.connections||[]).filter(entry=>entry.hasApiKey);
    if(!usable.length)throw Error('Save an AI connection in Settings to use quick add.');
    return connection=usable[0].id;
  }
  $('form').addEventListener('submit',event=>{
    event.preventDefault();
    const note=$('note').value.trim();
    if(!note)return;
    last=null;status('Reading…');
    run(async token=>{
      const id=await connectionId(token);
      const reading=await remote(token,`/v1/ai-connections/${id}/capture`,{method:'POST',value:{note,today:today()},timeoutMs});
      const store=stores[reading.capability];
      if(!store)throw Error('That belongs to a tool this device has not loaded yet.');
      const recordId=crypto.randomUUID();
      const result=await store.request(token,`${reading.path}/${recordId}`,{method:'PUT',value:{...reading.record,id:recordId,revision:null}});
      last={capability:reading.capability,path:reading.path,id:recordId,revision:result.record?.revision??null};
      $('note').value='';
      status(`Saved · ${reading.summary}`);
      onSaved(reading.capability);
    });
  });
  undo.addEventListener('click',()=>{
    const target=last;
    if(!target)return;
    status('Removing…');
    run(async token=>{
      await stores[target.capability].request(token,`${target.path}/${target.id}`,{method:'DELETE',value:{revision:target.revision}});
      last=null;status('Removed.');
      onSaved(target.capability);
    });
  });
  render();
  return {clear(){last=null;connection='';$('note').value='';status('');render();}};
}
