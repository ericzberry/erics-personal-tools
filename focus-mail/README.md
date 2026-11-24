# Focus Mail

A Chrome extension that holds new Gmail back and delivers it in batches, like an
inbox pause. Between deliveries the inbox looks exactly as it did at the last
delivery: new mail doesn't appear, the unread counts in the tab title, the left
menu and the red badge on the Mail icon are gone, and Gmail's desktop pop-ups are
silenced. At each delivery time the held mail appears all at once, with one
notification per account ("5 new emails").

Gmail's AI Inbox is closed while mail is held: its menu entry is hidden and opening
it lands on the inbox, because it summarizes new mail in a way that can't be filtered.

Verification codes, 2FA prompts, sign-in links and password resets are never held:
their rows show as they arrive and their Gmail pop-ups come through. There is no
setting for this.

Searching, Sent, Drafts, labels and open threads are never filtered. To reply to a
particular email, search for it and answer it as usual.

It is separate from Eric's Sidebar so it can run in any Chrome profile without the
sidebar.

## Install (once per Chrome profile)

1. In each profile (ezberry@gmail.com and eric@averincapital.com), open
   `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose
   `/Users/ericberry/erics-personal-tools/focus-mail`.
3. Pin it from the puzzle-piece menu, and allow notifications for Chrome in macOS
   System Settings → Notifications if you want delivery alerts.
Open Gmail tabs pick it up straight away; there's no need to reload them.

Both profiles load the same folder, so after a code change click **Reload** on the
extension in each profile.

## Using it

The toolbar button shows an on/off switch, the next delivery time with a bar for how
far through the wait you are and **Deliver now** (shows everything up to this
moment, then holds again), and the delivery times as
chips: click one to change it, × to remove it, + to add one.
Defaults are 8:00, 11:00, 14:00 and 17:00 every day. Settings are per profile.

## How it works

- `src/content.js` reads each inbox row's arrival time from Gmail's date cell
  (`td.xW span[title]`) and hides rows newer than the cutoff: the latest scheduled
  time, or **Deliver now** if that was later. It also strips the `(n)` count from
  the tab title. Only the inbox list, its pages and the category tabs are filtered,
  including while a compose window or a reading-pane thread is open beside the list
  (`#inbox?compose=new`, `#inbox/<thread>`; before 0.1.5 those showed all held mail), and
  `#aiinbox` is sent to `#inbox` while holding. It re-applies inside a
  MutationObserver, before the next paint, so new rows never flash in.
- `src/content.css` hides held rows and the menu's unread counts.
- `src/page.js` runs in Gmail's own page and swallows its `Notification` and
  `showNotification` calls while holding is on.
- `src/background.js` shows one notification per delivery per account, and focuses
  the Gmail tab when it's clicked. On install or reload it injects the scripts and
  stylesheet into Gmail tabs that are already open: Chrome only injects into pages
  loaded afterwards, and a reload strips the old copy's stylesheet, so those tabs
  would otherwise show everything. The newest copy in a tab owns it; older ones stop.
  Copies from before 0.1.3 can't stop, so the row marker was renamed in 0.1.4 and theirs
  no longer hides anything.
- `src/urgent.js` decides what cannot wait (codes, 2FA, sign-in and reset mail) from a
  row's sender, subject and snippet, or a pop-up's text. It loads in both the content
  script and Gmail's own page. A Gmail tab open since before 0.1.6 lets the rows
  through at once but needs one reload before the pop-ups come through.
- `icons/icon.svg` is the icon's source; the PNGs beside it are rendered from it.
- `src/schedule.js` holds the schedule maths and is shared by the content script,
  popup and tests.

## Limits

- It only affects Gmail in Chrome. The Gmail phone app, Apple Mail and other clients
  still show mail as it arrives.
- A delivery notification needs a Gmail tab open in that profile at delivery time.
- If Gmail changes its page markup, rows it can't date are left visible rather than
  hidden. Check that the tests' selectors still match.
- If you turned on Gmail's "Unread message icon" (Settings → Advanced), turn it off;
  the extension doesn't touch the tab icon.

## Tests

```bash
node --test focus-mail/tests/*.test.js
```

The DOM tests borrow `linkedom` from `chrome-sidebar/node_modules`, so run
`npm --prefix chrome-sidebar install` first on a fresh checkout.
