import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeFinance} from './finance-data.js';
// Portfolios and figures travel as one record stream, so one queue, one set of
// conflict rules and one adapter cover both. Every row is needed on the device:
// the totals, the history and the folding are all computed there, which stays
// affordable because a figure is four numbers.
export const financeOffline=(options={})=>offlineResource({resource:'finance',path:'/v1/finance',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeFinance,metadata:record=>record,...options});
