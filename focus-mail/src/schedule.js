// Delivery schedule maths, shared by the Gmail content script, the popup and the tests.
// Loaded as a classic script (content scripts cannot be ES modules) and as CommonJS in Node.
(function (root) {
  const DEFAULT_SETTINGS = Object.freeze({ enabled: true, times: ['08:00', '11:00', '14:00', '17:00'] });
  const MINUTE = 60 * 1000;

  // "HH:MM" strings → sorted unique minutes after midnight; anything malformed is dropped.
  function normalizeTimes(times) {
    const minutes = new Set();
    for (const t of Array.isArray(times) ? times : []) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
      if (!m) continue;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) continue;
      minutes.add(h * 60 + min);
    }
    return [...minutes].sort((a, b) => a - b);
  }

  function formatTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function atMinutes(day, minutes) {
    const d = new Date(day);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d.getTime();
  }

  // Delivery instants on the day before, of, and after `now`, in local time.
  function candidates(now, times) {
    const out = [];
    for (const offset of [-1, 0, 1]) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      for (const m of normalizeTimes(times)) out.push(atMinutes(day, m));
    }
    return out;
  }

  function lastScheduled(now, times) {
    const past = candidates(now, times).filter((t) => t <= now);
    return past.length ? Math.max(...past) : 0;
  }

  function nextScheduled(now, times) {
    const future = candidates(now, times).filter((t) => t > now);
    return future.length ? Math.min(...future) : null;
  }

  // Mail that arrived after the cutoff stays hidden. Off means nothing is held.
  function cutoff(now, settings, manualCutoff) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    if (!s.enabled) return Infinity;
    return Math.max(lastScheduled(now, s.times), Number(manualCutoff) || 0);
  }

  // Gmail puts the full arrival time in the date cell's title, e.g. "Fri, Nov 20, 2026, 9:00 AM"
  // (some locales use "at" and a narrow no-break space before AM/PM). Minute precision only.
  function parseGmailDate(title) {
    if (!title) return null;
    const cleaned = String(title).replace(/[  ]/g, ' ').replace(/\s+at\s+/, ' ').trim();
    const t = Date.parse(cleaned);
    return Number.isFinite(t) ? t : null;
  }

  // Gmail shows minutes, so compare whole minutes: a row stamped in a later minute than the cutoff is held.
  // Unknown times are never held — a row we cannot date stays visible rather than going missing.
  function isHeld(arrival, cut) {
    if (arrival == null || !Number.isFinite(cut)) return false;
    return Math.floor(arrival / MINUTE) > Math.floor(cut / MINUTE);
  }

  const api = { DEFAULT_SETTINGS, normalizeTimes, formatTime, lastScheduled, nextScheduled, cutoff, parseGmailDate, isHeld };
  root.FocusMailSchedule = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
