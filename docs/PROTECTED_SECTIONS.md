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
also explicit — **Lock now** is always reachable while unlocked.

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

### Reading pasted text

**Read an update** sends one block of pasted text to the `finance.intake` task
and gets back draft figures. What it does not send matters more: saved records
never leave the device, so the model cannot know what is already held, cannot
pick the record a figure belongs to, and is instructed never to total, net,
annualize or convert anything. Matching a draft to an existing record happens on
the device by name and institution; an ambiguous name is reported rather than
resolved by guessing. A draft with no usable date is dropped rather than assumed
to be today.

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

Reading pasted text is the only part that needs the internet. Everything
else — totals, history, matching, revealing a value — works offline.

## API and deployment

`/v1/finance[/…]` and `/v1/personal[/…]` reuse the generic record store in
`tools-api/src/travel.js`. Apply `tools-api/finance-schema.sql` and
`tools-api/personal-schema.sql` before deploying the code that depends on them;
both are additive `CREATE TABLE IF NOT EXISTS` statements that leave existing
records untouched. `/v1/ai-connections/:id/finance-intake` serves the reading.
