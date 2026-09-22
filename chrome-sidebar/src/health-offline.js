import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeHealth} from './health-data.js';
// Every health object — a record, a relative, a prior revision — is one sealed
// envelope, and the whole set comes to the device so the notebook opens with
// the passkey and no request while offline. The adapter's queue, revisions and
// conflict handling are the shared ones; nothing here syncs differently.
export const healthOffline=(options={})=>offlineResource({resource:'health',path:'/v1/health',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeHealth,metadata:record=>record,...options});

// The unsaved note. It is sealed with the vault key as it is typed — before it
// is written anywhere — so an idle lock, a closed editor or a failed save
// leaves a copy this device can offer back after the next unlock, and nothing
// readable in storage meanwhile. The device store encrypts it a second time
// under the connection token, like every other private copy. It queues
// nothing, so it never holds a disconnect up, and it is cleared with the rest.
export const HEALTH_DRAFT_RESOURCE='health-draft';
export function healthDrafts({store=encryptedDeviceStore(),resource=HEALTH_DRAFT_RESOURCE}={}){
  return {
    resource,
    // `sealed` is the vault envelope; `at` says when it was last written.
    read:token=>token?store.read(resource,token).catch(()=>null):Promise.resolve(null),
    write:(token,sealed,at=new Date().toISOString())=>store.write(resource,token,{sealed,at}),
    remove:token=>store.remove(resource,token),
    hasPending:async()=>false,
    disconnect:token=>store.remove(resource,token)
  };
}
