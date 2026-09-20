import {PersonalView,PersonalGroup} from './components/personal.js';
import {RecordRow,Button,RowAction,EDIT_GLYPH,DELETE_GLYPH,SHOW_GLYPH,HIDE_GLYPH,COPY_GLYPH,Note,Stack,ActionGroup,MaskedValue,setStatus} from './components/ui.js';
import {normalizePersonal,validatePersonalPayload,groupPersonalRecords,expiringPersonal} from './personal-data.js';
import {mountVaultGate,vaultReason} from './vault-gate.js';
import {sealSecret} from './secret-vault.js';
const fields=['category','label','person','hint','expires'];
// A revealed value returns to its hidden form on its own, so an unattended
// screen does not keep a document number on display for the rest of the
// section's idle window.
const REVEAL_MS=60000;

export function mountPersonal(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{},vault,clipboard=globalThis.navigator?.clipboard}){
  const gate=mountVaultGate(root,{
    id:'personal-vault',title:'Personal information',
    ...(vault?{vault}:{}),
    onChange:unlocked=>{unlocked?refresh():clear();}
  });
  gate.content.replaceChildren(PersonalView());
  const $=id=>gate.content.querySelector(`#personal-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0,revealTimer=null;
  const revealed=new Map();
  const status=(text,tone='')=>setStatus($('status'),text,tone);
  // A record's own verbs, named for the record they would act on rather than
  // repeating one word down a list of them.
  const rowAction=(glyph,label,handler,danger=false)=>
    RowAction(glyph,label,handler,{danger,disabled:busy||!loaded});
  const action=(label,handler,variant='secondary',{enabled=false}={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||(!loaded&&!enabled)});
    button.addEventListener('click',handler);
    return button;
  };
  function forget(){revealed.clear();clearTimeout(revealTimer);revealTimer=null;}
  function hold(){clearTimeout(revealTimer);revealTimer=setTimeout(()=>{forget();render();},REVEAL_MS);}
  function clearForm(){
    editing=null;
    for(const key of fields)$(key).value=key==='category'?'Identification':'';
    $('value').value='';$('notes').value='';
    $('value-state').hidden=true;$('value-state').textContent='';
    $('editor-title').textContent='New record';
    setStatus($('form-status'),'');
  }
  // Editing opens the sealed envelope so the value and its notes can both be
  // changed. They are sealed as one payload; prefilling is the only way to edit
  // notes without retyping a value.
  async function edit(record){
    const payload=await gate.open(record.id,record.secret);
    editing={id:record.id,revision:record.revision};
    for(const key of fields)$(key).value=record[key]||'';
    $('value').value=payload.value;$('notes').value=payload.notes||'';
    $('value-state').hidden=false;
    $('value-state').textContent='This value is decrypted here only while the section is unlocked. Saving re-encrypts it on this device.';
    $('editor-title').textContent=`Editing ${record.label}`;
    $('editor').open=true;$('label').focus();
  }
  async function reveal(record){
    await run(async()=>{
      const payload=await gate.open(record.id,record.secret);
      revealed.set(record.id,[payload.value,payload.notes].filter(Boolean).join(' · '));
      hold();
    });
  }
  async function copy(record){
    if(!clipboard?.write||typeof ClipboardItem==='undefined'){status('Copy is unavailable in this browser. Use Show value instead.','alert');return;}
    // The clipboard write starts during the click so Safari keeps the gesture.
    await run(async()=>{
      const value=gate.open(record.id,record.secret).then(payload=>new Blob([payload.value],{type:'text/plain'}));
      await clipboard.write([new ClipboardItem({'text/plain':value})]);
      status('Value copied to the clipboard.','success');
    });
  }
  function render(){
    const query=$('search').value.trim().toLowerCase();
    const visible=records.filter(record=>[record.label,record.category,record.person,record.hint].join(' ').toLowerCase().includes(query));
    const row=record=>{
      const shown=revealed.get(record.id);
      const remove=rowAction(DELETE_GLYPH,`Delete ${record.label}`,()=>{confirmation.hidden=false;yes.focus();},true);
      const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
      const no=action('Keep record',()=>{confirmation.hidden=true;remove.focus();});
      const confirmation=Stack([Note(`Permanently delete “${record.label}” from all devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
      const actions=[
        shown
          ?rowAction(HIDE_GLYPH,`Hide the value of ${record.label}`,()=>{revealed.delete(record.id);render();})
          :rowAction(SHOW_GLYPH,`Show the value of ${record.label}`,()=>reveal(record)),
        rowAction(COPY_GLYPH,`Copy the value of ${record.label}`,()=>copy(record)),
        rowAction(EDIT_GLYPH,`Edit ${record.label}`,()=>run(()=>edit(record))),
        remove
      ];
      // A conflict is a question this record is asking, so it stays in words
      // under it until one of the two answers is chosen.
      const decide=record.conflict
        ?[ActionGroup(['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))),{compact:true})]
        :[];
      const detail=[record.person,record.hint,record.expires?`Expires ${record.expires}`:'',record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · ');
      return RecordRow({title:record.label,detail,actions,extra:[shown?MaskedValue(shown):null,...decide,confirmation]});
    };
    $('list').replaceChildren(...(visible.length
      ?groupPersonalRecords(visible).map(group=>PersonalGroup(group.category,group.records.map(row)))
      :[Note(!loaded?'Connect in Settings to load your records.':records.length?'No matching records. Clear the search to see all of them.':'No records yet. Add your first one below.')]));
    const expiring=expiringPersonal(records);
    $('expiring').replaceChildren(...expiring.map(record=>RecordRow({
      title:record.label,
      detail:record.days<0?`Expired ${record.expires}`:record.days===0?'Expires today':`Expires in ${record.days} day${record.days===1?'':'s'} · ${record.expires}`,
      actions:[rowAction(EDIT_GLYPH,`Review ${record.label}`,()=>run(()=>edit(record)))]
    })));
    $('expiring').closest('section').hidden=!expiring.length;
    for(const key of [...fields,'value','notes'])$(key).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;
    // Beside the title, only what applies: loaded records can be refreshed, and
    // records that never loaded need the connection instead.
    $('actions').replaceChildren(loaded?action('Refresh',refresh):action('Connection settings',onSettings,'secondary',{enabled:true}));
  }
  async function run(operation){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your records before editing.');}
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'','alert');}
      return true;
    }catch(error){
      if(current!==generation)return false;
      const text=vaultReason(error);
      status(text,'error');setStatus($('form-status'),text,'error');
      return false;
    }finally{busy=false;render();}
  }
  async function save(record,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/personal/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    if(!gate.unlocked())return;
    status('Loading records…','progress');
    await run(token=>offline.request(token,'/v1/personal'));
  }
  function clear(){
    generation++;records=[];loaded=false;activeToken='';forget();clearForm();
    status('Unlock this section with your passkey to load your records.');
    render();
  }
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const payload=validatePersonalPayload({value:$('value').value,notes:$('notes').value});
      const id=editing?.id||crypto.randomUUID();
      const secret=await sealSecret(await gate.key(),id,payload);
      const value=normalizePersonal({...Object.fromEntries(fields.map(key=>[key,$(key).value])),secret});
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){setStatus($('form-status'),vaultReason(error),'error');}
  });
  clearForm();clear();
  if(gate.unlocked())refresh();
  const reload=()=>{if(gate.unlocked()&&!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();if(gate.unlocked())refresh();});
  return {refresh,clear,stop(){gate.stop();clearTimeout(revealTimer);}};
}
