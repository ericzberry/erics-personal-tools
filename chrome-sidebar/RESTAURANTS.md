# Restaurants

Open **Restaurants** from the Tools menu. The workspace opens in its own extension tab and uses your existing Chrome sessions on booking sites. The phone has the same tool; it opens the provider by hand instead of reading it.

This is the redesign described in [docs/RESTAURANT_SEARCH_SPEC.md](../docs/RESTAURANT_SEARCH_SPEC.md). The owner's complaint that started it — *"I don't think the restaurant search works well"* — is held to four regression criteria: no verification claimed above what a source was read to say, no false "available", no research repeated for a date or party change, and no restaurant shown in two places. The tests named below hold each one.

## Implementation status

| Phase (spec §13) | State |
| --- | --- |
| A — correctness and immediate friction | Delivered (extension 0.6.278, mobile 0.1.227). |
| B — staged research and ranking | Partly: claims are verified by reading their sources in the Worker, deterministic eligibility and ranking are in, and `restaurant.discovery` and `restaurant.intent` (the reading of the typed request) are registered tasks. Not yet: persisted venue and claim tables, the staged `/v1/restaurants/searches` routes, idempotent stage runs, the cost ledger. Research is still one bounded request. |
| C — provider efficiency and recovery | Partly: provider coverage plans, bounded concurrency and the check limits are in; **Check remaining** and **Continue checking** exist. Not yet: relaxation offers ("Check after 8:30"), notification handoffs, release reminders, live acceptance of each adapter. Only Resy has been read against a live page. |
| D — saved knowledge and personalization | Not yet: no Saved view, saved restaurants, shortlists or feedback. Ranking already accepts explicit feedback so the view can be added without touching it. The device keeps a bounded search history. |

## Search

One box takes the whole request, the way it would be said: *Sushi for 3 in the LES within 15 minutes of 12:15 this Saturday*, *Le Bernardin Friday for 2 at 8*, *exactly two Michelin stars, any night this weekend*. Enter searches; Shift+Enter starts a new line.

New words are read first (`restaurant.intent`; `readRestaurantRequest` in the Worker, checked by `readingFromJSON` in `restaurant-data.js`). The day, the hour, the window either side, the party and a city, if one is named, come out of them into the controls, and the rest of the words — *sushi restaurant in the LES* — are what the research looks for. Weekdays are looked up in a list of the coming days on the destination's clock rather than counted. A meal named without an hour takes its usual one: brunch 11:30, lunch 12:30, dinner 7:30 pm. The model never decides a requirement: the remaining words are read deterministically (`interpretRequest`), where "exactly", "under", "no" and an allergy make requirements, "prefer", "near" and the atmosphere words make preferences, a short phrase with no criterion words is a name, and a clock, a length of time or a head count is never a budget. Words already read are not read again, and the research identity is the words about the place, so saying Sunday instead of Saturday rechecks the same restaurants.

**Details** holds what the words set and the way to set it by hand: **City**, **Date**, **People**, **Time** (every quarter hour, plus any other time the words named), **Window** (exactly, or ± 15 minutes to ± 3 hours, plus any other span the words named), **More dates** (a last date up to seven days on), **More sizes** (up to four adjacent sizes), then neighborhood, the most to spend per person, dietary needs, the menu format and **Include longer travel**. A control the words say nothing about goes back to its default. A control set by hand stands over the words, and the summary says so (*People taken from the form (the words said 3).*), until the words about it change; then the newer statement wins. If the reading fails, Details opens, and the same words go ahead as typed on the next press with the controls as they stand. With no date the search is discovery only.

The standing New York preferences carry over: the Upper West Side is preferred, and the Lower East Side, East Village, Brooklyn and Queens are excluded unless the request names one of them or longer travel is included. Dates are judged on the destination's own clock: a Tokyo dinner is not refused for being yesterday in New York.

As soon as the words are read, the form folds under a line of chips saying what was understood, and the research runs beneath it; the previous results come back if it fails or is stopped. **Edit search** opens the form again. **Search as a description instead** / **Search as a name instead** corrects the reading. A named restaurant with several plausible locations asks **Which location?** before any page is opened.

## Results

