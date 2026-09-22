# Rewards & benefits

Choose **Rewards & benefits** from Tools in the extension or the unlocked mobile
app. It is the one place for everything a card, airline or membership gives you
that is not money in an account: points balances, statement credits, program
access, the deadlines attached to them, and what to pay with. It answers four
questions, one tab each, through the shared `Tabs`:

| View | Question | What is under it |
| --- | --- | --- |
| **For you** | What is worth doing? | A short ranked list of opportunities, then **Browse offers** |
| **Wallet** | What do I actually have? | The cards and programs, what has been read for each, and the ways in |
| **Pay** | Which card should I use? | One purchase, one answer, with the card terms it rests on under **Card rates** |
| **Points** | What can my points do? | Each balance, what earns into it, and what a point is worth to you |

A tab is in the row only while it has something to answer. A new wallet opens on
Wallet alone; Pay arrives once a card with earning terms is saved; Points once a
balance has a figure; For you once there is something to do or a catalogue to
browse. An established wallet opens on For you, and after that on whichever
view was last open on that device.

**Best card** and **Purchase advisor** are the Pay view now. Their old pages
(`cards.html`, `advisor.html`) and their capability ids stay as ways in — a
bookmark, an older link, the strip under the header — and land on Pay rather
than on a second calculator; see [BEST_CARD.md](BEST_CARD.md) and
[PURCHASE_ADVISOR.md](PURCHASE_ADVISOR.md) for what that view does.

## For you

`rewardOpportunities` in
[`reward-opportunities.js`](../chrome-sidebar/src/reward-opportunities.js) is
one deterministic projection over the wallet, the card terms and the
catalogues, read by For you, Needs attention and (in a later phase) the home
screen, and written by none of them. Every row is a rule over saved records —
no model chooses what is relevant — and each carries a stable key, so a row
resolved on one screen is resolved on every screen.

What it raises, in priority buckets that decide before any score does: access
the card includes and nobody has switched on (*Set up …*); a credit or
certificate closing with its period (*Use … within N days*), worded as useful
only if you were already going to spend it; what the wallet lacks and a
recommendation would lean on — a card's credit trackers never read, a card
with no earning terms, a balance more than 30 days old; a catalogue held for a
program no wallet entry says you are in (*Check whether … is yours to use*);
and, last and at most once, a catalogue to browse. A membership or a
protection with no dollar figure ranks on how useful and how urgent it is,
never on a cash value it has not got, and nothing here says you are losing
money by not spending.

The list is five rows, no more than two from one card or program, with **More
opportunities** for the rest. Each row's verbs are **Done** and **Not useful to
me**, kept as a resolution record against the row's key and the terms it was
decided on: a dismissal holds until the period turns or the terms change, and
a reminder until its date. The wallet's own records — resolutions, the
bindings below, point values — are `/v1/wallet`
([`wallet-data.js`](../chrome-sidebar/src/wallet-data.js),
[`wallet-offline.js`](../chrome-sidebar/src/wallet-offline.js)), synced and
kept offline like every other record.

## Wallet

**Update wallet** leads the view once a card is held: one line per card
account saying what has been read for it and when — its earning terms, its
credit trackers, its offers, the balance it earns into — and the page that
would fill the largest gap. `accountCoverage` and `walletGaps` in
`wallet-data.js` compute it from the records; an attempt that failed advances
nothing, only a save does. The status above it is the reconciliation: how many
cards, how many links still need a choice, how many balances have never been
read. Nothing here connects to an issuer: the owner opens the page and the
sidebar reads it.

A card is an account, not a product. Two cards of one product are two rows,
told apart by the digits the issuer prints beside them, sharing the product's
earning terms and nothing else; a credit read off a page belongs to the account
the page named. A page name that fits two of your cards asks which, once, in
the import review, and keeps the answer as a binding so the next reading of
that name files itself. Conflicting digits never match; missing digits prove
nothing either way. `cardAccounts` and `matchAccount` in `wallet-data.js` are
the one reading of "which account is that".

## Entry kinds

Every entry names itself, who provides it, and what it is worth.

