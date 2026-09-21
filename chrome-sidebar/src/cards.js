import {CardsView,BonusRule,SavedCard,CardMatches,CardIngest,PurchaseConditions,PurchaseReading,ComparisonResults,WalletCards} from './components/cards.js';
import {Note,setStatus} from './components/ui.js';
import {aiConnections} from './ai-connection.js';
import {normalizeCard,rewardRules,compareCards,normalizePurchase,parsePurchaseIntent,walletCards,merchantPerks} from './card-data.js';
// `wallet` is the Rewards wallet's own store, read and never written. It is
// what already knows which cards the owner holds: a card entry is the card
// itself, and a credit read off an issuer's page carries the card that page
// filed it under. Knowing a card exists costs nothing and is not something to
// be typed in twice, so this tool asks the wallet rather than the owner. A host
// that has no wallet simply has no such cards.
export function mountCards(root,{credentials,offline,remote,wallet=null}){
  root.replaceChildren(CardsView());
  const $=key=>root.querySelector(`#cards-${key}`);
  const fields=['name','unit','base','cpp','source','checked','notes'];
  for(const input of root.querySelectorAll('input[type=number]')){input.min='0';input.step='any';}
  let token='',records=[],selected=null,newId=crypto.randomUUID(),busy=false,dirty=false,conditionKey='',generation=0,reading=null,readFrom='';
  let held=[],downloaded=false,unrated=0;
  const connections=aiConnections({load:async current=>(await remote(current,'/v1/ai-connections')).connections,need:'to read a purchase or look up a card.'});
  const status=(message,target='status',tone='')=>setStatus($(target),message,tone);
  function controls(){
    for(const control of root.querySelectorAll('input,select,textarea,button'))control.disabled=busy||!token;
    $('research').disabled=busy||!token||globalThis.navigator?.onLine===false;
    $('cpp').disabled=busy||!token||$('unit').value==='cash';
  }
  function clearResults(){conditionKey='';$('conditions').replaceChildren();$('results').replaceChildren();status('','purchase-status');}
  function clearReading(){reading=null;readFrom='';$('reading').replaceChildren();$('adjust').hidden=true;$('adjust').open=false;$('category').value='';$('amount').value='';$('channel').value='Direct';}
  // The reading is the only thing between the description and the comparison, so
  // it is always shown and always editable, whether AI or the owner supplied it.
  // Once the controls are revealed they stay reachable, even with no reading yet.
  function showReading(){$('reading').replaceChildren(...PurchaseReading(reading));if(reading)$('adjust').hidden=false;}
  function manualReading(){
    // An owner correction replaces AI's confidence and explanation but keeps the
    // merchant it recognized, which the description still supports.
    reading=$('category').value?{merchant:reading?.merchant||'',category:$('category').value,channel:$('channel').value,
      amount:$('amount').value===''?null:Number($('amount').value),confidence:'high',reason:'',manual:true}:null;
    showReading();
  }
  function rules(){return [...$('rules').querySelectorAll('[data-rule]')].map(row=>{
    const input=key=>row.querySelector(`[id$="-${key}"]`).value;
    return {category:input('category'),rate:input('rate'),channel:input('channel'),merchant:input('merchant'),remaining:input('remaining')===''?null:input('remaining'),active:input('active')==='true',end:input('end'),condition:input('condition')};
  });}
  function renderRules(values){$('rules').replaceChildren(...values.map((value,index)=>BonusRule(value,index,()=>{const current=rules();current.splice(index,1);renderRules(current);dirty=true;})));controls();}
  function populate(card){for(const field of fields)$(field).value=card[field]??'';renderRules(rewardRules(card.rules||'[]'));}
  function edit(card=null){
    selected=card;newId=crypto.randomUUID();populate(card||{name:'',unit:'cash',base:'',cpp:1,rules:'[]',checked:'',source:'',notes:''});dirty=false;
    // The intake is for finding a card, so it never carries over; a saved card
    // opens straight to its terms because there is nothing left to find.
    $('find').value='';$('matches').replaceChildren();$('summary').replaceChildren();$('details').open=Boolean(card);
    status('','form-status');status('','research-status');
  }
  // One rough name is enough. Research identifies the exact product and fills in
  // every rate it found; when several real cards fit the name it asks which one
  // rather than guessing, and nothing is saved until the owner saves it.
  async function ingest(name){
    const result=await ai('card-research',{name});
    if(result.matches){
      $('summary').replaceChildren();
      $('matches').replaceChildren(...CardMatches(result.matches,choice=>run(()=>ingest(choice),'research-status')));
      status('That name fits more than one card. Choose the one you hold.','research-status','alert');return;
    }
    const card=normalizeCard(result.card);
    $('matches').replaceChildren();populate(card);dirty=true;
    $('summary').replaceChildren(...CardIngest(card));
    // Research fills in everything, a point's value included, so the card is
    // ready to save after a look at the summary; the terms stay shut.
    $('details').open=false;
    status('Found these rewards. Check them, then save.','research-status');
  }
  // A card the wallet holds and this tool has no rates for needs only its rates,
  // so the intake is filled with the card's own name and researched as though
  // the owner had typed it. The account digits the issuer printed beside it stay
  // here: research is asked about a product, which is a real card anyone can
  // look up, and never about whose card it is.
  function findRates(row){
    if(dirty){status('Save or cancel your current edit first.','form-status','alert');return;}
    edit();$('editor').open=true;$('find').value=row.product;
    // The editor is where the answer arrives, and it sits under the list the
    // press came from, so it is brought into view rather than left below.
    $('editor').scrollIntoView?.({block:'nearest'});
    run(()=>ingest(row.product),'research-status');
  }
  function renderWallet(){
    const rows=walletCards(held,records).filter(row=>!row.card&&!row.ambiguous);
    unrated=rows.length;
    $('known').replaceChildren(...WalletCards(rows,{onFind:findRates}));
  }
  function render(){
    renderWallet();
    $('list').replaceChildren(...(records.length?records.map(card=>SavedCard(card,{
      onEdit:()=>{if(dirty){status('Save or cancel your current edit first.','form-status','alert');return;}edit(card);$('editor').open=true;$('name').focus();},
      onDelete:()=>run(async()=>{if(dirty)throw Error('Save or cancel your edits before deleting a card.');const result=await request(`/v1/cards/${card.id}`,{method:'DELETE',value:{revision:card.revision}});records=result.records;clearResults();render();status(result.syncMessage||'Card deleted.','status',result.syncMessage?'alert':'success');}),
      onResolve:choice=>run(async()=>{if(dirty)throw Error('Save or cancel your edits before resolving a conflict.');const result=await offline.resolve(token,card.id,choice);records=result.records;clearResults();render();status(result.syncMessage,'status','alert');})
    })):[Note(token?'No cards saved.':'Connect this device in Settings.')]));controls();
  }
  async function run(action,target='status'){
    if(busy)return;busy=true;controls();status('Working…',target,'progress');const current=generation;
    try{await action();}catch(error){if(current===generation)status(error.message||'Could not complete this action. Your input is preserved.',target,'error');}
    finally{busy=false;controls();if(current!==generation)reload();}
  }
  async function request(path,options){const current=generation;const result=await offline.request(token,path,options);if(current!==generation)throw Error('Connection changed.');return result;}
  async function connectionList(){
    if(!token||globalThis.navigator?.onLine===false){status('Offline · Select a category to compare saved cards.','ai-status');return;}
    try{status(await connections.note(token),'ai-status','alert');}
    catch(error){status(error.message,'ai-status','error');}
  }
  // Both AI calls fall back to something the owner can do by hand, so an
  // unavailable model opens the controls that replace it: the reading for a
  // purchase, the card terms for a card.
  function fallback(action){
    if(action==='card-category'){$('adjust').hidden=false;$('adjust').open=true;return 'Set the category below to compare your saved cards offline.';}
    $('details').open=true;return 'Open Card terms below to enter this card yourself.';
  }
  async function ai(action,value){
    if(!token)throw Error('Connect in Settings first.');
    if(globalThis.navigator?.onLine===false)throw Error(`AI needs internet. ${fallback(action)}`);
    let id;
    try{id=await connections.id(token);}catch(error){throw Error(`${error.message} ${fallback(action)}`);}
    const current=generation;
    const result=await remote(token,`/v1/ai-connections/${id}/${action}`,{method:'POST',value,timeoutMs:130000});
    if(current!==generation)throw Error('Connection changed. Try again.');return result;
  }
  async function readPurchase(){
    const description=$('purchase').value.trim();
    if(!description)throw Error('Describe what you are buying.');
    const result=parsePurchaseIntent(await ai('card-category',{purchase:description}));
    reading={...result,manual:false};readFrom=description;
    $('category').value=result.category;$('channel').value=result.channel;$('amount').value=result.amount===null?'':String(result.amount);
    clearResults();showReading();
    return result;
  }
  // What the wallet says each card also gives at this merchant — the monthly
  // credit, the standing discount, the membership that covers the fee. It is
  // not a rate and is never folded into the money; it is what the result says
  // beside the card, because a card that earns a point less and hands back $15
  // of Uber credit is the card to use at Uber.
  function perksAt(merchant){
    const perks=new Map();
    if(!merchant||!held.length)return perks;
    for(const row of walletCards(held,records)){
      if(!row.card||!row.id)continue;
      const found=merchantPerks(held,row.id,merchant);
      if(found.length)perks.set(row.card.id,found);
    }
    return perks;
  }
  function comparison(){
    if(!$('category').value)throw Error('Choose a reward category to compare your saved cards.');
    const input=normalizePurchase({amount:$('amount').value,category:$('category').value,channel:$('channel').value,merchant:reading?.merchant||''});
    if(records.some(c=>!c.deleting&&!c.conflict&&c.unit==='points'&&c.cpp<=0))throw Error('Enter a redemption value above 0 for each points card before comparing.');
    const key=JSON.stringify([input.category,input.channel,input.merchant,records]);
    if(key!==conditionKey){$('conditions').replaceChildren(...PurchaseConditions(records,input));conditionKey=key;}
    const confirmed=[...$('conditions').querySelectorAll('input:checked')].map(node=>node.getAttribute('data-confirm'));
    $('results').replaceChildren(...ComparisonResults(compareCards(records,{...input,confirmed}),
      {unrated,perks:perksAt(input.merchant)}));controls();
  }
  $('purchase-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    // A changed description invalidates the previous reading; an owner-adjusted
    // reading is kept, so re-comparing never overwrites a manual correction.
    if(!reading||(!reading.manual&&readFrom!==$('purchase').value.trim()))await readPurchase();
    comparison();
    // The reading and the result speak for themselves; only a shaky reading needs a notice.
    status(reading.confidence==='low'?'Compared, but the reading is low confidence. Check the category below.':'','purchase-status','alert');
  },'purchase-status');});
  $('purchase').addEventListener('input',()=>{clearReading();clearResults();});
  // The formatted select dispatches both input and change; the number field only input.
  $('amount').addEventListener('input',()=>{clearResults();manualReading();});
  for(const key of ['category','channel'])$(key).addEventListener('change',()=>{clearResults();manualReading();});
  $('conditions').addEventListener('change',()=>{try{comparison();}catch(error){status(error.message,'purchase-status','error');}});
  $('add').addEventListener('click',()=>{if(dirty){status('Save or cancel your current edit first.','form-status','alert');return;}edit();$('editor').open=true;$('find').focus();});
  $('add-rule').addEventListener('click',()=>{const values=rules();if(values.length>=20){status('Save up to 20 bonus categories.','form-status','alert');return;}renderRules([...values,{}]);dirty=true;});
  $('unit').addEventListener('change',()=>{if($('unit').value==='cash')$('cpp').value='1';else $('cpp').value='';controls();});
  $('form').addEventListener('input',()=>dirty=true);
  $('cancel').addEventListener('click',()=>{edit();$('editor').open=false;});
  $('find-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const query=$('find').value.trim();
    if(!query)throw Error('Say which card you have. A rough name is enough.');
    // Existing edited terms survive until a complete, validated result replaces them.
    await ingest(query);
  },'research-status');});
  $('form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const card=normalizeCard({...Object.fromEntries(fields.map(key=>[key,$(key).value])),rules:JSON.stringify(rules())});
    if(card.unit==='points'&&card.cpp<=0){$('details').open=true;throw Error('Enter what one point is worth, in cents.');}
    if(!card.checked)throw Error('Review the card terms and enter the review date before saving.');
    const result=await request(`/v1/cards/${selected?.id||newId}`,{method:'PUT',value:{...card,revision:selected?.revision??null}});
    records=result.records;edit();$('editor').open=false;clearResults();render();status(result.syncMessage||'Card saved.','status',result.syncMessage?'alert':'success');
  },'form-status');});
  // The wallet as this device already has it: no request, no sync, and nothing
  // written back. A device that has never opened Rewards holds no copy of it,
  // so the cards it knows are downloaded once rather than never appearing —
  // and a wallet that cannot be read is another tool's trouble, never this
  // tool's failure, so it leaves the cards saved here exactly as they are.
  async function loadWallet(){
    if(!wallet)return;
    const current=generation;
    try{
      let entries=await wallet.saved(token);
      if(!entries.length&&!downloaded&&globalThis.navigator?.onLine!==false){downloaded=true;entries=(await wallet.request(token,'/v1/rewards')).records;}
      if(current===generation)held=entries;
    }catch{/* Reading it failed; the cards saved here are unaffected. */}
  }
  async function refresh(){
    const next=await credentials.get();if(next!==token){generation++;token=next;records=[];held=[];downloaded=false;edit();clearReading();clearResults();render();}
    if(!token){status('Connect in Settings to download your cards.');return;}
    const result=await request('/v1/cards');records=result.records;clearResults();
    await loadWallet();
    render();status(result.syncMessage,'status','alert');await connectionList();
  }
  $('refresh').addEventListener('click',()=>run(refresh));
  const reload=()=>{if(!busy)return run(refresh);};
  window.addEventListener('online',reload);window.addEventListener('offline',()=>{controls();status('Offline · Saved cards and manual comparisons are available.');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  credentials.subscribe?.(()=>{generation++;token='';records=[];held=[];downloaded=false;edit();clearReading();clearResults();render();reload();});
  render();const ready=run(refresh);return {ready,refresh:reload,clear:()=>{generation++;token='';records=[];held=[];downloaded=false;edit();clearReading();clearResults();render();}};
}
