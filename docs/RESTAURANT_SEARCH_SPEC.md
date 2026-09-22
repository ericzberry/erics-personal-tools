# Restaurant search redesign — implementation specification

Date: September 22, 2026  
Status: Proposed implementation; nothing in this document is a claim of shipped behavior.  
Scope: Chrome restaurant workspace, shared restaurant core, mobile restaurant tool, and Worker research/storage services.

## 1. Product objective

Help Eric choose a restaurant he actually wants to visit and reach the correct reservation context with minimal effort.

The primary output is a small, ranked set of restaurant choices. Each choice explains why it fits, identifies consequential compromises, and carries its own booking status and actions. A list of names, citations, or completed page checks is not success by itself.

Three principles govern tradeoffs:

1. A claim must be supported at the level at which it is presented. Finding a URL is not verifying a rating; seeing a time is not finding a table.
2. Changing an outing does not erase restaurant research. Dates, times, and party sizes can change without researching the same identities again.
3. Results become useful incrementally. One slow source or inaccessible provider does not block everything else.

### Included in the complete specification

- Named-restaurant lookup and discovery from a natural-language request.
- Optional structured editorial criteria, budgets, geography, dining format, and preferences.
- Verified restaurant facts, deterministic eligibility and ranking, and claim-specific evidence.
- Incremental research and provider-specific availability checks.
- One result per restaurant, with integrated booking observations.
- Saved restaurants, shortlists, and explicit preference feedback shared with mobile and available offline.
- Provider handoffs, alternatives, and opt-in release reminders.
- Evaluation fixtures, live acceptance, operational measurements, migration, and release gates.

### Not included

- Automatic booking, purchases, deposits, accepting terms, or joining waitlists on Eric's behalf.
- A universal reservation inventory service or a promise of exhaustive restaurant coverage.
- Unattended browser scraping, CAPTCHA bypass, private provider endpoint reverse engineering, or paywall circumvention.
- Continuous availability monitoring. Use provider notifications and existing reminders in this version.
- Reviews, photos, menus, or entire articles copied into a new restaurant catalogue without a permitted basis.
- A new top-level navigation tool. Everything stays under Restaurants.
- A model or connection picker inside the restaurant workflow.

## 2. Starting point and confirmed failures

The September 22 review inspected the existing source and the synthetic extension workspace at 1440 × 900 and 390 × 844. Eighteen restaurant tests passed. Paid live research and complete live provider coverage were not tested.

| Current behavior | Required change |
| --- | --- |
| One AI request researches identity, editorial membership, addresses, and all providers | Separate intent, discovery, verification, and booking resolution; reuse completed work |
| Citation URL membership is treated as candidate verification | Verify the particular fact that admits the candidate |
| A synthetic Resy time selector was accepted as a reservation | Require positive reservation-control evidence, not exclusion regexes alone |
| Changing the date requires Find restaurants again | Recheck availability against the existing shortlist |
| Default OpenTable/Tock checks visit six hourly anchors per restaurant | Plan checks using each provider's actual coverage |
| Shortlist and availability appear as separate lists | Merge them into one restaurant result |
| Model order becomes presentation order | Apply the eligibility and ranking rules below |
| Category search cannot use flexible dates | Allow bounded flexible dates for both search intents |
| Mobile generates a link for every date × size × time combination | Provide one contextual handoff per provider with compact date/party controls |
| Extension results are session-only; mobile retains one download | Persist bounded restaurant history and user-selected shortlists |

These observations justify the redesign; they do not establish a measured live false-positive rate.

## 3. Exact search experience

### 3.1 Initial screen

Show a compact form with:

1. Persistent label **Restaurant or dinner idea** and one text field. Example placeholder: “Quiet Italian near the UWS, no tasting menu”. Accept an exact name, approximate name, editorial criterion, or dinner description in the same field.
2. **City**, defaulting to the last selected city, initially New York City. Do not infer or transmit precise device location.
3. One compact row for **Date**, **People**, and **Time**. Date initially has no value, People defaults to 2, Time defaults to 7:30 p.m. with ±60 minutes when a date is selected. A missing date means discovery only.
4. A collapsed **Preferences** disclosure for neighborhood, maximum spend per person, dietary requirements, dining format, and permitted travel areas. Existing UWS preferences are preserved during migration.
5. One primary action: **Find restaurants** without a date; **Find a table** with a date.

Remove the specific-restaurant/category radio choice, shortlist-size selector, and research-settings disclosure. Intent comes from the request and can be corrected in the interpretation. Do not expose work limits as initial form controls.

Keep advanced flexibility behind the Date/People controls: date range up to 7 days and party range up to 4 adjacent sizes. Existing wider saved party ranges remain editable but require narrowing before a new v2 availability run; do not silently clamp them.

Accept people 1–20. Reject an end date before its start. Times use the destination's IANA timezone and must fall within one local calendar day in v2. Show an inline explanation for overnight ranges. Do not validate Tokyo's dinner against New York's calendar date.

### 3.2 Interpretation

After submission, display the understood request as a compact editable summary, for example:

> Italian · UWS preferred · No tasting menu · Fri Sep 25 · 4 people · 6:30–8:30 p.m.

Structured controls explicitly changed by the user win over conflicting language in the text. Otherwise text can supply missing values. The summary must expose any resolved conflict; never silently choose a different date, budget, or party.

