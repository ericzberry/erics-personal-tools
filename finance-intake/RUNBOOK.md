# Finance intake — instructions for the run

You are turning a source Eric handed you — a statement, a screenshot, a logged-in
page, a spreadsheet — into dated figures in his Finance ledger. Follow these
steps exactly.

The ledger holds one amount per **portfolio**, **asset class** and **date**. It
does not hold accounts, holdings, institutions or positions. A statement naming
forty holdings becomes the few class totals they add up to.

## Hard rules

1. **Never invent a figure.** Record only numbers the source states, or a class
   total you computed from holdings the source states and showed him. Do not
   estimate, annualize, or convert between currencies. If a figure is
   unreadable, say so and leave it out.
2. **Never guess the date.** Use the as-of date printed in the document — the
   statement period end, the valuation date, the capital-account date. Today's
   date is correct only for a live page showing current balances. A source with
   no usable date is not saved; ask Eric which date it belongs to.
3. **Never add a holding to a total that already covers it.** A page states an
   account's own total *and* the holdings inside it. Use one or the other, never
   both. Holdings may replace the total only when they add up to it — if three
   brokered CDs sit beside a $1.6M net account value, the account does not hold
   $300, and the right entry is the $1.6M as `unclassified`.
4. **Never guess a split.** If the source does not say how an account is
   invested, file its total as `unclassified`. That counts in full and asks to be
   corrected later. Inventing a stocks/bonds/cash split is worse than admitting
   there isn't one.
5. **Never guess the portfolio.** `ledger.mjs` refuses an ambiguous name by
   design. When a figure could belong to more than one, ask rather than pick.
6. **Never write without showing the plan first.** Run `save` without
   `--confirm`, show Eric the output, and only then re-run with `--confirm`.
7. **Never put account numbers, logins or identifying detail in the ledger.**
   There is nowhere for them: it holds portfolio names, codes, dates and numbers.
8. **Never delete.** There is no delete command and there should not be one. A
   wrong figure is corrected by saving the right one under the same portfolio,
   class and date, which the plan shows as `AMEND`. To stop counting something,
   save it as zero.
9. **Liabilities are positive numbers under a liability class** (`mortgage`,
   `loan`, `credit`). The app applies the sign.

## Steps

1. **Read the source.** Match the method to the format:
   - **PDF** — the `Read` tool reads PDFs directly (pass `pages` for long ones).
     For a scanned PDF with no text layer, read it as pages of images.
   - **Screenshot or photo** — the `Read` tool.
   - **A page behind a login** — the Claude Chrome extension
     (`mcp__claude-in-chrome__*`, load via ToolSearch), which uses Eric's real
     Chrome session, then `get_page_text`. Do not try to log in.
   - **Spreadsheet** — the `xlsx` skill, or read the file directly.
2. **Pull out, for each figure the source states:** what it is called, which
   account it belongs to, whether it is that account's own total or one holding
   inside it, what asset class it is, and its as-of date.
   - Ignore performance figures, gains and losses, cost basis, contributions,
     distributions, the unvested or potential value of a stock plan, market and
     index quotes, and advertised rates. The ledger tracks value on a date.
   - A figure covering several accounts at once — a portfolio-wide total — is
     left out. Count the accounts it covers instead.
3. **Fold it yourself, and show your work.** Group the figures by portfolio and
   class and add them up. State plainly which source lines went into each total,
   and say when an account's holdings did not reconcile to its stated total and
   you therefore kept the total whole as `unclassified`.
4. **See what already exists:** `node finance-intake/ledger.mjs list`. Map each
   class total to an existing portfolio, or mark it as new. Prefer an existing
   portfolio: a near-duplicate splits a history in two, and consolidating is the
   point of the shape.
5. **Write the figure file** to the scratchpad (not into the repo) — see
   [README.md](README.md) for the format. Wrap the figures with what they were
   read from — `"source"` (the file or page name), `"file"` (its path, so the
   same statement filed twice is caught), and `"firm"` when the statement is
   one site's — and give each figure `"from"`: the source lines you added up
   into it. That is the trail the ledger keeps from the statement to the saved
   figure; a figure with no trail is one nobody can check later.
6. **Preview:** `node finance-intake/ledger.mjs save <file>`. Read the plan
   yourself before showing it. Investigate anything marked `CHECK` (a large move)
   or `AMEND` (a date that already has a figure) and re-read the source rather
   than assuming the new number is right. `ALREADY IMPORTED` means this exact
   file was filed before; `DUPLICATE?` means the same amount is already filed
   for that portfolio and class from another firm within a week — the same money
   read twice would be counted twice. Stop and ask about either.
7. **Show Eric** the plan, what you read it from, and how you folded it, and
   wait for a yes.
8. **Save:** `node finance-intake/ledger.mjs save <file> --confirm`.
9. **Nothing to log by hand.** The save writes an import naming the source,
   when it was filed and every figure it saved; `ledger.mjs trail` reads it back,
   and the app's **Imports** tab shows it.

## Reporting back

Say which portfolios and classes moved and to what, name the as-of date, and
name anything in the source you could not read or could not place. Do not state
a net worth or a change in one: Eric reads those in the app, where currencies
are kept apart. If asked for a total, say which currency it covers.
