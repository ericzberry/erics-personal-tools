import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeTrip,tripExpired} from './trip-data.js';
export const tripsOffline=(options={})=>offlineResource({resource:'trips',path:'/v1/trips',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeTrip,expired:tripExpired,metadata:record=>record,...options});
