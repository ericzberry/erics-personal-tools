# Best card

Choose **Best card** from Tools in the extension or unlocked mobile app. To add a card, say which card you have however you name it — `chase sapphire`, `amex gold`, `my citi 2% card` — and select Find card and rewards. Research using a saved OpenAI connection identifies the exact product from the issuer's current pages and fills in the whole card: reward type, base rate, every bonus category, enrollment, caps, exclusions, the issuer link and today's review date. A name that fits more than one real card returns the products it could be, each with what separates it, and researches nothing until one is chosen. The summary lists every rate that was ingested; Card terms holds the same values as ordinary fields, and opens by itself for a points card, which still needs your redemption value. Saving is always yours: review the summary or the terms, then save. Without a connection or internet, Card terms accepts a card entered by hand. No card account numbers, security codes or bank credentials are collected.

## The cards you already hold

Best card knows which cards you hold without being told again. A card in your
[rewards wallet](REWARDS.md) — one you added there, or one an issuer's own
benefits page named when a credit was read off it — appears under **In your
wallet** with the account it was seen under, and one press researches what it
earns and opens it here ready to save. Only the product name is sent; the
account digits an issuer prints beside a card stay on the device, and no card
number is read, asked for or stored by this tool.

A card is only offered while its rates are missing. Once saved here it is this
tool's card and leaves that list, and a card whose name fits more than one saved
card is left alone rather than added a second time. While any remain, the
comparison says how many were not compared — a recommendation made without a
card you hold is the one thing this screen can get wrong while looking right.
The wallet is read, never written: what is in it stays Rewards' to change.

## Your purchase

The whole intake is one description box. Write the purchase at whatever level of detail you have — `gas`, `pharmacy`, `Amazon`, `dinner at Cote`, `$180 at Saks` — and select Find best card. AI reads that description into a merchant, a reward category, a purchase method and an amount if you stated one, and the reading is shown above the result. Adjust what AI read reveals those three values as ordinary controls; correcting any of them replaces the reading and recomputes. A description that simply names a reward category — `gas`, `groceries`, `dining` — is a complete reading on its own; no merchant is asked for, and a missing one never makes the reading low confidence. Low confidence is reserved for a category that is genuinely in doubt, and such a reading still returns a result, marked as low confidence in both the reading and the status. Changing the description clears the earlier reading and result. Confirm any applicable bonus requirements; unconfirmed requirements are excluded.

An amount is optional. With one, results are estimated dollars; without one, results are effective rates over the same reference spend for every card, and a remaining bonus cap is disclosed rather than blended, because it cannot be applied to an unknown amount.

A card's own rewards page is the other way its terms get filled in. Open it with the sidebar beside you and **Rewards & benefits** reads it: `8x on Chase Travel` is Travel through an Issuer portal, `4x on flights and hotels booked direct` is Travel booked Direct, `3x on dining` is Dining through any method, and `All other earnings` is the base rate. Each rate is proposed against the terms of the card it belongs to — a rule that card already holds for the same category and purchase method is that rule at a new rate, never a second one beside it, and the review says which. What narrows a reward is carried into its conditions, so a narrow reward is never quietly widened into a whole category. Your remaining cap, end date, activation and redemption value are yours and are left alone; the review date becomes the day you saved it, because that is the day you read the issuer's own page. A rate whose card you have not saved, or whose card cannot be told from another of yours, or that is stated in points on a card you keep in cash back, is reported and not saved. Nothing is written without a press. See [REWARDS.md](REWARDS.md) for the reading itself.

Offline, or with no saved AI connection, Find best card explains that AI is unavailable and opens the same controls so a category can be set by hand. The comparison itself never needs the network.

A reward is not always a category. A card can be good at one shop — a rebate at a named merchant, a partner discount, a rate that only applies through the issuer's own programme — and a bonus rule may name that merchant instead of standing for a whole category. A rule with a merchant is matched on the merchant AI read out of your description, whatever category it chose, and applies nowhere else; a rule with none is matched on the category as it always was. Research fills these in, and the merchant is a field of the rule like any other, so you can add or correct one by hand.

What the merchant gives you beyond a rate is the wallet's, and it is said beside the card rather than added to it: buying at Uber, a card carrying an Uber credit says so under its result, with what is left of it this period and whether it still needs activating. A monthly credit is not a rate on this purchase — spending twice does not earn it twice — so it never moves the money, and a card that earns a point less but hands back a credit you have not spent is a card you can now see.

