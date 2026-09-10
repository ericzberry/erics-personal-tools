import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizePersonal} from './personal-data.js';
// The sealed envelope is carried to the device so a record can be opened with
// the passkey while offline, without a request that would reveal which record
// was read.
export const personalOffline=(options={})=>offlineResource({resource:'personal',path:'/v1/personal',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizePersonal,metadata:record=>record,...options});
