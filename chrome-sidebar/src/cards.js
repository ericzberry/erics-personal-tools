import {CardsView,BonusRule,SavedCard,CardMatches,CardIngest,PurchaseConditions,PurchaseReading,ComparisonResults} from './components/cards.js';
import {Note,Option} from './components/ui.js';
import {normalizeCard,rewardRules,compareCards,normalizePurchase,parsePurchaseIntent} from './card-data.js';
export function mountCards(root,{credentials,offline,remote}){
  root.replaceChildren(CardsView());
  const $=key=>root.querySelector(`#cards-${key}`);
  const fields=['name','unit','base','cpp','source','checked','notes'];
  for(const input of root.querySelectorAll('input[type=number]')){input.min='0';input.step='any';}
  let token='',records=[],selected=null,newId=crypto.randomUUID(),busy=false,dirty=false,conditionKey='',generation=0,reading=null,readFrom='';
  const status=(message,target='status')=>{$(target).textContent=message||'';};
  function controls(){
    for(const control of root.querySelectorAll('input,select,textarea,button'))control.disabled=busy||!token;
    for(const key of ['research','connections'])$(key).disabled=busy||!token||globalThis.navigator?.onLine===false;
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
    return {category:input('category'),rate:input('rate'),channel:input('channel'),remaining:input('remaining')===''?null:input('remaining'),active:input('active')==='true',end:input('end'),condition:input('condition')};
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
      status('That name fits more than one card. Choose the one you hold.','research-status');return;
    }
    const card=normalizeCard(result.card);
    $('matches').replaceChildren();populate(card);dirty=true;
    $('summary').replaceChildren(...CardIngest(card));
    // Only a points card still needs something from the owner, so only it opens
    // the terms; everything else is ready to save after a look at the summary.
    $('details').open=card.unit==='points';
    status(card.unit==='points'
      ?'Found these rewards. Add your redemption value in cents per point, then save.'
      :'Found these rewards. Check them against the issuer terms, then save.','research-status');
  }
  function render(){
    $('list').replaceChildren(...(records.length?records.map(card=>SavedCard(card,{
      onEdit:()=>{if(dirty){status('Save or cancel your current edit first.','form-status');return;}edit(card);$('editor').open=true;$('name').focus();},
      onDelete:()=>run(async()=>{if(dirty)throw Error('Save or cancel your edits before deleting a card.');const result=await request(`/v1/cards/${card.id}`,{method:'DELETE',value:{revision:card.revision}});records=result.records;clearResults();render();status(result.syncMessage||'Card deleted.');}),
      onResolve:choice=>run(async()=>{if(dirty)throw Error('Save or cancel your edits before resolving a conflict.');const result=await offline.resolve(token,card.id,choice);records=result.records;clearResults();render();status(result.syncMessage);})
    })):[Note(token?'Add your first card below.':'Connect this device in Settings to save and sync your cards.')]));controls();
  }
  async function run(action,target='status'){
    if(busy)return;busy=true;controls();status('Working…',target);const current=generation;
    try{await action();}catch(error){if(current===generation)status(error.message||'Could not complete this action. Your input is preserved.',target);}
    finally{busy=false;controls();if(current!==generation)reload();}
  }
  async function request(path,options){const current=generation;const result=await offline.request(token,path,options);if(current!==generation)throw Error('Connection changed.');return result;}
  async function connectionList(){
    if(!token||globalThis.navigator?.onLine===false){status('Offline · Select a category to compare saved cards.','ai-status');return;}
    try{const result=await remote(token,'/v1/ai-connections');const previous=$('connection').value;$('connection').replaceChildren(Option('Choose a connection',''),...result.connections.filter(c=>c.hasApiKey).map(c=>Option(`${c.name} · ${c.provider}`,c.id)));if(result.connections.some(c=>c.id===previous))$('connection').value=previous;else if(result.connections.filter(c=>c.hasApiKey).length===1)$('connection').value=result.connections.find(c=>c.hasApiKey).id;status(result.connections.some(c=>c.hasApiKey)?'':'Save an AI connection in Settings to enable category suggestions.','ai-status');}
    catch(error){status(error.message,'ai-status');}
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
    const id=$('connection').value;if(!id)throw Error(`Choose a saved AI connection below. ${fallback(action)}`);
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
  function comparison(){
    if(!$('category').value)throw Error('Choose a reward category to compare your saved cards.');
    const input=normalizePurchase({amount:$('amount').value,category:$('category').value,channel:$('channel').value});
    if(records.some(c=>!c.deleting&&!c.conflict&&c.unit==='points'&&c.cpp<=0))throw Error('Enter a redemption value above 0 for each points card before comparing.');
    const key=JSON.stringify([input.category,input.channel,records]);
    if(key!==conditionKey){$('conditions').replaceChildren(...PurchaseConditions(records,input));conditionKey=key;}
    const confirmed=[...$('conditions').querySelectorAll('input:checked')].map(node=>node.getAttribute('data-confirm'));
    $('results').replaceChildren(...ComparisonResults(compareCards(records,{...input,confirmed})));controls();
  }
  $('purchase-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    // A changed description invalidates the previous reading; an owner-adjusted
    // reading is kept, so re-comparing never overwrites a manual correction.
    if(!reading||(!reading.manual&&readFrom!==$('purchase').value.trim()))await readPurchase();
    comparison();
    // The reading and the result speak for themselves; only a shaky reading needs a notice.
    status(reading.confidence==='low'?'Compared, but the reading is low confidence. Check the category below.':'','purchase-status');
  },'purchase-status');});
  $('purchase').addEventListener('input',()=>{clearReading();clearResults();});
  // The formatted select dispatches both input and change; the number field only input.
  $('amount').addEventListener('input',()=>{clearResults();manualReading();});
  for(const key of ['category','channel'])$(key).addEventListener('change',()=>{clearResults();manualReading();});
  $('conditions').addEventListener('change',()=>{try{comparison();}catch(error){status(error.message,'purchase-status');}});
  $('add').addEventListener('click',()=>{if(dirty){status('Save or cancel your current edit first.','form-status');return;}edit();$('editor').open=true;$('find').focus();});
  $('add-rule').addEventListener('click',()=>{const values=rules();if(values.length>=20){status('Save up to 20 bonus categories.','form-status');return;}renderRules([...values,{}]);dirty=true;});
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
    if(card.unit==='points'&&card.cpp<=0)throw Error('Enter your redemption value in cents per point.');
    if(!card.checked)throw Error('Review the card terms and enter the review date before saving.');
    const result=await request(`/v1/cards/${selected?.id||newId}`,{method:'PUT',value:{...card,revision:selected?.revision??null}});
    records=result.records;edit();$('editor').open=false;clearResults();render();status(result.syncMessage||'Card saved.');
  },'form-status');});
  async function refresh(){
    const next=await credentials.get();if(next!==token){generation++;token=next;records=[];edit();clearReading();clearResults();render();}
    if(!token){status('Connect in Settings to download your cards.');return;}
    const result=await request('/v1/cards');records=result.records;clearResults();render();status(result.syncMessage);await connectionList();
  }
  $('refresh').addEventListener('click',()=>run(refresh));
  $('connections').addEventListener('click',()=>run(connectionList,'ai-status'));
  const reload=()=>{if(!busy)return run(refresh);};
  window.addEventListener('online',reload);window.addEventListener('offline',()=>{controls();status('Offline · Saved cards and manual comparisons are available.');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  credentials.subscribe?.(()=>{generation++;token='';records=[];edit();clearReading();clearResults();render();reload();});
  render();const ready=run(refresh);return {ready,refresh:reload,clear:()=>{generation++;token='';records=[];edit();clearReading();clearResults();render();}};
}
