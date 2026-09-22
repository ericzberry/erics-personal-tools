import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeReplacement} from './replacement-data.js';
// The drawer is opened in a shop aisle, which is where the signal is worst, so
// the whole record comes to the device and a new one is written there first and
// synced afterwards.
export const replacementsOffline=(options={})=>offlineResource({resource:'replacements',path:'/v1/replacements',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeReplacement,metadata:record=>record,...options});
