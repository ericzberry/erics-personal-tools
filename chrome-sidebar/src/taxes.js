import {TaxesView,Destination,ConflictPanel,PasswordPanel,FiledList,ConnectionPanel,fileSize} from './components/taxes.js';
import {AttachmentCard,Button,Link,setStatus} from './components/ui.js';
import {attachFileDrop} from './components/file-drop.js';
import {readStatement,trimForReading,ACCEPTED} from './statement-text.js';
import {taxFileName,taxFolderPath,taxYears,defaultTaxYear,normalizeTaxFiling,parseTaxReading,filesIntoSubfolder,
  needsIssuer,needsJurisdiction,needsQuarter,defaultCategoryFor,DEFAULT_TAXPAYER,MAX_DOCUMENT_BYTES,extensionOf,driveFolderUrl} from './tax-data.js';

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
  // The reading's connection is chosen here rather than asked for. The Worker
  // lists connections most recently changed first, so the one in use is the one
  // last touched, and it is kept for as long as it still exists.
  // `locked` is a dropped PDF that would not open: what it said, waiting for a
  // password. `original` is the file as it arrived, kept so a document whose
  // password nobody has can still be filed exactly as it is.
  let dropped=null,original=null,reading=null,plan=null,filed={year:'',files:[],groups:[]},polling=0,consentUrl='',connectionId='',locked='',typed='';

  const status=(text,target='status',tone='')=>setStatus($(target),text,tone);
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
      status(error.message,target,'error');
      return false;
    }finally{busy=false;render();}
  }

  // --- Drive connection
  async function refreshStatus({quiet=false}={}){
    return run(async token=>{
      drive=await remote(token,'/v1/drive/status');
      if(!quiet)status(drive.configured?'':'Google Drive is not configured on the Worker yet.');
      if(drive.connected)await loadFiled(token);
      else filed={year:'',files:[],groups:[]};
      return drive;
    },'status');
  }
  async function connect(){
    await run(async token=>{
      const {url}=await remote(token,'/v1/drive/connect',{method:'POST',value:{}});
      // A blocked popup is not a failure: the link is kept beside the button so
      // the owner can open the same consent page themselves.
      consentUrl=openExternal(url)?'':url;
      status(consentUrl?'Open the consent page, then come back.':'Waiting for Google…','status',consentUrl?'alert':'progress');
      awaitConsent();
    },'status');
  }
  // Polls only while this mount is the current one and only until it is
  // answered. Every exit path stops it.
  function awaitConsent(){
    const current=++polling;
    let tries=0;
    const tick=async()=>{
      if(current!==polling)return;
      if(++tries>CONNECT_POLL_LIMIT){status('Google did not answer. Try connecting again.','status','error');return;}
      try{
        const token=await credentials.get();
        const next=await remote(token,'/v1/drive/status');
        if(current!==polling)return;
        if(next.connected){
          drive=next;polling=0;consentUrl='';
          status('','status');
          render();
          await run(loadFiled,'status');
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
      filed={year:'',files:[],groups:[]};
      status('','status');
    },'status');
  }

  async function loadFiled(token){
    const year=$('year').value||defaultTaxYear();
    const result=await remote(token,`/v1/drive/filed?year=${encodeURIComponent(year)}`);
    filed={year:result.year,files:result.files||[],groups:result.groups||[]};
  }

  // --- The dropped document
  async function receive(file){
    clearFiling({keepFields:false});
    original=file;dropped=file;
    return examine('');
  }

  // Reads what was dropped, with a password when one has been given. A file
  // that will not open without one stops here and asks: the document is not
  // reported as unreadable, because it is readable by the one person filing it.
  async function examine(password){
    let result;
    try{result=await readStatement(original,{password,unlock:true});}
    catch(error){
      if(!error.needsPassword)throw error;
      locked=error.message;dropped=original;reading=null;
      renderDocument();renderPassword();render();
      return {message:error.message,tone:'alert'};
    }
    locked='';typed='';
    // An encrypted document is filed as the unlocked copy made here, so what
    // reaches Drive opens without a password five years from now.
    dropped=result.file||original;
    if(result.kind==='image'){
      reading={kind:'image',image:result.image,text:'',
        detail:`Image · ${fileSize(dropped.size)}`,note:'',tone:''};
    }else if(result.text.trim()){
      const {text}=trimForReading(result.text);
      reading={kind:'text',text,image:null,
        detail:`${fileSize(dropped.size)} · ${text.length.toLocaleString('en-US')} characters read on this device`,
        note:result.note,tone:result.unlocked?'success':result.confidence==='good'?'':'alert'};
    }else{
      reading={kind:'none',text:'',image:null,detail:fileSize(dropped.size),
        note:[result.note,'No text came out of this file, so it cannot be named for you. It still files exactly as it is.'].filter(Boolean).join(' '),
        tone:'alert'};
    }
    renderDocument();renderPassword();render();
    if(reading.kind==='none')return 'Choose the type and year yourself, then file it.';
    if(!connectionId)return 'Save an AI connection in Settings to have a document named for you, or fill the fields in yourself.';
    await readDocument();
    return 'Ready to file.';
  }

  // The password panel's two answers. Unlocking reads the document again with
  // it; filing it locked keeps the file exactly as it arrived and moves on to
  // naming it, which still has to be done by hand because nothing was read.
  async function unlock(password){
    if(busy)return;
    typed=password;
    if(!password){status('Enter the password, or file it as it is.','file-status','alert');return;}
    status('Opening the document…','file-status','progress');
    const result=await examine(password);
    const {message,tone}=typeof result==='object'&&result?result:{message:result,tone:'success'};
    status(message||'','file-status',tone||'success');
  }
  function fileLocked(){
    locked='';typed='';dropped=original;
    reading={kind:'none',text:'',image:null,detail:fileSize(original.size),
      note:'This document is filed exactly as it arrived, and still needs its password to open.',tone:'alert'};
    renderDocument();renderPassword();render();
    status('Choose the type and year yourself, then file it.','file-status','alert');
  }
  async function readDocument(){
    const id=connectionId;
    if(!id||!reading||reading.kind==='none')return;
    await run(async token=>{
      status('Reading the document…','file-form-status','progress');
      const result=await remote(token,`/v1/ai-connections/${id}/tax-intake`,{method:'POST',
        value:{...(reading.text?{text:reading.text}:{}),...(reading.image?{image:reading.image.dataUrl}:{}),today:today()},timeoutMs:130000});
      const proposal=parseTaxReading(result);
      if(proposal.type){$('type').value=proposal.type;$('category').value=defaultCategoryFor(proposal.type);}
      if(proposal.issuer)$('issuer').value=proposal.issuer;
      if(proposal.taxpayer)$('taxpayer').value=proposal.taxpayer;
      if(proposal.jurisdiction)$('jurisdiction').value=proposal.jurisdiction;
      if(proposal.quarter)$('quarter').value=proposal.quarter;
      if(proposal.year&&taxYears().includes(proposal.year))$('year').value=proposal.year;
      reading={...reading,note:[reading.note,proposal.reason].filter(Boolean).join(' '),
        tone:proposal.confidence==='high'?reading.tone:'alert'};
      renderDocument();renderDestination();
      status(proposal.confidence==='high'?'':'Check the type, name and year before filing.','file-form-status','alert');
      if(proposal.year&&!taxYears().includes(proposal.year))status(`This looks like a ${proposal.year} document, which is outside the years you can file into. Pick the year yourself.`,'file-form-status','alert');
      await loadFiled(token);
    },'file-form-status');
  }

  // --- Filing
  function currentFiling(){
    return normalizeTaxFiling({type:$('type').value,issuer:$('issuer').value,taxpayer:$('taxpayer').value,
      category:$('category').value,jurisdiction:$('jurisdiction').value,quarter:$('quarter').value,
      year:$('year').value,fileName:dropped?.name||''});
  }
  async function file(){
    if(!dropped){status('Drop a document first.','file-form-status','alert');return;}
    if(!drive.connected){status('Connect Google Drive first.','file-form-status','alert');return;}
    let filing;
    try{filing=currentFiling();}catch(error){status(error.message,'file-form-status','error');return;}
    await run(async token=>{
      status('Checking the year folder…','file-form-status','progress');
      plan=await remote(token,'/v1/drive/plan',{method:'POST',value:{...filing,fileName:dropped.name},timeoutMs:60000});
      if(plan.existing){renderConflict();status('','file-form-status');return;}
      await send(token,'new');
    },'file-form-status');
  }
  async function send(token,mode){
    status(mode==='replace'?'Replacing…':'Filing…','file-form-status','progress');
    const result=await upload(token,`/v1/drive/upload?ticket=${encodeURIComponent(plan.ticket)}&mode=${mode}`,{file:dropped});
    const {name,year,path=[year]}=result.filed;
    // The plan resolved the folder the file went into, so the path it names
    // opens that folder.
    const folderId=plan.folder?.id,where=path.join(' / ');
    clearFiling({keepFields:false});
    $('year').value=year;
    await loadFiled(token);
    status([`${result.replaced?'Replaced':'Filed'} `,folderId?Link(where,driveFolderUrl(folderId)):where,` / ${name}.`],
      'file-form-status','success');
  }
  const resolveConflict=mode=>run(token=>send(token,mode),'file-form-status');

  function clearFiling({keepFields=true}={}){
    dropped=null;original=null;reading=null;plan=null;locked='';typed='';
    if(!keepFields){
      $('type').value='';$('issuer').value='';$('jurisdiction').value='';$('quarter').value='';
      $('taxpayer').value=DEFAULT_TAXPAYER;$('category').value=defaultCategoryFor('');
    }
    setStatus($('file-status'),'');
    renderDocument();renderPassword();renderConflict();renderDestination();
  }

  // --- Rendering
  function renderDocument(){
    $('document').hidden=!reading;
    $('document').replaceChildren(...(reading?[AttachmentCard({
      label:dropped?.name||'',detail:reading.detail,note:reading.note,tone:reading.tone,
      onRemove:()=>{clearFiling({keepFields:false});status('','file-form-status');render();}
    })]:[]));
  }
  function renderDestination(){
    let name='';
    try{
      name=dropped?taxFileName({type:$('type').value,issuer:$('issuer').value,taxpayer:$('taxpayer').value,
        jurisdiction:$('jurisdiction').value,quarter:$('quarter').value,extension:extensionOf(dropped.name)}):'';
    }catch{name='';}
    $('destination').hidden=!name;
    $('destination').replaceChildren(...(name
      ?[Destination({path:taxFolderPath({year:$('year').value,taxpayer:$('taxpayer').value,
        category:$('category').value}),name})]:[]));
  }
  // A locked document is the only thing being asked about while it is locked:
  // nothing below it can be answered until the file has been opened.
  function renderPassword(){
    $('password').hidden=!locked;
    $('password').replaceChildren(...(locked?[PasswordPanel({value:typed,busy,
      onType:value=>{typed=value;},onUnlock:unlock,onSkip:fileLocked})]:[]));
  }
  function renderConflict(){
    $('conflict').hidden=!plan?.existing;
    $('conflict').replaceChildren(...(plan?.existing?[ConflictPanel({
      existing:plan.existing,keepBothName:plan.keepBothName,
      onKeepBoth:()=>resolveConflict('keep-both'),
      onReplace:()=>resolveConflict('replace'),
      onCancel:()=>{plan=null;renderConflict();status('Nothing was filed.','file-form-status','alert');}
    })]:[]));
  }
  // Only the actions that apply: a document waiting to be filed has two, a
  // conflict the owner is answering has none of its own, and an empty drop
  // zone has nothing to offer at all.
  function renderActions(){
    $('file-actions').replaceChildren(...(!dropped||locked||plan?.existing?[]:[
      action('File it',file,'primary',{disabled:busy||!drive.connected}),
      action('Clear',()=>{clearFiling({keepFields:false});status('','file-form-status');render();})
    ]));
  }
  function render(){
    // A connected Drive is not mentioned at all: the account, its heading and
    // its maintenance action belong to the state where something is missing.
    $('connection-section').hidden=drive.connected;
    $('connection').replaceChildren(ConnectionPanel({connected:drive.connected,account:drive.account,
      consentUrl,onConnect:connect,onDisconnect:disconnect}));
    // Connecting Drive goes through this device's cloud connection, so without
    // one the button would only repeat what the status line already says.
    for(const node of $('connection').querySelectorAll('button'))node.disabled=busy||!drive.configured||!activeToken;
    $('filed').replaceChildren(FiledList(filed.year||$('year').value,filed.files,filed.groups));
    // Only what applies. The type, the taxpayer and the name describe a
    // document, so they appear once there is one, and a document that is still
    // locked is not being named yet. Which government and which instalment are
    // questions only about what the household filed or paid; who issued it is a
    // question only about what arrived. The year stays throughout, because it
    // also says which year's folder is listed below.
    const type=$('type').value,naming=!!dropped&&!locked;
    const shown={type:naming,taxpayer:naming,issuer:naming&&needsIssuer(type),
      jurisdiction:naming&&needsJurisdiction(type),quarter:naming&&needsQuarter(type),
      // What a document is for only decides anything in a year that is divided
      // by it, so before 2026 there is nothing for this answer to change.
      category:naming&&filesIntoSubfolder($('year').value)};
    for(const [key,visible] of Object.entries(shown)){
      $(key).closest('.form-field').hidden=!visible;
      $(key).disabled=busy;
    }
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
      if(!usable.some(connection=>connection.id===connectionId))connectionId=usable[0]?.id||'';
      status(usable.length?'':'Save an AI connection in Settings to have a dropped document named for you.','ai-status');
    }catch(error){status(error.message,'ai-status','error');}
  }

  attachFileDrop({zone:$('drop'),input:$('file'),status:$('file-status'),onFile:receive,accept:ACCEPTED,maxBytes:MAX_DOCUMENT_BYTES});
  $('file-clear').addEventListener('click',()=>{clearFiling({keepFields:false});status('','file-form-status');render();});
  for(const key of ['type','issuer','taxpayer','category','jurisdiction','quarter'])
    $(key).addEventListener(key==='issuer'?'input':'change',()=>{
      // The type almost always settles what a document is for, so choosing one
      // answers that too — and the answer stays a field, because an extension,
      // a notice or anything filed as "Other document" is the owner's to place.
      if(key==='type')$('category').value=defaultCategoryFor($('type').value);
      plan=null;renderConflict();renderDestination();render();
    });
  $('year').addEventListener('change',()=>{
    plan=null;renderConflict();renderDestination();
    run(loadFiled,'status').then(render);
  });

  function clear(){
    generation++;polling=0;activeToken='';
    drive={connected:false,account:'',configured:true};
    filed={year:'',files:[],groups:[]};consentUrl='';connectionId='';
    $('year').value=defaultTaxYear();
    clearFiling({keepFields:false});
    for(const target of ['status','file-form-status','ai-status'])status('',target);
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
