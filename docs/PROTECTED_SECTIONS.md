# Finance and Personal information

Two capabilities whose entire contents sit behind the device passkey. Choose
either from Tools in the extension or the unlocked mobile app.

## The gate

Both sections render nothing until the passkey answers — not a record name, not
a total, not a category. In these sections a record's name is often as
revealing as its value, so `chrome-sidebar/src/vault-gate.js` hides the whole
tool rather than masking individual fields.

**Arriving at the section asks for the passkey.** Opening Finance is a request
to read it, so the gate raises the prompt itself rather than reporting that the
section is locked and waiting to be told again. It asks once per arrival —
mounting a visible section, showing a hidden one, returning to a backgrounded
tab, or an idle window running out in front of the reader — so a dismissed
sheet leaves an **Unlock** button and never a loop. It never asks behind a
hidden tool or a backgrounded tab, where the prompt would belong to nothing the
reader is looking at, and **Lock now** means locked: it is the one lock the gate
does not offer to undo by itself. `auto-unlock.js` holds that one-attempt rule,
shared with the mobile app's own lock screen.

**A section the sidebar opened on its own account does not ask.** The panel
turns to Finance beside a finance page by itself (below), and a system prompt in
front of someone who only opened a tab would be the sidebar arriving at a
protected section on somebody else's behalf. Such a mount is given
`automatic: false`, and `gate.automatic(on)` turns the prompt back on the moment
the reader asks for the section — which counts as an arrival, so the prompt it
suppressed is offered then. The lock screen itself is unchanged: **Unlock** is
right there for anyone who wants in.

**In the side panel, the check runs in a small window.** Chrome sends a passkey
request from the side panel and never shows the sheet, so a section there sat on
"Waiting for your passkey…" with nothing to answer — every protected section
alike: Finance, Needs attention, Subscriptions, and a card number in Rewards.
The panel's vault is configured in `app.js` with `unlockInWindow()`
(`vault-window.js`), which opens `unlock.html` as a popup centred over the
browser window. That page asks as soon as it is on screen, stores the session in
`chrome.storage.session`, reports how the check ended, and closes itself; the
panel adopts the session exactly as another tab's unlock would, or shows the
reason and an **Unlock** button. Closing the window by hand counts as canceling,
and a window that never answers is closed after 90 seconds. Extension tabs and
the mobile app still ask on their own page. The recovery code needs no sheet
and is entered in the panel itself.

The gate is built on `secret-vault.js`, the same WebAuthn PRF key that seals
card numbers. One vault is shared per host (`sharedVault()`), so a single
passkey prompt opens every protected section on the page and one hour-long idle
window governs them together: activity in the ledger keeps the personal records
open, and going idle closes both and drops anything already revealed. Locking is
also explicit — **Lock now** is reachable while unlocked, except where the
session was borrowed from the host's own lock (see below).

**Open says nothing.** A section that is unlocked shows its records; it does not
announce that it is unlocked or count down the idle window. The gate's status
line is empty while open and speaks only when an attempt fails, so the state the
reader can see is never also narrated to them. The same holds for the wallet's
**Protected values** — no banner, only the controls that still apply.

**The unlocked session belongs to the browser, not to the page.** In the
extension each capability is its own tab, so a key held only in one page's
memory would mean a fresh biometric check for every navigation and a reload that
throws the unlock away. `vaultSessionStore()` keeps the derived key in
`chrome.storage.session`: memory only, gone when the browser closes, and
reachable by this extension's pages but not by a web page or content script.
One check therefore covers the idle window wherever it is spent, an unlock in
one tab opens the others, and locking or idling in any of them closes all of
them. The stored stamp carries the window's remaining time, so a restored
session expires when it was always going to. The trade is deliberate: the key is
readable by any extension page for as long as the window lasts, which is already
true of the page that derived it. The mobile app has no such area and needs
none — every tool there shares one page. The one navigation it has to survive is
the reload that applies an update, and `mobile-security.js` carries that unlock
across it in the tab's session storage: written as the reload is triggered, read
once and removed, and refused when it is stale or belongs to another saved lock.

**On the phone, the app's own lock is the check.** The mobile app already asks
for the passkey before it shows anything, to unwrap this device's access token.
That is a WebAuthn PRF evaluation of the same passkey the record vault needs, so
`mobile-security.js` evaluates the vault's salt (`PRF_SALT`) beside its own in
that one assertion: one salt yields the key that unwraps the token, the other
the key that opens sealed records. The unlocked frame adopts the second through
`unlockWithPasskeySeed()` before any tool mounts, so opening Finance right after
unlocking the app is simply open — it does not ask for the passkey the owner has
just given. The two keys stay independent: neither can be derived from the
other, and the record key lives only as long as the unlocked session does. An
authenticator that evaluates only one salt returns nothing for the second, and
each section asks for itself exactly as it did before.

