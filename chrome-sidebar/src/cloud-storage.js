// This is not only where the API lives. `secret-vault.js` derives VAULT_RP_ID
// from this hostname, so it is also the passkey's relying-party identity — and
// the phone app, served from the same host, arrives at the same ID through its
// own origin. That is why one passkey opens the protected sections in both.
//
// Changing it therefore re-keys the vault. A credential registered against one
// relying-party ID cannot be asserted against another, the PRF output behind it
// is what sealed envelopes are encrypted with, and nothing here re-seals
// existing records under a new key. The recovery code still opens them, because
// it carries the key material itself; a passkey enrolled on a new hostname does
// not. Moving this line is a deliberate migration, not a configuration change —
// see docs/CLOUDFLARE.md before editing it.
//
// It moved once, from the Worker's workers.dev host, while no sealed value
// existed anywhere. That was the only cheap moment it will ever have.
export const CLOUD_URL = 'https://tools.ezberry.net';
export const CONNECTION_KEY = 'cloudConnection';
// This device's saved access token, which is also the key its offline copies
// are encrypted with. The page controllers each grew their own copy of these
// four lines; this is where they belong, beside the key they read.
export const deviceCredentials=(storage=globalThis.chrome?.storage?.local)=>({
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){storage&&globalThis.chrome?.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
});
export async function cloudRequest(token, path, {method = 'GET', value, fetcher = globalThis.fetch, timeoutMs = 30000, maxBytes = 64 * 1024} = {}) {
  if (!token || token.length < 32) throw Error('Enter your private access token (at least 32 characters).');
  const body = value === undefined ? undefined : JSON.stringify(value);
  if (body && new TextEncoder().encode(body).length > maxBytes) throw Error(`This request exceeds the ${Math.round(maxBytes / 1024)} KB limit.`);
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