Separate hard requirements from preferences internally. The user sees plain labels, not parsing terminology. “Exactly”, “must”, “only”, “under”, “no”, and explicit allergy exclusions establish requirements. “Prefer”, “ideally”, “near”, and “somewhere we can talk” establish preferences unless corrected by the user. Ambiguous budget inclusions, names with multiple locations, and ambiguous editorial lists require at most one focused clarification at a time.

Examples:

- “Exactly two Michelin stars” means current verified Michelin star count = 2.
- “Infatuation above 8.5” means verified score > 8.5, not ≥ 8.5.
- “NYT top 20” requires selecting/identifying the list and edition; critic stars do not substitute for rank.
- “Under $150 all-in” means food, estimated tax/tip, and mandatory fees, with alcohol included only if specified. Unknown required components prevent a hard-budget pass.
- “Vegetarian options” and “celiac-safe” are not equivalent. Do not certify allergy safety from a menu; show published accommodations and the need to confirm with the restaurant.

If ambiguity affects only a preference, proceed with the interpretation visibly stated. If it changes candidate identity or hard eligibility, wait for the answer before checking the affected candidates. Independent discovery may continue.

### 3.3 Named restaurant

Resolve the venue using name, address, and official/provider identity. A known, unambiguous venue uses cached identity and booking metadata if fresh. Do not redo editorial research unless it was requested or relevant facts expired.

For multiple locations or plausible matches, show up to three names with addresses and neighborhoods, and ask **Which location?** Do not start availability checks until selected. A spelling correction with one strong identity match can proceed while showing the corrected name; a different venue requires selection.

A named venue outside preferred areas remains visible, labeled with its actual location. A closed or moved venue gets its current status and evidence before any reservation action.

### 3.4 Discovery

Discover at most 24 unique candidates. Verify the strongest candidates in batches of four, at most 12 per search. Initially present at most five eligible restaurants. Continue in bounded batches until five eligible results exist, candidates are exhausted, or the research budget is reached.

No filler is added to reach five. If only two qualify, show two and the reason for limited coverage. Unverified requirements and known mismatches appear under separate collapsed groups only when useful, never in the eligible list.

When a date is present, automatically check the first three eligible restaurants on Chrome as verification completes. Keep **Check remaining restaurants** available for the other displayed matches. An unambiguous named search checks that one venue automatically. The search submission authorizes these bounded read-only checks, not booking.

### 3.5 Edits after results

| Edit | Work to repeat |
| --- | --- |
| Date, date range, party, time window | Availability only; preserve candidates and evidence |
| Preferred time within an already observed range | Refilter fresh observations; recheck uncovered ranges only |
| Sort, source disclosure, saved status | No research and no provider visit |
| Preference weights/feedback | Rerank existing facts; verify missing decision-critical facts if needed |
| Hard budget, cuisine, editorial requirement, or area | Refilter existing facts, then discover only if coverage is insufficient |
| Different city or different named venue | New discovery identity; keep previous search recoverable |

Use an immutable query revision for every operation. Late results update the matching saved search only and never overwrite the visible search after it changes. Keep old availability marked with its old date until replaced; never relabel it with new controls.

### 3.6 Stop, failure, and reopen

- Stop prevents new jobs and aborts supported pending requests. Completed facts remain. Say once that an already dispatched research request may still incur cost if it cannot be cancelled.
- Failures preserve form values and prior results. Attach provider failures to the provider, verification failures to the claim, and connection errors to the search.
- Reopening restores the last view and observations with timestamps. It does not automatically resume research or browser checks.
- A paused run offers **Continue checking**. Continuing skips completed fresh checks.
- A failed stage offers **Retry research** only for that stage. A lost response first reads the stage status; it does not blindly send another paid request.

## 4. Results and navigation

### 4.1 One restaurant, one result

Every result contains, in order:

1. Name, neighborhood, cuisine, and a trailing shared Save row action.
2. One concise reason for this request, using actual supporting facts.
3. Price basis and at most one consequential compromise; missing decision-critical facts are explicit.
4. Reservation times or the exact reason times cannot be shown.
5. A primary booking/handoff action and secondary **Details** disclosure containing menu, address, individual evidence, provider coverage, and observation times.

Do not repeat the restaurant in a second Availability section. Do not repeat its name as “Check [name]” inside the same card. Do not render a paragraph of generic acclaim. A reason is assembled from ranked matched facts, with optional AI phrasing constrained to those facts.

Time labels use the destination's local 12-hour time in English UI. Each time includes seating or experience when known. “7:15 · Dining room” and “7:15 · Bar” remain different options. Unknown seating says “Seating not specified”. A displayed time opens the exact supported booking context; it never submits a booking. If there is no stable slot link, label the action **Open 7:15 search**, not **Book 7:15**.

Show freshness once per observation group. Available results older than 5 minutes become **Previously observed — recheck** and leave the available-first ranking group. They remain inspectable as history. No observation is a guarantee that the table will still be available at checkout.

### 4.2 Result grouping and stability

Discovery-only: rank eligible restaurants by fit. With dates: group **Times found**, **Still checking / Check on provider**, and **No matching times observed**, preserving fit order within groups. Hard mismatches never rise because they have a table.

Do not move the focused row while the user is interacting with it. Stage incoming reorder changes and apply them when focus leaves the row or when the user selects **Update order**. Preserve scroll position and avoid repeated live announcements of every slot.

### 4.3 Search form after submission

Collapse the large form into the editable query summary when useful results arrive. Keep Date, People, and Time easy to change. **Edit search** opens the other fields without destroying results. Loading before the first result uses a spinner; once a finite verification/check batch is planned, use progress with a denominator that reflects that batch.

