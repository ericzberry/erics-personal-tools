# Visual acceptance

Use this guide for changes to anything a person sees or operates: components, CSS, navigation, default selections, browser code, displayed API data, and loading or failure states. Behavior tests and builds accompany rendered review; they cannot establish that the complete interface is usable. Backend changes with no rendered effect do not need visual review.

[DESIGN.md](DESIGN.md) defines appearance and controls; [AGENTS.md](../AGENTS.md) defines repository requirements and release completion. This guide describes how to verify them without maintaining another design system.

## Before editing

1. Inspect the reported surface where accessible. For a supplied URL or screenshot, record the entry point, selected tool, viewport, connection state, data shape, and relevant scroll position. Keep inspection of personal data read-only unless the task authorizes a specific mutation; do not copy secrets into evidence.
2. State the view's primary job and identify its shared components and controllers. For navigation changes, establish what switching tools replaces and which input or selection should persist. Check the full screen for obsolete forms or actions left below the new flow.
3. Identify the states the change can expose. Match the reported data shape using synthetic values, including sparse records, long labels, or large lists. A polished populated fixture does not cover a first-run or empty-data bug.

## Truthful previews

Use the current task's checkout, build after the final edit, and keep preview credentials, storage, and fixtures separate from personal data. Reuse existing harnesses and production components. Add missing fixture states when needed; do not recreate the interface in a mock page that bypasses the changed controller. Confirm test controls and fixtures remain outside release assets.

| Surface | Existing preview and limits |
| --- | --- |
| Sidebar | From the repo root, `npm --prefix chrome-sidebar run preview`; open `http://127.0.0.1:8765/sidepanel.html`. This serves source files. It does not verify installed extension APIs or live capture. |
| Feature fixtures | The same server exposes `/tests/travel-editor-preview.html`, `/tests/restaurant-preview.html`, `/tests/draft-preview.html`, `/tests/vault-gate-preview.html` (the passkey gate's waiting, dismissed and open states with a synthetic passkey), `/tests/page-strip-preview.html` (the page strip's states, one per kind of page it recognizes), and `/tests/properties-preview.html` (the shortlist, and saving and updating a listing against a synthetic page and reading). Inspect each harness before use and confirm it exercises the changed path; a feature fixture alone does not verify navigation into it. |
| Mobile | Build with `npm --prefix mobile-app run build`, then run `node mobile-app/tests/preview-server.js`; open `http://localhost:8791/app/`. The harness uses synthetic data and mock passkey, offline, and idle controls. It does not verify native biometric prompts or a real passkey provider. |

Use a separate browser context or dedicated preview origin to avoid stale local storage and service workers masking the result. Keep the existing context when specifically testing restart persistence or an upgrade. Do not clear real app storage to obtain an empty state. If a port is occupied, use an available port supported by the launcher instead of stopping another task's server.

## Review the complete interface

Start at the normal entry point with no helper query parameters or preselected fixture state. Verify the initial tool and saved selection behavior relevant to the change. Navigate to the changed view through the controls a user would use, then inspect from the header through the final content and actions.

| Host | Review sizes |
| --- | --- |
| Chrome sidebar | Normal sidebar width, approximately 380px, and the supported 280px minimum |
| Mobile | Approximately 390 × 844px, plus a narrower supported phone layout; check content with the on-screen keyboard where applicable |
| Full-tab settings, editors, or workspaces | A normal desktop viewport, approximately 1440 × 900px, and a narrow viewport where that page is supported |

For shared components, review the affected extension and mobile consumers in their actual layouts. Desktop width is not a substitute for sidebar acceptance. Inspect the full scroll and capture useful evidence with synthetic values; one cropped component screenshot does not establish page acceptance.

Review the applicable states below, including transitions between them:

- **Populated:** realistic record counts, long names, missing optional fields, collapsed and expanded rows, and wrapped actions.
- **Whole-feature empty:** one useful explanation and next action; avoid repeated empty blocks and unnecessary zero-filled summaries.
- **Filtered empty:** explain that the filter found no matches and provide a clear route back to saved records.
- **Loading and failure:** stable layout, discoverable progress, duplicate submissions prevented, actionable errors, and preserved form input. Failed requests must not appear as successful empty results.
- **First run, disconnected, and locked:** correct setup or retry path without exposing private values. Review cancellation and permission failures when the changed flow uses them.
- **Offline, pending, and conflict:** saved content remains accessible, queued edits remain visible after restart, and reconnect or conflict resolution preserves the user's work.

Exercise every visible action in the changed view using synthetic data, including secondary actions, cancel, return navigation, and destructive confirmations where present. Confirm handlers work in that view, the destination is correct, and the resulting state remains coherent. Use intercepted or mocked external effects for preview interactions; a UI review is not permission to send a message, make a booking, or spend on generation.

Check the composition and access together:

- The selected tool, record values, labels, counts, and actions agree. Switching views replaces the intended content; retired workflows do not remain underneath.
- Related content and actions are grouped, useful information appears before excessive blank space, and mobile tool content uses the page scroll. Bounded dropdown option lists are a separate control, not a nested tool viewport.
- Long text and zoom do not cause clipping, overlap, or accidental page-wide horizontal scrolling. Shared spacing, compact density, and control hit targets remain consistent.
- Keyboard focus is visible and follows a logical order. Review hover, focus, disabled, open, and selected states; test dropdown arrow keys, type-ahead, Escape, and outside dismissal. Editable suggestions must retain custom entry.
- Labels and status messages remain understandable without color alone. Check announcements for changed async states and reduced-motion behavior when motion changes. Keep private values masked except during an explicitly tested reveal flow.

## Automated checks and release evidence

Add meaningful regression coverage for the failed behavior, such as default selection, a conditional action with its handler, preserved input after failure, or duplicate submission prevention. Use negative assertions for retired workflows when they protect a real regression; avoid tests that merely duplicate markup. Extend the existing component architecture checks for shared construction boundaries.

Run focused tests while editing. The existing suite commands from the repository root are `npm --prefix chrome-sidebar test`, `npm --prefix mobile-app test`, and `npm --prefix tools-api test`; select the relevant suites and required architecture checks for the changed dependencies. Complete the affected final builds as specified in AGENTS.md. There is no separate visual test command that replaces browser review.

Fix visible defects before packaging or pushing a UI change. If rendering is unavailable, complete independent implementation and checks, then report the exact missing review and leave the UI release incomplete. Do not present a DOM test, build, or source diff as visual acceptance. A documentation-only update to this guide does not itself require browser review.

After deployment, revisit the normal entry path and the originally affected view. Verify the delivered version and requested behavior separately, following [Cloudflare release verification](CLOUDFLARE.md). Check installed Chrome behavior when extension APIs or live capture matter, and native iPhone behavior when passkey, clipboard, keyboard, or installed-app behavior matters. A browser fixture or phone-sized desktop viewport does not prove these device behaviors.

In the handoff, briefly name the surfaces, sizes, states, and important interactions reviewed; summarize the relevant test results and release evidence. Distinguish preview verification, deployed mobile assets, published update metadata, and the version actually loaded on the device. State any remaining live or device checks precisely.