A session opened that way reports itself as **borrowed** (`vault.borrowed()`),
and a gate over a borrowed session offers no controls at all. **Lock now** there
would close a session the reader never opened from this panel, and the next
arrival would ask for the passkey they had already given — the very prompt this
removes. Recovery belongs to the same lock: the phone's own **Recover access**
is the way back, and the code itself stays available in the rewards wallet. In
the extension nothing is borrowed, so both controls stay where they were.

**The check names the passkey that answered last.** A request that names no
credential leaves the browser to ask which passkey to use, and that chooser is
noise for a reader who has one — worse when a synced copy or a repeated
enrollment fills it with entries under the same name. The credential ID of a
successful check is kept in `chrome.storage.local` (ordinary local storage on
mobile) and named on every check after it, so the routine unlock is a plain
biometric prompt. The ID identifies a passkey and cannot use one, so it is not
the kind of thing the session area guards.

**A named check that fails is not a dead end, and not a dead end twice.** A
passkey refused by name looks exactly like a dismissed prompt — both are
`NotAllowedError` — so the ID is marked as the suspect rather than dropped, and
the next check names nothing. What answers that check says which of the two
happened. A different passkey means the remembered one is gone, and it is
replaced. The very same passkey means it was here all along and this browser
cannot find it by ID: Chrome does that with a passkey held in Apple Passwords,
answering a check that names no credential and reporting *No passkeys available*
for one that names it. Naming then stops for good on that device, so the first
protected section opened in a session no longer fails while the next one
succeeds. A prompt dismissed and then answered looks the same and costs the
same — the browser's own chooser comes back.

**Two passkeys for this site derive two different keys**, and an assertion
succeeds under either, so naming the wrong one could otherwise stick. Opening a
sealed value is the only test of which passkey sealed it, and every protected
section reads through `vault.open()` for that reason: a value that will not open
drops the remembered ID, so the next check offers the choice again. Falling back
to the recovery code drops it too.

**Enrollment renews one passkey rather than adding another.** An authenticator
files a resident credential under `rp.id` and `user.id` together and replaces it
only when both match, so `passkey-vault.js` enrolls under a fixed user handle: a
repeated setup, or a recovery, replaces the passkey it renews instead of leaving
another entry behind under the same name. Entries from before that — an earlier
enrollment, a restarted setup, a recovery — stay in the provider until they are
deleted there, and only one of them holds the key that opens existing values.
The app cannot remove a credential it created.

Losing every copy of the passkey makes protected values unreadable. The recovery
code is the only way back, and the only fallback where a browser cannot produce
PRF output. It is the same code the rewards wallet shows.

## Finance

A ledger of what is held, by asset class, in each portfolio, on a date.

**A stored figure is four numbers.** Which portfolio, which asset class, the
date, and the amount in whole cents — and nothing else. The words live in two
registries in `finance-data.js` and are written once rather than copied onto
every entry: `ASSET_CLASSES` (stocks, bonds, cash, private equity, venture
capital, hedge funds, real estate, other, unclassified; mortgage, loan, credit)
and `REGISTRATIONS` (taxable, IRA, Roth IRA, 401(k), trust, entity, custodial).
A code is what is stored, a label is what is shown, and a code is never reused.

This is a deliberate reduction. The ledger this replaced kept a record per
account, each carrying a type, an institution, an owner, a currency, a
liquidity, an ownership share, a rate, commitments, tags, notes and a JSON array
of every figure ever filed for it — so reading one brokerage page produced eight
records, three of them individual brokered CDs spelling out
"WSTRN ALLIANCE PHOENIX AZ CD 4.05% 10/30/2026" for a hundred dollars. The
question worth answering is how much is in stocks, in bonds and in cash, in the
Eric and Ariana Berry Estate and in the IRA. A year of weekly figures across six
classes and three portfolios is now a few thousand integers.

**A portfolio is where value is held**, and there are a handful: the Eric and
Ariana Berry Estate, the IRA. It carries a name, a registration and a currency,
and its name is the only text in the whole ledger — encrypted at rest like every
other stored value here. Eight accounts held in one estate are one portfolio,
which is the consolidation the shape exists for: a checking account is not its
own portfolio, and a taxable account at an institution that holds one title and
settles none of its own joins the one taxable portfolio rather than starting a
second.

