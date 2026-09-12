import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeGift} from './gift-data.js';
// An idea usually arrives away from a desk, so the whole record comes to the
// device and a new one is written there first and synced afterwards.
export const giftsOffline=(options={})=>offlineResource({resource:'gifts',path:'/v1/gifts',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeGift,metadata:record=>record,...options});
