import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeReminder} from './reminder-data.js';
// Every field comes back to the device: the next date, how late something is,
// and what needs attention are all computed there, so a phone with no signal
// still knows what is coming.
export const remindersOffline=(options={})=>offlineResource({resource:'reminders',path:'/v1/reminders',store:encryptedDeviceStore(),remote:cloudRequest,normalize:normalizeReminder,metadata:record=>record,...options});
