# Purchase advisor

The purchase advisor is the **Pay** view of [Rewards & benefits](REWARDS.md),
on the extension and the phone. `advisor.html` and the `advisor` capability id
stay as ways in and open Rewards on Pay. Say what you are buying — `I'm buying
a laptop from Dell for $2,000`, `uber to the airport`, `groceries` — and
select Compare. One block answers: the account to pay with, what the purchase
comes to in rewards today, the lines that make up that figure, and what has to
hold for each of them. What could hold after a step is kept apart from that.

Two accounts of one product are two plans: each carries its own credits and
the digits that tell it apart, so **Pay with** names the account the credit is
on, not only the product.

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

**Pay with** the account that comes to the most on what holds today, then the
figure: `$210.00 back` with an amount, or the effective rate without one.
Under it, one line per thing the card gives here now, each with its money down
the right edge so the figure above reads as their sum:

- the rate — `3% Online shopping bonus` or `2% base rate` — and what it earns,
  with points said in points and the planning value that turned them into
  money;
- each credit the wallet files under this card at this merchant whose tracker
  has been read, with what is left of it, worth at most the purchase, because
  spending twice does not earn a monthly credit twice;
- each offer already on this card at this merchant with its minimum met, in
  the program's own words, with what it comes to.

**Could be better after…** holds what is not in that figure and could be after
one step: an offer not yet added to the card, a credit still to activate, a
tracker never read. Where the step has a known figure behind it the block says
what the card would come to; a ceiling the merchant decides, a minimum that
cannot be checked without an amount, or a tracker never read is named as a
step and adds nothing. An offer whose stated date has passed adds nothing
anywhere and is counted as left out. A points card's block says where its
figure stops holding: the value a point would have to carry to beat the best
cash return. Cards within $0.50, or a tenth of a point of rate, are called
effectively tied rather than ranked on a difference this cannot support.

Coverage is named: a card in the wallet with no earning terms, or whose name
fits more than one saved card, is listed as not compared and able to change
the answer, so **Pay with** is never "best" over cards it could not evaluate.

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
only once the issuer's own badge says it is added; until then it is what the
card could come to, never part of what it comes to. Its date is read out of
what the program printed beside it — `Expires 10/15/2026`, `Ends Sep 30,
2026` — and an offer past that date is left out.

Without an amount the rate decides, and a credit or a fixed offer is listed
beside it rather than added to a percentage; a minimum spend then cannot be
checked and is stated as a condition.

## Limits

Every figure is arithmetic over saved records; AI reads the description and
chooses nothing. The estimate carries Best card's limits — the issuer decides
the merchant category, and fees, interest and signup bonuses are outside it —
and adds the offers' own: the program's sentence is what is read, and an offer
worded in a way this cannot read is listed rather than counted. An offer's
dates are shown as the program states them; only a date this can read is
checked against today, and a date it cannot read is a date to check.

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
