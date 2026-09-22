import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {REWARD_FIELDS} from './rewards-data.js';
// Every field the wallet stores, read off the validator so the two cannot
// drift: a field missing here is silently dropped on its way to the cloud,
// which is how `remaining` — what a card's tracker said was left of a credit —
// was lost on every save for a release. tests/rewards-offline.test.js saves a
// credit with a remaining amount through this adapter and reads it back.
const fields=['id',...REWARD_FIELDS,'updatedAt'];
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
