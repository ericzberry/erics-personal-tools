# Best card

Choose **Best card** from Tools in the extension or unlocked mobile app. To add a card, say which card you have however you name it — `chase sapphire`, `amex gold`, `my citi 2% card` — and select Find card and rewards. Research using a saved OpenAI connection identifies the exact product from the issuer's current pages and fills in the whole card: reward type, base rate, every bonus category, enrollment, caps, exclusions, the issuer link and today's review date. A name that fits more than one real card returns the products it could be, each with what separates it, and researches nothing until one is chosen. The summary lists every rate that was ingested; Card terms holds the same values as ordinary fields, and opens by itself for a points card, which still needs your redemption value. Saving is always yours: review the summary or the terms, then save. Without a connection or internet, Card terms accepts a card entered by hand. No card account numbers, security codes or bank credentials are collected.

The whole intake is one description box. Write the purchase at whatever level of detail you have — `gas`, `pharmacy`, `Amazon`, `dinner at Cote`, `$180 at Saks` — and select Find best card. AI reads that description into a merchant, a reward category, a purchase method and an amount if you stated one, and the reading is shown above the result. Adjust what AI read reveals those three values as ordinary controls; correcting any of them replaces the reading and recomputes. A description that simply names a reward category — `gas`, `groceries`, `dining` — is a complete reading on its own; no merchant is asked for, and a missing one never makes the reading low confidence. Low confidence is reserved for a category that is genuinely in doubt, and such a reading still returns a result, marked as low confidence in both the reading and the status. Changing the description clears the earlier reading and result. Confirm any applicable bonus requirements; unconfirmed requirements are excluded.

An amount is optional. With one, results are estimated dollars; without one, results are effective rates over the same reference spend for every card, and a remaining bonus cap is disclosed rather than blended, because it cannot be applied to an unknown amount.

Offline, or with no saved AI connection, Find best card explains that AI is unavailable and opens the same controls so a category can be set by hand. The comparison itself never needs the network.

The application computes rewards from saved rates rather than asking AI to choose the winner: AI reads the purchase, and saved terms decide the card. Each result names the reward program that applied — the matching bonus, or the base rate when no bonus matched — and how far it is from the next card in points and dollars. Cash back and points are compared as estimated dollars using the owner's cents-per-point valuation. It displays ties, bonus caps and base-rate fallback. It does not combine overlapping bonuses. Expired, inactive, wrong-channel and unconfirmed bonuses are excluded. Conflicted cards and pending deletions are excluded until resolved.

## Limits

The issuer determines the actual merchant category. Estimates exclude fees, interest, signup bonuses, and unentered offers. Rewards may depend on card variants, merchant exclusions, account tiers, payment methods and purchase country. Review these against the linked terms. A points valuation is an assumption supplied by the owner, not a guaranteed redemption rate.

Remaining spending caps are entered manually and are not decremented by comparisons. For a cap shared across categories, maintain the same remaining amount on the relevant rules. Research sets capped bonus balances to zero and activation-dependent bonuses inactive until the owner supplies their account-specific information. Missing or old review dates are disclosed in calculation details.

## Private data and offline behavior

Cards use the shared encrypted IndexedDB adapter, authenticated encrypted D1 records and per-record revisions. Saved rules remain available after a cold offline reopen. Offline changes are queued before attempting network access and synchronize on reconnect or foreground. Conflicts offer Keep my change or Use cloud version. Disconnect is blocked while card changes remain pending; successful disconnect removes device card copies and retains cloud records. Device storage is a cache, not a permanent backup. API responses are excluded from service-worker shell caching.

Only the purchase description goes to the reading model; saved card names and terms never leave the device for it. Issuer research sends only the name typed into the intake, or the exact product name chosen from its alternatives. Provider keys remain on the Worker. `cards.category` and `cards.research` select models through the central task policy. Research requires web sources and source URL membership in the provider's reported evidence; the owner still reviews the returned terms.

## API and deployment

Apply `tools-api/cards-schema.sql` to the existing D1 database before deploying the Worker. The schema adds `card_records` without modifying existing records.

- `GET /v1/cards` and `GET /v1/cards/snapshot`: authenticated full card records.
- `GET /v1/cards/:uuid`: one card.
- `PUT /v1/cards/:uuid`: validated rates and rules, with current revision (null for new records).
- `DELETE /v1/cards/:uuid`: current revision required.
- `POST /v1/ai-connections/:uuid/card-category`: `{purchase}`.
- `POST /v1/ai-connections/:uuid/card-research`: `{name}` — a rough or exact card name. Returns `{card}` for one identified product, or `{matches:[{name,note}]}` when the name fits several. Both require web-search evidence; only `{card}` requires the issuer source URL to appear in it.

The local synthetic fixture is `mobile-app/tests/cards-preview-server.js`; build mobile first and run it with an unused `PORT`. `/cards-preview` exercises the shared standalone view and `/app/` exercises the full mobile shell. Fixture authentication, passkeys, cards and AI responses are synthetic and never included in builds.
