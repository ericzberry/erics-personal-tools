# Purchase advisor

Choose **Purchase advisor** from Tools in the extension or the unlocked mobile
app. Say what you are buying — `I'm buying a laptop from Dell for $2,000`,
`uber to the airport`, `groceries` — and select Recommend. One block answers:
the card to pay with, what the purchase comes to in rewards, the lines that
make up that figure, and what has to hold for each of them.

Three tools already know one part of the answer each, and this is the screen
where they are read together:

| Part | Where it comes from | What it adds |
| --- | --- | --- |
| The rate | [Best card](BEST_CARD.md)'s saved terms | What each card earns on this purchase, compared the way Best card compares it |
| The credit | The [rewards wallet](REWARDS.md) | A credit or discount the wallet files under a card that names this merchant, and what the issuer's own tracker says is left of it |
| The offer | The [reward programs](REWARD_PROGRAMS.md)' catalogues | An offer the merchant is running, on the card it is on |

## The reading

The description is read the way Best card reads one — into a merchant, a
reward category, a purchase method and an amount if you stated one — by the
same `cards.category` task, and only the description goes to the model. The
reading is shown above the result; Adjust what AI read opens the three values
as ordinary controls, and correcting any of them recomputes without asking
the model again. Without a saved AI connection, or offline, the controls open
on their own and a category set by hand still answers.

Bonus requirements a card's terms carry are asked about first, as they are in
Best card, and an unconfirmed one keeps that bonus out.

## The recommendation

**Pay with** the card that comes to the most, then the figure: `$210.00 back`
with an amount, or the effective rate without one. Under it, one line per
thing the card gives here, each with its money down the right edge so the
figure above reads as their sum:

- the rate — `3% Online shopping bonus` or `2% base rate` — and what it earns;
- each credit the wallet files under this card at this merchant, with what is
  left of it, worth at most the purchase, because spending twice does not earn
  a monthly credit twice;
- each offer on this card at this merchant, in the program's own words, with
  what it comes to.

**Conditions** follow, one line each, only when there are any: the rule's own
requirement, the purchase method it needs, the date it runs to, the eligible
spend left on it; a credit still to activate; an offer not yet added to the
card, its minimum spend (and whether this purchase is under it), a ceiling the
merchant decides, its dates. The next card is named with how far behind it is.
**Other cards** opens to the rest, each with its figure, its parts and its
conditions on one line. Under **Details** are Best card's own warnings — a
review date that has gone stale, the card's notes — and the issuer's terms.

Two runs of offers sit outside the ranking. **With any card** holds a program's
offers that name no card — a Morgan Stanley Reserved discount applies whatever
you pay with, so it moves no card above another. **On cards without rates here**
holds an issuer's offer on a card Best card has no rates for: it cannot be
ranked, but it is still the merchant's offer, and the card it is on is named.

## How an offer is counted

An offer is matched on its merchant, as loosely as the two sides write it —
`Dell` is `Dell Technologies` — and never on anything else, because an offer at
one shop applied at another is worse than none. A description that names no
merchant matches no offer and no credit; the card is then chosen on its rate
alone, which the screen says.

What an offer is worth is read out of its own sentence: `Spend $599 or more,
get $100 back` is $100 once $599 is met, `10% off` is a tenth of the amount,
`up to $50` is a ceiling and is marked as the merchant's to decide. A sentence
that states no figure — `3 additional points per dollar` — is listed in its
words and added to nothing. An issuer's offer counts toward the card it is on
and says it has to be added first unless the issuer's own badge says it
already is.

Without an amount the rate decides, and a credit or a fixed offer is listed
beside it rather than added to a percentage; a minimum spend then cannot be
checked and is stated as a condition.

## Limits

Every figure is arithmetic over saved records; AI reads the description and
chooses nothing. The estimate carries Best card's limits — the issuer decides
the merchant category, and fees, interest and signup bonuses are outside it —
and adds the offers' own: the program's sentence is what is read, and an offer
worded in a way this cannot read is listed rather than counted. An offer's
dates are shown as the program states them, not checked against today.

## Private data and offline behavior

The advisor writes nothing. It reads Best card's cards, the wallet and the
offer catalogues from the encrypted copies this device already keeps, brought
up to date when the network is there and read as they stand when it is not,
so a recommendation is available offline once each tool has been opened on
this device. A store that cannot be read leaves the others to answer. Only the
purchase description leaves the device, to the same reading Best card uses.

The local preview is `chrome-sidebar/tests/advisor-preview.html`; the phone's
fixture, `mobile-app/tests/preview-server.js`, carries two rated cards, a
wallet credit at Dell, an issuer offer on the lower-rate card and a reading
of the description that needs no model.