No duplicate “verified candidates”, “shortlist not exhaustive”, and success paragraphs. State limited coverage only when it changes the interpretation of the result.

### 4.4 Saved view

Use shared in-tool Tabs for **Search** and **Saved** only after a saved restaurant or shortlist exists. One visible view means no tab row. Saved holds restaurants and named shortlists, with a compact type filter rather than another nested tab system.

Saved restaurant states: **Want to try**, **Would return**, **Not for me**. Optional reasons: too loud, too formal, too expensive, wrong food, inconvenient location, plus a short note. Only explicit feedback affects ranking. Opening a link is not evidence of liking a restaurant or completing a reservation.

“Not for me” restaurants are suppressed from discovery by default but still appear for exact-name searches with the saved reason. Changing that feedback is reversible.

## 5. Claim verification and restaurant identity

### 5.1 Evidence is per fact

Each claim has `supported`, `contradicted`, or `unknown` status. Supported requires retained evidence actually obtained from the source: a bounded passage, structured provider field, or official menu/venue data. A model-generated quotation without retrieved supporting text is not sufficient. A search snippet is a discovery lead; it cannot establish a hard numerical editorial requirement.

Verification runs two checks:

1. Evidence association: the source identifies this venue/location and contains the claimed fact or a clearly attributable passage.
2. Deterministic comparison: edition, numerical threshold, currency, budget basis, geography, and dining format satisfy the user's requirement.

AI may extract claims and relationships from retrieved content, but cannot mark its own unsupported assertion verified. Store extraction provenance and the deterministic comparison result. A separate model opinion is not a substitute for source evidence.

### 5.2 Source precedence

| Fact | Preferred authority | Other evidence and treatment |
| --- | --- | --- |
| Editorial rank/rating | The named publication and edition | Other publications cannot establish it |
| Address, move, opening/closure | Official venue or current official booking listing | Conflicts require review, not silent preference |
| Menu, mandatory dining format, base price | Current official menu or experience listing | Older reviews are leads and clearly dated |
| Reservation provider and release policy | Official reservation page or provider venue page | Search-only guessed URLs are rejected |
| Noise, atmosphere, occasion | Dated attributable reviews; Eric's feedback | Qualified opinion, never guaranteed fact |
| Dietary accommodation | Official published policy/menu | Allergy safety requires direct confirmation |

Preserve each rating in its native units. Never infer Michelin stars from a search result's star glyphs, Google ratings, or prose praising a Michelin-trained chef.

For “latest” editorial criteria, identify the latest verifiable edition for that publisher, city, and list. If the latest edition cannot be established, say so and offer a specific known edition; do not silently label it current.

### 5.3 Identity

Use a persistent UUID per venue location. Store official website, normalized address, city, neighborhood, timezone, and provider venue identifiers/aliases where available. Match provider identifiers first, then official domain + address, then normalized name + address. Name alone never merges locations.

Deduplicate aliases. A restaurant moving location gets a reviewed relationship, not automatic replacement of address history. Do not strip all URL query parameters during evidence comparison: some providers encode venue identity in them. Remove only a documented allowlist of tracking parameters.

### 5.4 Freshness

These are initial product policies, centralized constants, not source guarantees:

| Fact | Reuse without revalidation |
| --- | --- |
| Venue identity/address | 30 days unless a conflicting fact appears |
| Open/closed status | 7 days; verify again when new contradictory evidence appears |
| Menu, prices, dining format | 7 days for decision-critical comparisons |
| Booking destination/release policy | 7 days; immediate invalidation on redirect/error indicating change |
| Fixed historical edition | Preserve as historical; never relabel as latest |
| Latest-edition lookup | 7 days |
| Atmosphere review | Retain date; reviews older than 12 months are weak evidence |
| Live availability | 5 minutes for ranking as freshly observed |

Stale evidence remains visible offline and in saved records. It must not silently satisfy a current hard requirement. Revalidation failures yield unknown, not deleted history.

## 6. Eligibility and ranking

### 6.1 Hard eligibility

For each requirement compute pass, fail, or unknown. All must pass to enter the main eligible set. Any fail puts the restaurant among explicit alternatives only if the user chooses to see them. Any unknown puts it under **Could not verify**, with the missing fact named.

Geography uses canonical neighborhoods/areas, not substring matching. Preserve Eric's existing UWS preference and exclusions of LES, East Village, Brooklyn, and Queens as migrated preferences. An explicit request for an excluded neighborhood overrides the standing preference for that search and says so in the query summary. Do not silently discard an explicit East Village request.

Do not invent travel minutes. In the initial release use named areas and relative geography only. A future route-time source must be introduced and tested separately before minute-based claims are used.

### 6.2 Fit ranking

Use a deterministic internal score after eligibility. Do not show a synthetic “94% match” to the user.

| Dimension | Default weight |
| --- | ---: |
| Requested cuisine/style match | 25 |
| Occasion/atmosphere fit | 20 |
| Location preference | 20 |
| Spend preference | 15 |
| Explicit personal feedback | 10 |
| Requested editorial preference | 10 |

Only active preference dimensions participate. If a dimension was not requested and has no saved explicit preference, remove its weight and renormalize. For each active dimension: strong match = 1, partial match = 0.5, mismatch = 0, unknown = 0 with an unknown flag. Do not turn missing evidence into a neutral positive score. Report the unknown fact when it materially affects ranking.

