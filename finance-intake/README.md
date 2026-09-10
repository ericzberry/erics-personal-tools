# finance-intake

Hand Claude a statement, a screenshot, a logged-in page, or a spreadsheet, and
it files the figures as dated snapshots in the Finance ledger — the same ledger
the Chrome sidebar and the mobile app read. Nothing is typed in by hand, and
nothing is saved until you have seen exactly what it read.

The ledger itself is the app's, not this directory's: records, value history,
totals, breakdowns, and the value-over-time series all live in
`finance_records` and are described in
[docs/PROTECTED_SECTIONS.md](../docs/PROTECTED_SECTIONS.md). This directory is
only a way in.

## Using it

Say what it is and hand over the file or the page:

> "Here's the Q2 Schwab statement." *(attach the PDF)*
> "Save the balances on this page." *(a broker dashboard you're logged into)*
> "This is the June capital account for the family trust." *(a photo)*

Claude reads it, shows you a plan — which record each figure lands on, the
previous value, and the as-of date — and saves only after you say yes. It
follows [RUNBOOK.md](RUNBOOK.md).

Then open Finance in the sidebar or the phone (passkey), where the new
snapshots appear in the history and in **Value over time**.

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
node finance-intake/ledger.mjs list                      # every record, with ids
node finance-intake/ledger.mjs list --json               # the same, machine-readable
node finance-intake/ledger.mjs show "Schwab brokerage"   # one record and its full history
node finance-intake/ledger.mjs save snapshots.json       # preview — writes nothing
node finance-intake/ledger.mjs save snapshots.json --confirm
```

`save` takes a JSON array. An entry either updates an existing record:

```json
[
  {"match": "Schwab brokerage", "value": 1284300.55, "asOf": "2026-06-30", "source": "Q2 2026 statement"},
  {"match": "b8f1…-uuid", "value": 412000, "asOf": "2026-06-30", "source": "Q2 2026 statement"}
]
```

…or creates one:

```json
[
  {"create": true, "name": "Meridian Fund III", "kind": "private", "institution": "Meridian Partners",
   "owner": "Berry Family Trust", "currency": "USD", "commitment": 500000, "unfunded": 180000,
   "value": 327400, "asOf": "2026-06-30", "source": "Q2 2026 capital account"}
]
```

`match` accepts a record id, an exact name, or a unique fragment of a name or
institution. **A fragment matching two records is an error, not a coin flip** —
use the id. `value` is always a positive number, with a liability recorded
under a liability kind (`mortgage`, `loan`, `credit`, `other-liability`); the
app applies the sign. A new record may also set `ownership` (percent),
`liquidity`, `rate`, `tags`, and `notes`. `kind` is one of the types listed in
[docs/PROTECTED_SECTIONS.md](../docs/PROTECTED_SECTIONS.md).

## What the preview tells you

- `APPEND` — a new date in that record's history.
- `AMEND` — that date already has a figure, and saving replaces it. History is
  keyed by as-of date, so this is how a correction is filed. The old figure is
  shown so you can see what is being replaced.
- `NEW` — a record that does not exist yet.
- `CHECK` — the figure moves more than 40% from the last snapshot. Usually a
  misread decimal or a number taken from the wrong row. Worth a second look
  before confirming.

A backdated snapshot does not disturb today's total: a record's current value
is whichever snapshot is newest by date.

## What it deliberately does not do

- **No arithmetic.** No totals, no net worth, no returns, no currency
  conversion. The app computes those, keeps currencies apart, and weights
  partial interests by ownership share.
- **No deletes.** Correct a figure by saving the right one under the same date.
- **No secrets.** Account numbers are sealed with the passkey on your device and
  can only be entered in the app. Only name, institution, and owner are stored
  readable here.
- **No unattended runs.** This is not a scheduled task. Every save is something
  you asked for and approved in the moment.

## Files

| File | Purpose |
|------|---------|
| `ledger.mjs` | The CLI. Read and append only. |
| `RUNBOOK.md` | The procedure Claude follows for each intake. |
| `log.md` | One line per intake (created on the first save). |
| `credentials/api-token` | Fallback token file if the keychain is not used. Gitignored, never committed. |
