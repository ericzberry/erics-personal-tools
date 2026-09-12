import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeProperty} from './property-data.js';
// The shortlist is most needed standing outside the house, where there is no
// signal, so the whole record comes to the device and a change is written there
// first and synced afterwards.
export const propertiesOffline=(options={})=>offlineResource({resource:'properties',path:'/v1/properties',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeProperty,metadata:record=>record,...options});