| Kind | What it is | Example |
| --- | --- | --- |
| Credit card you hold | The card itself. Benefits are filed under it, and its number can be sealed here. | Amex Platinum |
| Points or miles balance | A balance you update | 42,000 Membership Rewards |
| Credit, discount, or offer | Something to spend before it expires | $15 monthly ride credit |
| Membership or program access | Access, status, or an included subscription | Priority Pass Select |

A benefit says which of your saved cards carries it. That link is what lets the
wallet show a card with its benefits inside it rather than a flat list of forty
rows, and deleting a card leaves its benefits in the wallet rather than taking
them with it — the confirmation says so before you choose.

Every row goes somewhere. A balance opens the program's own account page, a
card opens its issuer's, and a benefit opens the page of the card that carries
it, so a figure in the wallet is one press from where it is kept. A link you
typed into an entry is the one it uses; otherwise the page comes from the
programs in
[`loyalty-sites.js`](../chrome-sidebar/src/loyalty-sites.js) and the
institutions in
[`account-sites.js`](../chrome-sidebar/src/account-sites.js), matched on the
name the entry carries. A row nothing there recognizes — a lounge membership,
a merchant offer — carries no link rather than a guess at one.

## Add a card you hold

The whole intake is one box: say which card you have however you name it —
`amex platinum`, `blue cash`, `jp morgan reserve`. Research using a saved OpenAI
connection identifies the exact product from the issuer's current pages and
brings back the card and every benefit it carries: the amount, how often it
resets, whether it needs enrolling, any fixed end date, and what the issuer says
you must check. A name that fits more than one real card returns the products it
could be, each with what separates it, and researches nothing until one is
chosen — `blue cash` is two different cards with two different annual fees.

Research never stops at the first document. A rewards programme agreement
names only the credits that touch points, and a guide to benefits names only
the protections, so it reads the card's benefits page, its guide to benefits
and, for a private or upgrade-only card, the published product it is a version
of — and checks for every kind of benefit a card carries: credits, lounges,
Global Entry, elite status, partner memberships, travel, purchase and phone
protections. A premium card comes back with twenty or more. The review shows
each as its name, what it is worth, and its fine print set smaller beneath.

Nothing is saved by research. The card and its benefits are listed the way they
will be stored, and **Save this card and N benefits** writes them: the card
first, so the benefits can name it. If a save stops part way, what is left stays
on screen and the action becomes **Save the remaining N benefits**, so no
research is lost and saving again finishes the job.

Benefits entered by hand work the same way; pick the card in the editor.

### The cards you already hold

