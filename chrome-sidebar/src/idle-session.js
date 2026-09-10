// Canonical inactivity gate, shared by the mobile app lock and the sidebar's
// protected-secret vault. A backwards clock is treated as expiry, never as
// extra time.
export const IDLE_MS = 15 * 60 * 1000;
export function idleSession({now = Date.now, onLock = () => {}, idleMs = IDLE_MS} = {}) {
  let active = false, last = 0;
  return {
    start() { active = true; last = now(); },
    check() {
      if (active && (now() < last || now() - last >= idleMs)) this.lock('idle');
      return active;
    },
    touch() { if (this.check()) last = now(); },
    lock(reason = 'manual') { const wasActive = active; active = false; last = 0; if (wasActive) onLock(reason); }
  };
}
