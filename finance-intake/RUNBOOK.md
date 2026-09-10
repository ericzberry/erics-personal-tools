# Finance intake — instructions for the run

You are turning a source Eric handed you — a statement, a screenshot, a logged-in
page, a spreadsheet — into dated snapshots in his Finance ledger. Follow these
steps exactly.

## Hard rules

1. **Never invent a figure.** Record only numbers the source actually states. Do
   not total, net, annualize, estimate, or convert between currencies. The app
   does all arithmetic; this intake only reports observations. If a figure is
   unreadable, say so and leave it out.
2. **Never guess the date.** Use the as-of date printed in the document — the
   statement period end, the valuation date, the capital-account date. Today's
   date is correct only for a live page showing current balances. A source with
   no usable date is not saved; ask Eric which date it belongs to.
3. **Never guess the record.** `ledger.mjs` refuses an ambiguous name by design.
   When a figure could belong to more than one account, ask rather than pick.
4. **Never write without showing the plan first.** Run `save` without
   `--confirm`, show Eric the output, and only then re-run with `--confirm`.
5. **Never put account numbers, logins, or identifying detail in the ledger.**
   Those belong in the app's protected field, which is sealed with the passkey
   on Eric's device and cannot be written from here. Name, institution, and
   owner only.
6. **Never delete.** There is no delete command and there should not be one. A
   wrong figure is corrected by saving the right one under the same date, which
   the plan will show as `AMEND`.
7. **Liabilities are positive numbers under a liability kind** (`mortgage`,
   `loan`, `credit`, `other-liability`). The app applies the sign.

## Steps

1. **Read the source.** Match the method to the format:
   - **PDF** — the `Read` tool reads PDFs directly (pass `pages` for long ones).
     For a scanned PDF with no text layer, read it as pages of images.
   - **Screenshot or photo** — the `Read` tool.
   - **A page behind a login** — the Claude Chrome extension
     (`mcp__claude-in-chrome__*`, load via ToolSearch), which uses Eric's real
     Chrome session, then `get_page_text`. Do not try to log in.
   - **Spreadsheet** — the `xlsx` skill, or read the file directly.
2. **Pull out, for each holding the source states:** the name as the source
   calls it, the institution, the owner (person, trust, or entity — only if the
   source names one), the currency, the figure, and the as-of date.
   - A statement covering several accounts produces several snapshots, one per
     account. Do not roll them into a household total.
   - Ignore performance figures, contributions, distributions, and cost basis.
     The ledger tracks value on a date, nothing else.
3. **See what already exists:** `node finance-intake/ledger.mjs list`.
   Map each figure to an existing record, or mark it as new. Prefer an existing
   record; a near-duplicate record splits an account's history in two.
4. **Write the snapshot file** to the scratchpad (not into the repo) — see
   [README.md](README.md) for the format.
5. **Preview:** `node finance-intake/ledger.mjs save <file>`. Read the plan
   yourself before showing it. Investigate anything marked `CHECK` (a large move)
   or `AMEND` (a date that already has a figure) and re-read the source rather
   than assuming the new number is right.
6. **Show Eric** the plan and what you read it from, and wait for a yes.
7. **Save:** `node finance-intake/ledger.mjs save <file> --confirm`.
8. **Append one line to `log.md`**: the date, the source, and what was saved.

## Reporting back

Say which records moved and to what, name the as-of date, and name anything in
the source you could not read. Do not state a net worth or a change in one:
Eric reads those in the app, where currencies are kept apart and ownership
shares are applied. If asked for a total, say which currency it covers.
