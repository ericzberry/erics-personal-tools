# UI components: mobile app

Read the [shared foundation](UI_COMPONENTS.md), [design rules](DESIGN.md), and [mobile runtime guide](../mobile-app/README.md). Mobile uses the same capability components and data rules with a touch-oriented shell.

## Structure and delivery

Keep the selected tool and saved content immediately accessible through the general Tools navigation. Connection maintenance and device detail belong in Settings. Preserve the selected tool and form input on return. Do not introduce special home-page feature callouts, unlocked banners, or manual lock controls.

`mobile-app/public/app/` owns the mobile shell and session behavior. `mobile-app/build.js` copies shared modules into the built app; edit the source modules, not those copies. Include every newly required shared module, style, and reference asset in both the build and service-worker shell inventory. Keep authenticated responses outside that shell cache.

## Touch and layout

- Use a single page scroll for tool content, including content hosted in the private frame. Avoid fixed-height nested tool panels. Menu option lists may have a bounded scroll area.
- Start with one column. Use compact record spacing while retaining DESIGN.md's touch targets: form controls and menu rows need their touch sizing; expanded record actions use the documented record size.
- Do not depend on hover to expose an action. Copy must remain discoverable, and disclosure affordances must be clear. Preserve the specific reveal and display policy of each data capability.
- Keep persistent input labels, readable input text, and controls that remain reachable with the on-screen keyboard. Test focus zoom, wrapping, and viewport changes on the target device; do not solve keyboard issues by shrinking text or fixing page height.
- Use the shared formatted Select and editable suggestion menu. Test long options, scrolling, dismissal, and selection in the private frame as well as the shell where applicable.
- Share typography, color, borders, and roles with other hosts. Use documented mobile modifiers for layout and touch sizing; avoid cloned controls or a separate mobile palette.

## Private data and offline states

Saved personal/reference data must remain useful offline after a successful download. Present pending edits, conflicts, and actionable failures near the affected workflow. An online-only action, such as generation, should clearly require connectivity without preventing access to saved results or records.

Preserve the passkey/session boundary. Configured entry can invoke verification automatically; show a brief opening state, then a retry control after cancellation or failure. Do not turn a mock preview into evidence that native device verification works. Do not persist secrets to avoid an unlock prompt.

Keep queued edits through restarts and backgrounding. Reconnect and foreground refreshes must preserve input. Disconnect must respect the existing pending-change guard and explain that private device copies are cleared while cloud records remain.

## Acceptance

Review around 390 × 844px and a narrower phone width, with populated, empty, loading, failed, and offline states relevant to the change. Exercise restart, reconnect, Settings return, conflict handling, menus, and keyboard interaction. Verify native passkey, clipboard, installed-app, and keyboard behavior when affected. Follow [VISUAL_QA.md](VISUAL_QA.md); desktop emulation and mock passkeys establish only preview behavior.
