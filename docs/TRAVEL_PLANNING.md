# Travel planning

The saved trip is the workspace for an assisted browser search. The owner says
what they want in the conversation; the agent researches it and files dated
evidence into **Travel planning** in Eric’s Tools. The same comparison is on
the extension and the phone, including a cold offline reopen after download.
The app can create and edit requests, copy a request for the conversation,
refresh saved findings and delete a trip. **Refresh saved research downloads
saved records; it does not run searches.** This release has no unattended
browser worker, price monitoring or automatic purchasing. Flight requests and
fare evidence use the same model; live flight-site execution is not yet tested.

## Browser and sign-in

Use the personal Chrome profile **Eric**, where **Eric’s Tools** is installed.
Do not use the `averincapital.com` work profile. Browser ids are session-local:
discover the named profile through the supported browser tool; never hardcode
an id or reach into browser profiles, cookies or password databases.
Follow the installed Chrome skill. Prefer an existing signed-in travel session;
preserve its current search and use a new tab for a different trip. A page left
open can display an account after authentication has expired: a new search
must demonstrate that access works.

The owner has authorized routine sign-in to the travel services being compared.
Use supported autofill where available. If macOS Passwords has the login but
the browser tool reports its virtual clipboard is empty, Copy Password in the
Passwords UI and use the native paste shortcut in the verified provider password
field in the Eric window; do not read the clipboard or reveal the password.
Submit once and inspect the resulting page. A rejected submission becomes a prominent `login` checkpoint, never repeated
guesses. Do not claim the saved password is wrong: a clipboard transfer or form
focus can fail even when the credential is valid. Prefer provider autofill; if
a native transfer failed, let the owner complete that submission and verify the
resulting session before resuming. The pilot demonstrated this failure mode. Apple Passwords can require the owner’s
Mac unlock, Touch ID or other verification. Keep secrets concealed and out of
snapshots, logs, source, records and prompts. Pause for a required authentication
handoff and continue independent research. Save the provider checkpoint in its channel:
`resumeURL` (a public page, never an OAuth callback or a URL carrying credentials),
`nextStep` (the precise action after unlock) and `contextKey` (the current
`tripKey`). After the owner unlocks Passwords, return to the saved page, use
autofill with secrets concealed, submit sign-in and verify a fresh search
actually opens. Continue at `nextStep`; when the context changed, run the new
request instead. A tab or a displayed account name alone never proves sign-in. `login` channels
appear prominently above the request as **Sign-in needs your help** with the
precise unlock/verification step and a link. Once verification succeeds, change
the channel to `partial` and record the resumed work so the prompt disappears.
The app does not inspect the Mac lock state; the agent updates the checkpoint
from the browser result and the owner’s confirmation. Never translate an authentication
failure, CAPTCHA or failed page into “sold out.” Do not book, pay or contact a
hotel without the owner's instruction to do that specific action.

## Repeatable search

1. Read the trip using `node tools-api/scripts/trips.mjs list` and `show UUID`.
   Preserve its id and revision. Before asking who travels or where a named
   person lives, read the relevant saved trips and use the owner’s recorded
   family and destination context. Keep ages dated to their observation; never
   infer a birth date. A new trip gets a UUID. Keep personal working
   JSON files outside source and packaged assets (for example in a private
   temporary directory). Do not commit the owner’s actual trip or home address.
2. Keep the original request verbatim. Establish year, dates, occupancy including
   children’s ages, room count, geographical anchor, budget if constrained, and
   flexibility. Say what was assumed. Ask only for missing facts that affect
   the result; discovery can continue while price checks await occupancy.
3. Turn requirements into `criteria` with stable ids, explicit labels and
   `required:true`; preferences use false. “High-end” is not automatically
   “five-star.” A two-bedroom suite, guaranteed connected rooms and merely
   adjacent rooms are different. A sofa bed never supplies another bedroom.
   Geography has its own criterion: map the actual anchor and direction.
   For a drive-time limit record routing source, departure scenario and range;
   straight-line distance does not verify a 20-minute drive, especially at rush hour.
