// Shared offline-first data adapter. All state changes are serialized across windows.
export function offlineResource({resource,path,store,remote,normalize,metadata,online=()=>globalThis.navigator?.onLine!==false,locks=globalThis.navigator?.locks,now=()=>new Date().toISOString()}) {
  let chain=Promise.resolve();
  const exclusive=action=>{
    const execute=()=>locks?locks.request(`erics-data:${resource}`,action):action();
    const result=chain.then(execute,execute);chain=result.catch(()=>{});return result;
  };
  const empty=()=>({cloud:[],pending:{},syncedAt:null,error:''});
  // A write whose response was lost may still have landed, and the snapshot is
  // the only witness. The server names the revision after the write when it
  // can; otherwise the record is compared by content. Content arrives as JSON,
  // so arrays and objects are new values and are compared as JSON would write
  // them: keys in any order, an undefined field the same as a missing one.
  const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
  function landed(current,change){
    if(change.method==='DELETE')return !current;
    if(!current)return false;
    if(change.operation&&current.revision===change.operation)return true;
    try{const content=normalize(change.value);return Object.keys(content).every(key=>canonical(current[key])===canonical(content[key]));}
    catch{return false;}
  }
  const rows=state=>{
    const records=new Map(state.cloud.map(record=>[record.id,record]));
    for(const [id,change] of Object.entries(state.pending))records.set(id,{...change.value,id,revision:change.localRevision,pending:true,conflict:!!change.conflict,deleting:change.method==='DELETE'});
    return [...records.values()];
  };
  function message(state){
    const pending=Object.values(state.pending),conflicts=pending.filter(item=>item.conflict).length;
    if(conflicts)return `${conflicts} conflicting change${conflicts===1?'':'s'}. Review the marked records; your local changes are safe.`;
    if(pending.length)return `${pending.length} change${pending.length===1?'':'s'} waiting to sync.${state.error?' '+state.error:''}`;
    if(state.error)return `Using the saved offline copy. ${state.error}`;
    return online()?'':'Offline · Your records are available.';
  }
  async function sync(token,state){
    if(!online())return state;
    try{
      const snapshot=await remote(token,`${path}/snapshot`);
      state.cloud=snapshot.records;
      for(const [id,change] of Object.entries(state.pending)){
        const current=state.cloud.find(record=>record.id===id);
        // Reconcile a successful write whose response was lost before retrying.
        if(landed(current,change)){delete state.pending[id];continue;}
        // An earlier write of this change landed and the owner edited on top of
        // it before hearing back: the cloud holds this device's own work.
        if(current&&change.earlier?.includes(current.revision))change.baseRevision=current.revision;
        if((current?.revision??null)!==change.baseRevision){change.conflict=true;continue;}
        // From here the write may land with no answer coming back, and a create
        // deleted afterwards can no longer be forgotten, so the device has to
        // know that before anything leaves it.
        if(change.unsent){delete change.unsent;await store.write(resource,token,state);}
        try{
          const response=await remote(token,`${path}/${id}`,{method:change.method,value:{...change.value,revision:change.baseRevision,...(change.operation?{operation:change.operation}:{})}});
          state.cloud=state.cloud.filter(record=>record.id!==id);
          if(change.method==='PUT')state.cloud.unshift({...change.value,...response.record});
          delete state.pending[id];
        }catch(error){if(error.status===409){change.conflict=true;continue;}throw error;}
      }
      state.error='';state.syncedAt=now();
    }catch(error){state.error=error.status===401?'Reconnect with a valid access token to sync.':(error.status?error.message:'Cloud unavailable. Reconnect to sync.');}
    await store.write(resource,token,state);
    return state;
  }
  async function load(token){return await store.read(resource,token)||empty();}
  const request=(token,url,options={})=>exclusive(async()=>{
    if(!token)throw Error('Connect with your private access token first.');
    let state=await load(token);
    const id=url.startsWith(`${path}/`)?url.slice(path.length+1):null;
    if(!options.method||options.method==='GET'){
      if(!id){
        state=await sync(token,state);
        if(!state.syncedAt&&!Object.keys(state.pending).length)throw Error(state.error||'Connect to the internet once to download your records for offline use.');
        return {records:rows(state).map(metadata),syncMessage:message(state)};
      }
      const record=rows(state).find(record=>record.id===id);
      if(!record)throw Error('This record is not saved on this device. Refresh your records while online.');
      return {record};
    }
    if(!id||!['PUT','DELETE'].includes(options.method))throw Error('Unknown data operation.');
    const previous=rows(state).find(record=>record.id===id);
    if((previous?.revision??null)!==(options.value.revision??null))throw Error('This record changed in another window. Cancel your edits and refresh.');
    const old=state.pending[id];
    const value=options.method==='PUT'?{...normalize(options.value,previous),id,updatedAt:now()}:previous;
    if(!value)throw Error('Record not found. Refresh your records.');
    // A create that never left the device can simply be forgotten. One that was
    // sent may have landed with its answer lost, so deleting it is queued like
    // any other change: the snapshot then shows either nothing to delete, or the
    // revision one of this record's earlier writes produced, to delete from. A
    // queue from before sends were marked cannot prove it never left.
    if(options.method==='DELETE'&&old?.baseRevision===null&&old.unsent){delete state.pending[id];}
    // The operation names this write for as long as it is queued, so a retry is
    // recognizable as the same write. A queue from before names were given has
    // none, and is recognized by its content alone.
    else state.pending[id]={method:options.method,value,baseRevision:old?old.baseRevision:previous?.revision??null,localRevision:`local:${crypto.randomUUID()}`,operation:crypto.randomUUID(),earlier:old?[...(old.earlier||[]),old.operation].filter(Boolean).slice(-20):[],conflict:old?.conflict||false,...(!old||old.unsent?{unsent:true}:{})};
    // Commit the queue BEFORE attempting the network. A restart cannot lose it.
    await store.write(resource,token,state);
    state=await sync(token,state);
    return {record:rows(state).find(record=>record.id===id),records:rows(state).map(metadata),syncMessage:message(state)};
  });
  return {
    // Which copy this is, so a disconnect can be checked against every one.
    resource,
    request,
    // The device's own copy, with no request and no sync. Recognizing what the
    // owner is looking at has to cost nothing, so it must not reach for the
    // cloud, and records that were never downloaded are simply none rather than
    // an error the caller has to catch.
    saved:token=>token?exclusive(async()=>rows(await load(token)).map(metadata)):Promise.resolve([]),
    resolve:(token,id,choice)=>exclusive(async()=>{
      const state=await load(token),change=state.pending[id];
      if(!change)throw Error('This change was already resolved. Refresh your records.');
      if(choice==='cloud')delete state.pending[id];
      // Keeping this device's change is a new write on a new base. It takes a new
      // name, because the old one may already be a revision the cloud has held.
      else if(choice==='local'){change.baseRevision=state.cloud.find(record=>record.id===id)?.revision??null;change.operation=crypto.randomUUID();change.conflict=false;}
      else throw Error('Choose a conflict resolution.');
      await store.write(resource,token,state);
      await sync(token,state);
      return {records:rows(state).map(metadata),syncMessage:message(state)};
    }),
    disconnect:token=>exclusive(async()=>{
      const state=await load(token);
      if(Object.keys(state.pending).length)throw Error('Sync or resolve your pending changes before disconnecting. They are still saved on this device.');
      await store.remove(resource,token);
    }),
    hasPending:token=>exclusive(async()=>Object.keys((await load(token)).pending).length>0)
  };
}
