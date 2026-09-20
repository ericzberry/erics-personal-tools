import {RewardsView,RewardGroup,CardBenefits,BalancePanel,BalanceTotals} from './components/rewards.js';
import {CardMatches} from './components/cards.js';
import {RecordRow,Button,RowAction,RowLink,EDIT_GLYPH,DELETE_GLYPH,DONE_GLYPH,SHOW_GLYPH,HIDE_GLYPH,OPEN_GLYPH,Note,Link,Stack,ActionGroup,MaskedValue,Option,FormField,setStatus} from './components/ui.js';
import {validateReward,nextActions,luhnValid,parseCardBenefits,CADENCE_LABELS} from './rewards-data.js';
import {sharedVault,sealSecret} from './secret-vault.js';
import {catalogOffers,catalogGroups,catalogCategories,offerUrl} from './program-data.js';
import {balanceTotals,parseBalanceReading,matchBalances,balanceRecord,directoryBalances,UNREAD_BALANCE} from './balance-data.js';
import {LOYALTY_PROGRAMS} from './loyalty-sites.js';
import {aiConnections} from './ai-connection.js';
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
// `readPage` is the host's ability to read the tab the owner is looking at. The
// sidebar sits beside that tab and supplies it; a full tab and the phone have
// no such page, so they pass nothing and the balance panel never appears.
export function mountRewards(root,{credentials,offline,remote=null,programs=null,readPage=null,onSettings=()=>{},onChanged=()=>{},vault=sharedVault()}){
  root.replaceChildren(RewardsView());
  const $=id=>root.querySelector(`#${id}`);
  let entries=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  let catalogs=[],programCategory='',categorySignature='';
  // The loyalty program whose site is open beside the panel, and what was read
  // off it. A reading is a proposal until it is saved: the figures are shown as
  // they will be stored, and nothing is written by reading.
  let site=null,balances=null;
  let vaultBusy=false,vaultMessage='',vaultOpen=false,clearSecret=false,revealTimer=null,syncFailed=false;
  let found=null,connectionsFor='';
  const connections=aiConnections({load:async token=>(await remote(token,'/v1/ai-connections')).connections,need:'to read a balance off a page or look up a card.'});
  const revealed=new Map();
  const status=(text,tone='')=>setStatus($('rewards-status'),text,tone);
  const cardStatus=(text,tone='')=>setStatus($('reward-card-status'),text,tone);
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  const connectAction=()=>{const b=Button('Connection settings',{variant:'secondary',size:'compact',disabled:busy});b.addEventListener('click',onSettings);return b;};
  const vaultAction=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:vaultBusy});b.addEventListener('click',fn);return b;};
  // A reward's own verbs, at the end of its line and named for the reward they
  // would act on. The two that reach the vault answer to the vault's own busy
  // state rather than to the list's.
  const rowAction=(glyph,label,fn,danger=false)=>RowAction(glyph,label,fn,{danger,disabled:busy||!loaded});
  const vaultRowAction=(glyph,label,fn)=>RowAction(glyph,label,fn,{disabled:vaultBusy});
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
    setStatus($('reward-form-status'),'');
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
    // A failed attempt is an error. Being locked is the state the section is
    // plainly in, so it is said quietly and wears no tone.
    setStatus($('vault-status'),vaultMessage||(open?''
      :available?'Locked · Your passkey is required to show a card number.'
      :'Locked · This browser cannot use passkeys. Unlock with your recovery code.'),vaultMessage?'error':'');
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
    // The actions say what belongs here; a sentence listing the four kinds of
    // reward said it again in longer form, above the two buttons that offer it.
    return [ActionGroup([...(remote?[action('Add a card',startCard,'primary')]:[]),
      action('Add a reward',startEntry,remote?'secondary':'primary')],{compact:true})];
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
    // What is listed, plainly — not a result and nothing to act on, so it
    // takes no tone.
    setStatus($('programs-status'),[live.length===1?live[0].label:'',
      shown===total?`${total} offer${total===1?'':'s'}`:`${shown} of ${total} offers`,
      read?`read ${read.slice(0,10)}`:''].filter(Boolean).join(' · '));
    // One row per offer, and — unless the owner has already narrowed the list —
    // those rows live inside a group per category with what is new on top, so a
    // catalogue of a hundred offers costs a handful of closed lines instead of
    // a screen the wallet below it never gets past.
    const offerRow=(catalog,offer)=>{
      const url=offerUrl(catalog.programId,offer.key);
      return RecordRow({title:offer.name,
        detail:[offer.badge,offer.category,offer.dates].filter(Boolean).join(' · '),
        notes:offer.summary,
        actions:url?[RowLink(OPEN_GLYPH,`Open the ${offer.name} offer`,url)]:[]});
    };
    $('programs-list').replaceChildren(...(shown?groups.flatMap(({catalog})=>[
      live.length>1?Note(catalog.label):null,
      ...catalogGroups(catalog,{query,category:programCategory}).flatMap(group=>group.flat
        ? group.offers.map(offer=>offerRow(catalog,offer))
        : [RewardGroup({title:group.label,
            detail:`${group.offers.length} offer${group.offers.length===1?'':'s'}`,
            open:group.open,
            children:group.offers.map(offer=>offerRow(catalog,offer))})])
    ].filter(Boolean)):[Note('No matching offers. Clear the search to see all of them.')]));
  }
  // Offered only where all three hold: a program's own page beside the panel, a
  // host that can read it, and a connection that can be asked to. Anywhere else
  // the panel is not there to be pressed.
  function renderBalances(){
    const show=!!site&&!!readPage&&!!remote;
    $('balance-panel').hidden=!show;
    if(!show){$('balance-body').replaceChildren();setStatus($('balance-status'),'');return;}
    $('balance-body').replaceChildren(BalancePanel({
      site,rows:balances||[],disabled:busy||!loaded,
      onRead:readBalances,onSave:saveBalances,
      onDiscard:()=>{balances=null;renderBalances();balanceStatus('');}
    }));
  }
  const balanceStatus=(text,tone='')=>setStatus($('balance-status'),text,tone);
  // One press does the whole errand: read the page beside the panel, turn it
  // into one figure per program, and show them. Nothing is saved yet.
  async function readBalances(){
    if(!site||!readPage||!remote||busy)return;
    busy=true;render();balanceStatus(`Reading your ${site.label} balance…`,'progress');
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      const connection=await connections.id(token);
      const page=await readPage();
      const result=await remote(token,`/v1/ai-connections/${connection}/balance-intake`,
        {method:'POST',value:{text:page.text,program:site.label,source:site.source,unit:site.unit},timeoutMs:130000});
      // Checked here too: the wallet accepts nothing the API has not proved.
      const rows=matchBalances(parseBalanceReading(result,site),entries);
      balances=rows.length?rows:null;
      balanceStatus(rows.length
        ?`${rows.length} balance${rows.length===1?'':'s'} read. Nothing is saved yet.`
        :[`No balance was found on that page. Open your account page and read again.`,result.unread||''].filter(Boolean).join(' '),rows.length?'success':'alert');
    }catch(error){balanceStatus(reason(error),'error');}
    finally{busy=false;render();renderBalances();}
  }
  // Saved one at a time through the same validator and queue as a typed edit.
  // A balance that fails leaves itself and the rest in place to be corrected.
  async function saveBalances(){
    if(!balances?.length)return;
    let saved=0;
    while(balances.length){
      const [row]=balances,match=row.ambiguous?null:row.match;
      const entry=balanceRecord(row,match);
      if(!await save({...entry,id:match?.id||entry.id,revision:match?.revision??null})){renderBalances();balanceStatus($('rewards-status').textContent,'error');return;}
      balances=balances.slice(1);saved++;
    }
    balances=null;renderBalances();
    balanceStatus(`Saved ${saved} balance${saved===1?'':'s'}.`,'success');
  }
  function startCard(){$('reward-card-intake').open=true;$('reward-card-name').focus();}
  // The wallet as a directory of programs. Every program this tool recognizes
  // arrives as a balance with no figure in it and the page its balance is
  // printed on, so reaching that page is one press; the owner then deletes the
  // ones they do not hold, which is one press each. A program already in the
  // wallet is never added twice, so pressing this again after pruning brings
  // back only what was never there — and a save that stops part way says how
  // far it got rather than losing the rest.
  async function addDirectory(){
    if(busy||!loaded)return;
    const pending=directoryBalances(LOYALTY_PROGRAMS,entries);
    if(!pending.length){status('Every program this tool knows is already in your wallet.','success');return;}
    let saved=0;
    for(const entry of pending){
      if(!await save(entry)){status(`Added ${saved} of ${pending.length} programs. Press again to add the rest.`,'error');return;}
      saved++;
    }
    status(`Added ${saved} program${saved===1?'':'s'}. Delete the ones you do not have, and read a balance from any program's own page.`,'success');
  }
  // A program awaiting its first reading already says so in its value, and
  // "Available" after it states nothing the row does not. A card carries no
  // state either, for the same reason it carries no deadline.
  const detailOf=e=>[e.source,e.value,
    e.kind==='card'||(e.kind==='balance'&&e.value===UNREAD_BALANCE)?'':STATES[e.state],CADENCE_LABELS[e.cadence]||'',
    e.secretHint?`•••• ${e.secretHint}`:'',e.due?`Due ${e.due}`:'',e.pending?'Waiting to sync':'',
    e.conflict?'Conflict':'',e.deleting?'Pending deletion':''].filter(Boolean).join(' · ');
  function row(e){
    const filed=e.kind==='card'?entries.filter(other=>other.card===e.id).length:0;
    // A program awaiting its first reading holds nothing the owner would miss,
    // so pruning the directory down to the programs they actually have costs
    // one press per row. Everything else still asks, because everything else
    // has something in it to lose.
    const unread=e.kind==='balance'&&e.value===UNREAD_BALANCE;
    const remove=rowAction(DELETE_GLYPH,`Delete ${e.name}`,
      unread?()=>save(e,'DELETE'):()=>{confirmation.hidden=false;yes.focus();},true);
    const yes=action('Delete reward',()=>save(e,'DELETE'),'danger');
    const no=action('Keep reward',()=>{confirmation.hidden=true;remove.focus();});
    // Deleting a card leaves its benefits in the wallet rather than taking them
    // with it, which the confirmation has to say before the choice is made.
    const confirmation=Stack([Note(`Delete “${e.name}” from your connected devices?${filed?` Its ${filed} benefit${filed===1?'':'s'} stay in your wallet.`:''}`),ActionGroup([yes,no],{compact:true})],{hidden:true});
    const shown=revealed.get(e.id);
    const actions=[rowAction(EDIT_GLYPH,`Edit ${e.name}`,()=>edit(e)),
      ...(e.secret?[shown
        ?vaultRowAction(HIDE_GLYPH,`Hide the number for ${e.name}`,()=>{revealed.delete(e.id);render();renderSecret();})
        :vaultRowAction(SHOW_GLYPH,`Show the number for ${e.name}`,()=>reveal(e))]:[]),
      ...(e.state!=='used'&&e.kind==='benefit'?[rowAction(DONE_GLYPH,`Mark ${e.name} used`,()=>save({...e,state:'used',updatedAt:new Date().toISOString()}))]:[]),
      ...(e.url?[RowLink(OPEN_GLYPH,`Open the source for ${e.name}`,e.url)]:[]),remove];
    // A conflict is a question this reward is asking; it waits in words under
    // the line rather than becoming one more glyph on it.
    const decide=e.conflict
      ?[ActionGroup(['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(e.id,choice))),{compact:true})]
      :[];
    return RecordRow({title:e.name,detail:detailOf(e),notes:e.notes,actions,
      extra:[shown?MaskedValue(shown):null,...decide,confirmation]});
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
    $('rewards-actions').replaceChildren(...next.map(e=>RecordRow({title:e.reason,detail:`${e.name} · ${e.source} · ${e.value}`,actions:[rowAction(EDIT_GLYPH,`Review ${e.name}`,()=>edit(e))]})));
    $('rewards-actions').closest('section').hidden=!next.length;
    // What the owner came to the wallet to know: how many miles and how many
    // points they hold, counted separately and never added together.
    const totals=balanceTotals(entries.filter(e=>!e.deleting));
    $('rewards-totals').hidden=!totals.totals.length;
    $('rewards-totals').replaceChildren(...BalanceTotals(totals));
    for(const key of fields)$(`reward-${key}`).disabled=busy||!loaded;
    for(const key of ['number','expiry'])$(`reward-secret-${key}`).disabled=busy||!loaded||vaultBusy;
    $('reward-save').disabled=busy||!loaded;$('reward-cancel').disabled=busy;
    // Finding a card is the one wallet action that needs AI and the network, so
    // it is the one that disappears where neither is available.
    $('reward-card-intake').hidden=!remote;
    $('reward-card-name').disabled=busy||!loaded;
    $('reward-card-find').disabled=busy||!loaded||globalThis.navigator?.onLine===false;
    // The wallet syncs on its own, so the title carries no Refresh. A wallet
    // that never loaded is the one case with something to press.
    // Offered only while the wallet holds no program at all: once the directory
    // is in, pruning it is the work, and an Add that re-adds what was just
    // deleted would be the loudest thing on the screen.
    const holdsPrograms=entries.some(e=>e.kind==='balance'&&!e.deleting);
    $('wallet-actions').replaceChildren(...(loaded&&!holdsPrograms
      ?[action('Add the points programs',addDirectory,'secondary')]:[]));
    $('rewards-connection').replaceChildren(...(loaded?[]:[connectAction()]));
    for(const node of $('balance-panel').querySelectorAll('button'))node.disabled=busy||!loaded;
  }
  async function run(operation){if(busy)return false;busy=true;const current=++generation;render();try{const token=await credentials.get();if(!token)throw Error('Open Settings to connect this device.');if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. This wallet is reloading for the new connection.');}activeToken=token;const result=await operation(token);if(current!==generation)return false;entries=result.records;loaded=true;syncFailed=false;status(result.syncMessage||'','alert');return true;}catch(error){if(current!==generation)return false;syncFailed=true;status(error.message,'error');setStatus($('reward-form-status'),error.message,'error');return false;}finally{busy=false;render();renderVault();}}
  async function save(entry,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/rewards/${entry.id}`,{method,value:entry}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh({quiet=false}={}){if(busy)return;if(!quiet)status(loaded?'Checking for changes…':'Loading rewards…','progress');await run(token=>offline.request(token,'/v1/rewards'));await connectionList();await loadPrograms();}
  function clear(){generation++;entries=[];editing=null;loaded=false;activeToken='';connectionsFor='';found=null;catalogs=[];balances=null;connections.forget();forget();vault.lock();clearForm();discardFound();status('Open Settings to connect this device.');render();renderVault();renderPrograms();renderBalances();}
  // Whether a connection exists at all is the only thing worth saying, and it
  // is checked once per connected device rather than on every automatic sync.
  async function connectionList(){
    if(!remote||!loaded||globalThis.navigator?.onLine===false)return;
    const token=await credentials.get();
    if(!token||connectionsFor===token)return;
    try{
      const note=await connections.note(token);
      connectionsFor=token;
      if(note)cardStatus(note,'alert');
    }catch(error){cardStatus(error.message,'error');}
  }
  async function researchCard(name){
    if(!remote)throw Error('Looking up a card is not available here.');
    const token=await credentials.get();
    if(!token)throw Error('Open Settings to connect this device.');
    if(globalThis.navigator?.onLine===false)throw Error('Looking up a card needs internet. Add it by hand below instead.');
    const connection=await connections.id(token);
    const result=await remote(token,`/v1/ai-connections/${connection}/card-benefits`,{method:'POST',value:{name},timeoutMs:130000});
    // A rough name can name more than one real card, so research answers with
    // the products it could be. Choosing one is the only way a card is read.
    if(result.matches){
      found=null;$('reward-card-review').replaceChildren();
      $('reward-card-matches').replaceChildren(...CardMatches(result.matches,choice=>cardRun(()=>researchCard(choice))));
      cardStatus('That name fits more than one card. Choose the one you hold.','alert');
      return;
    }
    // Validated again here: the wallet accepts nothing the API has not proved,
    // and nothing it stores was shaped by a response it did not check.
    found=parseCardBenefits(result);
    $('reward-card-matches').replaceChildren();
    showFound();
    cardStatus(`Found ${found.benefits.length} benefit${found.benefits.length===1?'':'s'}. Review them, then save.`,'success');
  }
  function showFound(){$('reward-card-review').replaceChildren(...CardBenefits(found,{onSave:saveFound,onDiscard:discardFound}));}
  function discardFound(){found=null;$('reward-card-review').replaceChildren();$('reward-card-matches').replaceChildren();cardStatus('');}
  // The card is saved first so its benefits can name it. A failure part way
  // through keeps the benefits that are left in the review list, so nothing
  // researched is lost and saving again finishes the job.
  async function saveFound(){
    if(!found||busy)return;
    const {card,benefits,cardSaved}=found;
    if(!cardSaved&&!await save(card)){cardStatus($('reward-form-status').textContent,'error');return;}
    for(const [index,benefit] of benefits.entries()){
      cardStatus(`Saving benefit ${index+1} of ${benefits.length}…`,'progress');
      if(!await save({...benefit,card:card.id})){
        found={card,benefits:benefits.slice(index),cardSaved:true};showFound();
        cardStatus($('reward-form-status').textContent,'error');return;
      }
    }
    const saved=benefits.length;
    discardFound();$('reward-card-name').value='';
    cardStatus(`Saved ${card.name} and ${saved} benefit${saved===1?'':'s'}.`,'success');
  }
  async function cardRun(operation){
    if(busy)return;
    busy=true;render();cardStatus('Looking up this card…','progress');
    try{await operation();}catch(error){cardStatus(reason(error),'error');}
    finally{busy=false;render();}
  }
  $('rewards-search').addEventListener('input',()=>{render();renderPrograms();});
  $('reward-kind').addEventListener('change',renderKind);
  $('reward-cancel').addEventListener('click',()=>{clearForm();$('reward-editor').open=false;});
  $('reward-card-form').addEventListener('submit',event=>{event.preventDefault();
    const name=$('reward-card-name').value.trim();
    if(!name){cardStatus('Say which card you have. A rough name is enough.','alert');return;}
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
  }catch(error){setStatus($('reward-form-status'),reason(error),'error');}});
  clearForm();render();renderVault();renderPrograms();renderBalances();
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
  return {refresh,clear,
    // The tab beside the panel, as the host already knows it. Leaving a
    // program's page takes the reading with it: a figure read off one program's
    // site has nothing to say beside another's.
    site(program=null){
      if((program?.id||'')===(site?.id||''))return;
      site=program||null;balances=null;
      renderBalances();
    },
    stop(){clearInterval(watch);clearInterval(retry);clearTimeout(revealTimer);}};
}
