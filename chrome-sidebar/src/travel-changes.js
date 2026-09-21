// Extension storage events reach side panels even across browser storage partitions.
// Only a random change marker is shared; private records stay in encrypted storage.
export function travelChanges(onChange,{resource='travel',storage=globalThis.chrome?.storage,Channel=globalThis.BroadcastChannel}={}) {
  const key=`${resource}-record-change`;
  if(storage?.local?.set&&storage?.onChanged){
    // The marker is handed to the listener and returned by `publish`, so a view
    // can tell its own save from another view's: storage reports a change to
    // every extension page, the one that made it included.
    const listener=(changes,area)=>{if(area==='local'&&changes[key])onChange(changes[key].newValue);};
    storage.onChanged.addListener(listener);
    return {
      publish:()=>{const marker=crypto.randomUUID();storage.local.set({[key]:marker}).catch(()=>{});return marker;},
      close:()=>storage.onChanged.removeListener(listener)
    };
  }
  const channel=typeof Channel==='function'?new Channel(`${resource}-record-changes`):null;
  if(channel)channel.onmessage=event=>{if(event.data?.type==='saved')onChange();};
  return {publish:()=>channel?.postMessage({type:'saved'}),close:()=>channel?.close()};
}
