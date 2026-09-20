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
| **UI-2** | An open disclosure is marked. Its summary wears `--open-band` at the head of a bounded block, the band differs from the tint a row takes under the pointer, and the marking lives in the two shared sheets rather than in a feature. | `tests/components.test.js` |
| **UI-3** | One status vocabulary. The four tones are the whole set, each owns one colour and one mark, a cleared line carries no tone, and only an error fills a surface. | `tests/status-tones.test.js` |
| **UI-4** | No feature identifiers in the shared sheet. `styles.css` styles component classes; an `#id` selector there means a feature reached into the design system. | `tests/components.test.js` |
| **UI-5** | No markup outside components. Feature code supplies state and actions and never builds elements, sets `innerHTML`, or writes controls into an HTML shell. | `tests/components.test.js` |

## Ratcheting

Budgets live in `chrome-sidebar/tests/ui-rules.test.js`, one number per file,
and cover the shared component sheets under `chrome-sidebar/src/components/`.
`tokens.css` and `status.css` are the two palette files and are exempt from the
colour rule, because defining the palette is what they are for.

| | Rule | Budget when written |
| --- | --- | --- |
| **UI-6** | Colour comes from a token. A raw hex in a component sheet is a colour that cannot be retuned, cannot be reused, and will not match the next thing that needs the same tone. | 166 |
| **UI-7** | Nothing is set below 10px. Metadata is 10–11px and body text 12–14px; 7, 8 and 9px type is unreadable at arm's length and is not density, it is loss. | 16 |
| **UI-8** | One system font stack, held in the `--sans` token. Nineteen inlined copies of `-apple-system, BlinkMacSystemFont, …` were nineteen places to forget when the stack changes, and two of them had already lost `"Segoe UI"`. | 19, now **7** |
| **UI-9** | Corners come from the radius set: `0`, 4, 6, 7, 8, 12 and 14px, `50%`, `999px`, and the `--radius` and `--control-radius` tokens. 7px is the inner curve of an 8px box with a 1px border, and nothing else. | 22 |

UI-8's remaining seven are `travel.css` (4), left alone because another session
was editing it, and `capabilities.css` (3), which needs `@import tokens.css`
first: `data.html` loads that sheet with no palette at all and leans on its
`var(--ink, #173e37)` fallbacks, so a bare `var(--sans)` there would set no
family. Bringing that page under the palette is the next pass, and it belongs
with UI-6 rather than UI-8.

Budgets are measured against the committed file. Several sessions edit these
sheets at once, and a number taken from someone else's half-finished cleanup
fails the suite for everyone at HEAD.

## By eye

| | Rule | Where to look |
| --- | --- | --- |
| **UI-10** | One state vocabulary, and no two states alike. Hover only where a pointer aims, and lighter than open or selected; focus-visible always the 2px forest outline; disabled at half opacity with the default cursor; a toggle's open state visible without hovering it. | Every changed control, in all of its states |
| **UI-11** | A heading is never smaller or paler than what it heads. A category over a run of records carries at least the size and the ink of the rows inside it, told apart by weight, a rule, or space. | Any screen with a run of records |
| **UI-12** | One spacing scale per screen: 2–4px inside a record, 8–12px between groups. Gaps within a group are always smaller than gaps between them. | The full scroll, not a cropped component |
| **UI-13** | Hit targets hold: 44px for touch form controls, 32px for the actions inside an expanded record. A row of glyphs is drawn to its line only where a pointer does the aiming; a finger keeps the touch size. | Sidebar and phone, hover and touch |
| **UI-14** | Every visual boundary explains a relationship. No card inside a card, no shadow that separates nothing, no rule with nothing under it. | Wherever a boundary was added |
| **UI-15** | Reviewed at the real sizes with no horizontal overflow: 380px and the 280px sidebar minimum, 390px and 320px on the phone, and a desktop viewport for full-tab pages. | [VISUAL_QA.md](VISUAL_QA.md) harnesses |

## Open

**UI-Q1 — what is the spacing scale?** DESIGN.md says 4px increments. The
compact density the owner asked for uses 2, 3 and 5px throughout, and the
record rules in AGENTS.md say 2–4px within a record. One of the two is wrong.
Decide, write it in DESIGN.md, then replace UI-12 with a check.

**UI-Q2 — is the phone's own sheet in scope?** `mobile-app/public/app/styles.css`
is outside every check above and holds 18 raw hexes and 2 inlined font stacks.
Either bring it under UI-6 and UI-8 with budgets of its own, or record here why
a host's own shell is exempt.

**UI-Q3 — how does an opened record mark itself?** Two answers ship today: a
`.record-row` whose toggle is expanded takes the surface and a top-rounded
radius, and a `.reward-group` takes a chevron and a rail down its contents.
Both read; having both means a reader learns the idiom twice. Pick one, or say
what distinguishes the two cases.

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
