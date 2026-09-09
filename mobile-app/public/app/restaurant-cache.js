// A read-only download, not a user-editable cloud record. Searching never writes
// cloud records; offline views therefore have no edits to queue or reconcile.
export const RESTAURANT_CACHE = 'restaurant-research.v1';
export function restaurantCache({store,credentials,locks=globalThis.navigator?.locks}) {
  let disconnected=false,chain=Promise.resolve();
  const exclusive=action=>{
    const run=()=>locks?locks.request(RESTAURANT_CACHE,action):action();
    const result=chain.then(run,run);chain=result.catch(()=>{});return result;
  };
  return {
    read:()=>exclusive(async()=>disconnected?null:store.read(RESTAURANT_CACHE,await credentials.get())),
    write:snapshot=>exclusive(async()=>{
      if(disconnected)throw Error('This device was disconnected.');
      const token=await credentials.get(),prior=await store.read(RESTAURANT_CACHE,token);
      // A slower search in another window cannot replace a newer download.
      if(prior&&prior.startedAt>snapshot.startedAt)return false;
      await store.write(RESTAURANT_CACHE,token,snapshot);return true;
    }),
    disconnect:()=>exclusive(async()=>{
      await store.remove(RESTAURANT_CACHE,await credentials.get());disconnected=true;
    })
  };
}
