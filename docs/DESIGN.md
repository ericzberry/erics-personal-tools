# Eric’s Personal Tools

A quiet, personal workspace. Warm paper, deep forest green, and a little brass. The tools should feel like parts of one considered product.

Read [UI_COMPONENTS.md](UI_COMPONENTS.md) for shared components and the sidebar, mobile, and full-tab guides. Use [VISUAL_QA.md](VISUAL_QA.md) for acceptance.

## Visual language

| Token | Value | Use |
| --- | --- | --- |
| Paper | #f7f6f2 | Page background |
| Surface | #fffefa | Cards and fields |
| Forest | #173e37 | Brand, primary actions, selected states |
| Ink | #203b33 | Main text |
| Muted | #626f67 | Supporting text |
| Sage | #e8eee5 | Status and personal selections |
| Brass | #ad8050 | Small decorative accents; never body text |
| Line | #dedfd5 | Quiet separators |

Georgia gives titles and large numbers an editorial character. The system sans-serif keeps controls and explanations readable. All fonts are local. Body text is 12–14px, metadata 10–11px, sidebar headings 20–22px. Uppercase labels are used sparingly.

Use 4px spacing increments and 14px sidebar gutters. Controls use 6px corners; avoid cards unless a boundary explains a relationship. Prefer whitespace and borders to shadows. Keep content usable at 280px. Provide clear keyboard focus, native controls and reduced-motion support.

## Shared shell

A 42px header pairs the Eric’s tools signature with the current function. The active browser tab selects the function automatically; do not add function tabs. Each tool has a compact heading. Put secondary information such as league rules behind a disclosure. Use the action hierarchy below, and one dominant recommendation at a time. Keep supporting explanations behind disclosure controls. Empty states explain one next step; they never pretend to show live data.

The implementation tokens live in chrome-sidebar/src/components/tokens.css; styles.css and each standalone shared stylesheet import them. Reuse these names and values in future subprojects. No external fonts, tracking, or third-party UI assets are needed.

## Writing

Short, specific, calm. Lead with the result. One sentence of context is usually enough. Label unfinished tools honestly. Avoid technical implementation details in normal user flows.

Money is written by `money()` in `ui.js` and nowhere else: whole dollars above a thousand, cents below it, and a negative in accounting notation — ($15,835), in the danger red, never -$15,835. A minus sign in front of a currency symbol is a hyphen the eye skips, and what is owed then passes for an asset. It is not a status tone: no mark, no surface, only the ink.

The next draft recommendation gets a small highlighted card at the top. Keep the name and position immediately readable; reasoning belongs below. Gmail shows the current subject, two action buttons, and editable results without a large hero or introduction.

File inputs use the reusable file-drop component: a quiet dashed surface, drag highlight, click/keyboard browsing, and inline status. Keep the native input hidden. Use concise copy and put optional board maintenance behind a disclosure. The draft source gets one short line rather than a large explanatory card.

All extension UI must be composed from the [shared component library](../chrome-sidebar/src/components/README.md). The rule is recorded in chrome-sidebar/AGENTS.md and enforced by architecture tests. Feature controllers supply state and actions; they do not create markup or styles.

Pick history uses the shared compact two-line row: player name, then round/NFL team/fantasy team. Recommendations show a short reason for both options, not only the primary card. The draft board is fixed, so do not display an upload or board-update control there.

## Status tones

Four things can be said about an operation, and each one looks like itself. A
feature never picks a status colour: it picks a meaning, and the shared tone
supplies the look.

| Tone | Means | Look |
| --- | --- | --- |
| Alert | Something to decide or act on: changes waiting to sync, a reading to check, an update ready | Amber `#7b5a1b` text, `!` in a rounded square |
| Error | What was asked for did not happen | Red `#8c2f26` on `#f8eae7`, red rule, `×` in a circle |
| Progress | Work is running right now | Muted forest `#3e564d` text, a turning spinner — the only tone that moves |
| Success | It worked | Green `#245138` text, `✓` in a circle |

Weight follows meaning. A page of filled colour blocks says everything is
urgent and therefore nothing is, so the mark and the words carry the tone and
the line sits on the page's own background. Only an error takes a surface and
a rule of its own, because only an error has to stop the reading.

