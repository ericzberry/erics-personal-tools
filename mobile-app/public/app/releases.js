export const VERSION = '0.1.18';
const KEY = 'erics-tools-mobile-release-check';
const HOUR = 60 * 60 * 1000;
export function newer(candidate, current = VERSION) {
  if (!/^\d+\.\d+\.\d+$/.test(candidate)) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
export async function checkRelease(storage, fetcher = fetch, now = Date.now()) {
  let prior;
  try { prior = JSON.parse(storage.getItem(KEY) || 'null'); } catch { return null; }
  if (prior && Number.isFinite(prior.at) && now - prior.at < HOUR) return prior.version || null;
  // Record attempts before the request, including failures. If persistence is
  // unavailable, skip automatic checks rather than repeatedly contacting D1.
  try { storage.setItem(KEY, JSON.stringify({at: now, version: prior?.version || null})); } catch { return null; }
  try {
    const response = await fetcher('/v1/releases/latest?app=mobile-app', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    if (!response.ok) return prior?.version || null;
    const {version} = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return prior?.version || null;
    storage.setItem(KEY, JSON.stringify({at: now, version}));
    return version;
  } catch { return prior?.version || null; }
}
