export const CLOUD_URL = 'https://erics-tools-api.ezberry.workers.dev';
export const CONNECTION_KEY = 'cloudConnection';
export async function cloudRequest(token, path, {method = 'GET', value, fetcher = globalThis.fetch} = {}) {
  if (!token || token.length < 32) throw Error('Enter your private access token (at least 32 characters).');
  const body = value === undefined ? undefined : JSON.stringify(value);
  if (body && new TextEncoder().encode(body).length > 64 * 1024) throw Error('These settings exceed the 64 KB limit.');
  const response = await fetcher(`${CLOUD_URL}${path}`, {
    method, headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    body, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000)
  });
  if (response.status === 401) throw Object.assign(Error('Access token was rejected. Check the Worker’s API_TOKEN secret.'),{status:401});
  if (response.status === 404) throw Error('The settings API has not been deployed yet.');
  let result;
  try {result = await response.json();} catch {throw Error('The Worker is responding, but the storage API has not been deployed yet.');}
  if (!response.ok) throw Object.assign(Error(result.error || `Cloud settings are unavailable (${response.status}).`),{status:response.status});
  return result;
}