**Some portfolios are settled by the institution, not by the statement.**
Everything held at Schwab is held in the Eric and Ariana Berry Estate — a
standing fact about where the account is, not something a statement restates on
every page, and no reading can be relied on to supply it because the model that
reads one is told never to guess an owner. `ACCOUNT_TITLES` in `finance-data.js`
says it once: the canonical spelling of the institution (Schwab, whatever a page
calls itself — Charles Schwab, Schwab Bank), the title its accounts are held in,
and the titles that registration overrides. **Registration overrides the title,
because law does:** an IRA is registered to one person and cannot sit inside a
joint estate, so the same institution answers `Eric Berry` for a retirement
account and the estate for a taxable one. Matching ignores case, punctuation and
spacing, so every spelling of Schwab answers the same.

**Some institutions hold one title; some hold a whole structure.** Chase is a
single sign-on covering the Eric and Ariana Berry joint account, the Berry 2020
Descendants' Irrevocable Trust, the Berry AE 21 Irrevocable Trust, Celsie LLC
and the children's accounts — so its entry carries a `holders` roster instead of
one owner, and the account in front of the reader says which of them it is.
Each holder lists the fragments its title is recognized by; every one of those
titles contains "Berry", so no fragment is "berry", and the longest fragment
that appears wins. **A place with a roster has no default title.** An account
the roster does not name is filed under the name the page gave it, registered by
what that name says it is — a trust is a trust, an LLC is an entity — and never
joined to the one portfolio that happens to be registered the same way, because
a trust's balance added into the joint estate is the mistake here that nobody
can see afterwards. The same reasoning reaches the class: one sign-on at a bank
covers the checking account and the managed portfolio beside it, so an account
whose own name says it holds investments keeps the class the reading gave it
rather than taking the site's default of cash.

For that to work the reading has to carry the heading an account was listed
under. The page snapshot keeps the nearest two lines above a figure rather than
one, so a group heading travels with the balance beneath it, and the intake
prompt asks for that heading in front of the account's own name — never
shortened, and never carried onto an account outside its group.

**Totals are calculated, never estimated.** Every class counts, including
Unclassified — nothing is quietly dropped from a total, and the way to stop
counting a figure is to mark it zero, which is visible in its history.
Liabilities are signed; conflicted rows and pending deletions are excluded until
they are resolved. Currencies are reported side by side and never converted —
this application has no exchange-rate source it can defend, so a single
cross-currency net worth would be invented rather than computed. A portfolio
nobody has marked in over 90 days is named as stale, once for the portfolio
rather than once per class, and still counted at its last known figure.

**A figure is keyed by portfolio, class and as-of date.** Saving that key again
replaces the amount under it, which makes the write idempotent, so a change
queued offline and revalidated by the Worker cannot duplicate an entry. Its
revision is the amount itself: nothing else identifies a version of a row whose
whole content is one number, a stored revision would cost more bytes than the
data it guards, and it still catches the one thing optimistic concurrency is
for. A backdated correction is filed without moving today's figure, because each
class shows whichever of its figures is newest by date. Value over time is a
step function between observed figures; nothing is interpolated, and a class
contributes nothing before its first figure. Each class keeps up to 240 dates;
past that the oldest fall off, and today's is never the one dropped.

**Retrofitting the old ledger.** `/v1/finance/backfill` reads the record-per-
account table, maps each record to a portfolio and a class, and brings every
dated figure across rather than only the newest. A portfolio is named by the
owner already on the record, or by the registry when there is none; an ownership
share that weighted a partial interest is applied once, on the way across,
because the new shape has no such field; a brokerage or retirement account
arrives Unclassified rather than guessed into stocks. It previews by default,
writes only when confirmed, is re-runnable — every write is keyed, so confirming
twice reaches the same ledger — and deletes nothing. `finance-intake/backfill.mjs`
is the way to run it.

**What this shape gave up**, deliberately: the per-account record, its
institution and free-text name, liquidity, ownership share, rate, total and
unfunded commitments, tags, notes, and the account number sealed with the
passkey. There is no account entity left to hang an account number on. Finance
is still passkey-gated as a section, and Personal information still holds sealed
values.


### Arriving beside a finance page

**The panel turns to Finance on its own, and says nothing about what is in it.**
`FINANCE_SITES` in `account-sites.js` recognizes about thirty institutions by
host — the four whose signed-in pages can be read, and the rest of the
brokerages, banks, card issuers, retirement and private-holding sites a figure
comes from. Recognition costs one URL comparison, so `context-panel.js` asks it
of every tab, and a recognized page shows Finance beside the tab those figures
would come off.

