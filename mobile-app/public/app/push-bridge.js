import {mobileCredentials, mobileRequest} from './mobile-session.js';
// The frame's half of the notification setup: the parent page owns the browser
// APIs, this owns the access token. Nothing here trusts the message beyond its
// origin and its own parent — the same rule the frame is entered by.
const PATH = '/v1/push/subscriptions';
async function revisionOf(token, id) {
  const {records = []} = await mobileRequest(token, PATH);
  return records.find(record => record.id === id)?.revision ?? null;
}
export function mountPushBridge() {
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== parent || parent === window) return;
    const {type, request, id} = event.data || {};
    if (!['mobile-push-save','mobile-push-forget','mobile-push-test'].includes(type)) return;
    const answer = (ok, extra = {}) => parent.postMessage({type:'mobile-push-result', request, ok, ...extra}, location.origin);
    try {
      const token = await mobileCredentials.get();
      if (type === 'mobile-push-test') { answer(true, {value:await mobileRequest(token, '/v1/push/test', {method:'POST', value:{}})}); return; }
      if (!/^[a-f0-9-]{36}$/.test(String(id || ''))) throw Error('Unknown device.');
      const revision = await revisionOf(token, id);
      if (type === 'mobile-push-forget') {
        if (revision !== null) await mobileRequest(token, `${PATH}/${id}`, {method:'DELETE', value:{revision}});
        answer(true, {value:{}});
        return;
      }
      const {endpoint, p256dh, auth, timeZone, hour} = event.data.subscription || {};
      answer(true, {value:await mobileRequest(token, `${PATH}/${id}`, {method:'PUT', value:{endpoint, p256dh, auth, timeZone, hour, revision}})});
    } catch (error) { answer(false, {error:error?.message || 'That did not work.'}); }
  });
}