The application computes rewards from saved rates rather than asking AI to choose the winner: AI reads the purchase, and saved terms decide the card. Each result names the reward program that applied — the matching bonus, or the base rate when no bonus matched — and how far it is from the next card in points and dollars. Cash back and points are compared as estimated dollars using the owner's cents-per-point valuation. It displays ties, bonus caps and base-rate fallback. It does not combine overlapping bonuses. Expired, inactive, wrong-channel and unconfirmed bonuses are excluded. Conflicted cards and pending deletions are excluded until resolved.

## Limits

The issuer determines the actual merchant category. Estimates exclude fees, interest, signup bonuses, and unentered offers. Rewards may depend on card variants, merchant exclusions, account tiers, payment methods and purchase country. Review these against the linked terms. A points valuation is an assumption supplied by the owner, not a guaranteed redemption rate.

A rate read off a card's own page is what that page stated on the day it was read, and the page is the issuer's summary rather than its terms — check the linked terms for the exclusions and caps a summary leaves out. A rate the page does not state is never inferred, and a rate is never converted between points and a percentage.

A card the issuer publishes nothing about — invitation-only, private bank, or offered only as an upgrade — is looked for where it is actually written down. Research prefers a page about that card which is not the issuer's, such as a card review or a reference site, and failing that the published product the card is a version of; either way the name stays the card you hold, the source is the page the terms were read on, and the notes say it is not the issuer's own and where it came from. Terms from anywhere but the issuer are never presented as the card's confirmed ones. Reading the card's own page is better than both, and writes the rates it states to that card's terms.

Remaining spending caps are entered manually and are not decremented by comparisons. For a cap shared across categories, maintain the same remaining amount on the relevant rules. Research sets capped bonus balances to zero and activation-dependent bonuses inactive until the owner supplies their account-specific information. Missing or old review dates are disclosed in calculation details.

## Private data and offline behavior

Cards use the shared encrypted IndexedDB adapter, authenticated encrypted D1 records and per-record revisions. Saved rules remain available after a cold offline reopen. Offline changes are queued before attempting network access and synchronize on reconnect or foreground. Conflicts offer Keep my change or Use cloud version. Disconnect is blocked while card changes remain pending; successful disconnect removes device card copies and retains cloud records. Device storage is a cache, not a permanent backup. API responses are excluded from service-worker shell caching.

Only the purchase description goes to the reading model; saved card names and terms never leave the device for it. Issuer research sends only the name typed into the intake, the exact product name chosen from its alternatives, or the product name of a card your wallet already holds — never the account digits printed beside it. The wallet itself is read from this device's own encrypted copy, with one download if this device has never opened Rewards; nothing in it is written by this tool, and a wallet that cannot be read leaves the saved cards exactly as they are. Provider keys remain on the Worker. `cards.category` and `cards.research` select models through the central task policy. Research requires web sources, and the page it cites must be one the provider reports having opened; the owner still reviews the returned terms.

## API and deployment

Apply `tools-api/cards-schema.sql` to the existing D1 database before deploying the Worker. The schema adds `card_records` without modifying existing records.

- `GET /v1/cards` and `GET /v1/cards/snapshot`: authenticated full card records.
- `GET /v1/cards/:uuid`: one card.
- `PUT /v1/cards/:uuid`: validated rates and rules, with current revision (null for new records).
- `DELETE /v1/cards/:uuid`: current revision required.
- `POST /v1/ai-connections/:uuid/card-category`: `{purchase}`.
- `POST /v1/ai-connections/:uuid/card-research`: `{name}` — a rough or exact card name. Returns `{card}` for one identified product, or `{matches:[{name,note}]}` when the name fits several. Both require web-search evidence; only `{card}` requires its cited source URL to appear in it.

The local synthetic fixture is `mobile-app/tests/cards-preview-server.js`; build mobile first and run it with an unused `PORT`. `/cards-preview` exercises the shared standalone view and `/app/` exercises the full mobile shell. Its synthetic wallet carries a card already saved here, a card that is not, and a card only an issuer's page ever named, so **In your wallet** and the linking behind it can be reviewed. Fixture authentication, passkeys, cards and AI responses are synthetic and never included in builds.
