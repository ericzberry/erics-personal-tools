# Travel planning

Travel planning holds browser research in Eric’s Tools. In the installed Chrome
extension, **Search source** selects Google Hotels, Amex, Chase, KAYAK, Trivago,
Booking.com, Expedia, Priceline, Hotwire, Travelzoo or Suiteness, plus saved
direct-provider checkpoints. **Search source** executes a bounded browser pass
in an owned tab. The shared source catalogue always shows unsearched sources
as **Not checked**, including on mobile. A result link is never assumed to be
the hotel's direct site. `trip-research.js` reads the request into
travel criteria, asks the centrally selected `travel.browser` model for observed
search-control actions, and saves progress before each action. The adapter only
fills search fields, clicks search controls, or opens observed public links. It
never enters credentials, books, pays or contacts a hotel. Sign-in and CAPTCHA
pause prominently; browser autofill and the owner's Mac unlock finish sign-in.

Each pass allows 18 steps and retains at most four short page observations in
memory for extraction. Only claims with a quote found in the observed source
can get a supported check. These are structural findings, not verified bookable
prices. The comparison deliberately keeps totals and availability unverified
until an exact live offer has been checked. Refresh downloads saved evidence;
it does not search. A pass is partial, not exhaustive. The current runner needs
the page/panel to remain open and Chrome site access; it has no background
monitor. Site-specific controls, iframe booking forms and flight workflows still
need live adapter testing. Mobile presents and edits the saved research offline;
search execution requires the desktop Chrome extension.

Encountered issuer offers also go into Rewards through its existing catalogue
reader, up to six distinct snapshots per pass. Capture failures or limits stay
in the source checkpoint while hotel research continues. This is partial
coverage; finishing the hotel search never means every card's offers were read.
See [reward program capture](REWARD_PROGRAMS.md#capture-during-travel-research).

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
   adjacent rooms are different. A sofa bed or pull-out never supplies a required bed or another bedroom. A listing that confirms only one bed is unverified for the second bedroom; never assume an unstated real bed.
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
   Expand beyond the portals to metasearch, online agencies and deal sites;
   opaque deals cannot meet a named property, room or connection requirement
   without that configuration being disclosed before purchase.
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
   `intentKey` records which request has already been parsed, including a run
   paused for authentication. Retrying another source must not reparse a current
   request just because earlier source checkpoints are stale. Unchanged criteria
   retain their ids and labels; changed criteria do not inherit old checks.
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
encrypts research at rest; the phone holds an encrypted offline copy. Search records expire 90 days after their last write; reads do not renew them. An indexed hourly cleanup and cleanup before API access delete expired records. Downloaded cloud copies are pruned on local access; queued edits remain recoverable and a stale revision conflicts rather than recreating a deleted search. Research is excluded from new quarterly backups. Existing D1 recovery snapshots follow Cloudflare retention. Family & places is a separate permanent reference store. Device disconnect clears its copy and leaves unexpired cloud research intact.
Unknown future formats are rejected without clearing pending changes. Private
API responses never enter the service-worker shell cache.

Run the trip data/controller tests, private-resource and offline-resource tests,
API trip tests, UI rules and full app suites before release. Review
`chrome-sidebar/tests/trips-preview.html` at desktop, 390px and 280px; it uses
synthetic data and the production view/controller. Verify normal navigation in
both hosts, empty/new/edit/failure/conflict states, offline reopen and revision
conflicts. Follow the standard build/version/package/push/deploy/publication
sequence; this is a shared capability and increments both app versions.
