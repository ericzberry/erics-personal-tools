# Finance and Personal information

Two capabilities whose entire contents sit behind the device passkey. Choose
either from Tools in the extension or the unlocked mobile app.

## The gate

Both sections render nothing until the passkey answers — not a record name, not
a total, not a category. In these sections a record's name is often as
revealing as its value, so `chrome-sidebar/src/vault-gate.js` hides the whole
tool rather than masking individual fields.

**Arriving at the section asks for the passkey.** Opening Finance is a request
to read it, so the gate raises the prompt itself rather than reporting that the
section is locked and waiting to be told again. It asks once per arrival —
mounting a visible section, showing a hidden one, returning to a backgrounded
tab, or an idle window running out in front of the reader — so a dismissed
sheet leaves an **Unlock** button and never a loop. It never asks behind a
hidden tool or a backgrounded tab, where the prompt would belong to nothing the
reader is looking at, and **Lock now** means locked: it is the one lock the gate
does not offer to undo by itself. `auto-unlock.js` holds that one-attempt rule,
shared with the mobile app's own lock screen.

The gate is built on `secret-vault.js`, the same WebAuthn PRF key that seals
card numbers. One vault is shared per host (`sharedVault()`), so a single
passkey prompt opens every protected section on the page and one 15-minute idle
window governs them together: activity in the ledger keeps the personal records
open, and going idle closes both and drops anything already revealed. Locking is
also explicit — **Lock now** is reachable while unlocked, except where the
session was borrowed from the host's own lock (see below).

**Open says nothing.** A section that is unlocked shows its records; it does not
announce that it is unlocked or count down the idle window. The gate's status
line is empty while open and speaks only when an attempt fails, so the state the
reader can see is never also narrated to them. The same holds for the wallet's
**Protected values** — no banner, only the controls that still apply.

**The unlocked session belongs to the browser, not to the page.** In the
extension each capability is its own tab, so a key held only in one page's
memory would mean a fresh biometric check for every navigation and a reload that
throws the unlock away. `vaultSessionStore()` keeps the derived key in
`chrome.storage.session`: memory only, gone when the browser closes, and
reachable by this extension's pages but not by a web page or content script.
One check therefore covers the idle window wherever it is spent, an unlock in
one tab opens the others, and locking or idling in any of them closes all of
them. The stored stamp carries the window's remaining time, so a restored
session expires when it was always going to. The trade is deliberate: the key is
readable by any extension page for as long as the window lasts, which is already
true of the page that derived it. The mobile app has no such area and needs
none — every tool there shares one page.

**On the phone, the app's own lock is the check.** The mobile app already asks
for the passkey before it shows anything, to unwrap this device's access token.
That is a WebAuthn PRF evaluation of the same passkey the record vault needs, so
`mobile-security.js` evaluates the vault's salt (`PRF_SALT`) beside its own in
that one assertion: one salt yields the key that unwraps the token, the other
the key that opens sealed records. The unlocked frame adopts the second through
`unlockWithPasskeySeed()` before any tool mounts, so opening Finance right after
unlocking the app is simply open — it does not ask for the passkey the owner has
just given. The two keys stay independent: neither can be derived from the
other, and the record key lives only as long as the unlocked session does. An
authenticator that evaluates only one salt returns nothing for the second, and
each section asks for itself exactly as it did before.

A session opened that way reports itself as **borrowed** (`vault.borrowed()`),
and a gate over a borrowed session offers no controls at all. **Lock now** there
would close a session the reader never opened from this panel, and the next
arrival would ask for the passkey they had already given — the very prompt this
removes. Recovery belongs to the same lock: the phone's own **Recover access**
is the way back, and the code itself stays available in the rewards wallet. In
the extension nothing is borrowed, so both controls stay where they were.

**The check names the passkey that answered last.** A request that names no
credential leaves the browser to ask which passkey to use, and that chooser is
noise for a reader who has one — worse when a synced copy or a repeated
enrollment fills it with entries under the same name. The credential ID of a
successful check is kept in `chrome.storage.local` (ordinary local storage on
mobile) and named on every check after it, so the routine unlock is a plain
biometric prompt. The ID identifies a passkey and cannot use one, so it is not
the kind of thing the session area guards. A named passkey that this device no
longer holds is forgotten rather than becoming a dead end: the failed check
drops the ID, and the next attempt asks the way the first one did.

**Two passkeys for this site derive two different keys**, and an assertion
succeeds under either, so naming the wrong one could otherwise stick. Opening a
sealed value is the only test of which passkey sealed it, and every protected
section reads through `vault.open()` for that reason: a value that will not open
drops the remembered ID, so the next check offers the choice again. Falling back
to the recovery code drops it too.

**Enrollment renews one passkey rather than adding another.** An authenticator
files a resident credential under `rp.id` and `user.id` together and replaces it
only when both match, so `passkey-vault.js` enrolls under a fixed user handle: a
repeated setup, or a recovery, replaces the passkey it renews instead of leaving
another entry behind under the same name. Entries from before that — an earlier
enrollment, a restarted setup, a recovery — stay in the provider until they are
deleted there, and only one of them holds the key that opens existing values.
The app cannot remove a credential it created.