When no dimensions are active, rank by evidence completeness, then identity confidence, then stable name/id order; ask for a dinner preference if the result would otherwise be arbitrary. Hard editorial constraints are eligibility, not a second ranking bonus. Saved “Would return” gives positive feedback; “Want to try” is neutral. Don't infer ratings from the absence of negative feedback.

Tie breakers: fewer material unknowns, fresher decision-critical evidence, then stable venue ID. Ranking explanations name the two largest supported contributions and the largest meaningful compromise. Tests must cover every rule and tie breaker.

Availability grouping is separate from fit. Inside each restaurant, sort slots by distance from the user's preferred time, then requested seating/experience, then chronological time. Do not infer that a 5 p.m. table is better merely because it sorts first.

## 7. Availability and provider behavior

### 7.1 Adapter contract

Each provider adapter supplies `recognize`, `canonicalVenue`, `buildSearch`, `readContext`, `readSlots`, `readOutcome`, and `coverage`. It returns structured observations, never a boolean “has tables”. Share validation across adapters and the AI fallback.

Require positive structural evidence of a reservation control: membership in the identified reservation-results region, correct selected venue/date/party context, enabled state, and a supported slot/experience relationship. A button containing a time outside that region does not count. A link's mere existence is insufficient.

Support exact normalized aliases and verified venue IDs for identity. Do not require character-for-character equality with a marketing heading, and do not replace that with unrestricted fuzzy matching across locations.

Reader metadata includes role, accessible name, selected state, region identity, safe href, and contextual seating/experience text. Never read cookies, passwords, application stores, payment fields, or hidden private state. Frame support is explicit per adapter with permitted host access; unsupported cross-origin frames yield a contextual handoff.

### 7.2 Outcomes

Use these internal states:

`not_checked`, `checking`, `available`, `none_in_checked_window`, `not_released`, `login_required`, `challenge_required`, `choose_experience`, `unsupported`, `failed`, `cancelled`, `stale`.

- `available` needs at least one positively validated slot.
- `none_in_checked_window` needs an explicit contextual no-availability message or a provider-specific tested empty-result contract. Empty text alone is insufficient.
- `not_released` needs a sourced release rule or explicit provider statement for this date.
- Missing/incorrect selections, unreadable widgets, or uncertain identity never become sold out.
- Partial success retains its slots and its incomplete coverage. An error at another time is not swallowed by a successful observation.

### 7.3 Check planner and limits

- Start with one preferred-time or all-day check per venue/provider/date/party, whichever the adapter supports.
- Record the actual observed coverage. Do not assume the entire day from an all-day URL parameter unless the page confirms it.
- Query additional anchors only for uncovered requested intervals and only when the adapter can meaningfully expand coverage.
- Reuse an owned tab within a provider job when reliable. Never navigate or close user-owned tabs.
- Maximum two simultaneous browser jobs total, one per provider domain. Back off on explicit rate limits; stop a challenged domain rather than repeatedly opening more tabs.
- Initial automatic pass: at most 12 page visits and 60 seconds of scheduling time. An already running bounded read can finish after that deadline. Additional work requires **Check remaining restaurants** and uses another bounded batch.
- Overall per user-started availability run: 36 visits; maximum two AI fallback interpretations per venue and six total. Beyond that, provide direct handoffs with remaining coverage named.
- Per page readiness limit: 15 seconds. Prefer recognized widget readiness and bounded DOM stability over fixed waits. Per AI fallback: 20-second caller deadline; late replies cannot change another query revision.
- Date/party combinations are ordered by preferred date, preferred party, then chronological date and increasing distance from the preferred party. The UI names checked and unchecked combinations instead of claiming full coverage.

These are work limits, not promised provider response times. Keep them centralized and adjustable only through measured engineering changes, not new user-facing complexity.

### 7.4 Booking handoff

Retain the provider, exact search URL, date, party, observed time anchor, and slot/experience URL if supported for each slot. Opening a slot preserves these values. Never construct a guessed slot ID or replay an expiring booking token.

Before handoff, mark old observations stale and offer recheck; still allow opening the provider directly. Do not block the user behind another research run. Where stable slot links do not exist, open the observed search context and clearly name the required next selection.

### 7.5 When nothing fits

Offer one or two relevant next actions, in priority order:

1. Check nearby times/date alternatives already requested but not covered.
2. Offer a specific relaxation, such as **Check after 8:30**, requiring a click before changing constraints.
3. Open the provider's notification/waitlist interface when supported.
4. Create a release reminder only from a verified rule and explicit user selection.
5. Show the next eligible restaurants.

Do not change party size to obtain a table unless that size was included in the user's range. Never suggest booking for a false number of diners.

Release reminder previews show the computed local release date/time, timezone, and source. Reuse the existing reminders store. Policies too ambiguous for a reliable date produce a manual reminder editor, not a guessed time.

## 8. Data contracts

All v2 persisted payloads include `schemaVersion: 2`. Timestamps are UTC ISO strings; outing calendar dates/times are local values accompanied by IANA timezone. Money is integer minor units with ISO currency and explicit basis. `null` means unknown; zero is a real value.

### SearchIntent

