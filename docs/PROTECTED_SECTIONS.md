# Finance and Personal information

Two capabilities whose entire contents sit behind the device passkey. Choose
either from Tools in the extension or the unlocked mobile app.

## The gate

Both sections render nothing until the passkey answers — not a record name, not
a total, not a category. In these sections a record's name is often as
revealing as its value, so `chrome-sidebar/src/vault-gate.js` hides the whole
tool rather than masking individual fields.

The gate is built on `secret-vault.js`, the same WebAuthn PRF key that seals
card numbers. One vault is shared per host (`sharedVault()`), so a single
passkey prompt opens every protected section on the page and one 15-minute idle
window governs them together: activity in the ledger keeps the personal records
open, and going idle closes both and drops anything already revealed. Locking is
also explicit — **Lock now** is always reachable while unlocked.

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
