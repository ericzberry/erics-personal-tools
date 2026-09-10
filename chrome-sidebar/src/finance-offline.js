import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeFinance} from './finance-data.js';
// Every field is needed on device: totals, history and matching are all computed
// locally, and the protected details are an opaque envelope wherever they sit.
export const financeOffline=(options={})=>offlineResource({resource:'finance',path:'/v1/finance',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeFinance,metadata:record=>record,...options});
