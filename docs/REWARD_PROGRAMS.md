# Reward programs

A reward program is a perks portal: a membership with no balance, whose value is
the catalogue of offers behind it. Morgan Stanley Reserved Living & Giving
(`msreserved.com`) is the first one. Its offers change without notice, so the
catalogue is read from the program's own pages instead of being typed in, and
it is refreshed whenever the owner visits the site.

The offers appear under **Program offers** in Rewards & benefits, on the
extension and on the phone.

## What is read, and what is not

The reading follows the rule Finance already follows for an account site. The
extension never signs in, never navigates, and never opens a tab of its own. It
reads a page the owner already has open, in the page.

What it takes is the published offer list: for each offer, its name, category,
one-line summary, any badge (*New*, *Exclusive*, *Limited-Time Offer*), any
dates, and the path of the offer's own page. Every member sees the same list.

What it never takes is anything about the owner's account. No session, cookie,
or credential leaves the browser, and none is needed: the catalogue is the same
whether or not anyone is signed in.

## Where the whole list comes from

`/offers/all_offers` lists every offer; every other page on the site shows a
subset. When the owner is on the site but not on that page, the reading asks
that page for itself — one same-origin `fetch` from inside the tab, parsed
there. That is what makes "all the offers" true from anywhere on the site.

A reading that could not see the whole list is **partial**: it adds and updates
offers, and may not retire one it simply could not see. Only a **complete**
reading drops an offer the program no longer lists. The status line dates the
catalogue by the last complete reading, because a partial one does not confirm
the rest is still current.

## When it runs

`background.js` registers the watcher, so a visit is picked up whether or not
the side panel is open. Landing on `/offers/all_offers` always reads — the
offers are already on screen, so it costs nothing extra. Anywhere else on the
site reads at most once every 30 minutes (`READ_MS`). An attempt is recorded
before it runs, so a page that cannot be read is not retried on every load.
Nothing is read at all when the device has no cloud connection.

## Where it is stored

One document per program in `program_catalogs`, encrypted at rest like every
other record, written through `PUT /v1/rewards/programs/:id` and read through
`GET /v1/rewards/programs`. That route is allowed a 256 KB body — a whole
catalogue is several times what an ordinary record is held to — and at most
`MAX_OFFERS` (500) offers.

The fold of a new reading into the stored one happens in the Worker, not on the
device: it is the one copy every device writes, so two browsers reading the same
program at the same moment cannot lose each other's offers or reset how long the
owner has had one. `firstSeenAt` survives every later reading, which is what
puts offers that are new *to the owner* at the top of the list.

`program-offline.js` keeps the device's copy, so the offers stay readable on a
phone with no signal. The phone never writes one: the reading needs the browser
that is on the program's site.

## Adding a program

Add an entry to `REWARD_PROGRAMS` in
[`chrome-sidebar/src/program-data.js`](../chrome-sidebar/src/program-data.js):
its `id`, `label`, `source`, `hosts`, `origin`, the `catalog` path that lists
everything, and the `offer` path pattern. If the program's markup differs from
the card markup `readProgramCards` expects, extend that reader in
[`reward-programs.js`](../chrome-sidebar/src/reward-programs.js) rather than
teaching the catalogue about a second shape.
