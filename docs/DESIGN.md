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

The next draft recommendation gets a small highlighted card at the top. Keep the name and position immediately readable; reasoning belongs below. Gmail shows the current subject, two action buttons, and editable results without a large hero or introduction.

File inputs use the reusable file-drop component: a quiet dashed surface, drag highlight, click/keyboard browsing, and inline status. Keep the native input hidden. Use concise copy and put optional board maintenance behind a disclosure. The draft source gets one short line rather than a large explanatory card.

All extension UI must be composed from the [shared component library](../chrome-sidebar/src/components/README.md). The rule is recorded in chrome-sidebar/AGENTS.md and enforced by architecture tests. Feature controllers supply state and actions; they do not create markup or styles.

Pick history uses the shared compact two-line row: player name, then round/NFL team/fantasy team. Recommendations show a short reason for both options, not only the primary card. The draft board is fixed, so do not display an upload or board-update control there.

## Controls and action hierarchy

Use role and density together. Do not shrink one button with a feature-specific override or give record actions the same prominence as a form submission.

| Role | Appearance | Use |
| --- | --- | --- |
| Primary | Forest fill, white text | Save, Connect, Add record; at most one per action group |
| Secondary | Paper surface, quiet outline | Cancel, Done, Refresh; alternate paths in a form or settings group |
| Subtle | Text on a transparent surface; background and underline on hover | Edit and Copy notes within an expanded record |
| Destructive | Red text, same size as adjacent actions | Delete uses subtle styling within a record; the final confirmation uses an outline and explicit wording |

Delete is always labeled; it never becomes an ambiguous trash icon. Keep confirmation beside the affected record. Hover strengthens a control rather than changing its size. Every button uses the same 6px radius, system font, medium weight, and visible 2px forest focus ring. Do not use shadows, pill shapes, or oversized outlined boxes for record actions.

| Density | Minimum height | Font | Horizontal padding | Use |
| --- | --- | --- | --- | --- |
| Standard | 36px | 13px | 12px | Form and connection actions |
| Compact | 28px | 12px | 8px | Add record and actions inside a record |
| Icon | 28px square | 14px glyph | Centered | Copy number |
| Filter | 34px | 13px | 10px | The find-record field above a record list |

Touch form buttons and fields have a 44px minimum; expanded record actions have a 32px minimum. Heights are minimums, so labels can wrap under zoom. Use 8px between form actions and 4px between compact record actions. Keep action labels short, concrete, and stable.

### Record layout

A record list is organized by type, not one long alphabetical run. Records group under a category label in the category registry's own order, alphabetically within each group; a group with no records is omitted, and a record whose saved category has since been retired keeps its own group rather than disappearing. A search filters within that structure, so only the groups holding matches remain.

The group label is an 11px uppercase sans-serif eyebrow in muted ink with .08em tracking, set close above its own records and separated from them by a hairline. Georgia stays with the page title and the record number, so the label never competes with the program names it heads: the eyebrow and its rule open the run, each row closes with a single fine separator, and 18px separates one group from the next. An empty or filtered-empty list shows only its explanation, never a stray rule.

A collapsed record is a compact row: 13px program name, optional 11px traveler, then a copy icon. Its disclosure marker is a small stroked chevron in a fixed right-hand column, quiet line color, pointing right and rotating down when the record opens. Never append a marker character to the name: markers must align in one column whatever the names are, and a long name that wraps keeps its marker centered on the row. Respect reduced motion when it turns.

An open record is one contained block, not text floating between two rules. It takes the surface fill with 6px top corners, and its number, metadata, actions, and any delete confirmation sit inside that block on the same left edge as the collapsed rows.

Inside the block the number leads at 18px tabular 600 — the strongest element, without extra tracking or a headline weight — followed by that record's own detail at 12px, then a quiet rule and the compact action group beneath it. The rule separates what the record is from what you can do with it, and keeps the confirmation visibly attached to its record. A record carries only detail the surrounding list does not already state: the category belongs to the group label, and the traveler belongs to whichever of the collapsed row or the open block is not already showing it. A metadata line with nothing to say is removed, never left as an empty gap. Edit and Delete have matching size and weight; danger color reinforces the Delete label.

A find-record field is a filter, not the page's main control. Keep it at the Filter density with the quiet `Line` border, separated from the list by 12px, and never let it outweigh the rows it filters. The shared `.form-field` control rules are more specific than a bare element selector, so a compact override must match `.form-field > input` specificity to take effect; verify the rendered height rather than trusting the declaration.

A tool heading is 22px Georgia. When it carries one primary action, that action sits on the opposite end of the heading row, aligned to the right edge of the content below it, never crowded against the title.

In the extension, Copy appears on row hover or keyboard focus. In the unlocked mobile wallet, show the number directly under its program name, with a permanently visible small Copy icon next to the number. Keep metadata and editing controls under the program disclosure. Mobile numbers use 15px text; do not add another traveler line to every collapsed mobile row. Icons retain accessible names and tooltips. A search field may use a visually hidden associated label and the visible placeholder “find record.” Routine successful synchronization has no banner; pending changes, errors, and offline state remain discoverable. Connection maintenance belongs in Settings.

### Implementation and scope

`Button` in `chrome-sidebar/src/components/ui.js` accepts a role through `variant` and a density through `size`. Use `size: 'compact'` with `primary`, `secondary`, `subtle`, `danger-subtle`, or `danger`. Use `CopyIconButton` for number copying. Do not supply custom padding or a feature-specific button class.

The wallet implements these tokens in `chrome-sidebar/src/components/travel.css`, shared unchanged by extension and mobile. This update applies the guide to the wallet; existing draft and Gmail screens keep their current styles until reviewed against the guide. New or revised controls should use this hierarchy rather than copying legacy one-off rules.

Review both collapsed and expanded rows, forms, confirmations, hover, keyboard focus, disabled states, 280px sidebar and phone layouts. Use synthetic records only. A passing build alone is not a visual review.

Configured mobile passkeys are invoked automatically on entry. Show only a brief opening state while the device verifies; show a retry control only after cancellation or failure. Native biometric or device-passcode verification remains in place. Do not display routine “Up to date” messages anywhere.
