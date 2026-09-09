# Travel wallet release — mobile 0.1.1 / extension 0.6.42

Shared encrypted travel records, masked numbers and private notes, copy actions, per-traveler search, expiration dates, revision-checked edits, and confirmed deletion. Connect each device with the same private access token. Travel records require internet; the phone app shell remains available offline.

Validation: 123 extension tests, 30 API tests, and 3 mobile tests passed. The Cloudflare runtime tests cover authentication, encrypted persistence, private-field omission from lists, readback, and stale edit/delete rejection. Browser checks used synthetic records at 280px, 390px, and desktop width; copy, editing, failed-save preservation, wrapping, and visible keyboard focus were checked. Native iPhone Safari and the installed Chrome extension were not directly exercised.

Archives: `erics-tools-mobile-0.1.1.zip` and `../../chrome-sidebar/release/erics-sidebar-0.6.42.zip`. The mobile build copies shared wallet components from the extension source. Run both builds before packaging.
