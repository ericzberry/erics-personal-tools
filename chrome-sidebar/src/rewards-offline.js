import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
const fields=['id','kind','name','source','value','due','state','url','notes','secret','secretHint','updatedAt'];
const normalize=value=>Object.fromEntries(fields.map(key=>[key,value[key]||'']));
const record=value=>({...normalize(value),revision:JSON.stringify(normalize(value))});
// The existing API revisions the wallet as a whole. Merge one queued record into
// a fresh wallet snapshot, then use its revision for an atomic conditional write.
export function rewardsOffline({store=encryptedDeviceStore(),remote=cloudRequest,online,locks}={}){
  return offlineResource({resource:'rewards',path:'/v1/rewards',store,normalize,metadata:value=>value,online,locks,
    remote:async(token,path,options={})=>{
      const wallet=await remote(token,'/v1/rewards');
      if(path==='/v1/rewards/snapshot')return {records:wallet.entries.map(record)};
      const id=path.split('/').at(-1),previous=wallet.entries.find(entry=>entry.id===id);
      if((previous?record(previous).revision:null)!==(options.value.revision??null))throw Object.assign(Error('This reward changed on another device. Review the conflict.'),{status:409});
      const entries=wallet.entries.filter(entry=>entry.id!==id);
      if(options.method==='PUT')entries.push(normalize({...options.value,id}));
      const saved=await remote(token,'/v1/rewards',{method:'PUT',value:{entries,revision:wallet.revision}});
      return {record:options.method==='PUT'?record(saved.entries.find(entry=>entry.id===id)):undefined};
    }
  });
}
