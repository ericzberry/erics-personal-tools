import {RewardsView,RewardGroup,CardBenefits} from './components/rewards.js';
import {CardMatches} from './components/cards.js';
import {RecordRow,Button,Note,Link,Stack,ActionGroup,MaskedValue,Option,FormField} from './components/ui.js';
import {validateReward,nextActions,luhnValid,parseCardBenefits,CADENCE_LABELS} from './rewards-data.js';
import {sharedVault,sealSecret} from './secret-vault.js';
import {catalogOffers,catalogCategories,offerUrl} from './program-data.js';
const fields=['kind','name','source','card','value','due','cadence','state','url','notes'];
// A revealed number returns to its masked form on its own, so an unattended
// sidebar does not keep a card number on screen.
const REVEAL_MS=60000;
// The wallet syncs on its own: on open, on reconnect, when the tool is shown
// again, and on this timer while a change is still waiting to reach the cloud.
// Nothing here asks the owner to press a refresh button.
const RETRY_MS=60000;
const STATES={available:'Available',activation:'Needs activation',used:'Used'};
const grouped=digits=>digits.replace(/(.{4})/g,'$1 ').trim();
const reason=error=>error?.name==='NotAllowedError'||error?.name==='AbortError'
  ?'Passkey verification was canceled or timed out. Try again when you’re ready.'
  :error?.message||'Protected values could not be unlocked.';