Losing every copy of the passkey makes protected values unreadable. The recovery
code is the only way back, and the only fallback where a browser cannot produce
PRF output. It is the same code the rewards wallet shows.

## Finance

An asset and liability ledger with a value history, meant for a setup with more
than one owner, currency, and kind of holding.

Each record carries a type (bank, brokerage, retirement, private investment,
business interest, real estate, digital assets, vehicle, other asset; mortgage,
loan, credit line, other liability), an institution, an **owner** — a person, a
trust, or an entity — a currency, a liquidity, an ownership share, an optional
rate, optional total and unfunded commitments, tags, notes, and optional
account details sealed with the passkey.

**Totals are calculated, never estimated.** Ownership shares weight a partial
interest; liabilities are signed; conflicted records and pending deletions are
excluded until they are resolved. Currencies are reported side by side and never
converted — this application has no exchange-rate source it can defend, so a
single cross-currency net worth would be invented rather than computed. Records
older than 90 days are named as stale but still counted at their last known
value.

**History is keyed by as-of date.** Saving a value files it under that date;
saving another value for a date that already exists replaces it. That makes the
append idempotent, so a change queued offline and revalidated by the Worker
cannot duplicate a snapshot. A backdated correction is filed in history without
moving today's figure — the record's current value is whichever snapshot is
newest by date. Value over time is a step function between observed snapshots;
nothing is interpolated, and a record contributes nothing before its first
snapshot.

### Reading a statement

Figures reach the ledger four ways, and all four end at the same place: draft
updates the owner reviews before anything is saved.

- **Drop a file.** PDF, CSV, XLSX, or an image. A PDF's text layer is extracted
  on the device by `pdf-text.js`, a spreadsheet by the vendored reader, and the
  result is put in the intake box **verbatim** so the owner sees exactly what
  was pulled out. This matters: PDF extraction is best-effort, and a statement
  that comes out garbled has to be visible as garbled rather than read
  silently. `pdf-text.js` reports its own confidence — `good`, `partial`,
  `low`, or `none` — and a scan with no text layer says so and suggests the
  image path instead.
- **Read the open page.** One text snapshot of the tab the owner is already
  looking at, for a balance behind a login. It never navigates, never signs in,
  never opens a tab, and only reads when asked. Table rows are rendered cell by
  cell so a label stays beside its figure. Extension and browser-internal pages
  are skipped.
- **Drop an image.** A screenshot, a photo, or a scanned statement. The picture
  is downscaled to 1400px and re-encoded on the device before it is sent —
  the original file never leaves. Images travel as content parts to a model
  marked `vision` in the catalog; a connection with no such model is refused
  rather than sent something it cannot read.
- **Paste text.** As before.

What is not sent matters as much. Saved records never leave the device, so the
model cannot know what is already held, cannot pick the record a figure belongs
to, and is instructed never to total, net, annualize or convert anything.
Matching a draft to an existing record happens on the device by name and
institution; an ambiguous name is reported rather than resolved by guessing. A
draft with no usable date is dropped rather than assumed to be today, and a
figure that is illegible in an image is named under `unread` rather than
guessed at.

Nothing is saved by reading. Each draft is applied, edited first, or discarded
by hand, and applying one writes through the same validator and offline queue as
a typed edit.

## Personal information

Records for sensitive personal detail — identification, contact, medical,
insurance, financial identity, employment, family, legal, accounts.

The value and its notes are sealed together on the device before saving, so the
Worker holds one opaque envelope and the shared validator refuses a record whose
value is not already sealed. Only the record name, category, person, a short
owner-written hint, and an expiration date are stored readable, which is what
makes a record findable and lets **Expiring soon** work without opening
anything. Keep the hint short and non-identifying; it is the one part that is
not protected.

A revealed value re-hides itself after a minute, and every envelope is bound to
its record id — an envelope moved to another record does not open.

## Storage, sync, and limits

Both use the shared encrypted IndexedDB adapter, authenticated encrypted D1
records (`finance_records`, `personal_records`), and per-record revisions.
Records download once and stay available offline, including opening a protected
value: the passkey is checked on the device, so revealing a value makes no
network request. Offline changes queue before the network is attempted and sync
on reconnect or foreground; conflicts offer Keep my change or Use cloud version.
Disconnecting is blocked while changes are pending, and a successful disconnect
clears this device's copies while leaving cloud records intact.

Reading is the only part that needs the internet, and only for the model call:
extracting a PDF, a spreadsheet, a page or an image all happen on the device.
Everything else — totals, history, matching, revealing a value — works offline.

## API and deployment

`/v1/finance[/…]` and `/v1/personal[/…]` reuse the generic record store in
`tools-api/src/travel.js`. Apply `tools-api/finance-schema.sql` and
`tools-api/personal-schema.sql` before deploying the code that depends on them;
both are additive `CREATE TABLE IF NOT EXISTS` statements that leave existing
records untouched. `/v1/ai-connections/:id/finance-intake` serves the reading; it accepts up to
24,000 characters and up to four images, and is the only route whose request
body may exceed 64 KB.
