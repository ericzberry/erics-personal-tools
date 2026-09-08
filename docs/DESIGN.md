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

Georgia gives titles and large numbers an editorial character. The system sans-serif keeps controls and explanations readable. All fonts are local. Body text is 12–14px, metadata 10–11px, display headings 30–38px. Uppercase labels are used sparingly.

Use 4px spacing increments, 16–24px page gutters, 9px field corners and 14px card corners. Prefer whitespace and borders to shadows. Keep content usable at 280px. Provide clear keyboard focus, native controls and reduced-motion support.

## Shared shell

The Eric’s / Personal Tools signature sits above a tool switcher. Each tool owns a heading and local navigation. Use forest for the primary action, a text button for secondary actions, and one dominant recommendation at a time. Keep supporting explanations behind disclosure controls. Empty states explain one next step; they never pretend to show live data.

The implementation tokens live in chrome-sidebar/sidepanel.css. Reuse these names and values in future subprojects. No external fonts, tracking, or third-party UI assets are needed.

## Writing

Short, specific, calm. Lead with the result. One sentence of context is usually enough. Label unfinished tools honestly. Avoid technical implementation details in normal user flows.