**Look up my saved cards** does the same research for every card in the wallet,
in one press. It is there only once there is a card to look up, and it proposes
only what is missing: a card filled in by hand, or one whose benefits were read
off the issuer's own page, already carries some of what research finds, and a
benefit the wallet has under that card is not offered again. Where a card never
said what it earns, the issuer's own line for it — `6% at U.S. supermarkets,
3% at U.S. gas stations, 1% on everything else` — fills that blank and nothing
else about the card is touched.

One review holds every card it found something for, one block each, and one
**Save N benefits across N cards** writes them all, filing each under the card
it came from. A save that stops part way keeps what is left, including the cards
it had not reached.

The one thing a sweep cannot settle is a name that fits more than one real
product: choosing between them means asking, and a sweep that stopped to ask
would be the presses it replaced. Those cards are named when it finishes and
left to the intake above, which is where choosing belongs. A card research
cannot answer at all is named the same way, and the sweep carries on to the
rest.

A card the issuer publishes nothing about — invitation-only, private bank, or
offered only as an upgrade — is the case research is weakest on, and the
J.P. Morgan Reserve is the example: Chase keeps no public page of its terms.
Research looks for it where it is actually written down: first a page about
that card which is not the issuer's — a card review, a reference site — and
failing that the published product the card is a version of. Either way it keeps
the name of the card you hold, cites the page the terms were read on, and says
in its notes that the issuer publishes none of its own and where these came
from. Terms from anywhere but the issuer are never presented as the card's
confirmed ones. The better source for a card like that is the card's own page: open it
with the sidebar beside you and read it, which is where its credits, its
benefits and what it earns are all stated for your account.

Earning rates are Best card's, not the wallet's: [BEST_CARD.md](BEST_CARD.md)
lists the cards this wallet holds and finds the rates for one with a press of
its own.

## Points

The Points view lists each balance the wallet holds a figure for: the brand
and the figure on one line, and under it the currency's full name, when it was
last read and whether that is more than 30 days old, the cards that earn into
it, and what a point is worth. Nothing is summed over programs. A point's
value is the owner's planning figure, kept per currency in `/v1/wallet` with
where it came from and when; until one is saved, the value a card's terms give
stands in and says so, and where no card earns into the program the value is
**not set** rather than assumed at 1¢. A balance as cash is shown as a
scenario on that value, never as a redemption
([`points-data.js`](../chrome-sidebar/src/points-data.js)). Goals, award
quotes and transfer paths are later phases of
[the rewards system spec](REWARDS_SYSTEM_SPEC.md).

## Points and miles in the wallet

The wallet's program rows are one row each, the program on the left and what
it holds on the right, read down a single column of figures. Nothing is summed
over them. A hotel's points, an airline's miles and the cash
back a card keeps in money are different things, and one number over the pair
answers no question anybody has; a balance that has gone out of date is raised
by name in Next actions, which is where something to do about it belongs.

Each row says the brand and nothing more — **United**, **Marriott**, **Amex** —
because the currency's own name is the long part and nobody holds two United
currencies. The full name is still what the panel beside a program's page names
when it offers to read it, and what the entry is called when it is deleted; the
wallet's own list is the one place the brand is enough. A program no registry
knows says its source, which is the shortest true thing there is about it.

The rows are grouped into runs and each run is one alphabetical column:
Airlines, Hotels, Rail, Card points, the Cards you hold, and Other for whatever
no registry recognizes. A run with nothing in it draws no heading. The brand
and the run are fields on the program in
[`loyalty-sites.js`](../chrome-sidebar/src/loyalty-sites.js) — `short` and
`kind` — so a program moves runs, or changes what it is called, in the registry
rather than in the screen that draws it.

Cash back — Blue Cash's Reward Dollars — is a balance like any other and stays
money, so it reads `$125.49` rather than being rounded into points, and it is
the one place an issuer's two currencies are told apart by name: **Amex** for
Membership Rewards, **Amex cash** for Reward Dollars. The unit is read back out
of the entry itself: "82,431 miles" is miles, and so is "82,431" under a
program called MileagePlus.

### The programs themselves

A program in the registry is not a program you are in, so the wallet no longer
offers to add every program it knows. A program arrives when you add it, or
when a reading of its page finds a balance. A program with no figure yet says
**Balance not read** on its row and is never raised in For you — it has never
been read, so there is nothing about it to update. Once a reading fills one in,
the ordinary 30-day rule applies to it like any other balance.

The programs are in
[`chrome-sidebar/src/loyalty-sites.js`](../chrome-sidebar/src/loyalty-sites.js).

### Reading a balance off the program's page

Open a program's own site with the sidebar beside it — united.com, marriott.com,
americanexpress.com — and Rewards offers to read your balance at the head of
**Wallet**, a block that is there only while such a page is. One press takes
one text snapshot of the page you are already looking at, turns it into a
figure per program, and shows it. Nothing is saved by reading: each balance
names the entry it would land on, and a press of yours saves it.

An issuer's page also lists the offers it has picked for your cards, and those
are a catalogue rather than wallet entries: the same press saves them under
**Browse offers** in For you, beside the other catalogue, and says how many. There is a list per
card, each on a page of its own, so every offer says which card it is on and
links back to that card's list; reading them all means a press on each. Nothing there waits
to be reviewed, because a hundred merchants reviewed one at a time is not a
thing to ask of anyone; the list adds and updates and retires nothing, so
scrolling further and pressing again brings back the rest. See
[reward programs](REWARD_PROGRAMS.md).

What the snapshot keeps depends on whose page it is. An airline's or a hotel's
page is a balance page, and is narrowed to the lines that carry a figure and the
lines that name one, the way Finance reads an account page. A card issuer's own
page is not: what it says about the card is mostly not a figure — `5X Membership
Rewards® Points`, `Centurion® Lounge Access`, `Enroll` — so that page is read
whole, with the legal furniture taken out and nothing else. Read for figures it
gave up what the card earns and every benefit with nothing to count.

The rest of the rule is the one Finance already follows for an account page. The
extension never signs in, never navigates, and never opens a tab of its own; no session,
cookie or credential leaves the browser, and none of your wallet is sent for
the reading. A balance read for a program you already hold updates that entry
instead of adding a second one beside it, and keeps everything else about it —
its expiration, its notes, the card it is filed under. An entry with no link of
its own takes the program's page; a link you put there yourself is never
replaced.

It reports the balance you can spend. Elite-qualifying miles, segments, nights
and status credits are not balances and are left in the note beside one. A page
that shows no balance is told so rather than guessed at, and the phone cannot
do this at all: the reading needs the browser that is on the program's site.

The programs recognized are in
[`chrome-sidebar/src/loyalty-sites.js`](../chrome-sidebar/src/loyalty-sites.js)
— the airlines, hotel groups and card issuers, each with the unit its balance
is counted in. Adding one is a single entry: its `id`, `label`, `source`,
`unit`, and the hosts it is recognized by.

### An issuer that runs more than one currency

A card issuer keeps a currency per kind of card, and prints them together. Hold
an Amex Platinum and a Blue Cash and the rewards page states two balances: the
Membership Rewards points the Platinum earns, and the Reward Dollars the Blue
Cash earns in money. Both are named on the panel, one press reads both, and each
figure is filed under the program it belongs to — cash back is never saved over
the points balance it was printed beside, and where a reading finds two balances
for one provider the program's own name decides which entry each lands on, or
neither does and it is saved as a new balance for you to check.

### Reading what is left of a card's credits

A card's page prints a tracker for each credit it carries: what has been earned
against it and what is still to go. The same press that reads a balance reads
those too — one snapshot, one list to review — and each one names the credit it
would fill in.

What is stored is what is **left** in the period the credit is in now, never
what has been used: a tracker reading `$0 Earned / $200 To Go` has $200 left.
That figure sits beside the card's own terms rather than replacing them, because
"$25 per month" and "$25 left this month" are different facts and only one of
them changes. Everything else about a saved benefit — its notes, its link, its
expiration, the card it is filed under — stays yours.

A credit is filed under the card the page names it against: a binding you
confirmed for that page name first, then the account digits the page prints,
then the words that tell one card from another. A name that fits two of them
equally asks **Which card is this on?** in the review, and the answer is kept
as a binding so it is never asked for that name again; nothing is filed under
a guess, because a Platinum's credits under a Blue Cash is worse than credits
under no card at all. A credit with nothing left is marked used, which takes
it off For you until the next reading finds the period has turned over. A
credit whose tracker has never been read says **remaining not read** on its
row: the allowance is known, what is left of it is not, and Pay counts it only
once it is.

Research and this reading answer different questions: **Add a card you hold**
brings back what the card gives, and the tracker says how much of it is left.
A credit read before it has ever been researched is saved with the amount the
page states.

## Resets and For you

Most card credits are not one-time offers — they come back, and the unused part
does not carry over. An entry's **Resets** says which calendar period it follows:
monthly, quarterly, twice a year, or yearly. For you raises a recurring
credit as its period closes, sooner for a shorter period (7 days for monthly,
14 for quarterly, 30 for twice a year, 45 for yearly), because a monthly credit
is always within a month of resetting and would otherwise never leave the list.

A credit whose period follows your account anniversary rather than the calendar
gets no cadence — only you know the anniversary — so give it an explicit date.
An explicit expiration always wins over the period the entry would sit in.

For you also raises a passed deadline to check, a benefit that still needs
activating, and a balance not updated in 30 days. A card itself carries no
deadline and is never raised. Needs attention shows the rows about something
closing or waiting to be set up, from the same projection.

### Before the quarter closes

The home screen both hosts open on carries the few of these worth crossing the
room for, under the birthdays: every credit with at least $50 left whose
deadline — its own date, or the close of the period it repeats on — lands inside
the quarter you are in now, largest first. `creditsThisQuarter` in
`rewards-data.js` decides it, and the screen shows six, then counts the rest and
what they come to.

The floor is what keeps it a glance rather than a second Next actions: a $15
ride credit resetting on Tuesday is true and not worth a home screen. What the
issuer's own tracker says is *left* wins over what the card gives, so a credit
half spent reads `$62.50 left`; one already used, one worth something that is
not money — four lounge visits — and one whose period closes next quarter are
all left off. Nothing is written and nothing is asked for: a wallet that will
not open leaves the birthdays above it exactly where they were.

## Limits

Research reports what the issuer's pages say on the day it ran. Benefits change,
and enrollment, eligibility, caps, tiers and merchant exclusions are yours to
confirm against the linked terms. It returns at most 40 benefits per card, omits
welcome offers and introductory rates, and knows nothing about how much of a
credit you have used — that comes from reading the card's own tracker, which the
issuer itself says may not reflect recent activity. Earning rates stay on the card's terms under **Card rates** in Pay (see
[BEST_CARD.md](BEST_CARD.md)), which reads this wallet for the cards you hold:
a card entry, or a card an issuer's page named when a credit was read off it,
appears there as a card awaiting its rates rather than one to add again.

## Private data and offline behavior

A card number entered here is sealed on the device with a key only your passkey
can derive, so the cloud stores unreadable text and keeps only the last four
digits in the clear. Never enter a security code. Revealing a number needs the
passkey and re-masks itself after a minute.

The wallet uses the shared encrypted IndexedDB adapter, authenticated encrypted
D1 records and per-record revisions, and syncs on its own — on open, on
reconnect, when the tool is shown again, and on a one-minute retry while a change
is still queued. There is no refresh button. Conflicts offer Keep my change or
Use cloud version. Saved entries remain readable after a cold offline reopen.

Only the card name typed into the intake, or the exact product name chosen from
its alternatives, is sent for research; nothing already in the wallet leaves the
device for it. Provider keys stay on the Worker, and `rewards.benefits` selects
its model through the central task policy
(see [MODEL_ROUTING.md](../tools-api/MODEL_ROUTING.md)).

## API

- `GET /v1/rewards`, `PUT /v1/rewards` — the whole wallet, revisioned. See
  [tools-api/README.md](../tools-api/README.md).
- `GET /v1/wallet[/snapshot]`, `GET/PUT/DELETE /v1/wallet/:uuid`,
  `GET /v1/wallet/capabilities` — the wallet's records about itself: bindings,
  resolutions, valuations, goals, one typed encrypted record each in
  `wallet_records` (apply `tools-api/wallet-schema.sql`). Validated by
  `wallet-data.js` on both sides.
- `POST /v1/ai-connections/:uuid/balance-intake` — `{text, program, source, unit,
  programs}` in; `{balances, credits, unread}` out. `programs` is every currency
  that site states, so an issuer running two of them is read for both; a device
  that sends only the single `program` is read the way it always was. `credits`
  is what the card's own trackers say is left of each recurring credit. The page
  text and nothing else: matching and every total stay on the device.
- `POST /v1/ai-connections/:uuid/card-benefits` — `{name}` in; `{card, benefits}`
  or `{matches:[{name,note}]}` out. Requires an OpenAI connection and web-search
  evidence including the issuer page it cites.

## Program offers

A perks portal — Morgan Stanley Reserved — publishes a catalogue of offers that
changes without notice. Those are not wallet entries: they are read off the
program's own pages and listed under **Browse offers**, one closed line at the
foot of **For you**, refreshed whenever the owner visits the site. The line is
there only once a catalogue has been read. A catalogue held is not a
membership held: with no wallet entry saying you are in the program, For you
raises **Check whether … is yours to use** rather than assuming the offers
are yours.
They are grouped — what is new, then one closed line per category — because one
program alone publishes well over a hundred. Each list has its own search, since
the wallet's narrows what you hold and this one narrows what is on offer, and a
category picker narrows the offers further; either narrowing shows a flat run
of matches instead. See
[reward programs](REWARD_PROGRAMS.md) for what is read, when, and what is not.