```ts
type SearchIntent = {
  schemaVersion: 2;
  id: string; revision: number;
  text: string; // max 2,000 characters
  mode: 'named' | 'discovery';
  city: { name: string; country: string; timezone: string };
  venueId: string | null;
  outing: null | {
    dates: string[]; preferredDate: string;
    partySizes: number[]; preferredParty: number;
    preferredTime: string; startTime: string; endTime: string;
  };
  requirements: Constraint[];
  preferences: Constraint[];
  interpretationVersion: string;
};
type Constraint = {
  id: string;
  kind: 'cuisine' | 'geography' | 'price' | 'editorial' |
        'dining_format' | 'dietary' | 'atmosphere' | 'occasion';
  operator: 'eq' | 'in' | 'exclude' | 'lt' | 'lte' | 'gt' | 'gte';
  value: string | number | string[];
  qualifiers: Record<string, string | number | boolean>; // validated per kind
  origin: 'explicit_control' | 'query' | 'saved_preference';
};
```

Maximum 12 requirements and 12 preferences. Reject unknown kinds, operators, or qualifiers. Editorial qualifiers include publisher, rating system/list, edition, and whether latest was requested. Price qualifiers include currency, per-person basis, included costs, and alcohol assumption. Do not use unrestricted executable expressions.

### Venue and claim

- `Venue`: id, canonical name, aliases (≤10), normalized address, city, neighborhood, country, timezone, official URL, cuisine labels, provider identities (≤5), identity status, created/updated timestamps.
- `Claim`: id, venueId, field, typed value, units/basis, status, source URL/title/publisher, bounded evidence excerpt (≤500 characters), retrieval timestamp, source publication/edition if known, expiry, extractor version, and comparison result where applicable.
- Store at most 20 active claims per venue; archive superseded claims for 90 days, then delete them unless referenced by a saved shortlist. Preserve only the bounded evidence needed for audit, not full articles.
- `BookingDestination`: provider, venue identifier, canonical URL, official relationship source, supported experiences, verifiedAt, expiresAt, adapterVersion.
- Conflicting claims remain identifiable. Do not overwrite them with whichever request finishes last.

### AvailabilityObservation

```ts
type AvailabilityObservation = {
  schemaVersion: 2;
  id: string; searchId: string; queryRevision: number;
  venueId: string; provider: string; adapterVersion: string;
  date: string; timezone: string; partySize: number;
  requestedWindow: { start: string; end: string };
  checkedWindow: { start: string; end: string } | null;
  coverage: 'complete_requested_window' | 'partial' | 'unknown';
  status: string; // closed enum from section 7.2
  slots: Array<{
    time: string; seating: string | null; experience: string | null;
    price: { minorUnits: number; currency: string; basis: string } | null;
    restrictions: string[]; searchURL: string; slotURL: string | null;
    evidenceRef: string;
  }>;
  reasonCode: string | null; nextAction: string | null;
  observedAt: string; expiresAt: string;
};
```

Maximum 40 slots per observation and 36 observations per run. Slot deduplication key includes venue, provider, date, party, time, seating, and experience. Two providers observing the same time remain traceable; merge their presentation only if seating/experience agree, keeping both source links.

### User records

Use per-record UUIDs and existing revision/conflict semantics:

- Saved venue: venueId, state, reason codes, note (≤1,000 characters), savedAt.
- Saved shortlist: name (≤120 characters), intent, venue references (≤20), bounded claim snapshots, savedAt.
- Standing preferences: explicit geography/occasion/spend preferences; no inferred sensitive profile.

Save claims as immutable snapshot references so later research cannot retroactively change what a saved shortlist said. Current views may display newer facts alongside the dated snapshot. Avoid one large mutable wallet document.

## 9. Services, stages, and request reliability

### 9.1 Architecture decision

Implement a client-orchestrated staged workflow over bounded Worker requests. Do not introduce a Queue, Durable Object, or always-running background crawler in the first release. Every expensive stage has a persisted status and idempotency identity so interrupted clients can inspect completion.

Proposed authenticated routes, additive to the existing v1 API:

| Method/path | Purpose |
| --- | --- |
| POST `/v1/restaurants/searches` | Validate intent and create/resume a search using a client operation UUID |
| GET `/v1/restaurants/searches/:id` | Read bounded search state, candidate summaries, stage status, and next cursor |
| POST `/v1/restaurants/searches/:id/stages/:stage` | Run one bounded stage for the stated query revision and work IDs |
| PATCH `/v1/restaurants/searches/:id` | Update outing/preferences using expected revision; invalidate only dependent stages |
| POST `/v1/restaurants/searches/:id/stop` | Persist stop intent and prevent claiming new work |
| GET `/v1/restaurants/venues/:id` | Venue and current bounded claims |
| GET/PUT/DELETE `/v1/restaurant-saves[/:id]` | Existing generic encrypted record pattern for user saves |
| GET `/v1/restaurant-saves/snapshot` | Offline synchronization of saves |

Stages are a closed enum: `interpret`, `discover`, `verify`, `resolve-booking`. Availability runs locally in Chrome; it is not falsely offered as a server inventory endpoint. Stage bodies may contain at most four candidate IDs. Search responses are cursor-paginated if they exceed 128 KB; individual writes remain under the existing 64 KB limit. Raise limits only for explicitly named routes with measured need.

Use 400 for invalid inputs, 401 for authentication, 409 for revision/stage conflict, 422 for unresolvable intent, 429 for bounded work exhaustion/rate limit with retry metadata, and 502/503 for provider failures. Do not turn provider errors into empty lists.

### 9.2 Idempotency and concurrency

