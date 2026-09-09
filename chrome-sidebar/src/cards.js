import {CardsView,BonusRule,SavedCard,PurchaseConditions,ComparisonResults} from './components/cards.js';
import {Note,Option} from './components/ui.js';
import {normalizeCard,rewardRules,compareCards,normalizePurchase,parseClassification} from './card-data.js';
export function mountCards(root,{credentials,offline,remote}){
  root.replaceChildren(CardsView());
  const $=key=>root.querySelector(`#cards-${key}`);
  const fields=['name','unit','base','cpp','source','checked','notes'];
  for(const input of root.querySelectorAll('input[type=number]')){input.min='0';input.step='any';}
  let token='',records=[],selected=null,newId=crypto.randomUUID(),busy=false,dirty=false,conditionKey='',generation=0;
  const status=(message,target='status')=>{$(target).textContent=message||'';};
  function controls(){
    for(const control of root.querySelectorAll('input,select,textarea,button'))control.disabled=busy||!token;
    for(const key of ['research','classify','connections'])$(key).disabled=busy||!token||globalThis.navigator?.onLine===false;
    $('cpp').disabled=busy||!token||$('unit').value==='cash';
  }
  function clearResults(){conditionKey='';$('conditions').replaceChildren();$('results').replaceChildren();status('','purchase-status');}
  function rules(){return [...$('rules').querySelectorAll('[data-rule]')].map(row=>{
    const input=key=>row.querySelector(`[id$="-${key}"]`).value;
    return {category:input('category'),rate:input('rate'),channel:input('channel'),remaining:input('remaining')===''?null:input('remaining'),active:input('active')==='true',end:input('end'),condition:input('condition')};
  });}
  function renderRules(values){$('rules').replaceChildren(...values.map((value,index)=>BonusRule(value,index,()=>{const current=rules();current.splice(index,1);renderRules(current);dirty=true;})));controls();}
  function populate(card){for(const field of fields)$(field).value=card[field]??'';renderRules(rewardRules(card.rules||'[]'));}
  function edit(card=null){selected=card;newId=crypto.randomUUID();populate(card||{name:'',unit:'cash',base:'',cpp:1,rules:'[]',checked:'',source:'',notes:''});dirty=false;status('','form-status');status('','research-status');}
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
  async function ai(action,value){
    if(!token)throw Error('Connect in Settings first.');
    if(globalThis.navigator?.onLine===false)throw Error('AI needs internet. Choose a category to compare your saved cards offline.');
    const id=$('connection').value;if(!id)throw Error('Choose a saved AI connection below.');
    const current=generation;
    const result=await remote(token,`/v1/ai-connections/${id}/${action}`,{method:'POST',value,timeoutMs:130000});
    if(current!==generation)throw Error('Connection changed. Try again.');return result;
  }
  async function classify(){
    const result=parseClassification(await ai('card-category',{purchase:$('purchase').value.trim()}));
    $('category').value=result.category;clearResults();status(`${result.category} · ${result.confidence} confidence. ${result.reason} Confirm or change the category.`, 'purchase-status');
    return result;
  }
  function comparison(){
    const input=normalizePurchase({amount:$('amount').value,category:$('category').value,channel:$('channel').value});
    if(records.some(c=>!c.deleting&&!c.conflict&&c.unit==='points'&&c.cpp<=0))throw Error('Enter a redemption value above 0 for each points card before comparing.');
    const key=JSON.stringify([input.category,input.channel,records]);
    if(key!==conditionKey){$('conditions').replaceChildren(...PurchaseConditions(records,input));conditionKey=key;}
    const confirmed=[...$('conditions').querySelectorAll('input:checked')].map(node=>node.getAttribute('data-confirm'));
    $('results').replaceChildren(...ComparisonResults(compareCards(records,{...input,confirmed})));controls();
  }
  $('purchase-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!$('category').value){const result=await classify();if(result.confidence==='low'){status(`${result.reason} Confirm the suggested category or choose another, then select Find best card.`,'purchase-status');return;}}
    comparison();if(!$('purchase-status').textContent.includes('confidence'))status('Compared using the selected category.','purchase-status');
  },'purchase-status');});
  $('classify').addEventListener('click',()=>run(classify,'purchase-status'));
  for(const key of ['purchase','category','channel','amount'])$(key).addEventListener('input',()=>{
    if(key==='purchase')$('category').value='';clearResults();
  });
  $('conditions').addEventListener('change',()=>{try{comparison();}catch(error){status(error.message,'purchase-status');}});
  $('add').addEventListener('click',()=>{if(dirty){status('Save or cancel your current edit first.','form-status');return;}edit();$('editor').open=true;$('name').focus();});
  $('add-rule').addEventListener('click',()=>{const values=rules();if(values.length>=20){status('Save up to 20 bonus categories.','form-status');return;}renderRules([...values,{}]);dirty=true;});
  $('unit').addEventListener('change',()=>{if($('unit').value==='cash')$('cpp').value='1';else $('cpp').value='';controls();});
  $('form').addEventListener('input',()=>dirty=true);
  $('cancel').addEventListener('click',()=>{edit();$('editor').open=false;});
  $('research').addEventListener('click',()=>run(async()=>{
    // Keep existing edited terms until a complete, validated result is available.
    const result=await ai('card-research',{name:$('name').value.trim()});populate(normalizeCard(result.card));dirty=true;
    status('Review the issuer source, card variant, rates, activation, remaining caps, and exclusions below. Set your point value if needed, then save.','research-status');
  },'research-status'));
  $('form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const card=normalizeCard({...Object.fromEntries(fields.map(key=>[key,$(key).value])),rules:JSON.stringify(rules())});
    if(card.unit==='points'&&card.cpp<=0)throw Error('Enter your redemption value in cents per point.');
    if(!card.checked)throw Error('Review the card terms and enter the review date before saving.');
    const result=await request(`/v1/cards/${selected?.id||newId}`,{method:'PUT',value:{...card,revision:selected?.revision??null}});
    records=result.records;edit();$('editor').open=false;clearResults();render();status(result.syncMessage||'Card saved.');
  },'form-status');});
  async function refresh(){
    const next=await credentials.get();if(next!==token){generation++;token=next;records=[];edit();clearResults();render();}
    if(!token){status('Connect in Settings to download your cards.');return;}
    const result=await request('/v1/cards');records=result.records;clearResults();render();status(result.syncMessage);await connectionList();
  }
  $('refresh').addEventListener('click',()=>run(refresh));
  $('connections').addEventListener('click',()=>run(connectionList,'ai-status'));
  const reload=()=>{if(!busy)return run(refresh);};
  window.addEventListener('online',reload);window.addEventListener('offline',()=>{controls();status('Offline · Saved cards and manual comparisons are available.');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  credentials.subscribe?.(()=>{generation++;token='';records=[];edit();clearResults();render();reload();});
  render();const ready=run(refresh);return {ready,refresh:reload,clear:()=>{generation++;token='';records=[];edit();clearResults();render();}};
}
