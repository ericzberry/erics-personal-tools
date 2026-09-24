import {mountRestaurants as mountShared} from './shared/restaurants.js';
import {aiConnections} from './shared/ai-connection.js';
// The phone's restaurant tool is the shared search without a browser to
// inspect: research runs through the Worker, results and their evidence are
// kept on the device, and each result opens the provider by hand with the
// date and party filled in (docs/RESTAURANT_SEARCH_SPEC.md §10).
export function mountRestaurants(root,{credentials,request,history,loadConnections,online=()=>navigator.onLine!==false}){
  const connections=aiConnections({load:async()=>loadConnections(),provider:'openai',need:'to research restaurants'});
  const token=async()=>{
    const value=await credentials.get();
    if(!value)throw Error('Connect this device in Settings to research restaurants.');
    return value;
  };
  return mountShared(root,{host:'mobile',credentials,history,online,
    read:async words=>{
      const value=await token();
      return (await request(value,`/v1/ai-connections/${await connections.id(value)}/restaurant-intent`,{method:'POST',value:words,timeoutMs:40000})).reading;
    },
    research:async intent=>{
      const value=await token();
      return request(value,`/v1/ai-connections/${await connections.id(value)}/restaurants`,{method:'POST',value:{intent},timeoutMs:170000});
    },
    connectionNote:async()=>online()?connections.note(await credentials.get()):'Offline. Saved results are available; reconnect for new research.'
  });
}
