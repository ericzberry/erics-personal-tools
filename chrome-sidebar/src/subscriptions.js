import {SubscriptionsView,SubscriptionEvidence,SubscriptionResearch,subscriptionFields} from './components/subscriptions.js';
import {Button,Option,RecordRow,Stack,Note,ActionGroup,Link} from './components/ui.js';
import {normalizeSubscription,parseSubscriptionReading,mergeSubscriptionReading,subscriptionKey,annualCost,money,BILLING_CYCLES,estimatedRenewal} from './subscription-data.js';
import {mountVaultGate} from './vault-gate.js';
import {attachFileDrop} from './components/file-drop.js';
import {readStatement,MAX_BYTES,ACCEPTED} from './statement-text.js';
export function mountSubscriptions(root,{credentials,offline,remote,onSettings=()=>{},onChanged=()=>{},vault}={}){
  const gate=mountVaultGate(root,{id:'subscriptions-vault',title:'Subscriptions & renewals',lockedDetail:'Unlock to review private charges and subscriptions.',...(vault?{vault}:{}),onChange:open=>open?refresh():clear()});
  gate.content.replaceChildren(SubscriptionsView());
  const $=id=>gate.content.querySelector(`#subscriptions-${id}`);
  let records=[],editing=null,busy=false,loaded=false,generation=0,activeToken='',image='',source='';
  const status=(message,target='status')=>{$(target).textContent=message||'';};
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  function resetForm(){editing=null;for(const key of subscriptionFields)$(key).value='';$('currency').value='USD';$('cycle').value='unknown';$('state').value='Active';$('notice').value='14';status('','form-status');}
  function edit(record){editing=record;for(const key of subscriptionFields)$(key).value=record[key]??'';$('editor').open=true;$('name').focus();}
  function render(){
    const totals=new Map();let unknown=0;
    for(const r of records.filter(r=>r.state==='Active'&&!r.deleting&&!r.conflict)){const n=annualCost(r);if(n===null)unknown++;else totals.set(r.currency,(totals.get(r.currency)||0)+n);}
    $('total').textContent=[...totals].map(([c,n])=>`${money(n,c)}/year confirmed`).concat(unknown?[`${unknown} active with unknown cost`]:[]).join(' · ');
    const rows=records.map(r=>{
      const remove=action('Delete',()=>{confirm.hidden=false;},'danger-subtle');
      const confirm=Stack([Note(`Delete ${r.name} and its saved charge evidence from all devices?`),ActionGroup([action('Delete record',()=>save(r,'DELETE'),'danger'),action('Keep record',()=>{confirm.hidden=true;})],{compact:true})],{hidden:true});
      const due=r.renewal||estimatedRenewal(r);
      const controls=[action('Edit',()=>edit(r),'subtle'),...(!r.conflict&&!r.deleting?[action('Find alternatives',()=>research(r))]:[]),remove];
      if(r.conflict)controls.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>run(token=>offline.resolve(token,r.id,choice)))));
      return Stack([RecordRow({title:r.name,detail:[r.state,money(r.amount,r.currency),BILLING_CYCLES[r.cycle],r.account,due?`${r.renewal?'Renewal':'Estimated next charge'} ${due}`:'',r.pending?(r.conflict?'Conflict':r.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · '),notes:r.notes,actions:controls}),...(r.url?[Link('Open account',r.url,{rel:'noopener noreferrer'})]:[]),SubscriptionEvidence(r),SubscriptionResearch(r),confirm].filter(Boolean));
    });
    $('records').replaceChildren(...(rows.length?rows:loaded?[Note('No subscriptions saved yet. Read a statement or add one below.')]:[]));
    for(const key of [...subscriptionFields,'connection','import-account','text','country','requirements','file','read','save','cancel','drop','clear-statement'])$(key).disabled=busy||!loaded;
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
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'');}
      return true;
    }catch(error){if(valid())status(error.message||'The operation failed.',target);return false;}
    finally{if(current===generation){busy=false;render();}}
  }
  async function refresh(){
    const ok=await run(token=>offline.request(token,'/v1/subscriptions'));
    if(ok&&!$('connection').value&&remote)await run(async(token,valid)=>{
      const result=await remote(token,'/v1/ai-connections');if(!valid())return;
      const connections=result.connections.filter(c=>c.provider==='openai'&&c.hasApiKey);
      $('connection').replaceChildren(Option('Choose AI connection',''),...connections.map(c=>Option(c.name,c.id)));
      if(connections.length===1)$('connection').value=connections[0].id;
      if(!connections.length)status('Add an OpenAI connection in Settings to read statements or research prices.','intake-status');
    },'intake-status');
  }
  async function save(r,method='PUT'){
    const ok=await run(token=>offline.request(token,`/v1/subscriptions/${r.id}`,{method,value:r}),'form-status');if(ok)onChanged();return ok;
  }
  async function read(){
    const connection=$('connection').value,account=$('import-account').value.trim(),text=$('text').value;
    if(!connection){status('Choose an AI connection.','intake-status');return;}
    if(!account){status('Give this statement an account nickname so separate accounts are not merged.','intake-status');return;}
    if(text.length>24000){status('Split this statement into sections of up to 24,000 characters. Nothing was sent.','intake-status');return;}
    status('Reading possible recurring charges…','intake-status');
    await run(async(token,valid)=>{
      const result=await remote(token,`/v1/ai-connections/${connection}/subscription-intake`,{method:'POST',value:{text,image},maxBytes:1536*1024,timeoutMs:120000});
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
        if(!valid())return;latest=saved.records;records=latest;status(saved.syncMessage||'');
      }
      if(valid()){status(readings.length?`${readings.length} possible service${readings.length===1?'':'s'} saved for review. Check charge evidence and edit to confirm.`:'No possible subscriptions identified. Check other statements; this does not establish that you have none.','intake-status');onChanged();}
    },'intake-status');
  }
  async function research(record){
    const connection=$('connection').value,country=$('country').value.trim();
    if(!connection||!country){status('Choose an AI connection under Read a statement and enter the country / market below.','research-status');$('country').focus();return;}
    status(`Researching alternatives to ${record.name}…`,'research-status');
    await run(async(token,valid)=>{
      const result=await remote(token,`/v1/ai-connections/${connection}/subscription-research`,{method:'POST',value:{name:record.name,currency:record.currency,country,requirements:$('requirements').value},timeoutMs:130000});
      if(!valid())return;
      const saved=await offline.request(token,`/v1/subscriptions/${record.id}`,{method:'PUT',value:{...record,research:result.research}});
      if(valid()){status(`Saved alternatives for ${record.name}. Open its Alternatives details to compare prices and tradeoffs.`,'research-status');onChanged();}return saved;
    },'research-status');
  }
  function clearStatement(){image='';source='';$('text').value='';status('','file-status');status('','intake-status');}
  function clear(){generation++;busy=false;records=[];loaded=false;activeToken='';clearStatement();resetForm();$('connection').replaceChildren(Option('Choose AI connection',''));$('import-account').value='';$('requirements').value='';status('');status('','research-status');render();}
  $('form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!loaded)return;try{const values=Object.fromEntries(subscriptionFields.map(k=>[k,$(k).value]));const value=normalizeSubscription({...editing,...values,...(editing&&(values.name!==editing.name||values.currency.toUpperCase()!==editing.currency)?{research:null}:{})});if(await save({...value,id:editing?.id||crypto.randomUUID(),revision:editing?.revision??null})){resetForm();$('editor').open=false;}}catch(error){status(error.message,'form-status');}});
  $('cancel').addEventListener('click',()=>{resetForm();$('editor').open=false;});
  $('read').addEventListener('click',read);$('clear-statement').addEventListener('click',clearStatement);
  attachFileDrop({zone:$('drop'),input:$('file'),status:$('file-status'),accept:ACCEPTED,maxBytes:MAX_BYTES,onFile:async file=>{
    if(busy||!gate.unlocked()||!loaded)throw Error('Unlock and wait for the current operation to finish.');
    busy=true;const current=++generation;render();
    try{
      const result=await readStatement(file);
      if(current!==generation||!gate.unlocked())throw Error('Unlock again to read this statement.');
      source=file.name.slice(0,120);image=result.kind==='image'?result.image.dataUrl:'';$('text').value=result.kind==='text'?result.text:'';
      return result.kind==='image'?'Image ready to send when you choose Find recurring charges.':`${result.note||'Text ready to review.'}${result.text.length>24000?' Split the text into smaller sections before reading.':''}`;
    }finally{if(current===generation){busy=false;render();}}
  }});
  resetForm();render();if(gate.unlocked())refresh();
  const reload=()=>{if(!$('editor').open&&!busy&&gate.unlocked())refresh();};
  window.addEventListener('online',reload);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear,focusRecord(id){const record=records.find(r=>r.id===id);if(record)edit(record);}};
}