Search creation and stages use client-generated operation IDs. A unique database key covers search ID, query revision, stage, and batch identity. Atomically claim work before dispatch; persist completion with a compare-and-swap on that claim. Competing callers receive the same completed result or a running status. They must not dispatch duplicate generation.

States: `pending`, `running`, `complete`, `failed`, `stopped`, `indeterminate`. A transport timeout while a provider may still be running becomes indeterminate until completion is observed or its bounded execution period expires. Expiring a lease does not prove no billing occurred. Require explicit retry for indeterminate work; reserve another budget allocation and disclose that the previous attempt may have run. Reuse a provider idempotency facility only when documented and supported by the adapter.

Requests return persisted results where available. Status polling is read-only, at most once every 2 seconds while visible and running, with backoff to 5 seconds and a 90-second ceiling. Stop polling in the background; resume with one status read on foreground. No polling when nothing is running.

### 9.3 AI tasks and budgets

Register `restaurant.intent`, `restaurant.discovery`, `restaurant.verification`, and `restaurant.booking-resolution` centrally. Keep `restaurant.availability` as a bounded fallback. Existing saved `restaurant.research` choices remain for legacy requests; new tasks inherit that explicit selection once during migration only if physically compatible, and Settings shows the resulting choices. Never override an owner's compatible selection to make a benchmark pass.

Initial output budgets: intent 1,500 tokens; discovery 4,000; verification batch 5,000; booking resolution batch 2,000; availability fallback 2,000. These are centrally configured and evaluated, not model constants in controllers.

Research limits: one interpretation, one discovery, three verification batches, and up to three booking-resolution batches. Maximum two independent research-stage requests in flight. Enforce a cumulative estimated cost budget of $0.75 per explicit search using the central catalogue plus known tool charges and reserved output budgets. If the selected model would exceed the remainder, pause before dispatch and offer to continue with an explicitly shown additional estimate; do not silently substitute a cheaper model. Report this as an estimate, not an exact provider spending guarantee. If tool-call ceilings or prices are unavailable, enforce call/token caps and state cost uncertainty in operational diagnostics.

Opening or refreshing saved results never starts billable work. Simple intent parsing and deterministic validation should avoid AI when existing fields suffice. Do not add a stronger model as the first response to a failing evidence contract; evaluate pipeline and model changes separately.

### 9.4 External source access

Use existing provider adapters and public-URL validation; strengthen the canonical helper if it does not cover server fetches. HTTPS only; reject credentials, local/private/reserved destinations and unsafe redirects, revalidate each redirect, bound redirects to three, each fetch to 10 seconds, body to 1 MB, and source fetches to eight per stage. Never send the app bearer token or provider credentials to evidence URLs. Treat all fetched content as untrusted data.

An inaccessible source remains inaccessible. Do not bypass authentication/paywalls or substitute another publication to satisfy the original requirement. The evidence collector returns the retrieved passage and retrieval metadata separately from model interpretation.

## 10. Storage, retention, and mobile

Proposed additive D1 tables:

- `restaurant_venues`: opaque ID, encrypted value, revision, timestamps.
- `restaurant_claims`: opaque ID/venue reference, encrypted bounded claim, revision, timestamps/expiry.
- `restaurant_searches`: ID, encrypted intent/results metadata, revision, timestamps/expiry.
- `restaurant_stage_runs`: operation identity, status, encrypted input/output references, budget reservation, timestamps.
- `restaurant_saved_records`: generic encrypted user records and revisions.

Use the existing server AES-GCM infrastructure with resource-specific authenticated context. Do not put names, preferences, notes, addresses, or request text in plaintext logs or operational status columns. Design actual indexes and migration SQL after checking existing D1 conventions; test upgrades against populated fixtures. D1 transactions govern related revision updates and stage claims.

Retention: last 10 unsaved searches for 30 days, unreferenced venue/claim caches for 90 days, stage diagnostics for 7 days, availability observations on the device for 24 hours. Explicit saves persist until deleted. Server cleanup is bounded, uses the existing scheduled infrastructure, and is tested against its query budget; do not introduce an unbounded scan. Preserve claims referenced by saved shortlists. Keep an operation receipt/tombstone for 30 days after stage payload expiry so repeated operation IDs cannot trigger unintended generation.

Both hosts use shared restaurant stores registered in `private-resources.js`. User saves/feedback support encrypted offline reads, durable queued edits, revision conflicts, restart survival, and disconnect protection. Research cache is read-only downloaded data with no queued writes. Browser observations are encrypted local data and never treated as shared live inventory.

Mobile shares interpretation, facts, ranking, saved records, and the integrated result component. It cannot inspect signed-in provider tabs. Its states say **Check on Resy/OpenTable/etc.**, never “No tables” merely because it cannot inspect. Provide one contextual provider action with selected date and party, not a combinatorial list of links. A date change immediately rebuilds handoff URLs without research.

Do not synchronize automatic Chrome page observations as if mobile independently verified them. If a later version shares observations, it must label device, age, and scope explicitly; that extension is outside this initial contract.

Offline: show saved facts with evidence dates, allow save-state/note edits, and label reservation observations historical. New discovery and provider checks are disabled with one concise reconnect message. Authenticated responses never enter the service-worker shell cache. Add every new shared module to mobile build and offline shell lists.

## 11. Component and module ownership

Keep the existing ownership boundaries. Proposed names describe implementation targets; implementers must first search for an existing canonical equivalent.