One block per restaurant: name and neighborhood, one reason built from the facts that were read, the price basis and at most one compromise, what is not verified, the times observed or the exact reason none are shown, one way in, and **Details** with the address, every claim with its source, status and the passage it was read in, the booking providers and the observation time.

Restaurants that meet every requirement are the choices, at most five, in fit order (`restaurant-ranking.js`: only the dimensions that were asked for take part, renormalised; an unknown scores nothing and is named). **Could not verify** and **Doesn't match** fold below with the fact that placed each one there. Nothing is padded to five.

With a date, the choices group as **Times found**, **Still checking / Check on provider**, **Previously observed — recheck** (older than five minutes) and **No matching times observed**, in fit order within each group. A table never lifts a restaurant that does not match.

## What is verified, and how

Discovery (`restaurant.discovery`, web search) proposes candidates and, for each fact, the sentence it read on the source page. The Worker then reads up to eight of those pages itself (`tools-api/src/source-fetch.js`: HTTPS only, public hosts, three revalidated redirects, ten seconds and one megabyte each) and marks a claim **read from the source** only when the quoted passage is on the page, with its figure, near the restaurant's name. Everything else stays **not verified** with the reason. A requirement passes only on a fresh supported claim in the publication's own units: exactly two stars is not three, above 8.5 is not 8.5, an all-in budget needs tax and fees established, "NYT top 20" needs the latest edition established or an edition named.

## Availability

On the extension, a dated search checks the first three choices as soon as they are known (one for a named restaurant); **Check remaining restaurants** covers the rest. Checks open a temporary background tab per venue, provider, date and party — the preferred combination first — two at a time and one per site, at most twelve pages and a minute per pass, thirty-six per search. Resy and SevenRooms show the whole day on one page; OpenTable and Tock are asked near the preferred time, and the result says the coverage was partial.

A time counts only when the reader saw it inside the page's reservation region, enabled, under the selected date and exact party, and inside the window. Opening hours, a time-of-day selector, calendar days, Notify buttons and disabled times are never tables. "No tables" needs the provider's explicit message for that party; empty pages, login, verification steps and experience choices are their own states, never sold out. A model reads a page only when the structure said nothing, at most twice per restaurant and six times per run, and only slots the page agrees with are kept.

Changing the date, party or time rechecks availability against the same restaurants; nothing is researched again. Old observations stay marked with their own date until replaced. **Stop** keeps what was found. Reopening restores the last search and its observations with their ages and starts nothing. A slot with a stable link opens it; otherwise **Open 7:15 pm search** opens the provider's search near that time, and the table is chosen there. The app never books, joins a waitlist, accepts terms or pays a deposit.

The phone shows **Check on Resy** (one per provider) with the date and party filled in, rebuilt as the date changes, and never says "no tables".

## What the device keeps

Both hosts keep the last ten searches for thirty days — the intent, the candidates and their claims, and a day of observations — encrypted on the device under the `restaurants` store in `private-resources.js`, so a disconnect clears it. The phone's earlier single download is carried forward as a dated search of leads. Searching writes no cloud records.

## Validation

`restaurant-data.test.js` (R01–R05, R16–R18, R24, R27, the reading's checks), `restaurant-ranking.test.js` (R19, weights, tie-breakers), `restaurants.test.js` (R06–R08, R14, R15, bounded runs, the browser), `restaurant-controller.test.js` (R09–R11, R05, R20, the typed request read into the controls), `restaurant-history.test.js`, `tools-api/tests/restaurants.test.js` and `source-fetch.test.js`, and `mobile-app/tests/restaurants.test.js`. The synthetic harness is `tests/restaurant-preview.html`: five candidates including an unverified lead and a three-star mismatch, a Resy page with dining-room and bar times, an OpenTable page, a verification challenge for parties of three and an explicit no-tables message otherwise. No external request is made.

Not yet verified: live OpenAI discovery, source reading and the request reading against real models and pages; live OpenTable, Tock and SevenRooms layouts (Resy's region reading was checked against one live page in the previous version; the region heuristics in `reservation-reader.js` are new). Until an adapter passes live acceptance it is best treated as a handoff with a read attempt, and the result says when a check could not be completed.
