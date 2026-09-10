# Task-based model selection

Connections contain credentials and endpoint configuration, never a default model. Legacy encrypted `model` values are ignored, excluded from public records, and removed on the next save. No database migration is required. The playground uses an explicit model for that individual request only.

Features send a stable task ID, not a model name. `src/model-policy.js` owns task requirements and the reviewed candidate catalog. `routeTask` checks the selected connection's live model list and honors an explicit per-task model choice, or selects the lowest estimated-cost candidate that meets the task's capability floor, context requirement, and estimated-cost ceiling. Unknown tasks and unreviewed models fail closed. API model listings indicate account visibility; generation may still fail on permissions, quota, or tool access. Errors and timeouts are not automatically retried.

Current policies:

| Task | Requirement | Escalation |
| --- | --- | --- |
| `email.summary` | GPT-5.6 Terra, explicitly selected by Eric | No silent fallback; reasoning disabled |
| `restaurant.availability` | Level 2: structured extraction from booking pages | No automatic downgrade |
| `restaurant.research` | Level 2 plus native web search | Level 3 for category searches above 12 candidates |

The initial catalog covers the OpenAI connections used by these features. Other providers remain available for explicit playground requests; automatic cross-provider routing is not yet implemented. Selecting a different provider must never silently send content to another account or endpoint. Add reviewed provider candidates to the same catalog when integrating another automatic task.

## Cost and quality assumptions

Prices checked September 9, 2026, in USD per million uncached input/output tokens. The Terra entry is maintained by the concurrent email-summary update:

- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra): $2 / $12. Explicit email-summary choice.
- [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano): $0.05 / $0.40. Focused summarization candidate.
- [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini): $0.15 / $0.60. Focused-task alternative.
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini): $0.40 / $1.60. Structured interpretation and research candidate.
- [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini): $0.25 / $2.00. More involved research candidate.

Capability tiers are initial application judgments informed by provider documentation, not measured guarantees of quality. Candidate eligibility should be maintained with representative task evaluations. No paid quality evaluation was run for this change.

Estimates use prompt characters / 3, output budgets, a reasoning allowance, and a one-search allowance for web tasks. GPT-4.1 mini includes the 8,000-token search-content charge. Multi-search runs, reasoning usage, actual tokenization, discounts, and provider price changes can change the bill. The cost ceiling filters estimates; it is not a hard billing cap. Results expose selected model, policy level, and estimated cost for diagnostics. No claim is made to the cheapest model across the entire market.

## Extending the system

1. Register a task ID, minimum capability level, required tools, output budget, and estimated-cost ceiling. Keep model IDs out of feature controllers.
2. Add current price, context, and API capability metadata for candidate models, with dated official sources.
3. Evaluate representative inputs and adversarial cases: faithful facts and deadlines for summaries; exact venue/date/party/time evidence for booking extraction; cited, current evidence for research. Define acceptance criteria before lowering the capability floor.
4. Test unavailable models, price ordering, context limits, unknown tasks, and request serialization. Validate quality with consented or synthetic fixtures before promoting a candidate.
5. Deploy the Worker before reloading the new extension. The old Worker does not understand task IDs. Retain manual model selection only in the playground.

Do not use a model's self-reported confidence as a quality gate, or blindly escalate after timeouts: the prior request may already be billable.
# Card rewards tasks

`cards.category` uses level 1, 600 output tokens, no web tool, and a $0.01 estimated request ceiling. It reads one free-text purchase description into a merchant, category, purchase method and stated amount; it never sees the owner's cards and cannot supply reward rates or pick a winner. `cards.research` uses level 3, 4,000 output tokens, live web search, and a $0.10 estimated request ceiling. Both use the existing reviewed catalog and availability checks. Issuer research is a draft requiring owner review, including caps and point values. Fixtures test ambiguous category handling, output validation and rejection of research without source evidence. The calculation suite covers cash/points equivalence, caps, ties, activation, channel restrictions, expiration and explicit eligibility confirmation.
