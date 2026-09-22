import {privateStores,assertNothingPending,disconnectStores} from './private-resources.js';
import {forgetProgramReads} from './reward-programs.js';
// The extension's copies are every store in the registry, plus the note of
// which program pages were read, which only the extension keeps.
const deviceStores=()=>globalThis.indexedDB?privateStores():null;
export async function assertPrivateDataSynced(token,stores=deviceStores()){
  if(token&&stores)await assertNothingPending(stores,token);
}
export async function disconnectPrivateData(token,stores=deviceStores()){
  if(!token||!stores)return;
  await disconnectStores(stores,token);
  await forgetProgramReads();
}
