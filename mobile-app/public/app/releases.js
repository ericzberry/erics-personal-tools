export const VERSION = '0.1.41';
const KEY = 'erics-tools-mobile-release-check';
const HOUR = 60 * 60 * 1000;
export function newer(candidate, current = VERSION) {
  if (!/^\d+\.\d+\.\d+$/.test(candidate)) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
// `force` is for the Settings check-for-a-new-version button: an explicit user
// action, not one of the automatic checks the hourly throttle paces. It still
// records the attempt, so the automatic checks back off after it.
export async function checkRelease(storage, fetcher = fetch, now = Date.now(), {force = false} = {}) {
  let prior;
  try { prior = JSON.parse(storage.getItem(KEY) || 'null'); } catch { return null; }
  if (!force && prior && Number.isFinite(prior.at) && now - prior.at < HOUR) return prior.version || null;
  // Record attempts before the request, including failures. If persistence is
  // unavailable, skip automatic checks rather than repeatedly contacting D1.
  try { storage.setItem(KEY, JSON.stringify({at: now, version: prior?.version || null})); } catch { return null; }
  try {
    const response = await fetcher('/v1/releases/latest?app=mobile-app', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw Error(`Release check failed: ${response.status}`);
    const {version} = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Release check returned no version');
    storage.setItem(KEY, JSON.stringify({at: now, version}));
    return version;
    // A forced check reports its failure, so the button can say so; automatic
    // checks stay silent and keep whatever version was last known.
  } catch (error) { if (force) throw error; return prior?.version || null; }
}
