import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeCard} from './card-data.js';
export const cardsOffline=(options={})=>offlineResource({resource:'cards',path:'/v1/cards',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeCard,metadata:record=>record,...options});
