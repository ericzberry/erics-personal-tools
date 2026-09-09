// Extension storage events reach side panels even across browser storage partitions.
// Only a random change marker is shared; private records stay in encrypted storage.
export function travelChanges(onChange,{storage=globalThis.chrome?.storage,Channel=globalThis.BroadcastChannel}={}) {
  const key='travel-record-change';
  if(storage?.local?.set&&storage?.onChanged){
    const listener=(changes,area)=>{if(area==='local'&&changes[key])onChange();};
    storage.onChanged.addListener(listener);
    return {
      publish:()=>storage.local.set({[key]:crypto.randomUUID()}).catch(()=>{}),
      close:()=>storage.onChanged.removeListener(listener)
    };
  }
  const channel=typeof Channel==='function'?new Channel('travel-record-changes'):null;
  if(channel)channel.onmessage=event=>{if(event.data?.type==='saved')onChange();};
  return {publish:()=>channel?.postMessage({type:'saved'}),close:()=>channel?.close()};
}
