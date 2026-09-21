# Needs attention and subscriptions

Introduced in extension 0.6.104 and mobile 0.1.62.

Needs attention is a shared projection of existing records, available through the
ordinary Tools navigation in both hosts. It has no second record store: completing
a reminder, changing a date or resolving a conflict happens in the owning tool.

`attention-data.js` combines reminder notice windows, the reward wallet's existing
next-actions rules, travel and personal document expirations within 90 days,
finance snapshots at least 90 days old, and subscription reviews / renewal dates.
Source conflicts are explicit review items; pending deletions are excluded. Items
with dates sort before undated reviews. Each action opens the owning tool.
The whole view uses the shared passkey gate; it never opens sealed document values
or account numbers. `attention.js` reads the six offline stores independently and
shows coverage and failures. Unavailable data never means "nothing needs attention".

## Subscriptions & renewals

`subscription-data.js` owns the record contract and calculations;
`subscriptions-offline.js` supplies encrypted device storage and per-record sync;
`subscriptions.js` and `components/subscriptions.js` are used by both hosts.
`tools-api/src/subscriptions.js` owns storage, statement reading and live research.

Each record contains a service name, the card or account it bills to, currency,
price per billing period, cycle, status, confirmed renewal / decision date,
notice window, account link, notes, up to 120 dated charges, and saved research.
Statuses are Review, Active, Canceled and Not recurring. Only Active records with
known price and cycle contribute to annualized totals. Currencies stay separate.
These are annualized contract prices, not measured annual spending.

Statement intake uses the existing PDF / XLSX / text / image reader, and asks
nothing first. A dropped file shows as the shared file card (UI-47) and is read
the moment it arrives (UI-42); the extracted text is never shown. Read appears
only for a file that could not be read then — offline, no connection, a failed
reading — and the file leaves once what it found is saved. Images are downscaled
on device. Text is limited to 24,000 characters; the part past the limit is
named on the card and again after the reading, never silently dropped. Raw files
and raw statement text stay in memory and are discarded on removal or locking. The selected AI provider receives statement
text or an image, not all saved accounts. Scanned PDFs without a text layer need
a readable image or pasted text. No bank connection or background inbox scan exists.

The reading returns up to 40 possible services with real dated debit evidence,
and the card the statement is for as the statement names it ("Amex Platinum"),
with anything that could be part of an account number removed on both the
Worker and the device (`statementAccount`). Nobody types a nickname (UI-38).
The reading's notes are only for an ambiguity the owner must resolve.
Missing year / currency, incomplete output or absent charge evidence fails rather
than inventing values. One recognizable subscription charge can be a candidate;
repeat purchases alone are not proof. Ambiguous payment aggregators need manual
identification. Detection is not guaranteed exhaustive; compare multiple months
and annual statements, and add missed services manually.

Reading saves candidates as Review ("Possible subscription") through the durable
queue. Confirm opens the editor with the status set to Active to fill in terms; Canceled / Not recurring preserve evidence without contributing to totals.
A case/whitespace-normalized name and currency match subsequent imports
(`matchingSubscriptions`): the same service on another card's statement joins
the saved record, and the card decides only when one service is saved twice on
two cards. A reading never replaces a saved card; it fills a missing one.
Different descriptors may need manual reconciliation.
Date, amount and exact descriptor deduplicate overlapping imports. Evidence with
identical descriptors on the same day and amount is treated as one observation;
this is not a transaction ledger. Imports never change manually confirmed terms
or reactivate canceled records. A partial batch keeps earlier successful saves;
retrying merges their evidence. Conflicted or ambiguous record matches stop intake.

Cycle suggestions require observed date intervals. Estimated next charges use
last observed date plus that interval and are labeled estimates. They do not roll
past today silently: an overdue estimate stays for review until new evidence or a
confirmed decision date is saved. Confirmed dates also remain until reviewed;
there is no assumption that a bill was paid or a service renewed.

## Cheaper alternatives

An explicit Find cheaper alternatives action, inside an Active record's drawer,
uses a saved OpenAI connection, the service name, currency, and the market the
browser's locale names (`researchMarket`) — no country field (UI-38).
Statement contents and charge history are not sent to web research. The central
`subscriptions.research` policy requires live web search. Every result must have
a full billing-period ongoing price in the same currency and an HTTPS source URL
in the provider's returned search evidence. Instructions require official pricing
pages, feature tradeoffs, eligibility, taxes, introductory terms and commitment.
URL evidence establishes a cited source, not independent verification of every
claim; the user checks terms before switching. No purchase or cancellation occurs.

Up to five options, sources, criteria and a checked date are saved with the record
and remain readable offline. Potential annual savings use deterministic arithmetic
and exclude tax / switching-cost differences. An annual upfront price is never
misrepresented as a monthly bill. Failed research preserves saved results.

## Privacy, offline and release

Both tools use the existing passkey UI gate. Subscription records are encrypted
at rest in D1 and device IndexedDB, like finance metadata; they are not individually
sealed end-to-end. Account numbers are not requested. Raw uploads are not retained.
Queued edits survive restart; conflicts need explicit resolution. Disconnect clears
device copies only after pending changes are settled; cloud deletion is a separate
confirmed action. The extension's disconnect inventory now also includes reminders
and gifts, which the attention view can download.

Upgrade the existing D1 database with `subscriptions-schema.sql` before deploying:
`cd tools-api && npx wrangler d1 execute erics-personal-tools --remote --file subscriptions-schema.sql`.
The additive, repeatable upgrade preserves existing tables and records. New routes
are `/v1/subscriptions[/snapshot|/:id]` and the AI operations `subscription-intake`
and `subscription-research`. Old clients remain compatible.

Extension 0.6.105 / mobile 0.1.63 add higher-charge and post-cancellation reviews.
A higher-charge alert compares the two latest distinct observation dates only when
each has one charge and their interval matches the confirmed cycle. It describes
an observed change, not a confirmed contract increase; taxes, usage and partial
bills need review. Future-dated observations are excluded. Canceled records require
an optional user-entered cancellation effective date before later charges can be
flagged. Same-day charges are not assumed to follow cancellation.

Mark charges reviewed acknowledges the exact saved date/amount/description evidence
without changing price, status or renewal terms. Reimporting identical evidence stays
reviewed; newly discovered charges, including older dates, can alert again. The
optional `canceledOn` and `reviewedCharges` fields live in the existing encrypted
JSON record, so no table migration is needed. Older API writes preserve these
fields when omitted. Review candidates also offer Confirm and Not recurring.

The existing morning push digest now uses the same six-source attention projection.
Financial, subscription and document items appear as category counts without private
names or amounts on the lock screen. Reminder-only notifications retain their existing
wording. Only cloud-synced records are visible to the Worker. A failed source read
aborts the run rather than sending an incomplete digest. See [notifications](NOTIFICATIONS.md).
Needs attention is checked when opened/refreshed, foregrounded or reconnected;
subscription extraction and price research are always explicit online actions.

Synthetic acceptance: `chrome-sidebar/tests/attention-preview.html`, the normal
sidebar menu, and `mobile-app/tests/preview-server.js`. Data / controller / storage
and API tests cover evidence, dates, currencies, failures, lock races, offline
restart, conflict resolution, source requirements and additive schema preservation.
