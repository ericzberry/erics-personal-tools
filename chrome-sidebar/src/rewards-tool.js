import {RewardsView} from './components/rewards.js';
import {RecordRow,Button,Note,Link,Stack,ActionGroup,MaskedValue} from './components/ui.js';
import {validateReward,nextActions,luhnValid} from './rewards-data.js';
import {sharedVault,sealSecret} from './secret-vault.js';
const fields=['kind','name','source','value','due','state','url','notes'];
// A revealed number returns to its masked form on its own, so an unattended
// sidebar does not keep a card number on screen.
const REVEAL_MS=60000;
// The wallet syncs on its own: on open, on reconnect, when the tool is shown
// again, and on this timer while a change is still waiting to reach the cloud.
// Nothing here asks the owner to press a refresh button.
const RETRY_MS=60000;
const grouped=digits=>digits.replace(/(.{4})/g,'$1 ').trim();
const reason=error=>error?.name==='NotAllowedError'||error?.name==='AbortError'
  ?'Passkey verification was canceled or timed out. Try again when you’re ready.'
  :error?.message||'Protected values could not be unlocked.';
export function mountRewards(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{},vault=sharedVault()}){
  root.replaceChildren(RewardsView());
  const $=id=>root.querySelector(`#${id}`);
  let entries=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  let vaultBusy=false,vaultMessage='',vaultOpen=false,clearSecret=false,revealTimer=null,syncFailed=false;
  const revealed=new Map();
  const status=text=>{$('rewards-status').textContent=text;};
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  const vaultAction=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:vaultBusy});b.addEventListener('click',fn);return b;};
  function forget(){revealed.clear();clearTimeout(revealTimer);revealTimer=null;$('vault-code').replaceChildren();}
  function hold(){clearTimeout(revealTimer);revealTimer=setTimeout(()=>{forget();renderVault();render();},REVEAL_MS);}
  function edit(entry){
    editing={id:entry.id,revision:entry.revision,secret:entry.secret||'',secretHint:entry.secretHint||''};
    clearSecret=false;
    for(const key of fields)$(`reward-${key}`).value=entry[key]||'';
    $('reward-secret-number').value='';$('reward-secret-expiry').value='';
    renderSecret();
    $('reward-editor').open=true;$('reward-name').focus();
  }
  function clearForm(){
    editing=null;clearSecret=false;
    for(const key of fields)$(`reward-${key}`).value=key==='kind'?'balance':key==='state'?'available':'';
    $('reward-secret-number').value='';$('reward-secret-expiry').value='';
    $('reward-form-status').textContent='';
    renderSecret();
  }
  // Editor state for the stored number: an empty input keeps what is saved, so
  // removing a number has to be its own explicit action.
  function renderSecret(){
    const saved=!!editing?.secret&&!clearSecret,shown=editing&&revealed.get(editing.id);
    $('reward-secret-state').hidden=!saved&&!clearSecret;
    $('reward-secret-state').textContent=clearSecret?'The saved number will be removed when you save this entry.'
      :shown?`Saved · ${shown}`
      :saved?`Saved · •••• ${editing.secretHint}. Leave the fields blank to keep it.`:'';
    $('reward-secret-actions').replaceChildren(...(saved?[
      shown?vaultAction('Hide number',()=>{revealed.delete(editing.id);renderSecret();render();})
        :vaultAction('Show number',()=>reveal({id:editing.id,secret:editing.secret})),
      vaultAction('Remove number',()=>{clearSecret=true;renderSecret();},'danger-subtle')
    ]:clearSecret?[vaultAction('Keep number',()=>{clearSecret=false;renderSecret();})]:[]));
  }
  function renderVault(){
    const open=vault.unlocked(),available=vault.available();
    vaultOpen=open;
    $('vault-status').closest('section').hidden=!entries.some(e=>e.secret)&&!open;
    root.querySelector('.rewards-wallet').classList.toggle('vault-locked',!open);
    $('vault-status').textContent=vaultMessage||(open
      ?`Unlocked · Card numbers stay readable for ${Math.round(vault.idleMs/60000)} minutes of activity.`
      :available?'Locked · Your passkey is required to show a card number.'
      :'Locked · This browser cannot use passkeys. Unlock with your recovery code.');
    $('vault-detail').textContent='Numbers are sealed with a key only your passkey can derive, so the cloud stores unreadable text. Keep your recovery code safe: without the passkey or that code, a saved number cannot be recovered.';
    $('vault-actions').replaceChildren(...(open
      ?[vaultAction('Lock now',()=>{vault.lock();forget();vaultMessage='';renderVault();render();}),vaultAction('Show recovery code',showRecovery)]
      :[...(available?[vaultAction('Unlock',unlockVault)]:[]),vaultAction('Use recovery code',()=>{$('vault-recovery').hidden=false;$('vault-recovery-code').focus();})]));
  }
  async function vaultRun(operation){
    if(vaultBusy)return false;
    vaultBusy=true;vaultMessage='';renderVault();render();
    try{await operation();return true;}
    catch(error){vaultMessage=reason(error);return false;}
    finally{vaultBusy=false;renderVault();render();renderSecret();}
  }
  const unlockVault=()=>vaultRun(()=>vault.key());
  async function reveal(entry){
    await vaultRun(async()=>{
      const value=await vault.open(entry.id,entry.secret);
      revealed.set(entry.id,[grouped(value.number),value.expiry?`exp ${value.expiry}`:''].filter(Boolean).join(' · '));
      hold();
    });
  }
  function showRecovery(){
    try{
      const code=vault.recoveryCode();
      $('vault-code').replaceChildren(MaskedValue(code),ActionGroup([vaultAction('Hide recovery code',()=>{$('vault-code').replaceChildren();clearTimeout(revealTimer);})],{compact:true}));
      hold();
    }catch(error){vaultMessage=reason(error);renderVault();}
  }
  async function protectedValues(id){
    const number=$('reward-secret-number').value.replace(/[^0-9]/g,''),expiry=$('reward-secret-expiry').value.trim();
    if(!number){
      if(expiry)throw Error('Enter the card number as well, or clear the expiration.');
      return clearSecret?{secret:'',secretHint:''}:{secret:editing?.secret||'',secretHint:editing?.secretHint||''};
    }
    if(!luhnValid(number))throw Error('Check the card number — those digits do not form a valid card number.');
    if(expiry&&!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry))throw Error('Enter the expiration as MM/YY.');
    return {secret:await sealSecret(await vault.key(),id,{number,expiry}),secretHint:number.slice(-4)};
  }
  // With nothing to show, the only useful action is starting an entry, so the
  // empty wallet opens the editor rather than describing where it is.
  function emptyState(){
    if(!loaded)return [Note('Connect in Settings to load your saved rewards.')];
    if(entries.length)return [Note('No matching rewards. Clear the search to see all entries.')];
    return [Note('No saved rewards yet. A points balance, a card credit, or a membership such as a perks program all belong here.'),
      ActionGroup([action('Add a reward',startEntry,'primary')],{compact:true})];
  }
  function startEntry(){clearForm();$('reward-editor').open=true;$('reward-name').focus();}
  function render(){
    const query=$('rewards-search').value.trim().toLowerCase();
    const visible=entries.filter(e=>[e.name,e.source,e.notes,e.value].join(' ').toLowerCase().includes(query));
    $('rewards-list').replaceChildren(...(visible.length?visible.map(e=>{
      const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
      const yes=action('Delete reward',()=>save(e,'DELETE'),'danger');
      const no=action('Keep reward',()=>{confirmation.hidden=true;remove.focus();});
      const confirmation=Stack([Note(`Delete “${e.name}” from your connected devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
      const shown=revealed.get(e.id);
      const actions=[action('Edit',()=>edit(e),'subtle'),
        ...(e.secret?[shown?vaultAction('Hide number',()=>{revealed.delete(e.id);render();renderSecret();}):vaultAction('Show number',()=>reveal(e))]:[]),
        ...(e.state!=='used'&&e.kind==='benefit'?[action('Mark used',()=>save({...e,state:'used',updatedAt:new Date().toISOString()}))]:[]),
        ...(e.url?[Link('Open source',e.url)]:[]),remove];
      if(e.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(e.id,choice))));
      return Stack([RecordRow({title:e.name,detail:`${e.source} · ${e.value} · ${{available:'Available',activation:'Needs activation',used:'Used'}[e.state]}${e.secretHint?` · •••• ${e.secretHint}`:''}${e.due?` · Due ${e.due}`:''}${e.pending?' · Waiting to sync':''}${e.conflict?' · Conflict':''}${e.deleting?' · Pending deletion':''}`,notes:e.notes,actions}),shown?MaskedValue(shown):null,confirmation]);
    }):emptyState()));
    const next=nextActions(entries.filter(e=>!e.deleting&&!e.conflict));
    $('rewards-actions').replaceChildren(...next.map(e=>RecordRow({title:e.reason,detail:`${e.name} · ${e.value}`,actions:[action('Review',()=>edit(e))]})));
    $('rewards-actions').closest('section').hidden=!next.length;
    for(const key of fields)$(`reward-${key}`).disabled=busy||!loaded;
    for(const key of ['number','expiry'])$(`reward-secret-${key}`).disabled=busy||!loaded||vaultBusy;
    $('reward-save').disabled=busy||!loaded;$('reward-cancel').disabled=busy;
  }
  async function run(operation){if(busy)return false;busy=true;const current=++generation;render();try{const token=await credentials.get();if(!token)throw Error('Open Settings to connect this device.');if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. This wallet is reloading for the new connection.');}activeToken=token;const result=await operation(token);if(current!==generation)return false;entries=result.records;loaded=true;syncFailed=false;status(result.syncMessage||'');return true;}catch(error){if(current!==generation)return false;syncFailed=true;status(error.message);$('reward-form-status').textContent=error.message;return false;}finally{busy=false;render();renderVault();}}
  async function save(entry,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/rewards/${entry.id}`,{method,value:entry}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh({quiet=false}={}){if(busy)return;if(!quiet)status(loaded?'Checking for changes…':'Loading rewards…');await run(token=>offline.request(token,'/v1/rewards'));}
  function clear(){generation++;entries=[];editing=null;loaded=false;activeToken='';forget();vault.lock();clearForm();status('Open Settings to connect this device.');render();renderVault();}
  $('rewards-search').addEventListener('input',render);
  $('rewards-connect').addEventListener('click',onSettings);
  $('reward-cancel').addEventListener('click',()=>{clearForm();$('reward-editor').open=false;});
  $('vault-recovery-cancel').addEventListener('click',()=>{$('vault-recovery-code').value='';$('vault-recovery').hidden=true;});
  $('vault-recovery-submit').addEventListener('click',()=>vaultRun(async()=>{
    await vault.unlockWithRecoveryCode($('vault-recovery-code').value);
    $('vault-recovery-code').value='';$('vault-recovery').hidden=true;
  }));
  $('reward-form').addEventListener('submit',async event=>{event.preventDefault();if(busy||!loaded)return;try{
    const base=validateReward({...Object.fromEntries(fields.map(key=>[key,$(`reward-${key}`).value])),id:editing?.id});
    const entry=validateReward({...base,...await protectedValues(base.id)},base.updatedAt);
    if(await save({...entry,revision:editing?.revision??null})){clearForm();$('reward-editor').open=false;}
  }catch(error){$('reward-form-status').textContent=reason(error);}});
  clearForm();render();renderVault();
  const reconnect=()=>{if(!$('reward-editor').open)refresh({quiet:true});};
  window.addEventListener('online',reconnect);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnect();});
  // A failed sync or a queued change retries by itself while the tool is on
  // screen. A conflict waits for the owner's choice instead of retrying.
  const retry=setInterval(()=>{
    if(document.hidden||busy||$('reward-editor').open)return;
    if(syncFailed||entries.some(entry=>entry.pending&&!entry.conflict))refresh({quiet:true});
  },RETRY_MS);
  retry?.unref?.();
  for(const type of ['pointerdown','keydown'])root.addEventListener(type,event=>{if(event.isTrusted)vault.touch();},{capture:true,passive:true});
  // The vault expires on its own schedule; reflect an idle lock without waiting
  // for the next interaction.
  const watch=setInterval(()=>{if(vault.unlocked()!==vaultOpen){forget();renderVault();render();renderSecret();}},1000);
  // Keeping the lock state honest must not keep a host process alive.
  watch?.unref?.();
  return {refresh,clear,stop(){clearInterval(watch);clearInterval(retry);clearTimeout(revealTimer);}};
}
