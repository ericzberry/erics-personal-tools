# UI rules

The checkable register. [DESIGN.md](DESIGN.md) says what the interface looks
like and why; [AGENTS.md](../AGENTS.md) says what every change owes the person
using it; [VISUAL_QA.md](VISUAL_QA.md) says how to look at the result. This file
holds neither reasoning nor procedure — only the numbered rules, what each one
costs to break, and where the check lives. A rule that is not checkable by a
test or by a named look at a named screen does not belong here yet.

Rules are kept by the [ui-consistency](../.claude/agents/ui-consistency.md)
reviewer, which reads this file, finds what breaks it, fixes what it can, and
proposes the next rule from what it could not.

Most of these arrived as a complaint about one screen. The screen was the
example; the rule is the task. See **A complaint becomes a rule** in
[AGENTS.md](../AGENTS.md).

## Status

**Enforced** — a test fails on any violation. Breaking one is a broken build.

**Ratcheting** — a test holds a per-file budget of existing violations. The
budget may go down and never up. This is how a rule arrives while the drift it
names is still on the screen: nothing new lands, and the number falls as the
old cases are cleaned up.

**By eye** — no test yet. The reviewer checks it against the named screens and
says so in its report. A by-eye rule that turns out to be mechanical should be
promoted to a check rather than left as a habit.

**Open** — not yet a rule. A question about the canon that has to be answered
before anything can be enforced. Answer it in DESIGN.md, then add the rule
here.

## Enforced