What it does not do is answer a question nobody asked. An arrival like that is
**quiet**: the totals, the breakdown, the value over time and the holdings list
are not hidden but unbuilt — no balance is anywhere in the page — while
everything that puts a figure *into* the ledger is ready at once: the site's own
reading where the page can be read, the statement drop zone, **Read the accounts
on the open page**, and a figure typed by hand. One action sits beside the
title, **Show position**, and one press makes it the ledger it always was.
Visiting a bank should not put a net worth on a shared screen, and it does not
raise a passkey sheet either.

Asking is remembered for the sitting and forgotten when the section locks, so
the next institution's page does not cover the ledger up again and make the
owner ask twice. Choosing Finance from Tools is itself the asking and opens it
whole; the strip's own offer hands the panel back to the tab, which is the quiet
arrival.

### Reading a statement

Figures reach the ledger four ways, and all four end at the same place: folded
figures the owner reviews before anything is saved.

**AI labels; the device adds up.** The model is asked for one reading per figure
the source states — what account it belongs to, what the figure is called, what
asset class it is, how the account is registered, and whether it is the
account's own total, one holding inside an account, or a figure covering several
accounts at once. It is told, repeatedly, that adding numbers together is not
its job. Everything after that is `foldReadings` on the device:

- A figure covering several accounts is left out, and the accounts it covers are
  counted individually.
- An account stating two account-level figures — a current value and a net value
  — is stating one balance twice, so the one that says it is the total wins and
  the panel says which was used.
- **Holdings split an account only when they add up to it.** A page listing
  three brokered CDs beside a $1.6M net account value is not telling you the
  account holds $300, so unless the holdings reconcile to within 1% of the
  account total, the total is kept whole and filed as Unclassified. The panel
  says so.
- Each remaining figure is added into its portfolio and class, and the result —
  one amount per portfolio and asset class — is what the panel shows and what
  saving writes. A page naming dozens of things becomes a handful of numbers.

- **Drop a file.** PDF, CSV, XLSX, or an image. A PDF's text layer is extracted
  on the device by `pdf-text.js`, a spreadsheet by the vendored reader, and the
  result is put in the intake box **verbatim** so the owner sees exactly what
  was pulled out. This matters: PDF extraction is best-effort, and a statement
  that comes out garbled has to be visible as garbled rather than read
  silently. `pdf-text.js` reports its own confidence — `good`, `partial`,
  `low`, or `none` — and a scan with no text layer says so and suggests the
  image path instead.
- **Read the open page.** One press, one errand: a text snapshot of the tab the
  owner is already looking at, read and folded into figures in the same press. It never
  navigates, never signs in, never opens a tab, and only reads when asked. The
  page is not copied into the intake box on the way through — it is open beside
  the panel, where the owner can see it better than any transcript of it, and
  the folded figures are the readout worth looking at. Table rows are rendered cell by
  cell so a label stays beside its figure. Extension and browser-internal pages
  are skipped.

  **The snapshot is narrowed to the figures.** An account dashboard is mostly
  not accounts: Schwab's summary wraps three balances in index quotes, a
  generative-AI explainer, article links and screens of disclosure, and sending
  all of it buries what was asked about. `finance-page-read.js` keeps the lines
  that state a figure, the short line above one that names it, and the lines
  that say which account or which date a figure belongs to; it drops legal
  furniture, chart axis labels, and market data — a bare index quote is
  recognized by the index named in the lines above it. Narrowing applies only
  when it actually found figures: a page whose balances this filter cannot see
  is sent whole rather than sent gutted.
- **Drop an image.** A screenshot, a photo, or a scanned statement. The picture
  is downscaled to 1400px and re-encoded on the device before it is sent —
  the original file never leaves. Images travel as content parts to a model
  marked `vision` in the catalog; a connection with no such model is refused
  rather than sent something it cannot read.