| Existing owner | Required work |
| --- | --- |
| `restaurant-search.js` | Compatibility parser, query normalization, bounded search types; split pure fact/ranking logic only when it becomes a distinct reusable owner |
| New shared `restaurant-data.js` | Versioned records, facts, constraints, identity and eligibility validation |
| New shared `restaurant-ranking.js` | Deterministic ranking, explanations, slot ordering |
| `restaurant-page.js` | Thin extension host wiring; move common orchestration to shared controller |
| New shared `restaurants.js` | Form/search state, staged research, saves, view updates; injected availability capability |
| `components/restaurant-views.js` | Compact form, interpretation, integrated result, saved view, failure/empty states |
| `reservation-browser.js` | Owned-tab lifecycle, bounded concurrency, cancellation, readiness |
| `reservation-reader.js` | Scoped structural snapshots; provider-specific extractors behind one adapter contract |
| `reservation-availability.js` | Positive validation, state enums, coverage, combination and stale rules |
| Worker `restaurants.js` | Legacy handler plus staged route orchestration; move provider specifics to adapters |
| Worker `model-policy.js` | Named tasks, requirements, budgets, compatibility and selection tests |
| `mobile-app/public/app/restaurants.js` | Thin mobile host wiring using shared controller and manual provider handoff |
| `private-resources.js` and shared offline adapter | Restaurant stores, cleanup, pending protection, deep canonical reconciliation |

Use shared Select, Tabs, form, disclosure, row action, status, progress, and spacing components. No feature-specific dropdowns or controller-created HTML. Compact body-size values, 2–4px within details, 8–12px between related groups, and existing accessible hit targets. All explanatory implementation reasoning belongs in source/spec rather than interface prose.

Record the complaint “I don't think the restaurant search works well” in the implementation issue and link it to concrete regression criteria: unsupported verification, false slot detection, unnecessary research reruns, and separated result context. During implementation update `UI_RULES.md` only with genuinely generalizable UI rules and enforceable checks; do not turn the entire product specification into a global style rule.

## 12. Test and evaluation plan

### 12.1 Required deterministic regressions

| ID | Fixture | Expected result |
| --- | --- | --- |
| R01 | Two-star request; citation establishes only a menu | Unknown editorial requirement, excluded from eligible set |
| R02 | Exactly two stars; current source says three | Fail requirement |
| R03 | Score above 8.5; source says 8.5 | Fail requirement |
| R04 | Latest list requested; only prior edition verified | Clarification/unknown, no current-edition claim |
| R05 | Same name, different addresses/provider IDs | Separate venues; selection before named check |
| R06 | Time-search button, hours, calendar and Notify; no slots | No available result |
| R07 | Correct slot but wrong selected date/party | Reject slot |
| R08 | Real available slot + provider failure elsewhere | Keep slot, mark coverage incomplete |
| R09 | Date-only edit | Zero discovery/verification requests; new availability key |
| R10 | Query changes while research finishes | Late reply cannot replace visible results |
| R11 | Stop/reopen | Completed data retained; no automatic paid work |
| R12 | Successful stage with lost response | Status retrieval returns completion; no duplicate dispatch |
| R13 | Running/indeterminate stage retried by second window | One claim; no blind replay |
| R14 | Same venue/time, different seating | Distinct slots |
| R15 | Slot found at a later anchor | Handoff preserves that anchor/experience |
| R16 | Explicit excluded-neighborhood request | Override standing preference for this query |
| R17 | Unknown tax/fees for hard all-in budget | Unknown, not budget-compliant |
| R18 | Destination is next day relative to New York | Destination-local validation |
| R19 | Fresh observation ages past five minutes | Historical/stale state and ranking update |
| R20 | Mobile search with 7 dates and 4 party sizes | Compact controls; no giant link matrix |
| R21 | Offline save/edit, restart, reconnect and conflict | No lost edit; explicit resolution |
| R22 | Disconnect with pending restaurant feedback | Refused until changes resolved; all restaurant copies cleared afterward |
| R23 | Provider ignores query parameters | Context validation fails; handoff, never fabricated availability |
| R24 | Same path with different venue-defining query parameter | Evidence identities remain distinct |
| R25 | Source says restaurant is permanently closed | No bookable recommendation without resolving contradiction |
| R26 | Expired stage payload, repeated operation UUID | Gone/status receipt; no new paid operation |
| R27 | Unsupported future record schema | Preserve queued data; refuse unsafe sync without advancing cursor |

Include rendered snapshots for each supported provider layout: available, none, unreleased, login, challenge, experience selection, wrong filters, disabled slots, and partial page. Synthetic fixtures must preserve meaningful structure, not just a list of time strings.

### 12.2 Recommendation benchmark

Create 30 dated evaluation cases with source-backed expected eligibility and a human suitability rubric. Include:

- 5 exact/approximate names and multi-location cases.
- 8 editorial constraints including boundaries and conflicting editions.
- 8 dinner descriptions with cuisine, occasion, price, geography, and unknown facts.
- 4 no-result or inaccessible-source cases.
- 3 standing-preference overrides.
- 2 non-NYC/timezone cases.

Run the old and new pipelines on the same frozen evidence first; separately run a small approved live evaluation so provider freshness does not contaminate deterministic comparison. Grade before inspecting which pipeline produced the answer. Record model/task selection and actual provider usage when available. Do not claim a model upgrade helps from one attractive answer.

Release gates:

