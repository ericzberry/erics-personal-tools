import {SubscriptionsView,SubscriptionEvidence,SubscriptionResearch,subscriptionFields} from './components/subscriptions.js';
import {Button,RecordRow,RowAction,RowLink,EDIT_GLYPH,DELETE_GLYPH,OPEN_GLYPH,Stack,Note,ActionGroup,setStatus} from './components/ui.js';
import {normalizeSubscription,parseSubscriptionReading,mergeSubscriptionReading,subscriptionKey,annualCost,money,BILLING_CYCLES,estimatedRenewal,subscriptionAlerts,chargeKey} from './subscription-data.js';
import {mountVaultGate} from './vault-gate.js';
import {attachFileDrop} from './components/file-drop.js';
import {aiConnections} from './ai-connection.js';
import {readStatement,trimForReading,MAX_BYTES,MAX_SEND,ACCEPTED} from './statement-text.js';
export function mountSubscriptions(root,{credentials,offline,remote,onSettings=()=>{},onChanged=()=>{},vault}={}){
  const gate=mountVaultGate(root,{id:'subscriptions-vault',title:'Subscriptions & renewals',lockedDetail:'Unlock to review private charges and subscriptions.',...(vault?{vault}:{}),onChange:open=>open?refresh():clear()});
  gate.content.replaceChildren(SubscriptionsView());
  const $=id=>gate.content.querySelector(`#subscriptions-${id}`);
  let records=[],editing=null,busy=false,loaded=false,generation=0,activeToken='',image='',source='';
  // Reading a statement takes any saved connection; live price research takes
  // an OpenAI one, because that is the only provider whose search this uses.
  const reader=aiConnections({load:async token=>(await remote(token,'/v1/ai-connections')).connections,need:'to read a statement.'});
  const researcher=aiConnections({load:async token=>(await remote(token,'/v1/ai-connections')).connections,provider:'openai',need:'to research prices.'});
  const status=(message,target='status',tone='')=>setStatus($(target),message,tone);
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  // A subscription's own verbs, at the end of its line. What a record is asking
  // to have decided — terms to review, charges to confirm, a conflict — needs a
  // sentence, so it is not a row verb and waits in words under the record.
  const rowAction=(glyph,label,fn,danger=false)=>RowAction(glyph,label,fn,{danger,disabled:busy||!loaded});
  function resetForm(){editing=null;for(const key of subscriptionFields)$(key).value='';$('currency').value='USD';$('cycle').value='unknown';$('state').value='Active';$('notice').value='14';status('','form-status');}
  function edit(record){editing=record;for(const key of subscriptionFields)$(key).value=record[key]??'';$('editor').open=true;$('name').focus();}
  function render(){
    const totals=new Map();let unknown=0;
    for(const r of records.filter(r=>r.state==='Active'&&!r.deleting&&!r.conflict)){const n=annualCost(r);if(n===null)unknown++;else totals.set(r.currency,(totals.get(r.currency)||0)+n);}
    $('total').textContent=[...totals].map(([c,n])=>`${money(n,c)}/year confirmed`).concat(unknown?[`${unknown} active with unknown cost`]:[]).join(' · ');
    const rows=records.map(r=>{
      const remove=rowAction(DELETE_GLYPH,`Delete ${r.name}`,()=>{confirm.hidden=false;},true);
      const confirm=Stack([Note(`Delete ${r.name} and its saved charge evidence from all devices?`),ActionGroup([action('Delete record',()=>save(r,'DELETE'),'danger'),action('Keep record',()=>{confirm.hidden=true;})],{compact:true})],{hidden:true});
      const due=['Canceled','Not recurring'].includes(r.state)?'':r.renewal||estimatedRenewal(r);
      const alerts=subscriptionAlerts(r);
      const controls=[...(r.state!=='Review'||r.conflict?[rowAction(EDIT_GLYPH,`Edit ${r.name}`,()=>edit(r))]:[]),
        ...(r.url?[RowLink(OPEN_GLYPH,`Open the ${r.name} account`,r.url,{rel:'noopener noreferrer'})]:[]),remove];
      // What this record is asking to have decided, for this record only.
      const decisions=[
        ...(!r.conflict&&!r.deleting&&r.state==='Review'?[action('Review terms',()=>edit(r),'primary'),action('Not recurring',()=>save({...r,state:'Not recurring'}))]:[]),
        ...(alerts.length?[action('Mark charges reviewed',()=>save({...r,reviewedCharges:r.charges.map(chargeKey)}))]:[]),
        ...(!r.conflict&&!r.deleting?[action('Find alternatives',()=>research(r))]:[]),
        ...(r.conflict?['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>run(token=>offline.resolve(token,r.id,choice)))):[])
      ];
      return RecordRow({title:r.name,detail:[r.state,money(r.amount,r.currency),BILLING_CYCLES[r.cycle],r.account,r.state==='Canceled'?(r.canceledOn?`Cancellation effective ${r.canceledOn}`:'Add the cancellation date to check later charges'):'',due?`${r.renewal?'Renewal':'Estimated next charge'} ${due}`:'',r.pending?(r.conflict?'Conflict':r.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · '),notes:[...alerts.map(a=>a.reason),r.notes].filter(Boolean).join('\n'),actions:controls,
        extra:[decisions.length?ActionGroup(decisions,{compact:true}):null,SubscriptionEvidence(r),SubscriptionResearch(r),confirm].filter(Boolean)});
    });
    $('records').replaceChildren(...(rows.length?rows:loaded?[Note('No subscriptions saved yet. Read a statement or add one below.')]:[]));
    for(const key of [...subscriptionFields,'import-account','text','country','requirements','file','read','save','cancel','drop','clear-statement'])$(key).disabled=busy||!loaded;
    const settings=Button('Connection settings',{variant:'secondary',size:'compact',disabled:busy});settings.addEventListener('click',onSettings);
    $('actions').replaceChildren(loaded?action('Refresh',refresh):settings);
  }
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
    }catch(error){if(valid())status(error.message||'The operation failed.',target,'error');return false;}
    finally{if(current===generation){busy=false;render();}}
  }
  async function refresh(){
    const ok=await run(token=>offline.request(token,'/v1/subscriptions'));
    // The only thing worth saying about connections is that there is none.
    if(ok&&remote&&globalThis.navigator?.onLine!==false)await run(async(token,valid)=>{
      const note=await reader.note(token);
      if(valid())status(note,'intake-status',note?'alert':'');
    },'intake-status');
  }
  async function save(r,method='PUT',target='status'){
    const ok=await run(token=>offline.request(token,`/v1/subscriptions/${r.id}`,{method,value:r}),target);if(ok)onChanged();return ok;
  }
  async function read(){
    const account=$('import-account').value.trim(),text=$('text').value;
    if(!account){status('Give this statement an account nickname so separate accounts are not merged.','intake-status','alert');return;}
    if(text.length>24000){status('Split this statement into sections of up to 24,000 characters. Nothing was sent.','intake-status','alert');return;}
    status('Reading possible recurring charges…','intake-status','progress');
    await run(async(token,valid)=>{
      const result=await remote(token,`/v1/ai-connections/${await reader.id(token)}/subscription-intake`,{method:'POST',value:{text,image},maxBytes:1536*1024,timeoutMs:120000});
      if(!valid())return;
      const readings=parseSubscriptionReading({subscriptions:result.subscriptions},{account,source:source||'Pasted statement'});
      let latest=records;
      for(const incoming of readings){
        if(!valid())return;
        const matches=latest.filter(r=>subscriptionKey(r)===subscriptionKey(incoming));
        if(matches.length>1||matches.some(r=>r.conflict||r.deleting))throw Error('A matching subscription has duplicate records or a conflict. Resolve it before importing.');
        const previous=matches[0],id=previous?.id||crypto.randomUUID();
        const value={...(previous?mergeSubscriptionReading(previous,incoming):incoming),id,revision:previous?.revision??null};
        const saved=await offline.request(token,`/v1/subscriptions/${id}`,{method:'PUT',value});
        if(!valid())return;latest=saved.records;records=latest;status(saved.syncMessage||'','status','alert');
      }
      if(valid()){status(readings.length?`${readings.length} possible service${readings.length===1?'':'s'} saved for review. Check charge evidence and edit to confirm.`:'No possible subscriptions identified. Check other statements; this does not establish that you have none.','intake-status',readings.length?'success':'alert');onChanged();}
    },'intake-status');
  }
  async function research(record){
    const country=$('country').value.trim();
    if(!country){status('Enter the country / market below.','research-status','alert');$('country').focus();return;}
    status(`Researching alternatives to ${record.name}…`,'research-status','progress');
    await run(async(token,valid)=>{
      const result=await remote(token,`/v1/ai-connections/${await researcher.id(token)}/subscription-research`,{method:'POST',value:{name:record.name,currency:record.currency,country,requirements:$('requirements').value},timeoutMs:130000});
      if(!valid())return;
      const saved=await offline.request(token,`/v1/subscriptions/${record.id}`,{method:'PUT',value:{...record,research:result.research}});
      if(valid()){status(`Saved alternatives for ${record.name}. Open its Alternatives details to compare prices and tradeoffs.`,'research-status','success');onChanged();}return saved;
    },'research-status');
  }
  function clearStatement(){image='';source='';$('text').value='';status('','file-status');status('','intake-status');}
  function clear(){generation++;busy=false;records=[];loaded=false;activeToken='';reader.forget();researcher.forget();clearStatement();resetForm();$('import-account').value='';$('requirements').value='';status('');status('','research-status');render();}
  $('form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!loaded)return;try{const values=Object.fromEntries(subscriptionFields.map(k=>[k,$(k).value]));const value=normalizeSubscription({...editing,...values,...(editing&&(values.name!==editing.name||values.currency.toUpperCase()!==editing.currency)?{research:null}:{})});if(await save({...value,id:editing?.id||crypto.randomUUID(),revision:editing?.revision??null},'PUT','form-status')){resetForm();$('editor').open=false;}}catch(error){status(error.message,'form-status','error');}});
  $('cancel').addEventListener('click',()=>{resetForm();$('editor').open=false;});
  $('read').addEventListener('click',read);$('clear-statement').addEventListener('click',clearStatement);
  attachFileDrop({zone:$('drop'),input:$('file'),status:$('file-status'),accept:ACCEPTED,maxBytes:MAX_BYTES,onFile:async file=>{
    if(busy||!gate.unlocked()||!loaded)throw Error('Unlock and wait for the current operation to finish.');
    busy=true;const current=++generation;render();
    try{
      const result=await readStatement(file);
      if(current!==generation||!gate.unlocked())throw Error('Unlock again to read this statement.');
      source=file.name.slice(0,120);
      if(result.kind==='image'){image=result.image.dataUrl;$('text').value='';return 'Ready to read.';}
      // Nothing came out of the file: that is a failure of the reading, not a
      // statement with no subscriptions in it, and it is said as one.
      if(!result.text.trim()){image='';$('text').value='';throw Error(result.note||'Nothing readable came out of that file.');}
      image='';
      const {text,trimmed}=trimForReading(result.text);
      $('text').value=text;
      const cut=trimmed?`${trimmed.toLocaleString('en-US')} characters past the ${MAX_SEND.toLocaleString('en-US')}-character limit were left out.`:'';
      return result.confidence==='good'&&!cut
        ?'Ready to read.'
        :{message:[result.note,cut].filter(Boolean).join(' ')||'The text came out unevenly — check the figures before reading.',tone:'alert'};
    }finally{if(current===generation){busy=false;render();}}
  }});
  resetForm();render();if(gate.unlocked())refresh();
  const reload=()=>{if(!$('editor').open&&!busy&&gate.unlocked())refresh();};
  window.addEventListener('online',reload);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear,focusRecord(id){const record=records.find(r=>r.id===id);if(record)edit(record);}};
}
