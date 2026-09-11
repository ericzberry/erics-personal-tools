import {TaxesView,DocumentCard,Destination,ConflictPanel,FiledList,ConnectionPanel,fileSize} from './components/taxes.js';
import {Button,Option} from './components/ui.js';
import {attachFileDrop} from './components/file-drop.js';
import {readStatement,trimForReading,ACCEPTED} from './statement-text.js';
import {taxFileName,taxYears,defaultTaxYear,normalizeTaxFiling,parseTaxReading,MAX_DOCUMENT_BYTES,extensionOf} from './tax-data.js';

const today=()=>new Date().toISOString().slice(0,10);
// Google's consent page is a round trip through another tab, so the tool waits
// rather than asking the owner to come back and press Refresh. Bounded on
// purpose: a consent that was abandoned stops costing requests.
const CONNECT_POLL_MS=3000,CONNECT_POLL_LIMIT=40;

// `openExternal` is the host's ability to put a page in front of the owner.
// The side panel has tabs to open; the phone has a new window; a host with
// neither gets a link instead of a dead button.
export function mountTaxes(root,{credentials,remote,upload,openExternal=url=>globalThis.open(url,'_blank','noopener'),onSettings=()=>{}}={}){
  root.replaceChildren(TaxesView({today:new Date()}));
  const $=id=>root.querySelector(`#taxes-${id}`);
  let busy=false,generation=0,activeToken='';
  let drive={connected:false,account:'',configured:true};
  // The dropped file, what the device pulled out of it, and — once the
  // destination has been resolved — the plan the owner is answering about.
  let dropped=null,reading=null,plan=null,filed={year:'',files:[]},polling=0,consentUrl='';

  const status=(text,target='status')=>{$(target).textContent=text||'';};
  const action=(label,handler,variant='secondary',extra={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy,...extra});
    button.addEventListener('click',handler);
    return button;
  };

  async function run(operation,target='status'){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      return result===undefined?true:result;
    }catch(error){
      if(current!==generation)return false;
      status(error.message,target);
      return false;
    }finally{busy=false;render();}
  }

  // --- Drive connection
  async function refreshStatus({quiet=false}={}){
    return run(async token=>{
      drive=await remote(token,'/v1/drive/status');
      if(!quiet)status(drive.configured?'':'Google Drive is not configured on the Worker yet.','connection-status');
      if(drive.connected)await loadFiled(token);
      else filed={year:'',files:[]};
      return drive;
    },'connection-status');
  }
  async function connect(){
    await run(async token=>{
      const {url}=await remote(token,'/v1/drive/connect',{method:'POST',value:{}});
      // A blocked popup is not a failure: the link is kept beside the button so
      // the owner can open the same consent page themselves.
      consentUrl=openExternal(url)?'':url;
      status(consentUrl?'Open the consent page, then come back.':'Waiting for Google…','connection-status');
      awaitConsent();
    },'connection-status');
  }
  // Polls only while this mount is the current one and only until it is
  // answered. Every exit path stops it.
  function awaitConsent(){
    const current=++polling;
    let tries=0;
    const tick=async()=>{
      if(current!==polling)return;
      if(++tries>CONNECT_POLL_LIMIT){status('Google did not answer. Try connecting again.','connection-status');return;}
      try{
        const token=await credentials.get();
        const next=await remote(token,'/v1/drive/status');
        if(current!==polling)return;
        if(next.connected){
          drive=next;polling=0;consentUrl='';
          status('','connection-status');
          render();
          await run(loadFiled,'connection-status');
          return;
        }
      }catch{}
      setTimeout(tick,CONNECT_POLL_MS);
    };
    setTimeout(tick,CONNECT_POLL_MS);
  }
  async function disconnect(){
    polling=0;consentUrl='';
    await run(async token=>{
      await remote(token,'/v1/drive/disconnect',{method:'POST',value:{}});
      drive={...drive,connected:false,account:''};
      filed={year:'',files:[]};
      status('','connection-status');
    },'connection-status');
  }

  async function loadFiled(token){
    const year=$('year').value||defaultTaxYear();
    const result=await remote(token,`/v1/drive/filed?year=${encodeURIComponent(year)}`);
    filed={year:result.year,files:result.files||[]};
  }

  // --- The dropped document
  async function receive(file){
    clearFiling({keepFields:false});
    dropped=file;
    const result=await readStatement(file);
    const extension=extensionOf(file.name);
    if(result.kind==='image'){
      reading={kind:'image',image:result.image,text:'',
        detail:`Image · ${fileSize(file.size)}`,note:'',tone:''};
    }else if(result.text.trim()){
      const {text}=trimForReading(result.text);
      reading={kind:'text',text,image:null,
        detail:`${fileSize(file.size)} · ${text.length.toLocaleString('en-US')} characters read on this device`,
        note:result.note,tone:result.confidence==='good'?'':'warning'};
    }else{
      reading={kind:'none',text:'',image:null,detail:fileSize(file.size),
        note:'No text came out of this file, so it cannot be named for you. It still files exactly as it is.',tone:'warning'};
    }
    renderDocument();render();
    if(reading.kind==='none')return 'Choose the type and year yourself, then file it.';
    if(!$('connection-picker').value)return 'Choose an AI connection to name it, or fill the fields in yourself.';
    await readDocument();
    return 'Ready to file.';
  }
  async function readDocument(){
    const id=$('connection-picker').value;
    if(!id||!reading||reading.kind==='none')return;
    await run(async token=>{
      status('Reading the document…','file-form-status');
      const result=await remote(token,`/v1/ai-connections/${id}/tax-intake`,{method:'POST',
        value:{...(reading.text?{text:reading.text}:{}),...(reading.image?{image:reading.image.dataUrl}:{}),today:today()},timeoutMs:130000});
      const proposal=parseTaxReading(result);
      if(proposal.type)$('type').value=proposal.type;
      if(proposal.issuer)$('issuer').value=proposal.issuer;
      if(proposal.year&&taxYears().includes(proposal.year))$('year').value=proposal.year;
      reading={...reading,note:proposal.reason,tone:proposal.confidence==='high'?'':'warning'};
      renderDocument();renderDestination();
      status(proposal.confidence==='high'?'':'Check the type, name and year before filing.','file-form-status');
      if(proposal.year&&!taxYears().includes(proposal.year))status(`This looks like a ${proposal.year} document, which is outside the years you can file into. Pick the year yourself.`,'file-form-status');
      await loadFiled(token);
    },'file-form-status');
  }

  // --- Filing
  function currentFiling(){
    return normalizeTaxFiling({type:$('type').value,issuer:$('issuer').value,year:$('year').value,fileName:dropped?.name||''});
  }
  async function file(){
    if(!dropped){status('Drop a document first.','file-form-status');return;}
    if(!drive.connected){status('Connect Google Drive first.','file-form-status');return;}
    let filing;
    try{filing=currentFiling();}catch(error){status(error.message,'file-form-status');return;}
    await run(async token=>{
      status('Checking Drive…','file-form-status');
      plan=await remote(token,'/v1/drive/plan',{method:'POST',value:{...filing,fileName:dropped.name},timeoutMs:60000});
      if(plan.existing){renderConflict();status('','file-form-status');return;}
      await send(token,'new');
    },'file-form-status');
  }
  async function send(token,mode){
    status(mode==='replace'?'Replacing in Drive…':'Filing to Drive…','file-form-status');
    const result=await upload(token,`/v1/drive/upload?ticket=${encodeURIComponent(plan.ticket)}&mode=${mode}`,{file:dropped});
    const {name,year}=result.filed;
    clearFiling({keepFields:false});
    $('year').value=year;
    await loadFiled(token);
    status(`${result.replaced?'Replaced':'Filed'} ${year} / ${name}.`,'file-form-status');
  }
  const resolveConflict=mode=>run(token=>send(token,mode),'file-form-status');

  function clearFiling({keepFields=true}={}){
    dropped=null;reading=null;plan=null;
    if(!keepFields){$('type').value='';$('issuer').value='';}
    $('file-status').textContent='';
    renderDocument();renderConflict();renderDestination();
  }

  // --- Rendering
  function renderDocument(){
    $('document').hidden=!reading;
    $('document').replaceChildren(...(reading?[DocumentCard({
      label:dropped?.name||'',detail:reading.detail,note:reading.note,tone:reading.tone,
      onRemove:()=>{clearFiling({keepFields:false});status('','file-form-status');render();}
    })]:[]));
  }
  function renderDestination(){
    let name='';
    try{name=dropped?taxFileName({type:$('type').value,issuer:$('issuer').value,extension:extensionOf(dropped.name)}):'';}catch{name='';}
    $('destination').hidden=!name;
    $('destination').replaceChildren(...(name?[Destination({year:$('year').value,name})]:[]));
  }
  function renderConflict(){
    $('conflict').hidden=!plan?.existing;
    $('conflict').replaceChildren(...(plan?.existing?[ConflictPanel({
      existing:plan.existing,keepBothName:plan.keepBothName,
      onKeepBoth:()=>resolveConflict('keep-both'),
      onReplace:()=>resolveConflict('replace'),
      onCancel:()=>{plan=null;renderConflict();status('Nothing was filed.','file-form-status');}
    })]:[]));
  }
  // Only the actions that apply: a document waiting to be filed has two, a
  // conflict the owner is answering has none of its own, and an empty drop
  // zone has nothing to offer at all.
  function renderActions(){
    $('file-actions').replaceChildren(...(!dropped||plan?.existing?[]:[
      action('File to Drive',file,'primary',{disabled:busy||!drive.connected}),
      action('Clear',()=>{clearFiling({keepFields:false});status('','file-form-status');render();})
    ]));
  }
  function render(){
    $('connection').replaceChildren(ConnectionPanel({connected:drive.connected,account:drive.account,
      consentUrl,onConnect:connect,onDisconnect:disconnect}));
    for(const node of $('connection').querySelectorAll('button'))node.disabled=busy||!drive.configured;
    $('filed').replaceChildren(FiledList(filed.year||$('year').value,filed.files));
    // Only what applies: the type and the name describe a document, so they
    // appear once there is one. The year stays, because it also says which
    // year's folder is listed below.
    for(const key of ['type','issuer'])$(key).closest('.form-field').hidden=!dropped;
    for(const key of ['type','issuer'])$(key).disabled=busy;
    $('year').disabled=busy;
    $('drive-contents').hidden=!drive.connected;
    $('drop').disabled=busy;
    renderActions();
    // Beside the title, only what applies: a connected Drive can be refreshed,
    // and a device with no cloud connection needs Settings rather than a dead
    // Refresh.
    $('actions').replaceChildren(activeToken?action('Refresh',()=>refreshStatus()):action('Connection settings',onSettings));
  }

  async function connectionList(){
    if(!activeToken||globalThis.navigator?.onLine===false){status('Offline · filing a document needs the internet.','ai-status');return;}
    try{
      const result=await remote(activeToken,'/v1/ai-connections');
      const usable=result.connections.filter(connection=>connection.hasApiKey);
      const previous=$('connection-picker').value;
      $('connection-picker').replaceChildren(Option('Choose a connection',''),...usable.map(connection=>Option(`${connection.name} · ${connection.provider}`,connection.id)));
      if(usable.some(connection=>connection.id===previous))$('connection-picker').value=previous;
      else if(usable.length===1)$('connection-picker').value=usable[0].id;
      status(usable.length?'':'Save an AI connection in Settings to have a dropped document named for you.','ai-status');
    }catch(error){status(error.message,'ai-status');}
  }

  attachFileDrop({zone:$('drop'),input:$('file'),status:$('file-status'),onFile:receive,accept:ACCEPTED,maxBytes:MAX_DOCUMENT_BYTES});
  $('file-clear').addEventListener('click',()=>{clearFiling({keepFields:false});status('','file-form-status');render();});
  for(const key of ['type','issuer'])$(key).addEventListener(key==='issuer'?'input':'change',()=>{plan=null;renderConflict();renderDestination();});
  $('year').addEventListener('change',()=>{
    plan=null;renderConflict();renderDestination();
    run(loadFiled,'status').then(render);
  });
  $('connection-picker').addEventListener('change',()=>{if(reading&&reading.kind!=='none'&&!$('type').value)readDocument();});

  function clear(){
    generation++;polling=0;activeToken='';
    drive={connected:false,account:'',configured:true};
    filed={year:'',files:[]};consentUrl='';
    $('year').value=defaultTaxYear();
    clearFiling({keepFields:false});
    for(const target of ['status','connection-status','file-form-status','ai-status'])status('',target);
    render();
  }
  async function refresh(){
    if(await refreshStatus())await connectionList();
    render();
  }
  clear();
  refresh();
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear,stop(){generation++;polling=0;}};
}
