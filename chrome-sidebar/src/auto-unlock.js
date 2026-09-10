// Attempt once per visit/foreground period. Visibility changes caused by the
// passkey sheet must not create a retry loop when it is dismissed.
export function autoUnlock({eligible, unlock}) {
  let attempted = false, pending = false;
  return {
    async request() {
      if (attempted || pending || !eligible()) return;
      attempted = true;
      pending = true;
      try { await unlock(); } finally { pending = false; }
    },
    background() { if (!pending) attempted = false; },
    suppress() { attempted = true; }
  };
}
