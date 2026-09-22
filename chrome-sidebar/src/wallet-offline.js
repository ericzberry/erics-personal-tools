import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {validateWalletRecord} from './wallet-data.js';
// The wallet's records about itself — which page name is which account, what
// a currency is worth to the owner, which opportunity was dismissed, what the
// points are for — through the same offline adapter and per-record revisions
// every other tool's records use. `/v1/wallet` is the generic record store on
// the Worker; the validator is shared with it.
export const walletOffline=(options={})=>offlineResource({resource:'wallet',path:'/v1/wallet',store:encryptedDeviceStore(),remote:cloudRequest,normalize:validateWalletRecord,metadata:record=>record,...options});
