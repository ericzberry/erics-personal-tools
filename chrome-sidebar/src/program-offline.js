import {offlineResource} from './offline-resource.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';
// Read-only, unlike every other adapter here: a catalogue is written by the
// reader that visits the program's site, never by the tool showing it. This
// exists so the offers stay readable on a phone with no signal, and on a
// desktop that has not been near the program's site in weeks.
export function programsOffline({store = encryptedDeviceStore(), remote = cloudRequest, online, locks} = {}) {
  return offlineResource({
    resource: 'reward-programs', path: '/v1/rewards/programs', store, remote,
    normalize: value => value, metadata: value => value, online, locks
  });
}
