import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizePerson} from './people-data.js';
export const peopleOffline=(options={})=>offlineResource({resource:'people',path:'/v1/people',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizePerson,metadata:record=>record,...options});