A tone reports what just happened or what is happening now. A standing
condition the screen is already showing takes no tone at all: a locked section
under its own Unlock button, a disconnected tool asking to be connected, an
offline note saying what still works, or a capability that needs a connection
saved first. Those read as quietly as a caption, in muted ink — as does a
status line that is simply stating what is listed. Amber means alert, so
nothing else may wear it, and a tone is never spent on a state the reader can
already see.

Progress is constant: the spinner turns, or the bar advances, for exactly as
long as the operation lasts. Never announce work with a sentence that appears
once and then sits still, and never leave a spinner running after the work has
finished or failed. A bar is for work with a knowable fraction, a spinner for
work without one; under reduced motion both hold still and pulse instead of
travelling. Clearing a status clears its tone, so a finished operation never
keeps the colour of the last one.

No tone is carried by colour alone: the mark and its shape differ tone to tone,
and the sentence says what happened. An error or an alert is announced
assertively; progress and success wait for a pause.

`setStatus(node, text, tone)` in `chrome-sidebar/src/components/ui.js` is the
only way to write a status line, with `Spinner` and `ProgressBar` for an
indicator placed beside the thing being worked on. The implementation lives in
`chrome-sidebar/src/components/status.css`, which every host imports through
`tokens.css`. Review the four tones together at
`chrome-sidebar/tests/status-tones-preview.html`.

## Controls and action hierarchy

Use role and density together. Do not shrink one button with a feature-specific override or give record actions the same prominence as a form submission.

| Role | Appearance | Use |
| --- | --- | --- |
| Primary | Forest fill, white text | Save, Connect, Add record; at most one per action group |
| Secondary | Paper surface, quiet outline | Cancel, Done, Refresh; alternate paths in a form or settings group |
| Subtle | Text on a transparent surface; background and underline on hover | A quiet action beside a stronger one: Undo, Discard, Remove |
| Destructive | Red text, same size as adjacent actions | Delete uses subtle styling within a record; the final confirmation uses an outline and explicit wording |

Delete names what it destroys: as a labelled button it says so in words, and as a record's own action it is the shared glyph with the record in its accessible name, never a bare “Delete” repeated down a column. Keep confirmation beside the affected record, in words. Hover strengthens a control rather than changing its size. Every button uses the same 6px radius, system font, medium weight, and visible 2px forest focus ring. Do not use shadows, pill shapes, or oversized outlined boxes for record actions.

| Density | Minimum height | Font | Horizontal padding | Use |
| --- | --- | --- | --- | --- |
| Standard | 36px | 13px | 12px | Form and connection actions |
| Compact | 28px | 12px | 8px | Add record and actions inside a record |
| Icon | 28px square, 32px on touch | 16px glyph | Centered | A record's own verbs: Edit, Copy, Copy notes, Delete |
| Filter | 34px | 13px | 10px | The find-record field above a record list |

Touch form buttons and fields have a 44px minimum; expanded record actions have a 32px minimum. Heights are minimums, so labels can wrap under zoom. Use 8px between form actions and 4px between compact record actions. Keep action labels short, concrete, and stable.

### Record layout

A record list is organized by type, not one long alphabetical run. Records group under a category label in the category registry's own order, alphabetically within each group; a group with no records is omitted, and a record whose saved category has since been retired keeps its own group rather than disappearing. A search filters within that structure, so only the groups holding matches remain.

The group label heads its records and is never set below them: 13px sans-serif in full ink, at 600 against the rows' 500. Uppercase with .06em tracking is what makes a label read as a label — but only for a label this product wrote and kept short: By liquidity, Airlines, Today. A heading that carries something the owner named — a trust, a person, a portfolio, a card — is set in sentence case, because a long proper name in caps is a wall a reader has to spell out, and the ledger's trusts run to five words. It is told apart from them by that weight, by its hairline, and by the space around it — not by being shrunk and greyed, which would invert the hierarchy and leave the run reading as rows with a caption stuck above them. Georgia stays with the page title and the record number, so the label never competes with the program names it heads: the label and its rule open the run, a single fine separator divides one row from the next, and 18px separates one group from the next. The last row in a run closes without a rule of its own: it would land a gap above the rule that opens whatever follows — the next group's label, or the editor under the list — and the two together read as a pair of bars rather than one boundary. An empty or filtered-empty list shows only its explanation, never a stray rule.

### Disclosure