// `programs` is the read-only store of catalogues a reward program publishes,
// filled by whichever browser last visited the program's own site. A host
// without one — a preview, a harness — simply has no offers section.
export function mountRewards(root,{credentials,offline,remote=null,programs=null,onSettings=()=>{},onChanged=()=>{},vault=sharedVault()}){
  root.replaceChildren(RewardsView());
  const $=id=>root.querySelector(`#${id}`);
  let entries=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  let catalogs=[],programCategory='',categorySignature='';
  let vaultBusy=false,vaultMessage='',vaultOpen=false,clearSecret=false,revealTimer=null,syncFailed=false;
  let found=null,connectionsFor='';
  const revealed=new Map();
  const status=text=>{$('rewards-status').textContent=text;};
  const cardStatus=text=>{$('reward-card-status').textContent=text||'';};
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  const connectAction=()=>{const b=Button('Connection settings',{variant:'secondary',size:'compact',disabled:busy});b.addEventListener('click',onSettings);return b;};
  const vaultAction=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:vaultBusy});b.addEventListener('click',fn);return b;};
  function forget(){revealed.clear();clearTimeout(revealTimer);revealTimer=null;$('vault-code').replaceChildren();}
  function hold(){clearTimeout(revealTimer);revealTimer=setTimeout(()=>{forget();renderVault();render();},REVEAL_MS);}
  function edit(entry){
    editing={id:entry.id,revision:entry.revision,secret:entry.secret||'',secretHint:entry.secretHint||''};
    clearSecret=false;
    for(const key of fields)$(`reward-${key}`).value=entry[key]||'';
    $('reward-secret-number').value='';$('reward-secret-expiry').value='';
    renderKind();renderSecret();
    $('reward-editor').open=true;$('reward-name').focus();
  }
  function clearForm(){
    editing=null;clearSecret=false;
    for(const key of fields)$(`reward-${key}`).value=key==='kind'?'balance':key==='state'?'available':'';
    $('reward-secret-number').value='';$('reward-secret-expiry').value='';
    $('reward-form-status').textContent='';
    renderKind();renderSecret();
  }
  // A card is the thing benefits belong to, so it has no card of its own and no
  // reset period; those controls leave rather than sit there meaning nothing.
  function renderKind(){
    const card=$('reward-kind').value==='card';
    if(card)$('reward-card').value='';
    for(const key of ['card','cadence'])$(`reward-${key}`).closest('.form-field').hidden=card;
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
    // The shared vault can be unlocked from Finance or Personal without Rewards
    // having a single card number of its own — that unlock is not this page's
    // business, so Lock now / recovery controls only appear here when Rewards
    // itself has something protected.
    $('vault-status').closest('section').hidden=!entries.some(e=>e.secret);
    root.querySelector('.rewards-wallet').classList.toggle('vault-locked',!open);
    // Open is the quiet state: no banner announcing it, just readable numbers
    // and the controls that still apply. Only a failed attempt speaks up.
    $('vault-status').textContent=vaultMessage||(open?''
      :available?'Locked · Your passkey is required to show a card number.'
      :'Locked · This browser cannot use passkeys. Unlock with your recovery code.');
    $('vault-detail').textContent=open?''
      :'Numbers are sealed with a key only your passkey can derive, so the cloud stores unreadable text. Keep your recovery code safe: without the passkey or that code, a saved number cannot be recovered.';
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
  // With nothing to show, the only useful actions are the two ways in, so the
  // empty wallet offers them rather than describing where they are.
  function emptyState(){
    if(!loaded)return [Note('Connect in Settings to load your saved rewards.')];
    if(entries.length)return [Note('No matching rewards. Clear the search to see all entries.')];
    return [Note('No saved rewards yet. A card you hold, a points balance, a card credit, or a membership such as a perks program all belong here.'),
      ActionGroup([...(remote?[action('Add a card',startCard,'primary')]:[]),action('Add a reward',startEntry,remote?'secondary':'primary')],{compact:true})];
  }
  function startEntry(){clearForm();$('reward-editor').open=true;$('reward-name').focus();}
  // What a program currently offers, read off its own site. Nothing here writes
  // a catalogue, so a load that fails leaves the section with nothing to show
  // rather than an error the owner cannot act on.
  async function loadPrograms(){
    if(!programs)return;
    try{
      const token=await credentials.get();
      catalogs=token?(await programs.request(token,'/v1/rewards/programs')).records||[]:[];
    }catch{catalogs=[];}
    renderPrograms();
  }
  // The picker is rebuilt only when the categories themselves change, so
  // choosing one does not replace the control being used.
  function syncCategories(categories){
    const signature=categories.join('|');
    if(signature===categorySignature)return;
    categorySignature=signature;
    if(!categories.includes(programCategory))programCategory='';
    $('programs-filter').replaceChildren(FormField({id:'programs-category',label:'Category',kind:'select',
      options:[{text:'All categories',value:''},...categories.map(name=>({text:name,value:name}))]}));
    const picker=$('programs-category');
    picker.value=programCategory;
    picker.addEventListener('change',()=>{programCategory=picker.value;renderPrograms();});
  }
  function renderPrograms(){
    const section=$('programs-status').closest('section');
    // No catalogue store, and nothing read yet, come to the same thing: the
    // section has nothing to say and is not shown at all.
    const live=programs?catalogs.filter(catalog=>catalog?.offers?.length):[];
    section.hidden=!live.length;
    if(!live.length){$('programs-list').replaceChildren();$('programs-filter').replaceChildren();categorySignature='';return;}
    syncCategories([...new Set(live.flatMap(catalogCategories))].sort((a,b)=>a.localeCompare(b)));
    const query=$('rewards-search').value;
    const groups=live.map(catalog=>({catalog,offers:catalogOffers(catalog,{query,category:programCategory})})).filter(group=>group.offers.length);
    const total=live.reduce((count,catalog)=>count+catalog.offers.length,0);
    const shown=groups.reduce((count,group)=>count+group.offers.length,0);
    // The date the whole catalogue was last seen at once. A reading taken on a
    // single offer's page refreshes part of it and does not move this on.
    const read=live.map(catalog=>catalog.listedAt||'').filter(Boolean).sort().at(-1);
    // With one program the heading cannot name it, so the status does. With
    // several, each group names itself instead.
    $('programs-status').textContent=[live.length===1?live[0].label:'',
      shown===total?`${total} offer${total===1?'':'s'}`:`${shown} of ${total} offers`,
      read?`read ${read.slice(0,10)}`:''].filter(Boolean).join(' · ');
    $('programs-list').replaceChildren(...(shown?groups.flatMap(({catalog,offers})=>[
      live.length>1?Note(catalog.label):null,
      ...offers.map(offer=>{
        const url=offerUrl(catalog.programId,offer.key);
        return RecordRow({title:offer.name,
          detail:[offer.badge,offer.category,offer.dates].filter(Boolean).join(' · '),
          notes:offer.summary,
          actions:url?[Link('Open offer',url)]:[]});
      })
    ].filter(Boolean)):[Note('No matching offers. Clear the search to see all of them.')]));
  }
  function startCard(){$('reward-card-intake').open=true;$('reward-card-name').focus();}
  const detailOf=e=>[e.source,e.value,e.kind==='card'?'':STATES[e.state],CADENCE_LABELS[e.cadence]||'',
    e.secretHint?`•••• ${e.secretHint}`:'',e.due?`Due ${e.due}`:'',e.pending?'Waiting to sync':'',
    e.conflict?'Conflict':'',e.deleting?'Pending deletion':''].filter(Boolean).join(' · ');
  function row(e){
    const filed=e.kind==='card'?entries.filter(other=>other.card===e.id).length:0;
    const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
    const yes=action('Delete reward',()=>save(e,'DELETE'),'danger');
    const no=action('Keep reward',()=>{confirmation.hidden=true;remove.focus();});
    // Deleting a card leaves its benefits in the wallet rather than taking them
    // with it, which the confirmation has to say before the choice is made.
    const confirmation=Stack([Note(`Delete “${e.name}” from your connected devices?${filed?` Its ${filed} benefit${filed===1?'':'s'} stay in your wallet.`:''}`),ActionGroup([yes,no],{compact:true})],{hidden:true});
    const shown=revealed.get(e.id);
    const actions=[action('Edit',()=>edit(e),'subtle'),
      ...(e.secret?[shown?vaultAction('Hide number',()=>{revealed.delete(e.id);render();renderSecret();}):vaultAction('Show number',()=>reveal(e))]:[]),
      ...(e.state!=='used'&&e.kind==='benefit'?[action('Mark used',()=>save({...e,state:'used',updatedAt:new Date().toISOString()}))]:[]),
      ...(e.url?[Link('Open source',e.url)]:[]),remove];
    if(e.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(e.id,choice))));
    return Stack([RecordRow({title:e.name,detail:detailOf(e),notes:e.notes,actions}),shown?MaskedValue(shown):null,confirmation]);
  }
  function render(){
    const query=$('rewards-search').value.trim().toLowerCase();
    const hit=e=>[e.name,e.source,e.notes,e.value].join(' ').toLowerCase().includes(query);
    const cards=entries.filter(e=>e.kind==='card'),held=new Set(cards.map(card=>card.id));
    // Benefits live inside the card that carries them; a search opens the groups
    // it matched so a benefit is never hidden behind a closed card.
    const groups=cards.map(card=>{
      const filed=entries.filter(e=>e.kind!=='card'&&e.card===card.id);
      return {card,filed,visible:hit(card)?filed:filed.filter(hit),matched:hit(card)||filed.some(hit)};
    }).filter(group=>group.matched);
    const loose=entries.filter(e=>e.kind!=='card'&&!held.has(e.card)&&hit(e));
    const rows=[...groups.map(group=>RewardGroup({
      title:group.card.name,
      detail:[group.card.source,`${group.filed.length} benefit${group.filed.length===1?'':'s'}`,
        group.card.secretHint?`•••• ${group.card.secretHint}`:'',group.card.pending?'Waiting to sync':'',
        group.card.conflict?'Conflict':''].filter(Boolean).join(' · '),
      open:!!query,
      children:[row(group.card),...group.visible.map(row)]
    })),...loose.map(row)];
    $('rewards-list').replaceChildren(...(rows.length?rows:emptyState()));
    const picker=$('reward-card'),chosen=picker.value;
    picker.replaceChildren(Option('Not a card benefit',''),...cards.map(card=>Option(card.name,card.id)));
    picker.value=cards.some(card=>card.id===chosen)?chosen:'';
    const next=nextActions(entries.filter(e=>!e.deleting&&!e.conflict));
    $('rewards-actions').replaceChildren(...next.map(e=>RecordRow({title:e.reason,detail:`${e.name} · ${e.source} · ${e.value}`,actions:[action('Review',()=>edit(e))]})));
    $('rewards-actions').closest('section').hidden=!next.length;
    for(const key of fields)$(`reward-${key}`).disabled=busy||!loaded;
    for(const key of ['number','expiry'])$(`reward-secret-${key}`).disabled=busy||!loaded||vaultBusy;
    $('reward-save').disabled=busy||!loaded;$('reward-cancel').disabled=busy;
    // Finding a card is the one wallet action that needs AI and the network, so
    // it is the one that disappears where neither is available.
    $('reward-card-intake').hidden=!remote;
    $('reward-card-name').disabled=busy||!loaded;
    $('reward-card-connection').disabled=busy||!loaded;
    $('reward-card-find').disabled=busy||!loaded||globalThis.navigator?.onLine===false;
    // The wallet syncs on its own, so the title carries no Refresh. A wallet
    // that never loaded is the one case with something to press.
    $('rewards-connection').replaceChildren(...(loaded?[]:[connectAction()]));
  }
  async function run(operation){if(busy)return false;busy=true;const current=++generation;render();try{const token=await credentials.get();if(!token)throw Error('Open Settings to connect this device.');if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. This wallet is reloading for the new connection.');}activeToken=token;const result=await operation(token);if(current!==generation)return false;entries=result.records;loaded=true;syncFailed=false;status(result.syncMessage||'');return true;}catch(error){if(current!==generation)return false;syncFailed=true;status(error.message);$('reward-form-status').textContent=error.message;return false;}finally{busy=false;render();renderVault();}}
  async function save(entry,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/rewards/${entry.id}`,{method,value:entry}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh({quiet=false}={}){if(busy)return;if(!quiet)status(loaded?'Checking for changes…':'Loading rewards…');await run(token=>offline.request(token,'/v1/rewards'));await connectionList();await loadPrograms();}
  function clear(){generation++;entries=[];editing=null;loaded=false;activeToken='';connectionsFor='';found=null;catalogs=[];forget();vault.lock();clearForm();discardFound();status('Open Settings to connect this device.');render();renderVault();renderPrograms();}
  // The connection list is the only thing this tool reads outside the wallet, so
  // it is fetched once per connection rather than on every automatic sync.
  async function connectionList(){
    if(!remote||!loaded||globalThis.navigator?.onLine===false)return;
    const token=await credentials.get();
    if(!token||connectionsFor===token)return;
    try{
      const result=await remote(token,'/v1/ai-connections');
      const usable=(result.connections||[]).filter(connection=>connection.hasApiKey),chosen=$('reward-card-connection').value;
      $('reward-card-connection').replaceChildren(Option('Choose a connection',''),...usable.map(connection=>Option(`${connection.name} · ${connection.provider}`,connection.id)));
      $('reward-card-connection').value=usable.some(connection=>connection.id===chosen)?chosen:usable.length===1?usable[0].id:'';
      connectionsFor=token;
      if(!usable.length)cardStatus('Save an AI connection in Settings to look up a card.');
    }catch(error){cardStatus(error.message);}
  }
  async function researchCard(name){
    if(!remote)throw Error('Looking up a card is not available here.');
    const token=await credentials.get();
    if(!token)throw Error('Open Settings to connect this device.');
    if(globalThis.navigator?.onLine===false)throw Error('Looking up a card needs internet. Add it by hand below instead.');
    const connection=$('reward-card-connection').value;
    if(!connection)throw Error('Choose a saved AI connection below.');
    const result=await remote(token,`/v1/ai-connections/${connection}/card-benefits`,{method:'POST',value:{name},timeoutMs:130000});
    // A rough name can name more than one real card, so research answers with
    // the products it could be. Choosing one is the only way a card is read.
    if(result.matches){
      found=null;$('reward-card-review').replaceChildren();
      $('reward-card-matches').replaceChildren(...CardMatches(result.matches,choice=>cardRun(()=>researchCard(choice))));
      cardStatus('That name fits more than one card. Choose the one you hold.');
      return;
    }
    // Validated again here: the wallet accepts nothing the API has not proved,
    // and nothing it stores was shaped by a response it did not check.
    found=parseCardBenefits(result);
    $('reward-card-matches').replaceChildren();
    showFound();
    cardStatus(`Found ${found.benefits.length} benefit${found.benefits.length===1?'':'s'}. Review them, then save.`);
  }
  function showFound(){$('reward-card-review').replaceChildren(...CardBenefits(found,{onSave:saveFound,onDiscard:discardFound}));}
  function discardFound(){found=null;$('reward-card-review').replaceChildren();$('reward-card-matches').replaceChildren();cardStatus('');}
  // The card is saved first so its benefits can name it. A failure part way
  // through keeps the benefits that are left in the review list, so nothing
  // researched is lost and saving again finishes the job.
  async function saveFound(){
    if(!found||busy)return;
    const {card,benefits,cardSaved}=found;
    if(!cardSaved&&!await save(card)){cardStatus($('reward-form-status').textContent);return;}
    for(const [index,benefit] of benefits.entries()){
      cardStatus(`Saving benefit ${index+1} of ${benefits.length}…`);
      if(!await save({...benefit,card:card.id})){
        found={card,benefits:benefits.slice(index),cardSaved:true};showFound();
        cardStatus($('reward-form-status').textContent);return;
      }
    }
    const saved=benefits.length;
    discardFound();$('reward-card-name').value='';
    cardStatus(`Saved ${card.name} and ${saved} benefit${saved===1?'':'s'}.`);
  }
  async function cardRun(operation){
    if(busy)return;
    busy=true;render();cardStatus('Looking up this card…');
    try{await operation();}catch(error){cardStatus(reason(error));}
    finally{busy=false;render();}
  }
  $('rewards-search').addEventListener('input',()=>{render();renderPrograms();});
  $('reward-kind').addEventListener('change',renderKind);
  $('reward-cancel').addEventListener('click',()=>{clearForm();$('reward-editor').open=false;});
  $('reward-card-form').addEventListener('submit',event=>{event.preventDefault();
    const name=$('reward-card-name').value.trim();
    if(!name){cardStatus('Say which card you have. A rough name is enough.');return;}
    cardRun(()=>researchCard(name));
  });
  $('vault-recovery-cancel').addEventListener('click',()=>{$('vault-recovery-code').value='';$('vault-recovery').hidden=true;});
  $('vault-recovery-submit').addEventListener('click',()=>vaultRun(async()=>{
    await vault.unlockWithRecoveryCode($('vault-recovery-code').value);
    $('vault-recovery-code').value='';$('vault-recovery').hidden=true;
  }));
  $('reward-form').addEventListener('submit',async event=>{event.preventDefault();if(busy||!loaded)return;try{
    const values=Object.fromEntries(fields.map(key=>[key,$(`reward-${key}`).value]));
    if(values.kind==='card')values.card='';
    const base=validateReward({...values,id:editing?.id});
    const entry=validateReward({...base,...await protectedValues(base.id)},base.updatedAt);
    if(await save({...entry,revision:editing?.revision??null})){clearForm();$('reward-editor').open=false;}
  }catch(error){$('reward-form-status').textContent=reason(error);}});
  clearForm();render();renderVault();renderPrograms();
  const reconnect=()=>{if(!$('reward-editor').open)refresh({quiet:true});};
  window.addEventListener('online',reconnect);
  // Losing the network takes Find card benefits with it, so the control says so
  // rather than waiting for a press to explain itself.
  window.addEventListener('offline',render);
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
