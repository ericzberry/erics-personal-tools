// Gmail content script: hides inbox rows that arrived after the last delivery, strips the unread
// count from the tab title, and tells the background worker how much mail each delivery released.
(function (root) {
  const S = root.FocusMailSchedule || (typeof require === 'function' ? require('./schedule.js') : null);
  // Not `data-focusmail-held`: copies from before 0.1.3 never stand down, so one left in a tab that
  // has been open since then keeps re-marking rows with that name from its own stale cutoff. The
  // stylesheet no longer hides that name, which makes those copies harmless.
  const HELD = 'data-focusmail-wait';

  // Only the inbox list and its category tabs are held. Search, labels, Sent, Drafts and open
  // threads stay complete so you can always find the one email you mean to answer.
  // The inbox list stays on screen with a query on the hash (an open compose window,
  // `#inbox?compose=new`) and beside a thread open in the reading pane (`#inbox/<thread>`), so
  // those are held too. The open thread itself is not an inbox row and is never hidden.
  function isHeldView(hash) {
    const h = String(hash || '').replace(/^#/, '').replace(/\?.*$/, '');
    return h === '' || /^inbox(\/.*)?$/.test(h) || /^category\/[^/]+(\/.*)?$/.test(h);
  }

  // Gmail's AI Inbox summarizes new mail as to-dos and topics with no per-email date to filter on,
  // so while mail is held it is closed entirely: the menu entry is hidden and the view sends you to the inbox.
  function isClosedView(hash) {
    return /^aiinbox(\/p\d+)?$/.test(String(hash || '').replace(/^#/, ''));
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
    let observer = null;
    let timer = null;
    // The background worker injects a fresh copy into open Gmail tabs whenever the extension is
    // installed or reloaded. The newest copy owns the page; an older one, or one whose extension
    // was reloaded under it, stands down instead of fighting it.
    const token = String(Math.random());
    document.documentElement.dataset.focusmailRun = token;
    const superseded = () =>
      document.documentElement.dataset.focusmailRun !== token || !(chrome.runtime && chrome.runtime.id);
    const stop = () => {
      if (observer) observer.disconnect();
      clearInterval(timer);
      removeEventListener('hashchange', apply);
    };

    const apply = () => {
      queued = false;
      if (superseded()) return stop();
      const doc = document;
      const cut = S.cutoff(Date.now(), settings, manualCutoff);
      doc.documentElement.dataset.focusmailHold = settings.enabled ? 'on' : 'off';
      if (settings.enabled && isClosedView(location.hash)) {
        location.replace(location.href.replace(/#.*$/, '#inbox'));
        return;
      }

      if (lastCut != null && Number.isFinite(lastCut) && cut > lastCut) {
        const count = countReleased(doc, lastCut, cut);
        if (count > 0) {
          try {
            chrome.runtime
              .sendMessage({ type: 'delivered', count, cutoff: cut, account: accountFromTitle(doc.title) })
              .catch(() => {});
          } catch {
            // The extension was reloaded mid-delivery; the new copy takes over.
          }
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

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) settings = { ...S.DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      if (changes.manualCutoff) manualCutoff = Number(changes.manualCutoff.newValue) || 0;
      schedule();
    });

    // Start only once both stored values are in, so a switched-off profile is never held by the
    // defaults and a later Deliver now isn't mistaken for a delivery.
    Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('manualCutoff')]).then(([sync, local]) => {
      settings = { ...S.DEFAULT_SETTINGS, ...(sync.settings || {}) };
      manualCutoff = Number(local.manualCutoff) || 0;
      if (superseded()) return;
      // Gmail re-renders the list and retitles the tab constantly, and reuses a row for a thread that
      // gets a new message by rewriting its date's title. Re-apply inside the observer, which runs
      // before the next paint, so a new row is hidden before it is ever drawn.
      observer = new MutationObserver(apply);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title'],
      });
      addEventListener('hashchange', apply);
      // Deliveries happen on the clock even when the page is idle.
      timer = setInterval(schedule, 20 * 1000);
      apply();
    });
  }

  const api = { HELD, isHeldView, isClosedView, applyToRows, countReleased, stripCount, accountFromTitle };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof chrome !== 'undefined' && chrome.storage) start();
})(typeof globalThis !== 'undefined' ? globalThis : self);
