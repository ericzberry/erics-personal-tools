# finance-intake

Hand Claude a statement, a screenshot, a logged-in page, or a spreadsheet, and
it files the figures in the Finance ledger — the same ledger the Chrome sidebar
and the mobile app read. Nothing is typed in by hand, and nothing is saved until
you have seen exactly what it read.

The ledger itself is the app's, not this directory's. It holds one amount per
**portfolio**, **asset class** and **date** — how much is in stocks, in bonds
and in cash, in the Eric and Ariana Berry Estate and in the IRA — stored as
`finance_portfolios` and `finance_marks` and described in
[docs/PROTECTED_SECTIONS.md](../docs/PROTECTED_SECTIONS.md). This directory is
only a way in.

A statement listing forty holdings is filed as the few class totals it adds up
to. The adding up is yours to do and to show; the app computes every total it
displays, and no model is ever asked to add two numbers together.

## Using it

Say what it is and hand over the file or the page:

> "Here's the Q2 Schwab statement." *(attach the PDF)*
> "Save the balances on this page." *(a broker dashboard you're logged into)*
> "This is the June capital account for the family trust." *(a photo)*

Claude reads it, shows you a plan — which portfolio and class each figure lands
on, the previous figure, and the as-of date — and saves only after you say yes.
It follows [RUNBOOK.md](RUNBOOK.md).

Then open Finance in the sidebar or the phone (passkey), where the new figures
appear under their portfolio and in **Value over time**.

## Setup — the API token

One step, once. In **Terminal** (not the browser console), put the token in the
login keychain:

```bash
security add-generic-password -s erics-tools-api -a API_TOKEN -U -w
```

**`-w` must be last.** There it takes no value and prompts instead —
`password data for new item:`, then `retype password for new item:` — so the
token never lands in shell history. Nothing echoes as you paste; paste, Enter,
paste again, Enter. Given a value (or followed by another flag, which it will
happily swallow as the password) it stores that instead, silently.

macOS encrypts the item at rest and the script reads it back without a prompt.

To read the token out of the extension: right-click the extension icon →
**Options**, then in DevTools → Console run
`(await chrome.storage.local.get('cloudConnection')).cloudConnection.token`.
The Settings field itself is a password input and is cleared after saving, so
it never shows the token back.

**This token cannot live in D1**, which is the obvious-looking place for it. It
is the credential that protects D1: every route checks it before running, and
the AI provider keys and finance records stored there are only reachable by
presenting it first. Storing it behind itself has no bootstrap. That is also
why it differs from an AI provider key, which *is* typed into a field in
Settings and encrypted into `ai_connections` — those are protected *by* this
token, not equal to it.

The script looks in three places, in order:

1. `TOOLS_API_TOKEN` in the environment — for a one-off or a different account.
2. The login keychain, as above. **Use this.**
3. `finance-intake/credentials/api-token` — a plain file, for a machine with no
   keychain. Gitignored, alongside `gmail-sender/credentials/`, but it is
   plaintext on disk; prefer the keychain.

If you no longer have the token, it is the same one the extension holds under
its connection settings, and it can be rotated with
`npx wrangler secret put API_TOKEN` in `tools-api/` — but rotating it means
re-entering it in the extension and on the phone.

## The script

`ledger.mjs` is dependency-free Node. It reads and appends; it cannot delete.

```bash
node finance-intake/ledger.mjs list                  # every portfolio and its figures
node finance-intake/ledger.mjs list --json           # the same, machine-readable
node finance-intake/ledger.mjs show "Estate"         # one portfolio, class by class, with history
node finance-intake/ledger.mjs save figures.json     # preview — writes nothing
node finance-intake/ledger.mjs save figures.json --confirm
```

`api.mjs` holds the token lookup and the request wrapper, so the credential is
resolved in one place for every script here.

`save` takes a JSON array. An entry files a figure into an existing portfolio:

```json
[
  {"portfolio": "Estate", "class": "stocks", "amount": 1284300.55, "asOf": "2026-06-30"},
  {"portfolio": "Estate", "class": "bonds",  "amount": 412000,     "asOf": "2026-06-30"},
  {"portfolio": "p2",     "class": "cash",   "amount": 18400.12,   "asOf": "2026-06-30"}
]
```

…or creates one first:

```json
[
  {"create": true, "name": "Berry Family Trust", "registration": "trust", "currency": "USD",
   "class": "pe", "amount": 327400, "asOf": "2026-06-30"}
]
```

`portfolio` accepts its number (`p2` or `2`), an exact name, or a unique
fragment of one. **A fragment matching two portfolios is an error, not a coin
flip** — use the number. `class` is one of `stocks`, `bonds`, `cash`, `pe`,
`vc`, `hedge`, `property`, `other`, `unclassified`, `mortgage`, `loan`,
`credit`. `registration` is one of `taxable`, `ira`, `roth`, `401k`, `trust`,
`entity`, `custodial`. `amount` is always a positive number; a debt goes under a liability
class and the app applies the sign.

### Use `unclassified` rather than guessing

An account total that does not say how it is invested is `unclassified`. It
counts in full, exactly like any other class, and its name is what asks to be
corrected when a page that shows the split turns up. Splitting a $1.6M account
into stocks and bonds because three brokered CDs were visible is the one mistake
this ledger is shaped to prevent.

### The portfolio you do not have to name

Some institutions settle their own titling: everything held at Schwab is held in
the Eric and Ariana Berry Estate, except a retirement account, which is
registered to one person by law and is titled `Eric Berry`. That is registered
once in `ACCOUNT_TITLES` in `chrome-sidebar/src/finance-data.js`, and the app
applies it when a page reading has to name a portfolio. Name one yourself only
when the source names a holder the registry does not cover.

Some hold several titles instead of one. Chase covers the joint account, the
irrevocable trusts, Celsie LLC and the children's accounts behind a single
sign-on, so its entry carries a `holders` roster and the account's own name
picks the holder. A place with a roster has no default: an account it does not
recognize is filed under the name the source gave it and registered by what that
name says — a trust is a trust, an LLC is an entity — rather than joining a
portfolio it was never part of. Adding a holder is one line in that roster.

## Retrofitting the old ledger

The ledger that came before kept a record per account, each with its own value
history. `backfill.mjs` moves it across: each record becomes a portfolio and a
class, and every dated figure comes with it, not only the newest.

```bash
node finance-intake/backfill.mjs            # the plan — writes nothing
node finance-intake/backfill.mjs --confirm
```

It is re-runnable — every write is keyed by portfolio, class and date, so
confirming twice reaches the same ledger — and it deletes nothing. Dropping the
old `finance_records` table is a separate decision, made after the new ledger
has been looked at.

## What the preview tells you

- `APPEND` — a new date for that portfolio and class.
- `AMEND` — that date already has a figure, and saving replaces it. A figure is
  keyed by portfolio, class and as-of date, so this is how a correction is
  filed. The old figure is shown so you can see what is being replaced.
- `NEW PORTFOLIO` — a portfolio that does not exist yet.
- `CHECK` — the figure moves more than 40% from the last one for that class.
  Usually a misread decimal or a number taken from the wrong row. Worth a second
  look before confirming.

A backdated figure does not disturb today's total: each class shows whichever of
its figures is newest by date.

## What it deliberately does not do

- **No arithmetic on the model's part.** No totals, no net worth, no returns, no
  currency conversion. The app computes those and keeps currencies apart.
- **No deletes.** Correct a figure by saving the right one under the same
  portfolio, class and date. To stop counting something, save it as zero — which
  is visible in its history.
- **No account numbers, logins or identifying detail.** The ledger holds
  portfolio names, codes, dates and numbers. Nothing else fits in it.
- **No unattended runs.** This is not a scheduled task. Every save is something
  you asked for and approved in the moment.

## Files

| File | Purpose |
|------|---------|
| `ledger.mjs` | The CLI. Read and append only. |
| `backfill.mjs` | The one-time retrofit of the record-per-account ledger. |
| `api.mjs` | The token lookup and request wrapper both scripts share. |
| `RUNBOOK.md` | The procedure Claude follows for each intake. |
| `log.md` | One line per intake (created on the first save). |
| `credentials/api-token` | Fallback token file if the keychain is not used. Gitignored, never committed. |
