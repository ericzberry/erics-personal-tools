# real-estate-value

Keeps the market value of the property Eric owns current in the **Finance
ledger**, so real estate counts in net worth the way everything else there does.
A scheduled Claude task runs on the 1st of each month, follows
[RUNBOOK.md](RUNBOOK.md), reads each property's Zestimate off its own Zillow
page, and files it as a dated valuation.

## Where a property actually lives

**In the ledger, not in this directory.** A property is a record in the Finance
app — an address, the Zillow page its value is published on, and one dated
valuation per reading — stored in D1 alongside the portfolios and figures, read
by the Chrome sidebar and the phone, and protected by the same passkey. There is
no list of addresses here to keep in step with it; the run asks the ledger what
it holds:

```bash
node finance-intake/property.mjs list
```

That prints each property, its portfolio, its latest value, what is still owed
and the equity left — and the Zillow page the next reading comes from.

## Adding a property

Either in the app — **Finance → Add to the ledger → Enter a property** — or from
here, which is the same two records through the same validator:

```bash
node finance-intake/property.mjs save new-house.json --confirm
```

```json
[
  {"create": true, "portfolio": "Estate",
   "address": "123 Example St, Town ST 00000",
   "link": "https://www.zillow.com/homedetails/123-Example-St/1234_zpid/",
   "value": 1240000, "source": "zestimate", "asOf": "2026-09-20"}
]
```

Once it is there, the monthly run picks it up on its own. Nothing in this
directory needs editing to add a second house.

## What the value means

`source` says which kind of number it is: `zestimate`, `appraisal`, `sale` or
`owner`. The standing answer is the Zestimate — it is public, dated, and costs
nothing to look up — and the monthly run files nothing else. Anything else is a
deliberate override, and the row in the app says which it was, because a figure
somebody chose and a figure Zillow published are not the same kind of claim
about a house.

To hold a value against the Zestimate, file it once with its own source and
**pause** the property (below); otherwise the next run overwrites it.

## Debt

A property carries what is still owed on it, and the app counts the house under
**Real estate** and the loan under **Mortgage**, so net worth holds the equity.
There is no mortgage today. When there is one, file it with the valuation:

```json
[{"property": "123 Example", "value": 1240000, "debt": 620000, "asOf": "2026-10-01"}]
```

A run that does not mention `debt` **carries the last known balance forward**
and says so in its preview. It never files zero — a mortgage erased by silence
is not visible afterwards.

## Pausing a property

Add `"paused": true` to its entry in `skip.json` (created on first use, keyed by
property number). The monthly run leaves it alone and says so in the log. Delete
the entry to resume.

## The files

| File | Purpose |
|------|---------|
| `RUNBOOK.md` | The procedure the monthly run follows. |
| `skip.json` | Properties the monthly run should leave alone. Optional. |
| `log.md` | One line per run (created on first run). |

The script is `../finance-intake/property.mjs`; the token and request wrapper
are the ones the rest of the finance intake uses, described in
[finance-intake/README.md](../finance-intake/README.md).
