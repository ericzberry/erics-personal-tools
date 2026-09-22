import {mountRestaurants as mountShared} from './shared/restaurants.js';
import {aiConnections} from './shared/ai-connection.js';
// The phone's restaurant tool is the shared search without a browser to
// inspect: research runs through the Worker, results and their evidence are
// kept on the device, and each result opens the provider by hand with the
// date and party filled in (docs/RESTAURANT_SEARCH_SPEC.md §10).
export function mountRestaurants(root,{credentials,request,history,loadConnections,online=()=>navigator.onLine!==false}){
  const connections=aiConnections({load:async()=>loadConnections(),provider:'openai',need:'to research restaurants'});
  return mountShared(root,{host:'mobile',credentials,history,online,
    research:async intent=>{
      const token=await credentials.get();
      if(!token)throw Error('Connect this device in Settings to research restaurants.');
      return request(token,`/v1/ai-connections/${await connections.id(token)}/restaurants`,{method:'POST',value:{intent},timeoutMs:170000});
    },
    connectionNote:async()=>online()?connections.note(await credentials.get()):'Offline. Saved results are available; reconnect for new research.'
  });
}
