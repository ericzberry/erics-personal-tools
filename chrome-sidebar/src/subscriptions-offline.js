import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeSubscription} from './subscription-data.js';
export const subscriptionsOffline=(options={})=>offlineResource({resource:'subscriptions',path:'/v1/subscriptions',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeSubscription,metadata:record=>record,...options});
