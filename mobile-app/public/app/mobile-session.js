// This module runs only inside the disposable, unlocked mobile frame.
let token = '';
export function assertMobileAccess() {
  if (!token || parent === window || !parent.mobileAccessAllowed?.()) throw Error('Unlock the mobile app first.');
}
export function initialize(value) { token = value; }
export const mobileCredentials = {
  async get() { assertMobileAccess(); return token; },
  async set(value) { assertMobileAccess(); if (value !== token) throw Error('Disconnect this device before changing its access token.'); },
  async remove() { assertMobileAccess(); token = ''; parent.postMessage({type: 'mobile-disconnected'}, location.origin); }
};
export async function mobileRequest(value, path, {method = 'GET', value: body, timeoutMs = 30000} = {}) {
  assertMobileAccess();
  if (!token || value !== token) throw Error('Unlock the mobile app first.');
  if (!/^\/(health|v1\/)/.test(path)) throw Error('Unknown mobile request.');
  const response = await fetch(path, {
    method, headers: {Authorization: `Bearer ${token}`, ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs)
  });
  assertMobileAccess();
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(Error(response.status === 401 ? 'Your access token was rejected. Check your connection credentials.' : data.error || 'Cloud access is unavailable. Try again.'), {status: response.status});
  }
  const result = await response.json();
  assertMobileAccess();
  return result;
}

export function protectedStore(store) {
  return Object.fromEntries(['read','write','remove'].map(method => [method, async (...args) => {
    assertMobileAccess();
    const result = await store[method](...args);
    assertMobileAccess();
    return result;
  }]));
}
