export const CLOUD_URL = 'https://erics-tools-api.ezberry.workers.dev';
export const CONNECTION_KEY = 'cloudConnection';
export async function cloudRequest(token, path, {method = 'GET', value, fetcher = globalThis.fetch, timeoutMs = 30000} = {}) {
  if (!token || token.length < 32) throw Error('Enter your private access token (at least 32 characters).');
  const body = value === undefined ? undefined : JSON.stringify(value);
  if (body && new TextEncoder().encode(body).length > 64 * 1024) throw Error('These settings exceed the 64 KB limit.');
  const response = await fetcher(`${CLOUD_URL}${path}`, {
    method, headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    body, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status === 401) throw Object.assign(Error('Access token was rejected. Check the Worker’s API_TOKEN secret.'),{status:401});
  if (response.status === 404) throw Error('The settings API has not been deployed yet.');
  let result;
  try {result = await response.json();} catch {throw Error('The Worker is responding, but the storage API has not been deployed yet.');}
  if (!response.ok) throw Object.assign(Error(result.error || `Cloud settings are unavailable (${response.status}).`),{status:response.status});
  return result;
}

// A document goes up as itself, not as JSON: base64 inside a record write would
// cost a third again in size and would not fit the record limit anyway. Where
// the file lands was settled by a previous request, so nothing identifying
// rides along in this URL.
export async function cloudUpload(token, path, {file, fetcher = globalThis.fetch, timeoutMs = 120000} = {}) {
  if (!token || token.length < 32) throw Error('Enter your private access token (at least 32 characters).');
  const response = await fetcher(`${CLOUD_URL}${path}`, {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream'},
    body: file, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status === 401) throw Object.assign(Error('Access token was rejected. Check the Worker\u2019s API_TOKEN secret.'),{status:401});
  let result;
  try {result = await response.json();} catch {throw Error('The upload did not complete. Try filing it again.');}
  if (!response.ok) throw Object.assign(Error(result.error || `The upload did not complete (${response.status}).`),{status:response.status});
  return result;
}
