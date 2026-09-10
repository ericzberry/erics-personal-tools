import {FinanceView,FinanceGroup,BreakdownList,TrendTable,DraftRow,Figure,money} from './components/finance.js';
import {RecordRow,Button,Note,Stack,ActionGroup,MaskedValue,Option} from './components/ui.js';
import {normalizeFinance,financeSummary,financeCurrencies,netWorthSeries,groupFinanceRecords,valueHistory,parseFinanceUpdates,matchFinanceUpdates,kindLabel,FINANCE_KINDS,effectiveValue} from './finance-data.js';
import {mountVaultGate,vaultReason} from './vault-gate.js';
import {sealSecret,openSecret} from './secret-vault.js';
const core=['kind','name','institution','owner','value','asOf'];
const extra=['currency','ownership','liquidity','rate','commitment','unfunded','tags','notes'];
const REVEAL_MS=60000;
const today=()=>new Date().toISOString().slice(0,10);

export function mountFinance(root,{credentials,offline,remote,onSettings=()=>{},onChanged=()=>{},vault,clipboard=globalThis.navigator?.clipboard}){
  const gate=mountVaultGate(root,{
    id:'finance-vault',title:'Finance',
    ...(vault?{vault}:{}),
    onChange:unlocked=>{unlocked?refresh():clear();}
  });
  gate.content.replaceChildren(FinanceView());
  const $=id=>gate.content.querySelector(`#finance-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0,currency='USD',drafts=[],revealTimer=null,clearSecret=false;
  const revealed=new Map();
  const status=(text,target='status')=>{$(target).textContent=text||'';};
  const action=(label,handler,variant='secondary')=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||!loaded});
    button.addEventListener('click',handler);
    return button;
  };
  function forget(){revealed.clear();clearTimeout(revealTimer);revealTimer=null;}
  function hold(){clearTimeout(revealTimer);revealTimer=setTimeout(()=>{forget();render();},REVEAL_MS);}

  function clearForm(){
    editing=null;clearSecret=false;
    $('kind').value='bank';$('liquidity').value='Liquid';
    for(const key of ['name','institution','owner','value','rate','commitment','unfunded','tags','notes'])$(key).value='';
    $('currency').value=currency;$('ownership').value='100';$('asOf').value=today();
    $('secret-number').value='';$('secret-expiry').value='';
    $('editor-title').textContent='New record';
    renderSecret();status('','form-status');
  }
  function fill(record){
    editing={id:record.id,revision:record.revision,secret:record.secret||'',secretHint:record.secretHint||''};
    clearSecret=false;
    for(const key of [...core,...extra])$(key).value=record[key]===null||record[key]===undefined?'':String(record[key]);
    $('secret-number').value='';$('secret-expiry').value='';
    $('editor-title').textContent=`Editing ${record.name}`;
    renderSecret();
    $('editor').open=true;$('name').focus();
  }
  // An empty account-details input means "keep what is stored". Removing saved
  // details has to be its own explicit action.
  function renderSecret(){
    const saved=!!editing?.secret&&!clearSecret,shown=editing&&revealed.get(editing.id);
    $('secret-state').hidden=!saved&&!clearSecret;
    $('secret-state').textContent=clearSecret?'The saved account details will be removed when you save this record.'
      :shown?`Saved · ${shown}`
      :saved?`Saved · ${editing.secretHint}. Leave the fields blank to keep them.`:'';
    $('secret-actions').replaceChildren(...(saved?[
      shown?action('Hide details',()=>{revealed.delete(editing.id);renderSecret();render();})
        :action('Show details',()=>reveal({id:editing.id,secret:editing.secret})),
      action('Remove saved details',()=>{clearSecret=true;renderSecret();},'danger-subtle')
    ]:clearSecret?[action('Keep saved details',()=>{clearSecret=false;renderSecret();})]:[]));
  }
  async function protectedValues(id){
    const number=$('secret-number').value.trim(),hint=$('secret-expiry').value.trim();
    if(!number){
      if(hint&&!editing?.secret)throw Error('Enter the account details as well, or clear the hint.');
      return clearSecret?{secret:'',secretHint:''}:{secret:editing?.secret||'',secretHint:editing?.secretHint||''};
    }
    if(!hint)throw Error('Add a short, non-identifying hint so this record can be recognized without unlocking it.');
    return {secret:await sealSecret(await gate.key(),id,{number}),secretHint:hint};
  }
  async function reveal(record){
    await run(async()=>{
      const payload=await openSecret(await gate.key(),record.id,record.secret);
      revealed.set(record.id,payload.number);
      hold();
    });
  }
  async function copy(record){
    if(!clipboard?.write||typeof ClipboardItem==='undefined'){status('Copy is unavailable in this browser. Use Show details instead.');return;}
    await run(async()=>{
      const value=gate.key().then(key=>openSecret(key,record.id,record.secret)).then(payload=>new Blob([payload.number],{type:'text/plain'}));
      await clipboard.write([new ClipboardItem({'text/plain':value})]);
      status('Account details copied to the clipboard.');
    });
  }

  function renderPosition(){
    const currencies=financeCurrencies(records);
    if(currencies.length&&!currencies.some(entry=>entry.currency===currency))currency=currencies[0].currency;
    $('currency-switch').hidden=currencies.length<2;
    $('currency-switch').replaceChildren(...(currencies.length<2?[]:currencies.map(entry=>{
      const button=Button(`${entry.currency} (${entry.count})`,{variant:entry.currency===currency?'primary':'secondary',size:'compact','aria-pressed':String(entry.currency===currency)});
      button.addEventListener('click',()=>{currency=entry.currency;renderPosition();});
      return button;
    })));
    const summary=financeSummary(records,{currency});
    $('totals').replaceChildren(
      Figure({label:'Net',value:money(summary.net,currency),tone:summary.net<0?'negative':''}),
      Figure({label:'Assets',value:money(summary.assets,currency)}),
      Figure({label:'Liabilities',value:money(summary.liabilities,currency)}),
      ...(summary.unfunded?[Figure({label:'Unfunded',value:money(summary.unfunded,currency)})]:[])
    );
    $('stale').hidden=!summary.stale.length;
    $('stale').textContent=summary.stale.length?`${summary.stale.length} record${summary.stale.length===1?'':'s'} not updated in over 90 days — the oldest is ${summary.stale[0].name}${summary.stale[0].asOf?` from ${summary.stale[0].asOf}`:''}. Totals still include ${summary.stale.length===1?'it':'them'} at ${summary.stale.length===1?'its':'their'} last known value.`:'';
    $('breakdown').replaceChildren(
      BreakdownList('By type',summary.byKind,currency),
      BreakdownList('By owner',summary.byOwner,currency),
      BreakdownList('Assets by liquidity',summary.byLiquidity,currency)
    );
    $('trend').replaceChildren(TrendTable(netWorthSeries(records,{currency}),currency));
    // Currencies are never added together, so say what a total covers.
    $('breakdown-panel').querySelector('summary').textContent=currencies.length>1?`Breakdown · ${currency} only`:'Breakdown';
  }

  function renderDrafts(){
    $('drafts').replaceChildren(...drafts.map((draft,index)=>DraftRow(draft,{
      onApply:()=>apply(index),
      onEdit:()=>{applyToForm(draft);drafts.splice(index,1);renderDrafts();},
      onDiscard:()=>{drafts.splice(index,1);renderDrafts();status(drafts.length?'':'Drafts discarded. Nothing was saved.','intake-status');}
    })));
  }
  // Applying a draft is an ordinary save through the same validator and queue as
  // a typed edit: nothing about an AI reading bypasses a check.
  function applyToForm(draft){
    const match=draft.match;
    if(match)fill(match);else clearForm();
    $('kind').value=match?.kind||draft.kind;
    $('name').value=match?.name||draft.name;
    if(!match){
      $('institution').value=draft.institution;
      $('owner').value=draft.owner;
      $('currency').value=draft.currency;
    }
    $('value').value=String(draft.value);
    $('asOf').value=draft.asOf;
    $('editor').open=true;
    $('value').focus();
    status('Review this draft, then save it.','form-status');
  }
  async function apply(index){
    const draft=drafts[index];
    const match=draft.ambiguous?null:draft.match;
    const id=match?.id||crypto.randomUUID();
    const success=await run(async token=>{
      const value=normalizeFinance({
        ...(match?{}:{kind:draft.kind,name:draft.name,institution:draft.institution,owner:draft.owner,currency:draft.currency}),
        value:draft.value,asOf:draft.asOf,source:`AI reading · ${draft.confidence} confidence`
      },match||{});
      return offline.request(token,`/v1/finance/${id}`,{method:'PUT',value:{...value,id,revision:match?.revision??null}});
    });
    if(success){
      drafts.splice(index,1);renderDrafts();onChanged();
      status(`Saved ${draft.name}.`,'intake-status');
    }
  }

  function render(){
    const query=$('search').value.trim().toLowerCase();
    const visible=records.filter(record=>[record.name,record.institution,record.owner,record.tags,kindLabel(record.kind)].join(' ').toLowerCase().includes(query));
    const row=record=>{
      const shown=revealed.get(record.id);
      const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
      const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
      const no=action('Keep record',()=>{confirmation.hidden=true;remove.focus();});
      const confirmation=Stack([Note(`Permanently delete “${record.name}” and its value history from all devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
      const history=valueHistory(record.history??'[]');
      const past=Stack(history.slice(0,8).map(entry=>Note(`${entry.asOf} · ${money(entry.value,record.currency)}${entry.source?` · ${entry.source}`:''}`)),{hidden:true});
      const actions=[
        action('Edit',()=>fill(record),'subtle'),
        ...(history.length>1?[action('History',()=>{past.hidden=!past.hidden;},'subtle')]:[]),
        ...(record.secret?[shown?action('Hide details',()=>{revealed.delete(record.id);render();}):action('Show details',()=>reveal(record)),action('Copy details',()=>copy(record),'subtle')]:[]),
        remove
      ];
      if(record.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))));
      const share=Number(record.ownership??100);
      const detail=[
        money(record.value,record.currency),
        share===100?'':`${share}% share · ${money(effectiveValue(record),record.currency)}`,
        record.asOf?`as of ${record.asOf}`:'',
        record.institution,record.owner,record.secretHint,
        record.unfunded?`${money(record.unfunded,record.currency)} unfunded`:'',
        record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):''
      ].filter(Boolean).join(' · ');
      return Stack([RecordRow({title:record.name,detail,notes:record.notes,actions}),shown?MaskedValue(shown):null,past,confirmation]);
    };
    $('list').replaceChildren(...(visible.length
      ?groupFinanceRecords(visible).map(group=>FinanceGroup(group.label,group.side,group.records.map(row)))
      :[Note(!loaded?'Connect in Settings to load your ledger.':records.length?'No matching records. Clear the search to see all of them.':'No records yet. Add your first account or asset below.')]));
    renderPosition();
    for(const key of [...core,...extra])$(key).disabled=busy||!loaded;
    for(const key of ['number','expiry'])$(`secret-${key}`).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;$('refresh').disabled=busy;
    $('read').disabled=busy||!loaded||globalThis.navigator?.onLine===false;
    $('intake').disabled=busy||!loaded;
  }

  async function run(operation,target='status'){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your ledger before editing.');}
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'');}
      return true;
    }catch(error){
      if(current!==generation)return false;
      status(vaultReason(error),target);
      return false;
    }finally{busy=false;render();}
  }
  async function save(record,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/finance/${record.id}`,{method,value:record}),'form-status');
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    if(!gate.unlocked())return;
    status('Loading your ledger…');
    if(await run(token=>offline.request(token,'/v1/finance')))connectionList();
  }
  function clear(){
    generation++;records=[];loaded=false;activeToken='';drafts=[];forget();clearForm();renderDrafts();
    status('Unlock this section with your passkey to load your ledger.');
    render();
  }

  async function connectionList(){
    if(!activeToken||globalThis.navigator?.onLine===false){status('Offline · Add and edit records by hand; reading text needs the internet.','ai-status');return;}
    try{
      const result=await remote(activeToken,'/v1/ai-connections');
      const usable=result.connections.filter(connection=>connection.hasApiKey);
      const previous=$('connection').value;
      $('connection').replaceChildren(Option('Choose a connection',''),...usable.map(connection=>Option(`${connection.name} · ${connection.provider}`,connection.id)));
      if(usable.some(connection=>connection.id===previous))$('connection').value=previous;
      else if(usable.length===1)$('connection').value=usable[0].id;
      status(usable.length?'':'Save an AI connection in Settings to read pasted text into drafts.','ai-status');
    }catch(error){status(error.message,'ai-status');}
  }
  async function read(){
    const text=$('intake').value.trim();
    if(!text){status('Paste the text you want read first.','intake-status');return;}
    const id=$('connection').value;
    if(!id){status('Choose a saved AI connection, or add the record by hand below.','intake-status');return;}
    await run(async token=>{
      status('Reading…','intake-status');
      const result=await remote(token,`/v1/ai-connections/${id}/finance-intake`,{method:'POST',value:{text,today:today()},timeoutMs:130000});
      const parsed=parseFinanceUpdates(result);
      drafts=matchFinanceUpdates(parsed.updates,records);
      renderDrafts();
      status([`${drafts.length} draft${drafts.length===1?'':'s'} ready to review. Nothing is saved until you apply one.`,parsed.unread].filter(Boolean).join(' '),'intake-status');
    },'intake-status');
  }

  $('search').addEventListener('input',render);
  $('refresh').addEventListener('click',refresh);
  $('connect').addEventListener('click',onSettings);
  $('read').addEventListener('click',read);
  $('intake-clear').addEventListener('click',()=>{$('intake').value='';drafts=[];renderDrafts();status('','intake-status');});
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('kind').addEventListener('change',()=>{
    // The kind's usual liquidity is a starting point, not a lock: it applies
    // only while the record is new and untouched.
    if(!editing)$('liquidity').value=FINANCE_KINDS.find(kind=>kind.id===$('kind').value)?.liquidity||'Liquid';
  });
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const id=editing?.id||crypto.randomUUID();
      const input=Object.fromEntries([...core,...extra].map(key=>[key,$(key).value]));
      for(const key of ['rate','commitment','unfunded'])if(input[key]==='')input[key]=null;
      const value=normalizeFinance({...input,source:'Entered by hand',...await protectedValues(id)},editing?records.find(record=>record.id===id)||{}:{});
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){status(vaultReason(error),'form-status');}
  });
  clearForm();clear();
  if(gate.unlocked())refresh();
  const reload=()=>{if(gate.unlocked()&&!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();if(gate.unlocked())refresh();});
  return {refresh,clear,stop(){gate.stop();clearTimeout(revealTimer);}};
}
