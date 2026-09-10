# UI components: pages opened by the extension

Read the [shared foundation](UI_COMPONENTS.md), [design rules](DESIGN.md), and [extension instructions](../chrome-sidebar/AGENTS.md). This guide covers settings, record editors, data pages, and research workspaces opened in ordinary tabs. They remain part of Eric’s Tools and share its components and data model.

## Choose the page structure

| Page job | Composition |
| --- | --- |
| Short record edit | Shared heading, compact labeled form, inline validation, adjacent save/cancel actions |
| Settings | `SettingsList` for navigation and `SettingsGroup` for each connection or form; saved records and setup remain distinct |
| Research or multi-part task | `Workspace` with `WorkspaceColumns` where input and results benefit from appearing together |
| Data browsing | Shared search, records or a meaningful comparison table, then related actions |

Existing entry documents include `settings.html`, `travel.html`, `restaurants.html`, and `data.html`. Confirm the current controller and navigation contract before extending one. HTML documents load the required styles and modules and provide mount roots; presentation belongs in shared components.

Use a clear document title and one page heading. A larger browser tab permits useful columns, not enlarged buttons, headings, record values, or empty padding. Keep short forms at a readable width. Wider workspaces may use shared columns that collapse in logical reading order; avoid spreading a few controls across the entire screen.

## Navigation and context

Open pages through the existing capabilities registry or feature action. Preserve the relevant record identity and source context without placing credentials or private values in a URL. A page opened directly or reloaded must show useful loading, disconnected, missing-record, or invalid-context states instead of assuming the sidebar initialized it.

Use explicit actions for return or cancel where the workflow needs them. Do not rely only on browser history, which may lead outside the app, or promise to close a tab when the browser may refuse. Distinguish navigation from discarding unsaved input. Use existing shared notifications after saving so other open views update without a page reaching into their DOM.

Full-tab extension pages still use extension permissions and approved messaging boundaries. A localhost preview is not the installed extension. Do not convert an extension page into a publicly hosted page or broaden authentication merely to make its preview convenient.

## Forms, results, and controls

- Keep labels above or close to fields, errors beside the affected workflow, and save/cancel actions adjacent. Put connection status and maintenance inside the connection group.
- Use `FieldGrid` or `WorkspaceColumns` only when relationships benefit from the layout. Collapse columns before text or controls become cramped; allow shrinking grid children without clipping.
- Keep primary input, current operation status, and results in a clear reading order. Long results should use normal page flow; avoid making the editor and results compete in small fixed-height scroll boxes.
- Reuse `ResultBlock` and `EvidenceList` for research. Distinguish generated suggestions, verified facts, and live availability. Do not imply that showing a booking link means a reservation was made.
- Use the same formatted controls and density roles as other hosts. A large viewport does not justify native dropdown menus, page-specific buttons, or a new palette.
- Prefer inline editing and confirmation. Add a shared dialog only when the interaction needs one, with the accessibility contract in the foundation guide.

## Acceptance

Review at a normal desktop viewport around 1440 × 900px and a narrow viewport around 390px for these responsive pages. Check direct entry, reload, missing context, long results, unsaved input, all changed actions, and updates reaching another open view. Check column collapse, focus order, dropdown positioning, and the entire page scroll. Follow [VISUAL_QA.md](VISUAL_QA.md) and report installed-extension verification separately from a local fixture.
