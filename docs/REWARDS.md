# Rewards & benefits

Choose **Rewards & benefits** from Tools in the extension or the unlocked mobile
app. It is the wallet for everything a card, airline or membership gives you that
is not money in an account: points balances, statement credits, program access,
and the deadlines attached to them.

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

## Add a card you hold

The whole intake is one box: say which card you have however you name it —
`amex platinum`, `blue cash`, `jp morgan reserve`. Research using a saved OpenAI
connection identifies the exact product from the issuer's current pages and
brings back the card and every benefit it carries: the amount, how often it
resets, whether it needs enrolling, any fixed end date, and what the issuer says
you must check. A name that fits more than one real card returns the products it
could be, each with what separates it, and researches nothing until one is
chosen — `blue cash` is two different cards with two different annual fees.

Nothing is saved by research. The card and its benefits are listed the way they
will be stored, and **Save this card and N benefits** writes them: the card
first, so the benefits can name it. If a save stops part way, what is left stays
on screen and the action becomes **Save the remaining N benefits**, so no
research is lost and saving again finishes the job.

Benefits entered by hand work the same way; pick the card in the editor.

## Points and miles

The wallet opens with what your balances come to: one figure per unit, because
miles and points are different things and are never added together. Each line
says how many programs it covers, and the note under them says how many
balances have not been updated in a month — a total is only as current as its
oldest figure. A balance whose value states no number is counted in neither
line rather than read as zero.

Nothing about the record shape changed to do this. A balance is the same entry
it always was, and the unit is read back out of it: "82,431 miles" is miles,
and so is "82,431" under a program called MileagePlus.

### The programs themselves

**Add the points programs** puts every program this tool knows into the wallet
at once — each one a balance with no figure in it yet, carrying the page its
balance is printed on. Getting to that page is then one press instead of a
search through an airline's marketing site, and the wallet is the list of
programs you are in rather than a list you have to build a program at a time.

You prune it: a program awaiting its first reading holds nothing you would
miss, so deleting one takes a single press and asks nothing. Everything with
something in it still asks before it goes. The offer appears only while the
wallet holds no program at all, because once they are in, pruning is the work.

A program with no figure yet is counted in no total and is never raised in Next
actions — it has never been read, so there is nothing about it to update. It is
counted among the balances the totals line calls unread. Once a reading fills
one in, the ordinary 30-day rule applies to it like any other balance.

The programs are in
[`chrome-sidebar/src/loyalty-sites.js`](../chrome-sidebar/src/loyalty-sites.js),
and a program already in the wallet is never added twice, so adding again after
pruning brings back only what was never there.

### Reading a balance off the program's page

Open a program's own site with the sidebar beside it — united.com, marriott.com,
americanexpress.com — and Rewards offers to read your balance. One press takes
one text snapshot of the page you are already looking at, turns it into a
figure per program, and shows it. Nothing is saved by reading: each balance
names the entry it would land on, and a press of yours saves it.

The rule is the one Finance already follows for an account page. The extension
never signs in, never navigates, and never opens a tab of its own; no session,
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

## Resets and Next actions

Most card credits are not one-time offers — they come back, and the unused part
does not carry over. An entry's **Resets** says which calendar period it follows:
monthly, quarterly, twice a year, or yearly. Next actions raises a recurring
credit as its period closes, sooner for a shorter period (7 days for monthly,
14 for quarterly, 30 for twice a year, 45 for yearly), because a monthly credit
is always within a month of resetting and would otherwise never leave the list.

A credit whose period follows your account anniversary rather than the calendar
gets no cadence — only you know the anniversary — so give it an explicit date.
An explicit expiration always wins over the period the entry would sit in.

Next actions also raises a passed deadline to verify, a benefit that still needs
activating, and a balance not updated in 30 days. A card itself carries no
deadline and is never raised.

## Limits

Research reports what the issuer's pages say on the day it ran. Benefits change,
and enrollment, eligibility, caps, tiers and merchant exclusions are yours to
confirm against the linked terms. It returns at most 40 benefits per card, omits
welcome offers and introductory rates, and reports nothing about how much of a
credit you have already used. Earning rates stay on the card entry; **Best card**
is where rates are compared (see [BEST_CARD.md](BEST_CARD.md)).

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
- `POST /v1/ai-connections/:uuid/balance-intake` — `{text, program, source, unit}`
  in; `{balances, unread}` out. The page text and nothing else: matching and
  every total stay on the device.
- `POST /v1/ai-connections/:uuid/card-benefits` — `{name}` in; `{card, benefits}`
  or `{matches:[{name,note}]}` out. Requires an OpenAI connection and web-search
  evidence including the issuer page it cites.

## Program offers

A perks portal — Morgan Stanley Reserved — publishes a catalogue of offers that
changes without notice. Those are not wallet entries: they are read off the
program's own pages and listed under **Program offers**, below the wallet,
refreshed whenever the owner visits the site. The wallet's search filters them
alongside your own entries, and a category picker narrows them further. See
[reward programs](REWARD_PROGRAMS.md) for what is read, when, and what is not.
