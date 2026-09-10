# UI components: extension sidebar

Read the [shared foundation](UI_COMPONENTS.md), [design rules](DESIGN.md), and [extension instructions](../chrome-sidebar/AGENTS.md). This guide covers the narrow sidebar. Settings and editors opened in tabs follow the [full-tab guide](UI_COMPONENTS_PAGES.md).

## Structure

Use the shared app header and Tools navigation, followed by the selected tool's heading, content, and actions. Tools come from the shared capabilities registry. Current tab is the automatic mode the sidebar starts in; the Tools toggle names it and the menu has no row for it. A manual selection stays selected when browser tabs change, marked in the menu by its highlighted row alone. Do not add new function tabs, feature shortcuts, or a second navigation system to the header.

Compose the sidebar through `views.js` and shared component modules. `sidepanel.html` is a bootstrap document. Controllers attach behavior to component hooks; they do not build parallel markup or style feature IDs.

## Compact composition

- Design for approximately 380px and the supported 280px minimum. Keep one main column and let long names, values, and actions wrap without hiding essential content.
- Use shared page insets and the compact spacing in DESIGN.md. Avoid stacked container padding, oversized figures, and decorative summary cards.
- Keep the useful record or result first. Put settings and optional reference detail under named disclosures. Anchor Refresh, Disconnect, and other maintenance actions to the resource they affect.
- Use `ExpandableRecord` and shared record views for detail. Keep common copy actions reachable by keyboard as well as hover. Follow the existing mask/reveal behavior for private values.
- Use `ActionGroup` and the shared button densities; compact does not mean reducing every target below its defined size. An open select menu must remain usable at the sidebar's actual width and height.

## Context and state

Make disconnected, unavailable-page, stale-capture, and no-data states specific to the selected tool. Do not show old browser-tab data as current after context changes. Preserve manual tool selection, unsaved form input, and active operations during background refreshes.

Keep larger editing or research tasks in the existing full-tab workflow when that is the capability's design. Opening a tab must not create an extension-only version of a data capability that mobile also needs. Use shared records and adapters, and refresh the sidebar through the existing notification path after a saved change.

## Acceptance

Review the normal sidebar entry, automatic and manual tool selection, Settings return, and open/closed disclosures at 380px and 280px. Exercise keyboard focus, menus, wrapped actions, loading, errors, and relevant offline states. For cross-window edits, verify refresh without losing input. Follow [VISUAL_QA.md](VISUAL_QA.md); static previews do not verify installed Chrome messaging or live-page capture.
