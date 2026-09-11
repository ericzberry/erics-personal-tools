import {MobileRestaurantWorkspace,MobileRestaurantCandidate} from './shared/components/restaurant-views.js';
import {Option} from './shared/components/ui.js';
import {searchInput,localDate,partySizes,searchDates,isNYC,bookingURL,searchTimes} from './shared/restaurant-search.js';

export function mountRestaurants(root,{credentials,request,cache,loadConnections,online=()=>navigator.onLine!==false}) {
  root.replaceChildren(MobileRestaurantWorkspace());
  const $=name=>root.querySelector(`#restaurant-${name}`);
  const fields={mode:'mode',query:'query',city:'city',neighborhood:'neighborhood',date:'date',through:'endDate',start:'startTime',end:'endTime',party:'partySize',min:'minParty',max:'maxParty',limit:'limit'};
  let connections=[],snapshot=null,busy=false,generation=0,loaded=false;
  const status=text=>{$('status').textContent=text;$('status').hidden=!text;};
  const error=text=>{$('error').textContent=text;$('error').hidden=!text;};
  const connectionStatus=text=>{$('connection-status').textContent=text;$('connection-status').hidden=!text;};
  function visibility(){
    const category=$('mode').value==='category',flexDates=!category&&$('flex-dates').checked;
    root.querySelector('label[for="restaurant-query"]').textContent=category?'Restaurant category':'Restaurant name';
    $('category-help').hidden=!category;
    $('nyc').hidden=!isNYC($('city').value);
    $('date-options').hidden=category;
    $('through-field').hidden=!flexDates;$('date-help').hidden=!flexDates;
    root.querySelector('label[for="restaurant-date"]').textContent=flexDates?'First date':'Date';
    $('fixed-fields').hidden=$('flexible').checked;$('flex-fields').hidden=!$('flexible').checked;
    $('party-help').hidden=!$('flexible').checked;
  }
  function fill(value={}){
    const defaults={mode:'restaurant',query:'',city:'New York City',neighborhood:'',date:localDate(),endDate:value.date||localDate(),startTime:'17:00',endTime:'22:00',partySize:value.minParty||2,minParty:2,maxParty:6,limit:12,...value};
    for(const [id,key] of Object.entries(fields))$(id).value=defaults[key];
    $('flexible').checked=!!value.flexible;$('flex-dates').checked=!!value.flexibleDates;$('travel').checked=!!value.includeLongTravel;
    for(const id of ['date','through'])$(id).min=localDate();
    for(const id of ['party','min','max']){$(id).min=1;$(id).max=20;$(id).step=1;}
    for(const id of ['query','city','date','start','end'])$(id).required=true;
    visibility();
  }
  function controls(){
    for(const node of $('form').querySelectorAll('input,select,button'))node.disabled=busy;
    $('find').disabled=busy||!online()||!connections.length;
    $('reload').disabled=busy||!online();$('stop').disabled=false;$('stop').hidden=!busy;
  }
  function render(){
    $('empty').hidden=!!snapshot;
    $('summary').hidden=!snapshot;
    if(!snapshot)return;
    const {search,research,downloadedAt}=snapshot,dates=searchDates(search);
    $('summary').textContent=[research.summary,`${research.restaurants.length} candidate${research.restaurants.length===1?'':'s'} · Researched ${new Date(downloadedAt).toLocaleString()}.`,online()?'':'Offline · Saved shortlist.', 'Shortlist, not an exhaustive list.',research.excluded?`${research.excluded} longer-travel options excluded.`:'',research.unverified?`${research.unverified} unverified candidates omitted.`:''].filter(Boolean).join(' ');
    $('clarification').textContent=research.clarification||'';$('clarification').hidden=!research.clarification;
    $('candidates').replaceChildren(...research.restaurants.map(r=>MobileRestaurantCandidate(r,{
      search,expired:search.date<localDate(),
      links:r.booking.flatMap(b=>dates.flatMap(date=>partySizes(search).flatMap(size=>searchTimes(b.provider,search).map(time=>({provider:b.provider,size,date:dates.length>1?date:null,time:['OpenTable','Tock'].includes(b.provider)?time:null,url:bookingURL(b.url,search,size,time,date)})))))
    })));
  }
  async function reloadConnections(){
    if(!online()){if(!connections.length)$('connection').replaceChildren(Option('Reconnect for research',''));controls();connectionStatus('Offline. Saved results are available; reconnect for new research.');return;}
    $('reload').disabled=true;
    try{
      const previous=$('connection').value;
      connections=(await loadConnections()).filter(c=>c.provider==='openai'&&c.hasApiKey);
      $('connection').replaceChildren(...(connections.length?connections.map(c=>Option(c.name,c.id)):[Option('Add an OpenAI connection','')]));
      if(connections.some(c=>c.id===previous))$('connection').value=previous;
      connectionStatus(connections.length?'':'Add an OpenAI connection in the extension’s AI settings, then reload connections here.');
    }catch(e){connectionStatus(e.message);}
    finally{controls();}
  }
  async function find(event){
    event.preventDefault();if(busy)return;
    let search,id;
    try{
      if(!online())throw Error('Reconnect to find restaurants. Your saved shortlist remains available.');
      const input=Object.fromEntries(Object.entries(fields).map(([id,key])=>[key,$(id).value]));
      search=searchInput({...input,flexible:$('flexible').checked,flexibleDates:$('flex-dates').checked,includeLongTravel:$('travel').checked});
      id=connections.find(c=>c.id===$('connection').value)?.id;
      if(!id)throw Error('Choose an OpenAI connection for research.');
    }catch(e){error(e.message);return;}
    const attempt=++generation,startedAt=Date.now();busy=true;controls();error('');status('Researching restaurants and booking providers… This can take up to two minutes.');
    try{
      const research=await request(await credentials.get(),`/v1/ai-connections/${id}/restaurants`,{method:'POST',value:{search},timeoutMs:150000});
      if(attempt!==generation)return;
      snapshot={search,research,startedAt,downloadedAt:new Date().toISOString()};render();
      let saved=false;
      try{saved=await cache.write(snapshot);}catch(e){error(`Results are visible, but could not be saved for offline use. ${e.message}`);}
      if(attempt!==generation)return;
      $('search-panel').open=!research.restaurants.length;
      status(research.restaurants.length?(saved?'':'This search is not saved offline. The previous downloaded shortlist remains available after reopening.'):'No verified matches. Try a clearer name or broader criteria.');
    }catch(e){if(attempt===generation){error(e.message);status('Research could not finish. Your inputs and previous shortlist are preserved.');}}
    finally{if(attempt===generation){busy=false;controls();}}
  }
  $('form').addEventListener('submit',find);
  $('reload').addEventListener('click',reloadConnections);
  $('stop').addEventListener('click',()=>{generation++;busy=false;controls();status('Stopped. The previous shortlist is preserved. Research already sent may still use API credit.');});
  for(const id of ['mode','city','flexible','flex-dates'])$(id).addEventListener('input',visibility);
  const connectionChanged=()=>{if(!loaded)return;render();controls();if(!busy)reloadConnections();};
  window.addEventListener('online',connectionChanged);window.addEventListener('offline',connectionChanged);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)connectionChanged();});
  fill();controls();
  return {
    async open(){
      if(loaded)return;loaded=true;
      try{snapshot=await cache.read();if(snapshot){fill(snapshot.search);$('search-panel').open=false;}}
      catch(e){error(e.message);}
      render();
      await reloadConnections();
    }
  };
}