| | Rule | Check |
| --- | --- | --- |
| **UI-1** | One owner per dropdown. Every `<select>` in either host is built by the shared `Select`, which is the only place allowed to construct one; no feature, page or host builds its own, and no HTML file writes the element. | `tests/ui-rules.test.js` |
| **UI-2** | An open disclosure is marked. Its summary wears `--open-band` at the head of a bounded block, the band differs from the tint a row takes under the pointer, and the marking lives in the two shared sheets rather than in a feature. UI-22 says it applies to every one of them. | `tests/components.test.js` |
| **UI-3** | One status vocabulary. The four tones are the whole set, each owns one colour and one mark, a cleared line carries no tone, and only an error fills a surface. | `tests/status-tones.test.js` |
| **UI-4** | No feature identifiers in the shared sheet. `styles.css` styles component classes; an `#id` selector there means a feature reached into the design system. | `tests/components.test.js` |
| **UI-5** | No markup outside components. Feature code supplies state and actions and never builds elements, sets `innerHTML`, or writes controls into an HTML shell. | `tests/components.test.js` |
| **UI-7** | Nothing is set below 10px. Metadata is 10–11px and body text 12–14px; 7, 8 and 9px type is unreadable at arm's length and is not density, it is loss. Reached zero in 0.6.207 and moved up from ratcheting. | `tests/ui-rules.test.js` |
| **UI-8** | One system font stack, held in the `--sans` token. Nineteen inlined copies of `-apple-system, BlinkMacSystemFont, …` were nineteen places to forget when the stack changes, and two of them had already lost `"Segoe UI"`. Reached zero in 0.6.207 and moved up from ratcheting. | `tests/ui-rules.test.js` |
| **UI-9** | Corners come from the radius set: `0`, 4, 6, 7, 8, 12 and 14px, `50%`, `999px`, and the `--radius` and `--control-radius` tokens. 7px is the inner curve of an 8px box with a 1px border, and nothing else. Reached zero in 0.6.207 and moved up from ratcheting. | `tests/ui-rules.test.js` |
| **UI-16** | One action row per state; the actions that do not apply are hidden, not disabled. No component builds two action groups as siblings. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-17** | A registry entry carries a name, a way in and an icon, and no prose. The rest of "nothing on screen explains itself" is read on the screen; stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-21** | One focus ring: 2px, in the forest token, in every sheet either host loads. Offsets may differ — inside a tile, outside a control — but the width and the colour may not. The one exception is the gear on the forest header, which rings in `currentColor` because forest on forest is no ring at all. | `tests/ui-rules.test.js` |
| **UI-22** | Everything that expands opens the same way: one inset block with a banded head, and no sheet carries a list of disclosures exempt from it. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-26** | One currency formatter, in `ui.js`, and it writes a negative in parentheses. No other module builds a currency format. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-29** | A rule closes the whole heading: the name, the tag and the date are above it and it runs the width of the list. A title never carries the border itself. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-31** | An override of a shared rule out-specifies it and never relies on sheet order. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-32** | A harness loads what its host loads, in the same order. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-27** | One column of money: every figure in a list ends on the same right edge, a group's own total included, and the lines that hold them reserve their row actions' slot in one shared declaration. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-33** | A record's verbs ride on its own line and a group's on its heading line — never in a row of their own at the foot of the block it opens. Stated in full under [From a complaint](#from-a-complaint). | `tests/finance-ledger.test.js` |
| **UI-34** | An amount is one word. Every class that renders money declares `white-space:nowrap`, in a sheet both hosts load; the column gives way before the figure does. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-35** | Sections at one level of a screen all open the same way. A bare list standing beside three disclosures is the odd one out; it becomes a disclosure too, and the one the screen is opened for is the one that starts open. Stated in full under [From a complaint](#from-a-complaint). | `tests/finance-ledger.test.js` |
| **UI-36** | A band reaches both edges of its block. Whatever bleeds sideways with a negative margin widens by the same amount in the same rule, because a negative margin moves a box and does not stretch it. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |
| **UI-37** | A way out of a problem appears only while there is one. Connection settings stands in place of Refresh when a tool has no token or reached nothing, and not beside it when everything worked. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/attention-tools.test.js` |
| **UI-38** | Never ask for what the app can find out. Research fills in a point's value; the owner is asked only for what only the owner knows. Stated in full under [From a complaint](#from-a-complaint). | `tools-api/tests/cards.test.js`, `chrome-sidebar/tests/subscriptions-tool.test.js` |
| **UI-39** | Fine print is set below what it qualifies: name, amount in ink, conditions smaller and muted, and no box around a review inside an editor. Stated in full under [From a complaint](#from-a-complaint). | By eye |
| **UI-39** | Evidence for someone else is a Copy button, not a transcript. Diagnostic text meant to be pasted elsewhere is one Copy button, shown only while there is a problem to diagnose. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/finance-snapshot.test.js` |
| **UI-41** | A list of classes holds only classes. A single holding among the lines that name whole classes is grouped under its class's line and opens from it, a name keeps no kind-word run onto it, and its figures read one to a line. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/finance-investments.test.js` |
| **UI-42** | What has happened is not offered again. A dropped statement is read when it arrives; a Read button exists only for a file that could not be read, and no line says a thing is ready once it has been done. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/finance-investments.test.js`, `subscriptions-tool.test.js` |
| **UI-43** | A review's actions are the bare verbs — Save, Edit, Discard. The review above them is what they act on, so the label never restates or counts it. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/finance-snapshot.test.js`, `finance-investments.test.js`, `rewards-tool.test.js` |
| **UI-44** | A reading reports only what went wrong. A figure it left out on purpose, or one that is part of a figure it did report, is not a warning; what was refused is said only when nothing was found. Stated in full under [From a complaint](#from-a-complaint). | `tools-api/tests/finance.test.js`, `chrome-sidebar/tests/finance-snapshot.test.js` |
| **UI-45** | A side panel answers; a page holds the detail. A panel tool says what it all comes to and takes new records in; the record-by-record detail — every entity, every holding, every quarter — is read on the tool's own page, one press away, and the panel does not carry it again. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/finance-ledger.test.js` |
| **UI-46** | A glyph alone carries a verb on the record whose line it rides. An action that makes something new — cash for an institution — says what it makes in words; there is no glyph for adding. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/ui-rules.test.js`, `finance-overview.test.js` |
| **UI-47** | A dropped file is shown as itself. Every tool that opens one shows it as the one shared card — its name, a few words on what came out of it, Remove — and never puts the text pulled out of it on the screen. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/ui-rules.test.js`, `subscriptions-tool.test.js` |
| **UI-48** | What is not known is left off the line. A record's line prints what is known; an unknown billing cycle or price is omitted, not spelled out as "Not established" or "Amount unknown", and the ordinary state is not said at all. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/subscriptions-tool.test.js` |
| **UI-50** | Money is typed the way it reads. Every box a dollar figure is typed into is the shared `money` field: it groups thousands as they are typed and when a figure is filled in, and reads back as the plain number. No money box is a bare text or number input. Stated in full under [From a complaint](#from-a-complaint). | `chrome-sidebar/tests/ui-rules.test.js` |

## Ratcheting

Budgets live in `chrome-sidebar/tests/ui-rules.test.js`, one number per file,
and cover the shared component sheets under `chrome-sidebar/src/components/`.
`tokens.css` and `status.css` are the two palette files and are exempt from the
colour rule, because defining the palette is what they are for.

| | Rule | Budget when written |
| --- | --- | --- |
| **UI-6** | Colour comes from a token. A raw hex in a component sheet is a colour that cannot be retuned, cannot be reused, and will not match the next thing that needs the same tone. | 166, now **129** |

UI-7 closed by raising a tag's size and taking the width back from its tracking
and its padding, so every heading in the ledger and every row in the draft
board wraps where it wrapped before: seven portfolio heading rows measured
byte-identical at 380px and at 280px. A floor that widens the screen is not a
floor, it is a redesign.

Only UI-6 still ratchets. UI-7, UI-8 and UI-9 were cleared in 0.6.207 — no
type below 10px, one font stack, one set of corners — and are enforced above.

`capabilities.css` went from 37 raw colours to one in 0.6.207. Its `var(--x,
#hex)` fallbacks turned out to be vestigial — the sheet imports `tokens.css` on
its first line, so `data.html` has had the palette all along — and the rest
were literal copies of token values. The one it keeps is the forest-at-12%
shadow under the open Tools menu, which is the only elevation in the product
and has no token. 
Budgets are measured against the committed file. Several sessions edit these
sheets at once, and a number taken from someone else's half-finished cleanup
fails the suite for everyone at HEAD.

## By eye

| | Rule | Where to look |
| --- | --- | --- |
| **UI-10** | One state vocabulary, and no two states alike. Hover only where a pointer aims, and lighter than open or selected; disabled at half opacity with the default cursor; a toggle's open state visible without hovering it. The focus ring half is now UI-21 and checked. | Every changed control, in all of its states |
| **UI-11** | A heading is never smaller or paler than what it heads. A category over a run of records carries at least the size and the ink of the rows inside it, told apart by weight, a rule, or space. | Any screen with a run of records |
| **UI-12** | One spacing scale per screen: 2–4px inside a record, 8–12px between groups. Gaps within a group are always smaller than gaps between them. | The full scroll, not a cropped component |
| **UI-13** | Hit targets hold: 44px for touch form controls, 32px for the actions inside an expanded record. A row of glyphs is drawn to its line only where a pointer does the aiming; a finger keeps the touch size. | Sidebar and phone, hover and touch |
| **UI-14** | Every visual boundary explains a relationship. No card inside a card, no shadow that separates nothing, no rule with nothing under it. | Wherever a boundary was added |
| **UI-30** | Nothing sits on a rule: at least 4px under a hairline before what it introduces, and no less above it than below. Stated in full under [From a complaint](#from-a-complaint). | Every group heading, at the narrow width |
| **UI-28** | A list of groups opens one group at a time, and a closed group's heading carries its own number — its name, its kind, its total, and anything a reader needs before deciding to open it. Stated in full under [From a complaint](#from-a-complaint). | The list closed, one group open, and after a refresh |
| **UI-49** | A reading is drawn as a reading, not as a run of records: its figure in the serif at lead size, what it means beside it, what follows from it underneath, and no heading or rule between them. Stated in full under [From a complaint](#from-a-complaint). | The home screen's weather at 380px and 280px, and any new single figure a screen opens on |
| **UI-15** | Reviewed at the real sizes with no horizontal overflow: 380px and the 280px sidebar minimum, 390px and 320px on the phone, and a desktop viewport for full-tab pages. | [VISUAL_QA.md](VISUAL_QA.md) harnesses |

## From a complaint

Five rules the owner stated himself, each about one screen and every one of
them general. They were carried in a session's private notes until 0.6.207,
which is why the same mistakes kept arriving from screens nobody had shown him
yet. The complaint is recorded with the rule because it is the test of whether
a fix actually answers it.

**UI-16 — one action row per state.** *Enforced.* Give each state a single row
of actions and hide the ones that do not apply; do not render them disabled,
and do not strand one under a heading while the rest sit below. Two visible
`ActionGroup`s in a row is the shape of the defect, and a component may not
build them as adjacent siblings. *From Settings → Credentials, where a dead
Refresh/Disconnect row sat under Connect while disconnected; he said it was
something "the app keeps doing".* Checked in `tests/ui-rules.test.js`.

**UI-17 — nothing on screen explains itself.** *Enforced for registries, by eye
elsewhere.* No menu-entry descriptions, no section intros, no capability
blurbs, no caveat footnotes. Ship headings, labels, controls and values. Text
earns its place only by doing work: live status, an error and what to do about
it, an empty state, a consequence that is not visible before it is
irreversible, and a rule that decides what a value must contain. A registry
entry carries no prose field at all. *From the Tools menu's "Follow Gmail and
ESPN automatically", which he then generalised to every screen.* The registry
half is checked in `tests/ui-rules.test.js`; the rest is read on the screen.

**UI-18 — never announce a state the screen is already showing.** *By eye; the
mechanical half is enforced.* An open section shows its records; it does not
print a banner naming the state or counting down an idle window. The status
line is for what cannot be seen — what is required, what is in flight, what
failed — and it is empty and collapsed otherwise. *In his words: "don't ever
say 'unlocked' — just be unlocked."* That an emptied line carries no tone and
no space is checked in `tests/status-tones.test.js`; that nobody writes the
banner in the first place is read on the screen.

**UI-19 — never ask for detail that changes nothing.** *By eye.* Before adding
a confidence warning, a clarifying question or a "for better results" hint, name
the downstream value that would change if it were answered. If there is none,
drop it. Tie a reading's confidence to the field the result depends on, never
to fields a model happened to leave empty. *From Best card, where typing `Gas` —
one of the categories cards compete on — returned a low-confidence warning and
asked him to confirm the merchant.* Look at every hedge on a changed screen.

**UI-20 — describe it, do not fill it in.** *By eye.* A create or edit surface
leads with one free-text box and one primary action, and resolves a rough
description into the record. The fields stay behind a disclosure as reviewable
detail; an ambiguous description offers the real candidates rather than
guessing; the save stays explicit and a manual path survives with no AI
connection. *From Best card's "Add or edit a card", which opened on an exact
name field and a column of empty rate fields: "I want to be able to say what I
think the card is then you find it and match it."* Look at every create and
edit surface the change touches.

**UI-22 — everything that expands opens the same way.** *Enforced.* One idiom:
the summary takes the `--open-band` tint at the head of a bounded block on the
surface, and where the block ends is where the section ends. A record that
opens is not a special case — a card and its benefits, a program and its
offers, a travel record and its number all open into the same block as a panel
of figures does. No sheet carries an exception list. *"The breakdown is OK — I
like this concept, you should use that inset everywhere there's an expandable
thing."* This answers what was UI-Q3, and the check is the absence of the
exclusions that used to sit in `travel.css`.

**UI-23 — decoration sits behind the figures and stays behind them.** *By eye.*
A bar drawn under a row to show a proportion is lighter than every rule and
every tint drawn in front of it, and it is never the same tone as a heading
band or a hover. It is `--share-bar`: sage carried most of the way back to
paper. *"The graphs are ok but make them a little lighter."* Look at a
breakdown with a long tail, where the small bars have to stay legible without
the large ones shouting.

**UI-24 — no control whose other answer answers nothing.** *By eye.* Before
shipping a switch, name what the second option tells the reader that the first
does not. If the answer is "the same figures, arranged differently", there is
no choice to offer: pick the good one and delete the control. A view that will
deserve a richer treatment later gets that treatment later, not a placeholder
toggle now. *"For Value over Time — just have quarterly."* Look at every
segmented control and period switch on a changed screen.

**UI-25 — uppercase is for a label the product chose, never for a name.** *By
eye.* `BY LIQUIDITY`, `AIRLINES`, `TODAY` are category labels this product
wrote, they are short, and uppercase with tracking is what makes them read as
labels. A heading that carries something the owner named — a trust, a person, a
portfolio, a card — is set in sentence case, because a long proper name in caps
is a wall a reader has to spell out. *"The names of the trusts are too long in
this listing and they don't need to be all caps, but it's just harder to parse
all this text."* Look at any run of records headed by a name.

**UI-26 — what is owed is in parentheses, in red, never behind a minus sign.**
*Enforced.* A negative amount reads `($15,835)` and carries the negative ink. A
minus sign in front of a currency symbol is a hyphen the eye skips, and the
figure then passes for an asset. It is not a status tone: no mark, no surface,
only the red. One formatter does this, `money()` in `ui.js`, and no other
module builds a currency format of its own. *"Use parens not minus sign for all
liabilities. Make it a shade of red."*

**UI-27 — a column of money ends on one edge.** *Enforced.* A list of figures
is read down its right edge, so every figure in it ends on the same one and a
group's own total is one of them. The lines that carry them reserve the slot
their row actions ride in from one shared declaration, because two
declarations drift. A heading does not get a layout of its own: at sidebar
width the amount and that slot leave under 80px, which is not a name. *"In Net
Worth — this looks terrible — overlapping numbers and misaligned numbers."*
This was a regression 0.6.215 introduced by giving the portfolio heading two
columns of its own: the total landed 104px right of the figures it totalled,
and a trust's name broke into three lines with the total jammed against them.
A list of quarters broke the same edge from the other end: the shared rule that
hides an empty footnote took away the slot a change rides in, so the first
quarter of a series — the one with nothing to compare against — ended its
amount 88px right of every quarter under it.

**UI-28 — a list of groups opens one group at a time.** *By eye.* Where a list
is groups of records — portfolios and their asset classes, years and their
filings, programs and their offers — the group is closed to its own heading and
opens on its own. The closed heading carries everything the group would
otherwise hide: its name, what kind of thing it is, its own number, and any
fact about the group a reader would need before deciding to open it, such as a
date behind the rest of the list or a change still waiting to sync. Which
groups are open survives a redraw, because these lists refresh themselves while
they are being read. *"I think you could have entity level numbers and an
option to expand per entity vs showing everything at once."* Look at the list
closed, with one group open, and after a refresh.

**UI-29 — a rule closes the whole heading.** *Enforced in part.* Everything
that belongs to a heading is above the rule that closes it — its name, its
tag, its date — and the rule runs the width of the list, not the width of the
words. A border on inline text underlines the words and stops where they stop,
so the rule goes on whatever holds the heading and never on the title itself.
*"The way Trust goes onto another line below the horizontal for Berry 2020
Descendants' Irrevocable Trust isn't good."* The title carrying no border of
its own is checked in `tests/ui-rules.test.js`; that the right container
carries one is read on the screen.

**UI-30 — nothing sits on a rule.** *By eye.* A hairline separates two things,
so both of them stand clear of it: at least 4px under a rule before whatever it
introduces, and no less above it than below. A figure printed hard against the
line above it reads as though it belongs to the line rather than to the list.
*"The way the elements under each line are almost touching the lines isn't
good."* Look at every group heading in a reading and in the ledger, at the
narrow width where the padding is tightest.

**UI-31 — an override out-specifies; it never relies on sheet order.** *Enforced
in part.* Two rules of equal weight are decided by which sheet comes last, and
a sheet's position is not something it can know: `gifts.css`, `sizes.css` and
`reminders.css` each import `travel.css`, and the side panel loads all three
after `finance.css`, so the shared rules are re-inserted after every sheet that
means to override them. An override of a shared rule therefore carries the host
class — `.travel-wallet .group-name>.record-group-title`, not
`.group-name>.record-group-title`. *"Now it looks really bad with all the extra
horizontal lines."* The known tie is checked in `tests/ui-rules.test.js`.

**UI-32 — a harness loads what its host loads.** *Enforced.* A preview that
links three of the side panel's eleven sheets is showing a cascade the owner
never sees, which is exactly how UI-31's tie reached him twice. Every harness
for a side-panel screen links `tests/panel-cascade.css`, one file holding the
panel's sheets in the panel's order; the check compares that file to
`sidepanel.html` and then requires every harness to use it. The three that
preview another host — the settings site, the restaurant workspace — name that
host in the check and are compared against it instead.

**UI-33 — verbs ride on the line of the thing they act on.** *Enforced.* A
record's two glyphs sit at the end of its own line, and a group's at the end of
its heading line, because that line is what says which record they would act
on. They never form a row of their own at the foot of the block a group opens:
there they are separated from the name they belong to by every figure in
between, and the rule drawn over them reads as one more boundary in a list that
already has one per row. A portfolio wore them that way for a release —
*"Looks weird when I expand an entity"* — with a hairline and twelve pixels of
nothing between the last figure and a pair of glyphs belonging to the heading
three lines above. Where a heading is also the press that opens the group, the
verbs on it prevent that press rather than moving off it; and where a finger
does the aiming, the verbs take room in the flow, so the heading's name takes
its own line and the total follows underneath in the column the figures land in
(UI-27). Checked on the rendered ledger in `tests/finance-ledger.test.js`.

**UI-34 — an amount is one word.** *Enforced.* The net worth block printed
"$7,496," on one line and "850" on the next in a 374px sidebar, which reads as
seven thousand. A currency figure has no break point a reader can recover from:
the comma that would take the break is the same comma that carries the
magnitude. So the amount never wraps, and what gives instead is the thing
around it — a totals column takes the next row whole, a qualifier drops under
the figure it qualifies, a long account name wraps while the number beside it
does not. `.record-line > .record-figure` had said this since the wallet was
written, but only in `styles.css`, which only the extension loads, and only for
a record line; the phone and every figure outside a record line were left to
chance. It is on `.amount` now, in `travel.css`, which both hosts load. The
check in `tests/ui-rules.test.js` holds the list of classes that render money
and requires each one to declare it.

**UI-35 — sections at one level open the same way.** *Enforced.* The Net worth
tab grew three disclosures — Breakdown, Value over time, Institutions over time
— and then ran the list of entities underneath them as a bare stack of rows
with no head and no bounds. Four things at one level of a screen, three of them
boxes that open and one of them loose text: the loose one reads as the page's
remainder rather than as the section it is, and there is no way to put it away
to reach the three above it. So it is a disclosure too, with the same banded
head and inset block as its neighbours (UI-22). The screen still says which
section it is for by which one starts open — here Entities, since the ledger is
what the tab is opened to read — and a reader who wants it shut can shut it.
This is the reason UI-22 is not only about how a disclosure looks: a screen
whose sections do not agree on whether they are sections is uneven before any
of them is drawn. Since the ledger moved to its own page (UI-45) the same rule
is kept the other way round: there every section — Allocation, Entities, Value
over time, Private investments, Real estate, Institutions over time — is a
heading over what it names and none of them has to be opened, because a page
that wide has no reason to put anything away. Checked on the rendered ledger in
`tests/finance-ledger.test.js`.

**UI-36 — a band reaches both edges of its block.** *Enforced.* An open
record's banded head is pulled out over its block's 8px padding with
`margin-inline:-8px`. The travel wallet's record toggle is a button with
`width:100%`, and a negative margin moves a fixed-width box rather than
widening it: the band slid 8px left and stopped 16px short of the right edge,
leaving a sliver of block beside it. *"When I click Alamo the dropdown bar
doesn't go all the way to the right, it looks goofy."* Every rule that bleeds
sideways declares `width:calc(100% + <left + right>)` alongside the margin; a
fixed-width box such as `.sr-only` is not a band and is exempt. Look at an
open record in Travel and an open panel in Rewards, at sidebar width.

**UI-37 — a way out of a problem appears only while there is one.** *Enforced
for Needs attention.* Every tool swapped Refresh for Connection settings when it
could not load — except Needs attention, which drew both on every visit, so a
clean "6 of 6 sources checked" still sat under a button asking to reconnect.
*"Why is 'Needs attention' asking me for connection settings here — this should
only come up if there's a problem."* A tool shows Refresh while it is reaching
its records and Connection settings instead of it when there is no token or not
one source answered; a partial failure keeps Refresh, since retrying is the
remedy. Checked in `chrome-sidebar/tests/attention-tools.test.js`; the other
tools' `loaded ? Refresh : Connection settings` is read in their controllers.

**UI-38 — never ask for what the app can find out.** *Enforced for Best card
research and Subscriptions.* A value the app can look up — what a point is worth, a card's
rates, a date it already knows — is looked up and filled in, and the owner is
asked only for what nobody but the owner knows: a remaining cap, whether a
bonus was activated. A form never opens itself to demand a field research
could have answered, and saving never refuses for want of one. *From Best card,
where researching J.P. Morgan Reserve opened every field of Card terms and
refused to save until he typed a cents-per-point figure: "'Enter your
redemption value in cents per point' is a thing you can figure out."* And from
Subscriptions, which would not read a statement until an account nickname had
been typed — the statement names its own card — and asked for a country before
it would look for cheaper plans, which the browser already says: *"why do I
need to give the statement a nickname to upload it?"* Checked in
`tools-api/tests/cards.test.js` and `chrome-sidebar/tests/subscriptions-tool.test.js`;
look at every other create surface for a field it could fill itself.

**UI-39 — evidence for someone else is a Copy button, not a transcript.**
*Enforced for Finance's page reading.* Diagnostic text — what a reading took
off a page, what the page was built out of — is for pasting into a
conversation about why something failed, not for reading in a sidebar. It is
one "Copy …" button beside the action that produced it, shown only when that
action came back empty, and never a disclosure holding a dump of it. *From
Finance, where an iCapital reading failed and he copied the whole "What was
read" disclosure by hand: "what was read should just have a copy button."*
Checked in `chrome-sidebar/tests/finance-snapshot.test.js`; the only other
dump of this kind is the Settings playground output, which already has Copy.

**UI-40 — a form asks only what the chosen kind has.** *Enforced for Finance's
investment forms.* Where a choice on a form changes what the record is, the
fields that follow are the ones that kind of record has, named the way the
owner names them for that kind. A field with no answer for the chosen kind is
hidden, not left for him to fill with zero, and a default that belongs to
another kind — the class a new record starts in — moves with the choice.
*From Finance → Enter by hand, where a Direct Equity Investment still asked
for a commitment, a capital account and unfunded capital under Fund
investments: "this isn't really a fund investment. It's just an investment I
made in a company one time."* Checked in
`chrome-sidebar/tests/finance-investments.test.js`; the statement review uses
the same field list, and the Figure and Property forms have no such choice.

**UI-41 — a list of classes holds only classes.** *Enforced for Finance's
portfolios.* A portfolio is read down its asset classes, one name and one
amount a line. A single holding set among them — a fund with a legal name that
wraps over three lines, a kind-word and a date trailing it, and four flows hung
underneath — is a different kind of thing in the same column and stops the
column. So holdings are grouped under one line for their class, the way houses
are under Real estate, and open from it; inside, a holding is its own name,
with no vehicle word run onto it, and its figures read down one to a line
with each one's name beside it — never run together with middots into a
sentence that wraps wherever the width falls. *From Finance → a portfolio holding the Vista
Equity Partners fund: "This looks so goofy - the way Vista is listed." And
of its figures on one wrapped line: "Jamming it all into one line is silly."* Checked
in `chrome-sidebar/tests/finance-investments.test.js`; Real estate was already
shaped this way.

**UI-39 — fine print is set below what it qualifies.** *By eye.* A list of
found things reads as names and amounts: the name, what it is worth in ink,
and conditions smaller and muted beneath it — never three lines of equal grey.
A review sitting inside an editor draws no box of its own; the editor is the
boundary. The page a reading came from sits with the thing it describes, not
after the last item. *From Rewards' card research, where two benefits of the
J.P. Morgan Reserve came back as a boxed wall of same-weight paragraphs: "the
formatting is a bit off."* Look at every research review — Rewards' card
intake and Best card's summary — at sidebar width.

**UI-42 — what has happened is not offered again.** *Enforced for Finance's
and Subscriptions' statement intake.* A button offers what has not been done yet, and a status
line says what is true now. Finance took a dropped statement, said "Ready to
read." and waited for a press on "Read this"; after the press both stayed on
the screen, above the figures they had produced. Dropping a statement is
asking for it to be read, so it is read on arrival, the way Taxes names a
document on arrival. Read appears only for a file that could not be read —
offline, or a reading that failed — and a file whose figures are saved or
discarded leaves with them. *"I've already read the document - so 'Read this'
is strange."* Checked in `chrome-sidebar/tests/finance-investments.test.js`.
Subscriptions kept "Ready to read." and a Find recurring charges button, on the
grounds that a nickname and the editable text had to be settled first; UI-38
and UI-47 took both away, so it reads on arrival too, and its file leaves once
what it found is in the list. Checked in `subscriptions-tool.test.js`.

**UI-43 — a review's actions are the bare verbs.** *Enforced for Finance's
reviews and Rewards' card research.* Under a list of what is about to be
saved, the button is Save, beside Edit and Discard. The list is what it
saves; "Save these capital accounts", "Save these figures" and "Save this
card and 12 benefits" said it again, counted it, and grew a clause for every
way a save could go. *"'Save these capital accounts' is also weird - it's
just, like, 'Save'."* Checked in `chrome-sidebar/tests/finance-snapshot.test.js`,
`finance-investments.test.js` and `rewards-tool.test.js`. A form whose
button names its record — Save figure, Save reminder — is not a review and
is not covered.

**UI-44 — a reading reports only what went wrong.** *Enforced for Finance's
intake prompt.* What a model could not read is worth a line when the owner
would otherwise expect a figure that is not there; it is shown as something
to act on, so it says nothing when nothing is missing. A capital account
statement that read cleanly came back with a warning naming its fees, income,
opening balance and amount over or under paid — every one of them a figure
the prompt tells the model to leave out, or a part of the capital account it
did report. *"The warning message is strange. Unless it's an issue don't
show it."* The prompt now says so, and `tools-api/tests/finance.test.js`
holds it. The device's own "Left out: a total across accounts" was the same
line from the other side — a headline total, a gain, a credit limit, a company
the roster keeps out, refused because they should be and printed in the alert
tone under nearly every page reading. It is now said only when a reading found
nothing, where it is the explanation; `finance-snapshot.test.js` holds that.
Rewards already showed its unread line only when a page gave nothing.

**UI-45 — a side panel answers; a page holds the detail.** *Enforced for
Finance.* The side panel is a column beside the page the work comes from, and
a ledger of seven entities, forty class lines, a run of private positions and
a table of quarters read down it one disclosure at a time is a ledger nobody
can compare anything in. *"Rather than jamming everything into the sidebar of
finance, you can show net worth and stuff, and let me enter investments in the
sidebar, but when I want to look at details open a special extension-managed
page."* So the panel keeps what it all comes to — the net figure and its date,
what is owed against it, how much could be sold this week, each entity's total
— and every way a figure gets in; **Open details** brings `finance.html` to
the front, or opens it, where the same records are laid out at a width that
makes them comparisons: the figure beside the line it has drawn, the classes in
two columns under one bar, the private positions as a table, the houses with
what is left of each. The panel does not carry the detail again, and the page
is also what the phone shows, since it has no second page to send anyone to.
The next panel tool that grows a ledger is the next case: its answer stays in
the panel and its rows go to a page. `tests/finance-ledger.test.js` holds that
the panel builds no entity list, table or series, and that Open details is
there only where a page can be opened.

**UI-46 — a glyph alone carries a verb on its own record.** *Enforced.* Edit,
Delete, Show, Copy, History: each acts on the record whose line it sits at the
end of, so the glyph and the line between them say what would happen. Adding
is not one of those. It makes a different record, and a + cannot say which —
on an institution's card it sat just left of the balance, where it read as the
balance's sign rather than as "record cash moved in or out of UBS". *"The plus
icon in the finance view isn't super intuitive."* So an action that makes
something new under a record is a word that names it — **Record cash in or
out** — revealed with the card's verbs on a pointer and always shown to a
finger. `ui.js` exports no glyph for adding, the glyphs it does export are a
closed list in `tests/ui-rules.test.js`, and `finance-overview.test.js` holds
the card's verb to its words.

**UI-47 — a dropped file is shown as itself.** *Enforced.* Subscriptions took
a statement and poured the text the device pulled out of it into a box on the
screen, a year of card lines run together, as though the owner were meant to
proofread it before the reading could start. *"Why is it giving me the text
like that?"* That text is the reading's input; what the reading found is what
the owner reviews. So a dropped file appears as one card — its name, a few
words on what came out of it, and Remove at the end of the name's line — and
the only thing said beyond that is what went wrong with it. Finance and Taxes
each drew that card for themselves, under two names; there is now one,
`AttachmentCard` in `ui.js`. `tests/ui-rules.test.js` holds that no component
draws a card of its own for a file, that every tool opening one shows the
shared card, and that none writes the extracted text into a field.

**UI-48 — what is not known is left off the line.** *Enforced for
Subscriptions.* A record's line under its name is read for what it says, so
every word on it is a fact: the cycle, the card, the next date. Subscriptions
printed "Review · $895.00 · Not established · Amex Platinum" — the state
nobody needed told, the price in the middle of the words, and a placeholder
for a billing cycle it did not know. *"This looks junky."* An unknown is
omitted, the price stands in the column where a list's amounts are read down
(UI-27), Active — the ordinary state — is not said, and a state that asks for
something ("Possible subscription") leads the line. A choice list may still
name the unknown ("Not known yet"), because there it is an option to pick.
Checked in `chrome-sidebar/tests/subscriptions-tool.test.js`; look at any list
that joins its fields with a dot for a placeholder standing in for a value.

**UI-49 — a reading is drawn as a reading.** *By eye.* The home screen's
weather was set exactly like the runs under it: an uppercase heading carrying
a place name in capitals, the advice as a bold row, the day's range as grey
fine print beneath it, and the umbrella ruled off as a second record. *"Make
it look nicer."* What it lacked was the look of the thing it was — one reading
of one day. So a screen's single figure (the weather, the net worth a panel
opens on) is its figure: set in Georgia at the panel's 24px lead size, with
what it describes and where set small beside it, and what follows from it —
the jacket, the umbrella and when — hung underneath in the rows' own ink. It
takes no group heading, because the figure says what it is, and no rules,
because nothing in it is a list. A picture belongs only where it is
information: the weather's sky glyph is what the day looks like before a word
is read. A long name in it stays in sentence case (DESIGN.md, record layout).
`chrome-sidebar/tests/home.test.js` holds that the weather has no heading and
no rows; look at the next single figure a screen opens on for the same drift.

**UI-50 — money is typed the way it reads.** *Enforced.* Finance's Enter by
hand showed a capital account's current value as 4384000 — seven digits to
count, in a form whose every other figure the app prints as $4,384,000 — and
refused 4,384,000 if the owner typed the commas himself. *"When entering dollar
amounts by hand include commas etc as they come in."* A box money is typed into
is `Field` with `kind:'money'` in `ui.js`: it groups thousands as each digit
arrives, keeps the caret after the digit it was after, shows a figure filled in
from a record the same way, and reads back as the plain number, so no
controller strips commas and none can forget to. A browser number input cannot
hold a comma at all, so a money box is never one. The check builds every form
that takes money — Finance's four, its two reviews, Cards and Subscriptions —
and requires each figure's box to be the shared field, and requires the same of
any field whose placeholder is `0.00`. Look at the next form that asks for a
price, a balance or a limit.

## Open

**UI-Q1 — what is the spacing scale?** DESIGN.md says 4px increments. The
compact density the owner asked for uses 2, 3 and 5px throughout, and the
record rules in AGENTS.md say 2–4px within a record. One of the two is wrong.
Decide, write it in DESIGN.md, then replace UI-12 with a check.

**UI-Q2 — is the phone's own sheet in scope?** UI-21 now spans it, because a
focus ring that differs between the hosts is the same defect wherever it is.
The colour and font-stack budgets still stop at the shared component sheets,
and `mobile-app/public/app/styles.css` holds 15 raw hexes and 2 inlined font
stacks outside them. Worse, its `:root` redefines `--ink`, `--line` and
`--accent` to values the shared palette does not use — the phone renders ink as
forest — so bringing it in is a palette decision, not a cleanup.
Either bring it under UI-6 and UI-8 with budgets of its own, or record here why
a host's own shell is exempt.

*UI-Q3 is answered.* The two idioms for an opened record — a `.record-row`
taking the surface, a `.reward-group` taking a rail — are now one: UI-22, the
same inset block a panel opens into.

**UI-Q4 — which sheet owns a shared component's look?** The instance that
raised this is fixed: `.pill` moved out of `styles.css`, which only the
extension loads, into `travel.css`, which both hosts do — measured in the live
phone document, a tag inside the restaurant workspace went from a bare 14px
inline span with no border to 10px, `--line`, 4px. The wallet's own `.pill`
override turned out to be the same declarations under the wallet token names
and was deleted, so one tag is drawn once.

The rule behind it is still open, because the size of the problem is not
known. A static scan says 67 of the 129 classes `ui.js` emits are styled only
in the extension's sheet — but `ui.js` ships whole to the phone, so that count
cannot tell a component the phone renders from one it merely carries
(`ranked-player` and `connection-card` will never appear there). Answering it
means walking the phone's screens and scanning the rendered DOM for classes no
loaded sheet matches. Until then, a component that both hosts render is styled
in a sheet both hosts load, by precedent rather than by rule.

**UI-Q5 — when may a word break in the middle?** A trust's position read
"Opportunit / ies GP I LLC" in the 280px sidebar, because `.travel-wallet` sets
`overflow-wrap:anywhere` once at the top of the wallet and it inherits to every
name under it. `anywhere` also makes a flex item's min-content one character
wide, so the name column collapses further than it needs to and breaks words
that would have fit on a line of their own; `break-word` breaks only a word
that genuinely cannot fit. But `anywhere` is right for the things that have no
word boundaries — a masked account number, a URL, a monospace token — and there
are 32 declarations of it across the two hosts' sheets, some of each kind.
Sorting them is a pass of its own with a 280px sweep behind it, not a token
swapped in a shared sheet. Decide which classes hold text with words in it,
give those `break-word`, and make the rest a ratcheting budget.

## Iterating

- **Lowering a budget** is the ordinary way a ratcheting rule progresses: fix
  the cases in one sheet, drop that sheet's number to what is left, commit both
  together. A budget that reaches zero becomes an enforced rule and moves up.
- **Raising a budget** is a decision, not a fix. It needs a line in the test
  saying which rule the new case is exempt from and why, and it should be rare
  enough to argue about.
- **Adding a rule** means naming the drift, saying what the check is, and
  giving it a status. A rule with no check is **by eye** and names the screen
  to look at; a rule that cannot name one is an **Open** question instead.
- **Retiring a rule** is allowed when the canon changed. Say so in DESIGN.md
  first, because that is where the reasoning lives; this file only records the
  rule and its check.
