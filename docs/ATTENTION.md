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

Each record contains a service name, user-supplied account nickname, currency,
price per billing period, cycle, status, confirmed renewal / decision date,
notice window, account link, notes, up to 120 dated charges, and saved research.
Statuses are Review, Active, Canceled and Not recurring. Only Active records with
known price and cycle contribute to annualized totals. Currencies stay separate.
These are annualized contract prices, not measured annual spending.

Statement intake uses the existing PDF / XLSX / text / image reader. The owner
reviews extracted text and explicitly starts AI reading; images are downscaled
on device. Text is limited to 24,000 characters; longer documents must be split,
never silently truncated. Raw files and raw statement text stay in memory and
are discarded on clearing or locking. The selected AI provider receives statement
text or an image, not all saved accounts. Scanned PDFs without a text layer need
a readable image or pasted text. No bank connection or background inbox scan exists.

The reading returns up to 40 possible services with real dated debit evidence.
Missing year / currency, incomplete output or absent charge evidence fails rather
than inventing values. One recognizable subscription charge can be a candidate;
repeat purchases alone are not proof. Ambiguous payment aggregators need manual
identification. Detection is not guaranteed exhaustive; compare multiple months
and annual statements, and add missed services manually.

Reading saves candidates as Review through the durable queue. Edit confirms status
and terms; Canceled / Not recurring preserve evidence without contributing to totals.
A case/whitespace-normalized name, account nickname and currency match subsequent
imports conservatively. Different descriptors may need manual reconciliation.
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

An explicit Find alternatives action uses a saved OpenAI connection, a country /
market entered by the owner, the service name, currency and required features.
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
confirmed action. The extension's disconnect inventory now also includes reminders,
gifts and properties, which the attention view can download.

Upgrade the existing D1 database with `subscriptions-schema.sql` before deploying:
`cd tools-api && npx wrangler d1 execute erics-personal-tools --remote --file subscriptions-schema.sql`.
The additive, repeatable upgrade preserves existing tables and records. New routes
are `/v1/subscriptions[/snapshot|/:id]` and the AI operations `subscription-intake`
and `subscription-research`. Old clients remain compatible.

This first release does not expand the existing reminder-only morning push digest.
Needs attention is checked when opened/refreshed, foregrounded or reconnected;
subscription extraction and price research are always explicit online actions.

Synthetic acceptance: `chrome-sidebar/tests/attention-preview.html`, the normal
sidebar menu, and `mobile-app/tests/preview-server.js`. Data / controller / storage
and API tests cover evidence, dates, currencies, failures, lock races, offline
restart, conflict resolution, source requirements and additive schema preservation.
