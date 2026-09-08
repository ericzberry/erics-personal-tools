# Eric’s Personal Tools

A quiet, personal workspace. Warm paper, deep forest green, and a little brass. The tools should feel like parts of one considered product.

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

Use 4px spacing increments, 14px sidebar gutters, 9px field corners and 14px card corners. Prefer whitespace and borders to shadows. Keep content usable at 280px. Provide clear keyboard focus, native controls and reduced-motion support.

## Shared shell

A 42px header pairs the Eric’s tools signature with the current function. The active browser tab selects the function automatically; do not add function tabs. Each tool has a compact heading. Put secondary information such as league rules behind a disclosure. Use forest for the primary action, a text button for secondary actions, and one dominant recommendation at a time. Keep supporting explanations behind disclosure controls. Empty states explain one next step; they never pretend to show live data.

The implementation tokens live in chrome-sidebar/sidepanel.css. Reuse these names and values in future subprojects. No external fonts, tracking, or third-party UI assets are needed.

## Writing

Short, specific, calm. Lead with the result. One sentence of context is usually enough. Label unfinished tools honestly. Avoid technical implementation details in normal user flows.

The next draft recommendation gets a small highlighted card at the top. Keep the name and position immediately readable; reasoning belongs below. Gmail shows the current subject, two action buttons, and editable results without a large hero or introduction.

File inputs use the reusable file-drop component: a quiet dashed surface, drag highlight, click/keyboard browsing, and inline status. Keep the native input hidden. Use concise copy and put optional board maintenance behind a disclosure. The draft source gets one short line rather than a large explanatory card.
