import {AdvisorView,AdviceConditions,Advice,StandingAdvice} from './components/purchase-advisor.js';
import {PurchaseReading} from './components/cards.js';
import {setStatus} from './components/ui.js';
import {aiConnections} from './ai-connection.js';
import {parsePurchaseIntent,normalizeCard,walletCards,key as cardKey} from './card-data.js';
import {advise,bestByCategory} from './purchase-data.js';
// A card the wallet holds with no earning terms is looked up by itself, once
// per card per device and again a week after an attempt that found nothing,
// so a card is compared without anyone having to ask for its rates and an
// answer research cannot give is not asked for on every open.
const RESEARCH_KEY='rewards-rate-research',RESEARCH_AGAIN_MS=7*86400000;
const tried=()=>{try{return JSON.parse(globalThis.localStorage?.getItem(RESEARCH_KEY)||'{}')||{};}catch{return {};}};
const markTried=name=>{try{globalThis.localStorage?.setItem(RESEARCH_KEY,JSON.stringify({...tried(),[cardKey(name)]:Date.now()}));}catch{/* Asked again next time. */}};
// Three stores, none of them this tool's. `cards` is Best card's, `wallet` is
// Rewards', `programs` holds the offer catalogues; every one is read and never
// written, so what is in them stays those tools' to change. A host that has no
// programs store simply has no offers.
export function mountPurchaseAdvisor(root,{credentials,cards,wallet=null,programs=null,remote,onSettings=()=>{},onChanged=()=>{},embedded=false}){
  root.replaceChildren(AdvisorView({embedded}));
  const $=key=>root.querySelector(`#advisor-${key}`);
  let token='',generation=0,busy=false,filling=false,reading=null,readFrom='',records=[],held=[],catalogs=[],conditionKey='';
  const connections=aiConnections({load:async current=>(await remote(current,'/v1/ai-connections')).connections,need:'to read a purchase.'});
  const status=(message,target='status',tone='')=>setStatus($(target),message,tone);
  function controls(){for(const control of root.querySelectorAll('input,select,textarea,button'))control.disabled=busy||!token;}
  function clearResult(){conditionKey='';$('conditions').replaceChildren();$('result').replaceChildren();status('','purchase-status');}
  function clearReading(){reading=null;readFrom='';$('reading').replaceChildren();$('adjust').hidden=true;$('adjust').open=false;$('category').value='';$('amount').value='';$('channel').value='Direct';}
  function showReading(){$('reading').replaceChildren(...PurchaseReading(reading));if(reading)$('adjust').hidden=false;}
  // An owner correction replaces AI's confidence and explanation but keeps the
  // merchant it recognized, which the description still supports.
  function manualReading(){
    reading=$('category').value?{merchant:reading?.merchant||'',category:$('category').value,channel:$('channel').value,
      amount:$('amount').value===''?null:Number($('amount').value),confidence:'high',reason:'',manual:true}:null;
    showReading();
  }
  async function run(action,target='status'){
    if(busy)return;busy=true;controls();status('Working…',target,'progress');const current=generation;
    try{await action();}catch(error){if(current===generation)status(error.message||'Could not complete this action. Your input is preserved.',target,'error');}
    finally{busy=false;controls();}
  }
  // The reading falls back to something the owner can do by hand, so an
  // unavailable model opens the controls that replace it.
  function fallback(){$('adjust').hidden=false;$('adjust').open=true;return 'Set the category below to compare your saved cards offline.';}
  async function ai(value){
    if(!token)throw Error('Connect in Settings first.');
    if(globalThis.navigator?.onLine===false)throw Error(`AI needs internet. ${fallback()}`);
    let id;
    try{id=await connections.id(token);}catch(error){throw Error(`${error.message} ${fallback()}`);}
    const current=generation;
    const result=await remote(token,`/v1/ai-connections/${id}/card-category`,{method:'POST',value,timeoutMs:130000});
    if(current!==generation)throw Error('Connection changed. Try again.');return result;
  }
  async function readPurchase(){
    const description=$('purchase').value.trim();
    if(!description)throw Error('Describe what you are buying.');
    const result=parsePurchaseIntent(await ai({purchase:description}));
    reading={...result,manual:false};readFrom=description;
    $('category').value=result.category;$('channel').value=result.channel;$('amount').value=result.amount===null?'':String(result.amount);
    clearResult();showReading();
  }
  function recommend(){
    if(!$('category').value)throw Error('Choose a reward category to compare your saved cards.');
    const purchase={amount:$('amount').value,category:$('category').value,channel:$('channel').value,merchant:reading?.merchant||''};
    if(records.some(card=>!card.deleting&&!card.conflict&&card.unit==='points'&&card.cpp<=0))throw Error('Enter a planning value above 0 for each points card under Card rates before comparing.');
    const key=JSON.stringify([purchase.category,purchase.channel,purchase.merchant,records]);
    if(key!==conditionKey){$('conditions').replaceChildren(...AdviceConditions(records,purchase));conditionKey=key;}
    const confirmed=[...$('conditions').querySelectorAll('input:checked')].map(node=>node.getAttribute('data-confirm'));
    $('result').replaceChildren(...Advice(advise({cards:records,wallet:held,catalogs,purchase,confirmed})));controls();
  }
  $('form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    // A changed description invalidates the previous reading; an owner-adjusted
    // reading is kept, so asking again never overwrites a manual correction.
    if(!reading||(!reading.manual&&readFrom!==$('purchase').value.trim()))await readPurchase();
    recommend();
    status(reading.confidence==='low'?'Compared, but the reading is low confidence. Check the category below.':'','purchase-status','alert');
  },'purchase-status');});
  $('purchase').addEventListener('input',()=>{clearReading();clearResult();});
  $('amount').addEventListener('input',()=>{clearResult();manualReading();});
  for(const key of ['category','channel'])$(key).addEventListener('change',()=>{clearResult();manualReading();});
  $('conditions').addEventListener('change',()=>{try{recommend();}catch(error){status(error.message,'purchase-status','error');}});
  // Each store's copy, brought up to date when the network is there and read as
  // it stands when it is not. A store that cannot be read is another tool's
  // trouble: the recommendation is made from whatever the rest hold.
  async function read(store,path){
    if(!store)return [];
    try{
      if(globalThis.navigator?.onLine===false)return await store.saved(token);
      return (await store.request(token,path)).records||[];
    }catch{try{return await store.saved(token);}catch{return [];}}
  }
  async function connectionList(){
    if(!token||globalThis.navigator?.onLine===false){status('Offline · Select a category to compare saved cards.','ai-status');return;}
    try{status(await connections.note(token),'ai-status','alert');}
    catch(error){status(error.message,'ai-status','error');}
  }
  async function refresh(){
    const next=await credentials.get();
    if(next!==token){generation++;token=next;records=[];held=[];catalogs=[];clearReading();clearResult();}
    if(!token){controls();status('Connect in Settings to download your cards.');return;}
    const current=generation;
    const [found,entries,lists]=await Promise.all([read(cards,'/v1/cards'),read(wallet,'/v1/rewards'),read(programs,'/v1/rewards/programs')]);
    if(current!==generation)return;
    // A card, a credit or an offer saved since the last answer changes it, so
    // the answer is worked out again over the new records rather than left
    // standing or wiped; a refresh that found nothing new touches nothing.
    const changed=JSON.stringify([found,entries,lists])!==JSON.stringify([records,held,catalogs]);
    records=found;held=entries;catalogs=lists;
    if(changed&&$('result').children.length){try{recommend();}catch(error){clearResult();status(error.message,'purchase-status','error');}}
    controls();renderStanding();
    status(records.length||unrated().length?'':'No card has earning rates yet. Add them under Card rates.');
    await connectionList();
    fillRates();
  }
  // The cards the wallet holds that nothing here has rates for. One whose
  // name fits several saved cards already has rates under one of them.
  const unrated=()=>walletCards(held,records).filter(row=>!row.card&&!row.ambiguous);
  function renderStanding(){
    const rows=bestByCategory({cards:records,wallet:held});
    const missing=filling?[]:unrated().map(row=>({name:row.product,hint:row.digits}));
    $('standing-group').hidden=!rows.length&&!missing.length&&!filling;
    $('standing').replaceChildren(...StandingAdvice(rows,missing));
  }
  // Research each unrated card in turn and save what it finds under the name
  // the wallet already calls it, so the two are one card from then on. The
  // terms stay editable under Card rates; nothing else about the card is
  // touched, and a name research could not settle is left for the owner.
  async function fillRates(){
    if(filling||!token||globalThis.navigator?.onLine===false)return;
    const seen=tried(),now=Date.now();
    const due=unrated().filter(row=>!(now-(seen[cardKey(row.product)]||0)<RESEARCH_AGAIN_MS));
    if(!due.length)return;
    let id;try{id=await connections.id(token);}catch{return;}
    filling=true;renderStanding();
    const current=generation,today=new Date().toISOString().slice(0,10);
    let saved=0;
    try{
      for(const [index,row] of due.entries()){
        if(current!==generation)return;
        status(`Finding rates for ${row.product}${due.length>1?` (${index+1} of ${due.length})`:''}`,'fill-status','progress');
        markTried(row.product);
        try{
          const result=await remote(token,`/v1/ai-connections/${id}/card-research`,{method:'POST',value:{name:row.product},timeoutMs:130000});
          if(!result?.card)continue;
          const card=normalizeCard({...result.card,name:row.product,checked:result.card.checked||today});
          if(card.unit==='points'&&!(card.cpp>0))continue;
          const stored=await cards.request(token,`/v1/cards/${crypto.randomUUID()}`,{method:'PUT',value:{...card,revision:null}});
          if(current!==generation)return;
          records=stored.records||records;saved++;
        }catch{/* This card stays named as not compared. */}
      }
    }finally{
      filling=false;
      if(current===generation){status('','fill-status');renderStanding();if($('result').children.length){try{recommend();}catch{/* The last answer stands. */}}}
      if(saved)onChanged();
    }
  }
  const reload=()=>{if(!busy)return run(refresh);};
  window.addEventListener('online',reload);
  window.addEventListener('offline',()=>{controls();status('Offline · Saved cards, credits and offers are available.');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  const clear=()=>{generation++;token='';records=[];held=[];catalogs=[];clearReading();clearResult();controls();status('Connect in Settings to download your cards.');};
  credentials.subscribe?.(()=>{clear();reload();});
  controls();const ready=run(refresh);
  return {ready,refresh:reload,clear,settings:onSettings};
}
