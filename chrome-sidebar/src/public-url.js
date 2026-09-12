// One reading of "a link safe to show and open": HTTPS, a real public hostname,
// no embedded credentials, no fragment. Restaurants asked for it first; it is
// here so every feature that stores a link the owner typed answers to the same
// rule rather than to its own near-copy.
export function safePublicURL(value) {
  try { const u = new URL(value); const h=u.hostname;
    if (u.protocol!=='https:' || u.username || u.password || !h.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(h)) return null;
    u.hash=''; return u.href;
  } catch { return null; }
}