A closed panel is a rule and a label in a run of them. An open one is a region:
its summary wears the `--open-band` tint at the head of a bounded block on the
page's surface, so the label that was pressed and everything that came out from
under it read as one thing, and where the block ends is where the section ends.
The band is a step firmer than the sage a row takes under the pointer, so
hovering a closed panel never looks like the open one. The marking belongs to
the panel rather than to a feature: `travel.css` gives the wallet's panels the
block they have no box for, and `styles.css` puts the band on every other
disclosure, whose box is already there.

Without it a panel of figures read as one more heading in a run of headings —
Breakdown is set in the same 13px uppercase as By liquidity under it, and
nothing on the screen said which section the figures belonged to.

Two disclosures are not sections and keep the marking they already have: a
record that opens into a block of its own is marked the way the compact rows
around it are, by its chevron and the rail down its contents, and a panel whose
summary is hidden has no label to head a block with. The quiet inline toggles —
the Tools menu's branch, a draft card's reasoning, a tier already banded in a
colour of its own — take no band either.

### Tabs

Two concepts on one screen are two tabs, not one longer page. A tool that
answers more than one question — what the ledger comes to, and how a figure gets
into it; what you hold, and what the programs are offering — asks the questions
across the top and answers one at a time, so reaching either never means
scrolling past the other. This is inside a tool and has nothing to do with
choosing one: the shell's function still follows the browser tab, and no tool
becomes a tab in the header.

Do not overdo it. A row of labels earns its place only where each tab holds
something worth a screen of its own and the concepts would otherwise bury each
other: a ledger of a dozen portfolios and the ways of adding to it, a wallet and
a catalogue of a hundred offers. A short section, an editor drawer, a group that
fits under what it follows, or a second view that is empty stays where it is —
the row would cost a press and save no scrolling. Most tools hold one thing and
have no row at all, and a tool that has one today gets none the moment its
second tab has nothing to answer.

A tab's label is the heading for what is under it, so nothing inside repeats it
and a group filling a whole panel drops the boundary it needed when it sat above
another group. Every label names a view — `Net worth`, `Offers`, `This page` —
never an action: a row mixing a verb with two nouns reads as a row of buttons,
which is the one thing the strip must not look like.

The strip is text, not controls: 12px labels at their own width against the left
edge, muted, the selected one in forest above a 2px rule, on a hairline that
closes the row. It takes 26px, less than the heading it replaces, and wraps to a
second line rather than clipping or scrolling sideways. A label longer than the
panel is cut with an ellipsis. Where there is no pointer the labels keep a 44px
line. Arrow keys, Home and End move between them, skipping the ones not
currently there.

A tab exists only while it has something to answer: the page in front of the
owner is a tab only while there is one, a catalogue only once one has been read,
the ledger only once it has been asked for. Until the owner picks a tab the
leading visible one is shown, so a tab arriving at the head of the row takes the
lead; once they have picked, nothing moves them but their own tab disappearing.
One visible tab draws no row at all — one tab is not a choice.

`Tabs` in `chrome-sidebar/src/components/ui.js` is the only implementation, with
`tabs.css` beside it; `tokens.css` imports it so every host has it.

### Row actions

A record's own actions ride at the end of its name's line, and a group's own actions at the end of its heading line. They are never a row of words under the record: Edit and Delete repeated beneath every row double the length of a list and end up the loudest thing in it, when the list is there to be read down.

A row action is a verb that repeats down every row and is understood from its glyph alone — Edit, Delete, Done, Reopen, Show, Hide, Copy, Open, History. It is a 26px quiet glyph button (32px where there is no pointer), drawn in muted ink, or danger ink where it destroys something. The glyph carries the verb and the accessible name carries the record: “Delete Cash in Estate”, not “Delete” twelve times down a column. The actions wait at opacity 0 until the row is hovered or holds keyboard focus, and appear unconditionally on touch, where there is no pointer to hover with. A group's actions answer to its heading line alone, so pointing at a group does not light up every record inside it.

In a list of money the right edge belongs to the money. A row's verbs wait at opacity 0 until the row is pointed at, so holding a fixed slot open for them ends every figure short of the edge and leaves a column of totals hanging over a void; on a pointer they float just left of the figure they act on, on the row's own ground, and nothing reflows as they appear. A finger has no hover and sees them always, so on touch they stay in the flow and keep the slot that holds the column. A record that opens into a block keeps its own verbs inside that block, ruled off at its foot, where they are shown rather than waiting to be found.

