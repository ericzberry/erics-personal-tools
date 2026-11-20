// Gmail content script: hides inbox rows that arrived after the last delivery, strips the unread
// count from the tab title, and tells the background worker how much mail each delivery released.
(function (root) {
  const S = root.FocusMailSchedule || (typeof require === 'function' ? require('./schedule.js') : null);
  const HELD = 'data-focusmail-held';

  // Only the inbox list and its category tabs are held. Search, labels, Sent, Drafts and open
  // threads stay complete so you can always find the one email you mean to answer.
  function isHeldView(hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (h === '' || h === 'inbox' || /^inbox\/p\d+$/.test(h)) return true;
    return /^category\/[^/]+(\/p\d+)?$/.test(h);
  }

  function rowArrival(row) {
    const span = row.querySelector('td.xW span[title]');
    return span ? S.parseGmailDate(span.getAttribute('title')) : null;
  }

  // Marks held rows; returns how many are held. Leaves every row visible outside the held views.
  function applyToRows(doc, cut, hash) {
    const active = isHeldView(hash);
    let held = 0;
    for (const row of doc.querySelectorAll('tr.zA')) {
      const hide = active && S.isHeld(rowArrival(row), cut);
      if (hide) held += 1;
      if (hide !== row.hasAttribute(HELD)) {
        if (hide) row.setAttribute(HELD, '');
        else row.removeAttribute(HELD);
      }
    }
    return held;
  }

  // Unread rows a delivery just released: arrived after the previous cutoff, at or before the new one.
  function countReleased(doc, previousCut, cut) {
    let n = 0;
    for (const row of doc.querySelectorAll('tr.zA.zE')) {
      const t = rowArrival(row);
      if (t != null && S.isHeld(t, previousCut) && !S.isHeld(t, cut)) n += 1;
    }
    return n;
  }

  // "Inbox (3) - you@example.com - Gmail" → "Inbox - you@example.com - Gmail"
  function stripCount(title) {
    return String(title).replace(/\s\(\d[\d,]*\)(?=\s|$)/, '');
  }

  function accountFromTitle(title) {
    const m = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(String(title));
    return m ? m[0] : 'Gmail';
  }

  function start() {
    let settings = { ...S.DEFAULT_SETTINGS };
    let manualCutoff = 0;
    let lastCut = null;
    let queued = false;

    const apply = () => {
      queued = false;
      const doc = document;
      const cut = S.cutoff(Date.now(), settings, manualCutoff);
      doc.documentElement.dataset.focusmailHold = settings.enabled ? 'on' : 'off';

      if (lastCut != null && Number.isFinite(lastCut) && cut > lastCut) {
        const count = countReleased(doc, lastCut, cut);
        if (count > 0) {
          chrome.runtime
            .sendMessage({ type: 'delivered', count, cutoff: cut, account: accountFromTitle(doc.title) })
            .catch(() => {});
        }
      }
      lastCut = cut;

      applyToRows(doc, cut, location.hash);
      if (settings.enabled && doc.title !== stripCount(doc.title)) doc.title = stripCount(doc.title);
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      setTimeout(apply, 50);
    };

    chrome.storage.sync.get('settings').then(({ settings: s }) => {
      settings = { ...S.DEFAULT_SETTINGS, ...(s || {}) };
      schedule();
    });
    chrome.storage.local.get('manualCutoff').then(({ manualCutoff: m }) => {
      manualCutoff = Number(m) || 0;
      schedule();
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) settings = { ...S.DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      if (changes.manualCutoff) manualCutoff = Number(changes.manualCutoff.newValue) || 0;
      schedule();
    });

    // Gmail re-renders the list and retitles the tab constantly; re-apply after each burst.
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    addEventListener('hashchange', schedule);
    // Deliveries happen on the clock even when the page is idle.
    setInterval(schedule, 20 * 1000);
    schedule();
  }

  const api = { isHeldView, applyToRows, countReleased, stripCount, accountFromTitle };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof chrome !== 'undefined' && chrome.storage) start();
})(typeof globalThis !== 'undefined' ? globalThis : self);