- **Read the accounts on a site the sidebar recognizes.** The sidebar knows the
  readable account sites in `ACCOUNT_SITES` from the tab beside it — the four
  whose signed-in pages have been checked against their log-on and public pages,
  which is the only work separating them from the rest of the registry above —
  and asks every frame of that page
  four things — its path, whether it has finished loading, whether a password
  field is on screen, and whether a sign-out control is — to tell a signed-in
  session from a log-on form. No page text crosses back to answer that, and a
  password field on screen settles it as signed out. Every frame is asked
  because Chase serves its log-on form inside one, under the same path its
  signed-in application uses; for the same reason a path only counts once the
  page has finished loading, while a rendered sign-out control counts at once.
  A site's public pages are held out of the paths it is recognized by, since
  Morgan Stanley Online serves the page an owner lands on when they sign out
  from the same prefix as its application.
  A site whose accounts live on one subdomain is recognized by that subdomain
  alone — Schwab's client host, not the marketing site around it — so the rest
  of its domain is never asked anything.
  On a signed-in site the sidebar opens Finance — quietly, as above — and offers
  one action, named for
  the site — **Read my Schwab accounts** — in a group of its own that says what
  pressing it will do and that nothing is saved by reading. Pressing it takes
  the same single page snapshot as above and reads it as a live page: one figure
  per account the page names, using each account's own total. A portfolio-wide
  total, a day change, a market quote and anything in the page's news or
  promotional panels are left out, and a balance the page shows without a date
  of its own is current rather than dropped. What comes back is the
  confirmation: one row per portfolio and asset class, folded on the device,
  with **Edit** to correct any amount before **Save these figures** writes them.
  A portfolio the reading had to propose says **new portfolio** before it is
  made, and is made first, because a figure cannot be filed into one that does
  not exist. While
  a recognized site is beside the panel this is the one place the page is read
  from; the general **Read the accounts on the open page** action steps aside,
  because two buttons for one errand is the confusion.
**Which saved connection does the reading is not a question.** Connections are
managed in Settings; Finance uses whichever saved connection can answer and says
so only when there is none. A model picker in a feature would be a second place
to manage connections and a decision the owner has no reason to make.

What is not sent matters as much. The ledger never leaves the device, so the
model cannot know what is already held, cannot pick the portfolio a figure
belongs to, and is instructed never to total, net, annualize or convert
anything. Choosing the portfolio happens on the device, from the registration
the reading named and the institution the site settles. A
reading with no usable date is dropped rather than assumed to be today — the one
exception being a page the device says the owner is signed in to right now,
where today's balances carry no printed date — and a figure that is illegible in
an image is named under `unread` rather than guessed at.

Nothing is saved by reading. The folded figures are saved, edited first, or
discarded by hand, and saving them writes through the same validator and offline
queue as a figure typed by hand.

## Personal information

Records for sensitive personal detail — identification, contact, medical,
insurance, financial identity, employment, family, legal, accounts.

The value and its notes are sealed together on the device before saving, so the
Worker holds one opaque envelope and the shared validator refuses a record whose
value is not already sealed. Only the record name, category, person, a short
owner-written hint, and an expiration date are stored readable, which is what
makes a record findable and lets **Expiring soon** work without opening
anything. Keep the hint short and non-identifying; it is the one part that is
not protected.

A revealed value re-hides itself after a minute, and every envelope is bound to
its record id — an envelope moved to another record does not open.

## Storage, sync, and limits

Personal information uses the shared encrypted IndexedDB adapter and
authenticated encrypted D1 records (`personal_records`) with per-record
revisions. Finance uses the same device adapter over two relational tables,
`finance_portfolios` (id, encrypted name/registration/currency, revision) and
`finance_marks` (portfolio, class, as_of as YYYYMMDD, cents — `WITHOUT ROWID`,
keyed by the three that identify a figure). Portfolios and figures travel as one
record stream, so one offline queue and one set of conflict rules cover both.
The amounts are plain integers rather than an encrypted blob: that is what makes
the shape relational and small, and a table of integers with no names in it says
little without the portfolio table beside it.
Records download once and stay available offline, including opening a protected
value: the passkey is checked on the device, so revealing a value makes no
network request. Offline changes queue before the network is attempted and sync
on reconnect or foreground; conflicts offer Keep my change or Use cloud version.
Disconnecting is blocked while changes are pending, and a successful disconnect
clears this device's copies while leaving cloud records intact.

Reading is the only part that needs the internet, and only for the model call:
extracting a PDF, a spreadsheet, a page or an image all happen on the device.
Everything else — totals, history, folding a reading, revealing a value — works
offline.

## API and deployment

`/v1/personal[/…]` reuses the generic record store in `tools-api/src/travel.js`.
`/v1/finance[/…]` is its own handler in `tools-api/src/finance.js`, because its
rows are not records: a portfolio is addressed as `p3` and a figure as
`3-1-20260919`. `/v1/finance/backfill` plans the retrofit on `GET` and performs
it on `POST`. Apply `tools-api/finance-schema.sql` and
`tools-api/personal-schema.sql` before deploying the code that depends on them;
both are additive `CREATE TABLE IF NOT EXISTS` statements that leave existing
records untouched, and the record-per-account `finance_records` table is left in
place for the backfill to read — dropping it is a separate, later decision. `/v1/ai-connections/:id/finance-intake` serves the reading; it accepts up to
24,000 characters and up to four images, and is the only route whose request
body may exceed 64 KB.