What one record is asking to have decided is not a row action. A delete confirmation, a sync conflict, a decision only some records are raising — each needs a sentence, so it opens in words inside the record that raised it, under that record's line and nowhere else. A record that opens into a block of its own, like a travel record, keeps its actions inside that block instead — still glyphs, still at the end of a line, on the line of the value the record was opened for.

A collapsed record is a compact row: 13px program name, optional 11px traveler, then a copy icon. Its disclosure marker is a small stroked chevron in a fixed right-hand column, quiet line color, pointing right and rotating down when the record opens. Never append a marker character to the name: markers must align in one column whatever the names are, and a long name that wraps keeps its marker centered on the row. Respect reduced motion when it turns.

An open record is one contained block, not text floating between two rules. It takes the surface fill with 6px top corners, and its number, metadata, actions, and any delete confirmation sit inside that block on the same left edge as the collapsed rows.

Inside the block the number takes a line of its own at 12px tabular 500, spaced .01em so it can be read back a digit at a time: one step under the name above it and in the same weight, never over it. The list is read down its programs' names and the number is what one of them was opened for, so a number set larger or bolder than its own record's name makes the row a label with a headline hanging under it. The record's verbs ride at the end of that line as [row actions](#row-actions) — Edit, Copy, Copy notes where there are notes, then Delete in danger ink — so Copy sits beside the value it copies. A rule under the number with the words Edit, Copy notes and Delete in a strip beneath it made a three-banded card of every opened record, and left a number nobody had asked to read yet the loudest thing on the screen; the line closes the block instead. Detail the surrounding list does not already state follows at 12px: the category belongs to the group label, and the traveler to whichever of the collapsed row and the open block is not already showing it. A metadata line with nothing to say is removed, never left as an empty gap. Only what the record is asking to have decided stays in words — its delete confirmation, its sync conflict — under the number it was raised against.

A find-record field is a filter, not the page's main control. Keep it at the Filter density with the quiet `Line` border, separated from the list by 12px, and never let it outweigh the rows it filters. The shared `.form-field` control rules are more specific than a bare element selector, so a compact override must match `.form-field > input` specificity to take effect; verify the rendered height rather than trusting the declaration.

A tool heading is 22px Georgia. When it carries one primary action, that action sits on the opposite end of the heading row, aligned to the right edge of the content below it, never crowded against the title.

In the extension a closed row carries nothing but the name, its traveler and the chevron: the number and its verbs arrive together when the record is opened, so nothing is copied out of a row nobody looked at and the markers stay in one column however many verbs a record has. In the unlocked mobile wallet the number is always under its program name, carrying that same line of verbs, and the disclosure keeps the rest of the record's detail. Mobile numbers are set like the extension's; do not add another traveler line to every collapsed mobile row. Icons retain accessible names and tooltips. A search field may use a visually hidden associated label and the visible placeholder “find record.” Routine successful synchronization has no banner; pending changes, errors, and offline state remain discoverable. Connection maintenance belongs in Settings.

### Implementation and scope

`Button` in `chrome-sidebar/src/components/ui.js` accepts a role through `variant` and a density through `size`. Use `size: 'compact'` with `primary`, `secondary`, `subtle`, `danger-subtle`, or `danger`. Use `RowAction` with `COPY_GLYPH` for number copying. Do not supply custom padding or a feature-specific button class.

The wallet implements these tokens in `chrome-sidebar/src/components/travel.css`, shared unchanged by extension and mobile. This update applies the guide to the wallet; existing draft and Gmail screens keep their current styles until reviewed against the guide. New or revised controls should use this hierarchy rather than copying legacy one-off rules.

Review both collapsed and expanded rows, forms, confirmations, hover, keyboard focus, disabled states, 280px sidebar and phone layouts. Use synthetic records only. A passing build alone is not a visual review.

Which of these rules a test actually holds is recorded in [UI_RULES.md](UI_RULES.md), with a budget per stylesheet for the drift that is still on the screen. This file stays the canon: when a rule and this guide disagree, change the guide first and the rule after.

Configured mobile passkeys are invoked automatically on entry. Show only a brief opening state while the device verifies; show a retry control only after cancellation or failure. Native biometric or device-passcode verification remains in place. Do not display routine “Up to date” messages anywhere.
