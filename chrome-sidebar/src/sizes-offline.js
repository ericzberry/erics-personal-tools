import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeSize} from './size-data.js';
// A size is looked up in a shop, which is exactly where the signal is worst, so
// the whole record comes to the device and a new one is written there first and
// synced afterwards.
export const sizesOffline=(options={})=>offlineResource({resource:'sizes',path:'/v1/sizes',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeSize,metadata:record=>record,...options});
