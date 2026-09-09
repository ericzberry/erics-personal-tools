# Best card

Choose **Best card** from Tools in the extension or unlocked mobile app. Add your full card name and country, then look up issuer terms using a saved OpenAI connection or enter rates manually. Research produces a draft: review the exact card variant, issuer link, reward type, base rate, bonus categories, enrollment, remaining caps and exclusions before saving. No card account numbers, security codes or bank credentials are collected.

Describe the merchant and purchase, enter the amount in USD, and choose how you are paying. Find best card asks AI for a category when none is selected. Low-confidence suggestions pause for review. You can always select or change the category yourself, including offline. Confirm any applicable bonus requirements; unconfirmed requirements are excluded. Changing the purchase description clears the earlier category and result.

The application computes rewards from saved rates rather than asking AI to choose the winner. Cash back and points are compared as estimated dollars using the owner's cents-per-point valuation. It displays ties, bonus caps and base-rate fallback. It does not combine overlapping bonuses. Expired, inactive, wrong-channel and unconfirmed bonuses are excluded. Conflicted cards and pending deletions are excluded until resolved.

## Limits

The issuer determines the actual merchant category. Estimates exclude fees, interest, signup bonuses, and unentered offers. Rewards may depend on card variants, merchant exclusions, account tiers, payment methods and purchase country. Review these against the linked terms. A points valuation is an assumption supplied by the owner, not a guaranteed redemption rate.

Remaining spending caps are entered manually and are not decremented by comparisons. For a cap shared across categories, maintain the same remaining amount on the relevant rules. Research sets capped bonus balances to zero and activation-dependent bonuses inactive until the owner supplies their account-specific information. Missing or old review dates are disclosed in calculation details.

## Private data and offline behavior

Cards use the shared encrypted IndexedDB adapter, authenticated encrypted D1 records and per-record revisions. Saved rules remain available after a cold offline reopen. Offline changes are queued before attempting network access and synchronize on reconnect or foreground. Conflicts offer Keep my change or Use cloud version. Disconnect is blocked while card changes remain pending; successful disconnect removes device card copies and retains cloud records. Device storage is a cache, not a permanent backup. API responses are excluded from service-worker shell caching.

Only the purchase description goes to the category model. Issuer research sends the supplied card name. Provider keys remain on the Worker. `cards.category` and `cards.research` select models through the central task policy. Research requires web sources and source URL membership in the provider's reported evidence; the owner still reviews the returned terms.

## API and deployment

Apply `tools-api/cards-schema.sql` to the existing D1 database before deploying the Worker. The schema adds `card_records` without modifying existing records.

- `GET /v1/cards` and `GET /v1/cards/snapshot`: authenticated full card records.
- `GET /v1/cards/:uuid`: one card.
- `PUT /v1/cards/:uuid`: validated rates and rules, with current revision (null for new records).
- `DELETE /v1/cards/:uuid`: current revision required.
- `POST /v1/ai-connections/:uuid/card-category`: `{purchase}`.
- `POST /v1/ai-connections/:uuid/card-research`: `{name}`.

The local synthetic fixture is `mobile-app/tests/cards-preview-server.js`; build mobile first and run it with an unused `PORT`. `/cards-preview` exercises the shared standalone view and `/app/` exercises the full mobile shell. Fixture authentication, passkeys, cards and AI responses are synthetic and never included in builds.
