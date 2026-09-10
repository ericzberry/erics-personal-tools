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

Touch form buttons and fields have a 44px minimum; expanded record actions have a 32px minimum. Heights are minimums, so labels can wrap under zoom. Use 8px between form actions and 4px between compact record actions. Keep action labels short, concrete, and stable.

### Record layout

A collapsed record is a compact row: 13px program name, optional 11px traveler, and a copy icon. Use a single fine separator. Expanded content follows the same left edge: 18px tabular number, 12px metadata, then the compact action group. Edit and Delete have matching size and weight; danger color reinforces the Delete label. The number remains the strongest element.

In the extension, Copy appears on row hover or keyboard focus. In the unlocked mobile wallet, show the number directly under its program name, with a permanently visible small Copy icon next to the number. Keep metadata and editing controls under the program disclosure. Mobile numbers use 15px text; do not add another traveler line to every collapsed mobile row. Icons retain accessible names and tooltips. A search field may use a visually hidden associated label and the visible placeholder “find record.” Routine successful synchronization has no banner; pending changes, errors, and offline state remain discoverable. Connection maintenance belongs in Settings.

### Implementation and scope

`Button` in `chrome-sidebar/src/components/ui.js` accepts a role through `variant` and a density through `size`. Use `size: 'compact'` with `primary`, `secondary`, `subtle`, `danger-subtle`, or `danger`. Use `CopyIconButton` for number copying. Do not supply custom padding or a feature-specific button class.

The wallet implements these tokens in `chrome-sidebar/src/components/travel.css`, shared unchanged by extension and mobile. This update applies the guide to the wallet; existing draft and Gmail screens keep their current styles until reviewed against the guide. New or revised controls should use this hierarchy rather than copying legacy one-off rules.

Review both collapsed and expanded rows, forms, confirmations, hover, keyboard focus, disabled states, 280px sidebar and phone layouts. Use synthetic records only. A passing build alone is not a visual review.

Configured mobile passkeys are invoked automatically on entry. Show only a brief opening state while the device verifies; show a retry control only after cancellation or failure. Native biometric or device-passcode verification remains in place. Do not display routine “Up to date” messages anywhere.
