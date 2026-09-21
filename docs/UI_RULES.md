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
| **UI-27** | One column of money: every figure in a list ends on the same right edge, a group's own total included, and the lines that hold them reserve their row actions' slot in one shared declaration. Stated in full under [From a complaint](#from-a-complaint). | `tests/ui-rules.test.js` |

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
