# Reward programs

A reward program is a perks portal: a membership with no balance, whose value is
the catalogue of offers behind it. Morgan Stanley Reserved Living & Giving
(`msreserved.com`) is the first one, and **Amex Offers** — the offers American
Express picks for the cards you hold — is the second. Offers change without
notice, so a catalogue is read from the program's own pages instead of being
typed in.

The offers appear under **Browse offers**, one closed line at the foot of
**For you** in Rewards & benefits, on the extension and on the phone. A
catalogue is evidence and something to browse, not the organizing principle:
For you raises at most one row about it, and where no wallet entry says the
owner is in the program that row asks them to check eligibility rather than
presenting the offers as theirs.

## Two kinds of catalogue

Morgan Stanley Reserved publishes its offers: every member sees the same list,
it needs no sign-in, and its pages are a listing whose markup says which part is
an offer. That catalogue is read from the markup, by the watcher, whenever the
owner visits the site. It costs nothing and it is exact.

Amex Offers is the other kind. The offers are chosen for the owner's own cards,
they sit behind their sign-in, and the page is an application rather than a
listing — its markup is nobody's contract. So that catalogue is read the way the
wallet reads an issuer's page: the owner presses **Read this page** with the
offers open beside the panel, and the text of that page is read into offers.
Visiting americanexpress.com reads nothing on its own.

Because those offers are the owner's, the text of that page goes to the same
model the rest of the reading uses — merchant names and what each offer gives,
as the page states them. Nothing else about the account goes with it: no
session, cookie or credential leaves the browser, and none of the wallet is
sent. The catalogue is stored encrypted like every other record.

A reading of that page is always **partial**. The list loads more offers as it
is scrolled, so a reading adds and updates and never retires: scroll, press
again, and what was further down joins what was already saved. At most
`OFFER_READ_LIMIT` (100) offers come back from one press.

### One list per card

An issuer runs a different set of offers on each card, on a page of its own —
`/offers/eligible?account_key=…`, one key per account. So an offer carries the
card the page names it for ("Blue Cash Preferred® ····72005") and the address of
the list it was read from. The card is part of the offer's identity: the same
merchant offer on two cards is two offers, and one key for both would keep
whichever was read last and lose the other. Each offer's link opens the list it
is actually on, rather than whichever card the issuer happens to show first,
and the card is searched along with the merchant, so typing a card's name
narrows the tab to that card's offers.

Reading them all means visiting each card's list and pressing once on each. The
one catalogue holds them together, told apart by the card on every row.

## What is read, and what is not

The reading follows the rule Finance already follows for an account site. The
extension never signs in, never navigates, and never opens a tab of its own. It
reads a page the owner already has open, in the page.

What it takes is the offer list: for each offer, its name, category, one-line
summary, any badge (*New*, *Exclusive*, *Limited-Time Offer*, or *Added* where
an issuer says the offer is already on a card), any dates, the card it is on
where the program keeps a list per card, and the path of the page it belongs to
— the offer's own where it has one, and the list it sits on where it does not.
A path on any other origin is not this program's and is dropped.

What it never takes is a session, a cookie, or a credential — neither leaves the
browser, and for a published catalogue none is needed: it is the same list
whether or not anyone is signed in. An issuer's offers are the owner's own, and
are held to the same rule as the rest of their wallet: read only when they ask,
stored encrypted, and never sent anywhere but to the model that reads the page.

## Where the whole list comes from (a published catalogue)

`/offers/all_offers` lists every offer; every other page on the site shows a
subset. When the owner is on the site but not on that page, the reading asks
that page for itself — one same-origin `fetch` from inside the tab, parsed
there. That is what makes "all the offers" true from anywhere on the site.

A reading that could not see the whole list is **partial**: it adds and updates
offers, and may not retire one it simply could not see. Only a **complete**
reading drops an offer the program no longer lists. The status line dates the
catalogue by the last complete reading, because a partial one does not confirm
the rest is still current.

## When it runs (a published catalogue)

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

## How a long catalogue is listed

Morgan Stanley Reserved alone publishes well over a hundred offers, which is
not a list to read down and would bury the wallet under it. So the offers are
grouped: **New** first, then one line per category, each saying how many it
holds and each closed until it is opened. A whole catalogue costs the height of
its categories.

Only **New** opens itself, and only while it is short enough to be worth
opening. A first reading stamps every offer as first seen that day, so **New**
would be the entire catalogue and say nothing about it — in that case the group
is not shown at all and the categories are the list. A new offer also stays
under its own category, because a category that quietly omitted its newest
offers would be the wrong answer to what is there.

Searching or choosing a category has already narrowed the list, so it is shown
as one flat run of matches with no groups to open through.

`program-offline.js` keeps the device's copy, so the offers stay readable on a
phone with no signal. The phone never writes one: the reading needs the browser
that is on the program's site.

## Adding a program

Add an entry to `REWARD_PROGRAMS` in
[`chrome-sidebar/src/program-data.js`](../chrome-sidebar/src/program-data.js):
its `id`, `label`, `source`, `hosts`, `origin`, the `catalog` path that lists
everything, the `offer` path pattern, and `reading` — `markup` for a published
catalogue the watcher reads, or `text` for one read off the page by the owner's
press, where offers have no page of their own and each one's link is the list
it sits on. If the program's markup differs from
the card markup `readProgramCards` expects, extend that reader in
[`reward-programs.js`](../chrome-sidebar/src/reward-programs.js) rather than
teaching the catalogue about a second shape.