- Zero hard-constraint violations in the benchmark's main eligible results.
- Every decisive rating/price/location claim has matching source evidence and dates.
- Zero false “available” outcomes across the negative slot fixtures.
- Correct venue/date/party handoff in every supported adapter fixture.
- At least four of five displayed choices rated useful in at least 80% of benchmark cases where five qualifying candidates exist. Human grading is required; fewer legitimate matches are not penalized for missing filler.
- No repeat research on any date/party/time-only edit test.
- No duplicate paid stage dispatch in timeout, restart, and two-window tests.

Performance targets, measured rather than promised: cached facts visible within 1 second; date/party changes reflected immediately; fresh availability starts without waiting for unrelated research; first verified choice within 30 seconds in at least 80% of successful live research runs. Report p50/p95 and failed-run rate separately. Failure to meet the timing target calls for investigation and a documented release decision, never a weaker verification gate.

### 12.3 Visual and interaction acceptance

Review production components at 1440 × 900, 390 × 844, and 280px width where supported. Review the real mobile host as well as a narrow extension page. Include first run, disconnected, loading, five results, one result, zero results, unknown requirements, mixed availability, expanded details, stale data, offline saved records, and sync conflicts.

Keyboard-test the entire search/edit/save/handoff flow, shared dropdowns, disclosures, and focus preservation during incremental updates. Verify persistent labels, readable contrast, no horizontal overflow, motion preferences, and truthful status announcements. No duplicated restaurant/availability lists, no inaccessible slot actions, and no permanent spinner after stop/error.

Live acceptance before claiming automatic provider support: perform read-only checks against each supported provider with the installed extension, manually compare displayed date/party/seating to the app result, and verify the actual handoff. Do not book. Providers that have not passed remain manual-handoff-only and are named as such in release notes. Native iPhone behavior is checked separately; desktop emulation is not native validation.

## 13. Implementation phases and release order

### Phase A — correctness and immediate friction

Fix positive slot validation and contextual handoff. Add the claim eligibility contract and honest unknown states. Separate discovery identity from outing criteria, permit date-only rechecks, and combine result presentation. Keep legacy backend compatibility. Deliver both hosts' shared presentation changes with relevant regression and visual tests.

### Phase B — staged research and ranking

Add additive schemas, persistent venue identities/claims, bounded stage endpoints, idempotency, task registration, caches, deterministic ranking, and incremental results. Install schema before dependent Worker code. Preserve the existing `/v1/ai-connections/:id/restaurants` route for old clients; its compatibility response must not contain stronger claims than the new verifier supports.

New clients request capability/version metadata before using staged endpoints. If unavailable, offer the legacy research path with honest limitations; never silently claim staged verification on legacy data. Server rollout precedes clients. Breaking stored shapes require explicit migrations and future-version refusal without losing queued work.

### Phase C — provider efficiency and recovery

Introduce measured provider-specific coverage plans and bounded concurrency. Add distinct recovery actions, opt-in broader time/date checks, notification handoffs, and verified release reminder creation. Mark each adapter supported only after live acceptance. Do not block the product on partner API approval; official APIs are an optional later adapter with equivalent contracts.

### Phase D — saved knowledge and personalization

Add saved restaurants/shortlists and explicit feedback using shared encrypted offline resources. Migrate mobile's latest downloaded shortlist into a dated local historical search, not falsely verified v2 facts. Keep the legacy copy until the new write succeeds. Adopt shared stores on both hosts, verify disconnect/recovery, and add the Saved view only when populated.

At every phase update the existing restaurant guide, affected component/host docs, and blueprint when mapped structure changes. Follow current repository version, build, package, commit/push, Worker/mobile deployment, and D1 release-publication rules. Do not ship unrelated in-progress changes from this checkout.

Each phase must stand alone as a useful release with truthful limitations. The complete redesign is done only when all four phases and their acceptance gates are satisfied.

## 14. Operational visibility and rollback

Record stage timings, counts, adapter versions, reason codes, cache hit/miss, estimated/actual usage where provided, and whether a handoff occurred. Do not log raw queries, private feedback, credentials, full snapshots, or complete source text. A handoff is not a completed reservation. Local diagnostic IDs may correlate a failure with an explicitly requested support export.

Keep a provider capability register in code: automatic inspection supported/manual only, tested adapter version, and last verified date. Disable a broken adapter centrally through normal versioned configuration while preserving provider links; never change failure to unavailable to improve success metrics.

Rollback must preserve all new user records and queued edits. Reverting a UI or Worker version must not drop additive tables. Keep migrations reversible where possible; irreversible cleanup waits until old-client compatibility and retention windows have elapsed. Availability inspection can fall back to manual handoff independently of discovery and saved records.

## 15. References and authority

Repository rules and current implementations remain authoritative for shared infrastructure. This specification defines proposed restaurant behavior; it does not authorize unrelated changes or claim access to provider APIs.

- [Existing restaurant behavior and limitations](../chrome-sidebar/RESTAURANTS.md)
- [Shared components](UI_COMPONENTS.md), [design](DESIGN.md), [visual acceptance](VISUAL_QA.md)
- [Repository blueprint](BLUEPRINT.md), [Cloudflare operations](CLOUDFLARE.md), [reminders](REMINDERS.md)
- [OpenTable partner/API FAQ](https://www.opentable.com/restaurant-solutions/api-partners/faqs/) — reviewed September 22, 2026; API access requires the applicable partner process, not an assumed public inventory endpoint.
- [Resy Notify explanation](https://blog.resy.com/2021/09/notify/) — reviewed September 22, 2026; notifications do not guarantee a reservation.
