# Properties

A shortlist for a real estate search: every property being considered, where the
search stands with each one, and what its asking price has done since it was
first seen.

Files: [`property-data.js`](../chrome-sidebar/src/property-data.js),
`properties-offline.js`, `properties.js`, `components/properties.*`,
[`listing-sites.js`](../chrome-sidebar/src/listing-sites.js) (the sidebar's
alone), and [`tools-api/src/properties.js`](../tools-api/src/properties.js).

## The record

`{address, link, status, price, beds, baths, sqft, taxes, hoa, notes, since, prices}`.

The facts that decide a search are read off the listing, so having them costs the
owner nothing; `notes` is for what only the owner knows, in their own words. A
figure the listing does not state is `null`, never zero — a house with no HOA and
a house whose HOA nobody has read are not the same house.

There is deliberately no score, no mortgage and no estimate. A number this app
made up would sit beside numbers the listing states and look exactly as
authoritative.

`status` is where the search stands: Looking, Seen, Offer, Passed. A row offers
the next step and passing on it; Passed keeps its own quiet view, the way a gift
already bought does, because "didn't we already look at that one" comes up in
every search.

## Price history

`prices` is a list of `{price, on}`. It starts at the first price, dated by
`since` — however the property arrived: typed, read off a page, or captured from
a line — so a later cut always has something to be measured against. A new price
joins only when it differs from the last one recorded, so reading the same
listing every day adds nothing. The row shows how far the price has moved from
where it started: `$1,195,000 ↓ $55,000`.

## Reading a listing

In the side panel, beside a listing page, the tool offers **Save this listing**,
and the [page strip](../chrome-sidebar/src/page-offers.js) offers the same from
wherever the panel is. Pressing it takes one snapshot of the page's visible text
(the same reader Finance uses), and `POST /v1/ai-connections/:id/listing` returns
the facts the listing states. Nothing is confirmed before saving; the line read
back is built from the stored record.

Beside a listing already on the shortlist the action becomes **Update from this
page**. The device merges the reading into the saved property: a new price joins
the history, a figure the page now shows is filled in, a figure it no longer shows
is left as it was, and status, notes and `since` are never touched. The same house
found on a second site is matched by its address.

A listing site is recognized by URL alone, in `listing-sites.js`. Zillow's
detail-page shape was checked against its live search pages; Redfin, Realtor.com,
Compass, StreetEasy, Trulia and Homes.com all refuse automated browsing, so theirs
follow the URLs those sites are known to use. A page that matches but is not a
single listing costs one reading, which comes back saying so, and nothing is saved.

The phone never reads a listing — that needs the browser the listing is open in —
but it has the whole shortlist offline, because it is needed most standing outside
a house with no signal.

Quick add can create a property from a typed line: see [quick add](QUICK_ADD.md).
