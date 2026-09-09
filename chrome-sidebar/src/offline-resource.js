// Shared offline-first data adapter. All state changes are serialized across windows.
export function offlineResource({resource,path,store,remote,normalize,metadata,online=()=>globalThis.navigator?.onLine!==false,locks=globalThis.navigator?.locks,now=()=>new Date().toISOString()}) {
  let chain=Promise.resolve();
  const exclusive=action=>{
    const execute=()=>locks?locks.request(`erics-data:${resource}`,action):action();
    const result=chain.then(execute,execute);chain=result.catch(()=>{});return result;
  };
  const empty=()=>({cloud:[],pending:{},syncedAt:null,error:''});
  const same=(left,right)=>Object.keys(normalize(right)).every(key=>left?.[key]===right[key]);
  const rows=state=>{
    const records=new Map(state.cloud.map(record=>[record.id,record]));
    for(const [id,change] of Object.entries(state.pending))records.set(id,{...change.value,id,revision:change.localRevision,pending:true,conflict:!!change.conflict,deleting:change.method==='DELETE'});
    return [...records.values()];
  };
  function message(state){
    const pending=Object.values(state.pending),conflicts=pending.filter(item=>item.conflict).length;
    if(conflicts)return `${conflicts} conflicting change${conflicts===1?'':'s'}. Review the marked records; your local changes are safe.`;
    if(pending.length)return `Saved on this device · ${pending.length} change${pending.length===1?'':'s'} waiting to sync.${state.error?' '+state.error:''}`;
    if(state.error)return `Using the saved offline copy. ${state.error}`;
    return online()?'Saved on this device · Up to date.':'Offline · Saved records are available on this device.';
  }
  async function sync(token,state){
    if(!online())return state;
    try{
      const snapshot=await remote(token,`${path}/snapshot`);
      state.cloud=snapshot.records;
      for(const [id,change] of Object.entries(state.pending)){
        const current=state.cloud.find(record=>record.id===id);
        // Reconcile a successful write whose response was lost before retrying.
        if((change.method==='DELETE'&&!current)||(change.method==='PUT'&&current&&same(current,change.value))){delete state.pending[id];continue;}
        if((current?.revision??null)!==change.baseRevision){change.conflict=true;continue;}
        try{
          const response=await remote(token,`${path}/${id}`,{method:change.method,value:{...change.value,revision:change.baseRevision}});
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
    if(options.method==='DELETE'&&old?.baseRevision===null){delete state.pending[id];}
    else state.pending[id]={method:options.method,value,baseRevision:old?old.baseRevision:previous?.revision??null,localRevision:`local:${crypto.randomUUID()}`,conflict:old?.conflict||false};
    // Commit the queue BEFORE attempting the network. A restart cannot lose it.
    await store.write(resource,token,state);
    state=await sync(token,state);
    return {record:rows(state).find(record=>record.id===id),records:rows(state).map(metadata),syncMessage:message(state)};
  });
  return {
    request,
    resolve:(token,id,choice)=>exclusive(async()=>{
      const state=await load(token),change=state.pending[id];
      if(!change)throw Error('This change was already resolved. Refresh your records.');
      if(choice==='cloud')delete state.pending[id];
      else if(choice==='local'){change.baseRevision=state.cloud.find(record=>record.id===id)?.revision??null;change.conflict=false;}
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
