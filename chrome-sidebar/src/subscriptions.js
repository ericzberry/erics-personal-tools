import {SubscriptionsView,SubscriptionDetails,subscriptionDetail,subscriptionFields} from './components/subscriptions.js';
import {Button,RecordRow,RowAction,RowLink,EDIT_GLYPH,DELETE_GLYPH,OPEN_GLYPH,Stack,Note,Notice,ActionGroup,AttachmentCard,setStatus} from './components/ui.js';
import {normalizeSubscription,parseSubscriptionReading,mergeSubscriptionReading,matchingSubscriptions,annualCost,money,estimatedRenewal,subscriptionAlerts,chargeKey} from './subscription-data.js';
import {mountVaultGate} from './vault-gate.js';
import {attachFileDrop} from './components/file-drop.js';
import {aiConnections} from './ai-connection.js';
import {readStatement,trimForReading,MAX_BYTES,MAX_SEND,ACCEPTED} from './statement-text.js';
// Where to look for cheaper plans is where the owner is, which the browser
// already says; nobody is asked for a country (UI-38).
export function researchMarket(language=globalThis.navigator?.language){
  try{const region=new Intl.Locale(language||'en-US').maximize().region;return region?new Intl.DisplayNames(['en'],{type:'region'}).of(region)||'':'';}
  catch{return '';}
}
export function mountSubscriptions(root,{credentials,offline,remote,onSettings=()=>{},onChanged=()=>{},vault}={}){
  const gate=mountVaultGate(root,{id:'subscriptions-vault',title:'Subscriptions & renewals',lockedDetail:'Unlock to review private charges and subscriptions.',...(vault?{vault}:{}),onChange:open=>open?refresh():clear()});
  gate.content.replaceChildren(SubscriptionsView());
  const $=id=>gate.content.querySelector(`#subscriptions-${id}`);
  let records=[],editing=null,busy=false,loaded=false,generation=0,activeToken='',attachment=null,opened=false,clears=0;
  // What happened to one record — alternatives found, a search that failed —
  // is said under that record, and which records' drawers are open survives
  // the list being drawn again.
  const said=new Map(),open=new Set();
  // Reading a statement takes any saved connection; live price research takes
  // an OpenAI one, because that is the only provider whose search this uses.
  const reader=aiConnections({load:async token=>(await remote(token,'/v1/ai-connections')).connections,need:'to read a statement.'});
  const researcher=aiConnections({load:async token=>(await remote(token,'/v1/ai-connections')).connections,provider:'openai',need:'to research prices.'});
  const status=(message,target='status',tone='')=>setStatus($(target),message,tone);
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  // A subscription's own verbs, at the end of its line. What a record is asking
  // to have decided — whether a charge recurs, charges to confirm, a conflict —
  // is not a row verb and waits under the record, for that record only.
  const rowAction=(glyph,label,fn,danger=false)=>RowAction(glyph,label,fn,{danger,disabled:busy||!loaded});
  function resetForm(){editing=null;for(const key of subscriptionFields)$(key).value='';$('currency').value='USD';$('cycle').value='unknown';$('state').value='Active';$('notice').value='14';status('','form-status');syncForm();}
  // Confirming a possible subscription is editing it with its status already
  // set to Active: the owner fills in what the statement could not say.
  function edit(record,changes={}){editing=record;for(const key of subscriptionFields)$(key).value={...record,...changes}[key]??'';syncForm();$('editor').open=true;$('name').focus();}
  function syncForm(){$('canceledOn').closest('.form-field').hidden=$('state').value!=='Canceled';}
  function render(){
    const totals=new Map();let unknown=0;
    for(const r of records.filter(r=>r.state==='Active'&&!r.deleting&&!r.conflict)){const n=annualCost(r);if(n===null)unknown++;else totals.set(r.currency,(totals.get(r.currency)||0)+n);}
    $('total').textContent=[...totals].map(([c,n])=>`${money(n,c)} a year`).concat(unknown?[`${unknown} active with no known yearly cost`]:[]).join(' · ');
    const linked=records.some(r=>r.url);
    const rows=records.map(r=>{
      const remove=rowAction(DELETE_GLYPH,`Delete ${r.name}`,()=>{confirm.hidden=false;},true);
      const confirm=Stack([Note(`Delete ${r.name} and its saved charges from all devices?`),ActionGroup([action('Delete record',()=>save(r,'DELETE'),'danger'),action('Keep record',()=>{confirm.hidden=true;})],{compact:true})],{hidden:true});
      const due=['Canceled','Not recurring'].includes(r.state)?'':r.renewal||estimatedRenewal(r);
      const alerts=subscriptionAlerts(r);
      const settled=!r.conflict&&!r.deleting;
      // Every row carries the same verbs, so the amounts end on one edge; a
      // record with no account link holds that slot empty while any other
      // record has one. UI-27.
      const controls=[...(r.url?[RowLink(OPEN_GLYPH,`Open the ${r.name} account`,r.url,{rel:'noopener noreferrer'})]:linked?[Stack([],{className:'row-action','aria-hidden':'true'})]:[]),
        rowAction(EDIT_GLYPH,`Edit ${r.name}`,()=>edit(r)),remove];
      const decisions=[
        ...(settled&&r.state==='Review'?[action('Confirm',()=>edit(r,{state:'Active'}),'primary'),action('Not recurring',()=>save({...r,state:'Not recurring'}))]:[]),
        ...(alerts.length?[action('Mark charges reviewed',()=>save({...r,reviewedCharges:r.charges.map(chargeKey)}))]:[]),
        ...(r.conflict?['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>run(token=>offline.resolve(token,r.id,choice)))):[])
      ];
      const note=said.get(r.id);
      const outcome=note?Notice('',{role:'status'}):null;if(outcome)setStatus(outcome,note.message,note.tone);
      // Cheaper plans are worth looking for only for a service being paid for.
      const find=settled&&r.state==='Active'?action(r.research?'Search again':'Find cheaper alternatives',()=>research(r)):null;
      return RecordRow({title:r.name,figure:r.amount===null?'':money(r.amount,r.currency),detail:subscriptionDetail(r,due),
        notes:alerts.map(a=>a.reason),actions:controls,
        extra:[r.notes?Note(r.notes):null,decisions.length?ActionGroup(decisions,{compact:true}):null,outcome,
          SubscriptionDetails(r,{find,open:open.has(r.id),onToggle:shown=>shown?open.add(r.id):open.delete(r.id)}),confirm]});
    });
    $('records').replaceChildren(...(rows.length?rows:loaded?[Note('No subscriptions yet.')]:[]));
    for(const key of [...subscriptionFields,'file','read','save','cancel','drop'])$(key).disabled=busy||!loaded;
    // With nothing saved, reading a statement is what the screen is for, so it
    // starts open — once, so a drawer the owner closed stays closed. UI-35.
    if(loaded&&!opened){opened=true;if(!records.length)$('intake').open=true;}
    const settings=Button('Connection settings',{variant:'secondary',size:'compact',disabled:busy});settings.addEventListener('click',onSettings);
    $('actions').replaceChildren(loaded?action('Refresh',refresh):settings);
  }
  // `target` is a status line's id, or a function that says it somewhere else.
  async function run(operation,target='status'){
    if(busy||!gate.unlocked())return false;
    busy=true;const current=++generation;render();
    const valid=()=>current===generation&&gate.unlocked();
    try{
      const token=await credentials.get();if(!valid())return false;if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();return false;}activeToken=token;
      const result=await operation(token,valid);
      if(!valid())return false;
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'','status','alert');}
      return true;
    }catch(error){
      if(valid()){const message=error.message||'The operation failed.';if(typeof target==='function')target(message,'error');else status(message,target,'error');}
      return false;
    }
    finally{if(current===generation){busy=false;render();}}
  }
  async function refresh(){
    const ok=await run(token=>offline.request(token,'/v1/subscriptions'));
    // The only thing worth saying about connections is that there is none.
    if(ok&&remote&&globalThis.navigator?.onLine!==false)await run(async(token,valid)=>{
      const note=await reader.note(token);
      if(valid())status(note,'intake-status',note?'alert':'');
    },'intake-status');
    if(ok)readOnArrival();
  }
  async function save(r,method='PUT',target='status'){
    const ok=await run(token=>offline.request(token,`/v1/subscriptions/${r.id}`,{method,value:r}),target);if(ok)onChanged();return ok;
  }
  function renderAttachment(){
    $('attachment').hidden=!attachment;
    $('attachment').replaceChildren(...(attachment?[AttachmentCard({label:attachment.label,detail:attachment.detail,note:attachment.note,tone:attachment.tone,
      onRemove:()=>{attachment=null;renderAttachment();status('','file-status');status('','intake-status');}})]:[]));
    // Only a file that is waiting to be read offers to be read.
    $('read-actions').hidden=attachment?.state!=='waiting';
  }
  // Dropping a statement is asking for it to be read. One that cannot be read
  // yet — offline, still loading, another errand running — waits for Read.
  function readOnArrival(){if(attachment?.state==='waiting'&&loaded&&!busy&&globalThis.navigator?.onLine!==false)read();}
  async function read(){
    const reading=attachment;if(!reading||reading.state!=='waiting')return;
    reading.state='reading';renderAttachment();
    status(reading.image?'Reading the image…':'Reading…','intake-status','progress');
    let found=0;
    const done=await run(async(token,valid)=>{
      const result=await remote(token,`/v1/ai-connections/${await reader.id(token)}/subscription-intake`,{method:'POST',value:{text:reading.text,image:reading.image},maxBytes:1536*1024,timeoutMs:120000});
      if(!valid())return;
      const readings=parseSubscriptionReading({account:result.account,subscriptions:result.subscriptions},{source:reading.label});
      let latest=records;
      for(const incoming of readings){
        if(!valid())return;
        const matches=matchingSubscriptions(latest,incoming);
        if(matches.length>1)throw Error(`${incoming.name} is saved twice. Delete one, then read the statement again.`);
        if(matches.some(r=>r.conflict||r.deleting))throw Error(`Settle ${incoming.name} above, then read the statement again.`);
        const previous=matches[0],id=previous?.id||crypto.randomUUID();
        const value={...(previous?mergeSubscriptionReading(previous,incoming):incoming),id,revision:previous?.revision??null};
        const saved=await offline.request(token,`/v1/subscriptions/${id}`,{method:'PUT',value});
        if(!valid())return;latest=saved.records;records=latest;status(saved.syncMessage||'','status','alert');found++;
      }
      if(valid())onChanged();
    },'intake-status');
    // Read once is read: what it found is in the list, so the file goes. One
    // that failed stays and offers Read, because trying again is the remedy.
    if(attachment!==reading)return;
    if(done){
      attachment=null;renderAttachment();status('','file-status');
      // A statement cut short is said again once its card has gone, because
      // the part that was not read is still the owner's to drop.
      const outcome=found?`Found ${found} possible subscription${found===1?'':'s'} — confirm ${found===1?'it':'them'} above.`:'No subscriptions found on this statement.';
      status([outcome,reading.cut].filter(Boolean).join(' '),'intake-status',reading.cut?'alert':found?'success':'');
    }else{reading.state='waiting';renderAttachment();}
  }
  async function research(record){
    const country=researchMarket();
    const say=(message,tone='')=>{said.set(record.id,{message,tone});};
    if(!country){say('This browser does not say which country to search in.','error');render();return;}
    say(`Looking for cheaper alternatives to ${record.name}…`,'progress');
    const done=await run(async(token,valid)=>{
      const result=await remote(token,`/v1/ai-connections/${await researcher.id(token)}/subscription-research`,{method:'POST',value:{name:record.name,currency:record.currency,country,requirements:''},timeoutMs:130000});
      if(!valid())return;
      const saved=await offline.request(token,`/v1/subscriptions/${record.id}`,{method:'PUT',value:{...record,research:result.research}});
      if(valid()){
        const n=result.research.options.length;
        say(n?`Found ${n} alternative${n===1?'':'s'}.`:'No cheaper plan with a published price was found.',n?'success':'');
        open.add(record.id);onChanged();
      }
      return saved;
    },say);
    if(!done&&said.get(record.id)?.tone==='progress')said.delete(record.id);
    render();
  }
  function clear(){generation++;clears++;busy=false;records=[];loaded=false;activeToken='';attachment=null;said.clear();open.clear();reader.forget();researcher.forget();renderAttachment();resetForm();status('');status('','file-status');status('','intake-status');render();}
  $('form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!loaded)return;try{const values=Object.fromEntries(subscriptionFields.map(k=>[k,$(k).value]));const value=normalizeSubscription({...editing,...values,...(values.state==='Canceled'?{}:{canceledOn:''}),...(editing&&(values.name!==editing.name||values.currency.toUpperCase()!==editing.currency)?{research:null}:{})});if(await save({...value,id:editing?.id||crypto.randomUUID(),revision:editing?.revision??null},'PUT','form-status')){resetForm();$('editor').open=false;}}catch(error){status(error.message,'form-status','error');}});
  $('cancel').addEventListener('click',()=>{resetForm();$('editor').open=false;});
  $('state').addEventListener('change',syncForm);
  $('read').addEventListener('click',read);
  // Nothing is said about a file that read cleanly: its card names it and the
  // reading starts at once. Only uneven text earns a line.
  attachFileDrop({zone:$('drop'),input:$('file'),status:$('file-status'),accept:ACCEPTED,maxBytes:MAX_BYTES,onFile:async file=>{
    if(!gate.unlocked())throw Error('Unlock to read this statement.');
    // Locking while the file is opened forgets it, as locking forgets the rest.
    const before=clears;
    const result=await readStatement(file);
    if(before!==clears||!gate.unlocked())throw Error('Unlock again to read this statement.');
    const label=file.name.slice(0,120);
    if(result.kind==='image'){
      attachment={label,image:result.image.dataUrl,text:'',state:'waiting',note:'',tone:'',
        detail:`Image · ${result.image.width}×${result.image.height}`};
      renderAttachment();readOnArrival();return '';
    }
    // Nothing came out of the file: that is a failure of the reading, not a
    // statement with no subscriptions in it, and it is said as one.
    if(!result.text.trim()){attachment=null;renderAttachment();throw Error(result.note||'Nothing readable came out of that file.');}
    const {text,trimmed}=trimForReading(result.text);
    const cut=trimmed?`The last ${trimmed.toLocaleString('en-US')} characters were past the ${MAX_SEND.toLocaleString('en-US')}-character limit and not read — drop them as a separate file.`:'';
    attachment={label,text,image:'',state:'waiting',tone:'alert',cut,
      detail:`${text.length.toLocaleString('en-US')} characters read on this device`,
      note:[result.confidence==='good'?'':result.note||'The text came out unevenly — check what was found.',cut].filter(Boolean).join(' ')};
    renderAttachment();readOnArrival();return '';
  }});
  resetForm();renderAttachment();render();if(gate.unlocked())refresh();
  const reload=()=>{if(!$('editor').open&&!busy&&gate.unlocked())refresh();};
  window.addEventListener('online',reload);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear,focusRecord(id){const record=records.find(r=>r.id===id);if(record)edit(record);}};
}