4. Discover broadly, then read official room/airline descriptions. Each candidate
   is one exact room configuration or itinerary, not every room at a hotel.
   Record one check per criterion as `match`, `mismatch` or `unknown` with
   a concise paraphrase, source and observation time. Search snippets and AI
   summaries are leads, not verified room layouts or live inventory.
5. Check direct, Amex Travel, Chase Travel and suitable search engines using the
   same dates, occupancy and exact room/fare. Bound a pass to 12 result/detail
   pages, at most 2 simultaneous tabs and one active check per provider; save
   partial results before continuing. Each channel gets `not-checked`, `partial`,
   `checked`, `login` or `blocked` and an explanation. Do not claim exhaustive
   coverage of every search engine.
6. Read the actual bookable product, full-trip cash total, included taxes and
   mandatory fees, currency, cancellation deadline with timezone, payment timing,
   and applicable restrictions. For hotels establish the beds in each bedroom,
   connection guarantee, minimum stay, parking if needed and breakfast coverage.
   For flights include every segment, operating airline, airports, local dates
   and times, cabin per segment, fare brand, bags, seats, change/refund restrictions
   and whether separate tickets are involved. Put these in the product, terms
   and criterion checks; do not infer them from a headline price or cabin label.
7. Offers carry their own checks, not just the hotel's: the portal could be
   selling a different room. `total` is for the complete stay/itinerary and all
   travelers, never a nightly/per-person price. `allIn:true` requires the page
   to establish taxes and mandatory fees. Benefits are separate text, never
   subtracted from cash due. Verify eligibility and minimum stays; never assume
   the owner's credit is unused or upgrades are guaranteed. Do not add points
   of different currencies or call a redemption cheaper without a stated valuation.
8. `tripKey(trip)` from `trip-data.js` is the exact search context. Set
   `researchKey` only after researching that request; each live offer has its own
   `contextKey` captured when read. Changing scope must not relabel old offers.
   Retain previous observations under distinct offer ids, within the bounded
   record size; do not refresh timestamps just because a record was saved.
9. Write concise `summary`, `questions`, `candidates` and channel coverage.
   Distinguish recommendation, verified constraints, compromises and unverified
   facts. Do not recommend a booking when no candidate satisfies requirements.
   A match requires all hard criteria supported; a dated offer additionally
   needs the exact scope, occupancy, complete cash total and terms. Observation
   freshness is 15 minutes for offers and 30 days for structural facts. These
   are recheck thresholds, not a guarantee that prices persist that long.
10. Validate with `node tools-api/scripts/trips.mjs save FILE`. Then save with
    `--confirm` under the owner's authorization to save research. The importer
    refuses stale revisions and does not retry uncertain writes. Read back the
    record before retrying after a timeout. Open Travel planning in Eric’s Tools,
    refresh saved research and check the actual comparison. Before booking,
    recheck the selected exact offer and total in the provider's checkout.

## Data and release

`chrome-sidebar/src/trip-data.js` owns format 1, validation, exact context,
requirement eligibility and observation age. Format 1 is hotel/flight agnostic;
the field `product` describes the exact room or full itinerary, and criteria
encode the relevant requirements. `trips.js` is the shared controller and
`components/trips.js`/`trips.css` the shared presentation. `trips-offline.js`
uses the existing durable queue, encrypted device store, revisions and explicit
conflict handling. `private-resources.js` clears its `trips` resource with every
other private copy on disconnect, only after pending work is resolved.

`/v1/trips[/snapshot|/:id]` reuses the generic authenticated encrypted D1 store.
`trips-schema.sql` creates only the new table; apply it to the existing database
before deploying. No existing records or schema are rewritten. The server
encrypts research at rest; the phone holds an encrypted offline copy. Records
remain until explicitly deleted; device disconnect leaves cloud research intact.
Unknown future formats are rejected without clearing pending changes. Private
API responses never enter the service-worker shell cache.

Run the trip data/controller tests, private-resource and offline-resource tests,
API trip tests, UI rules and full app suites before release. Review
`chrome-sidebar/tests/trips-preview.html` at desktop, 390px and 280px; it uses
synthetic data and the production view/controller. Verify normal navigation in
both hosts, empty/new/edit/failure/conflict states, offline reopen and revision
conflicts. Follow the standard build/version/package/push/deploy/publication
sequence; this is a shared capability and increments both app versions.
