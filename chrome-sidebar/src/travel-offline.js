import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {normalizeTravel,travelMetadata} from './travel-data.js';
import {cloudRequest} from './cloud-storage.js';
export function travelOffline(options={}) {
  return offlineResource({resource:'travel',path:'/v1/travel',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeTravel,metadata:travelMetadata,...options});
}
