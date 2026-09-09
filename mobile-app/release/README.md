# Offline data release — mobile 0.1.2 / extension 0.6.43

Shared Capabilities navigation replaces travel callouts. Travel records support encrypted device storage, offline copy/search/edit/delete, durable queued changes, optimistic revisions, lost-response reconciliation, and explicit conflict resolution. Mobile also includes bundled league rules/player rankings and encrypted offline AI connection metadata. Provider keys stay on the server.

Validation: 132 extension tests, 30 API tests, and 13 mobile tests passed. Browser checks used synthetic data. With the test server stopped, the app reopened from its service worker, read cached records, invoked copy, and saved an edit. The edit survived a second reopen and reached the server after reconnection. Offline rules and AI metadata, 280px/390px layouts, masked values, search, and capability selection were checked. Clipboard payload construction is tested; native iPhone Safari, OS clipboard integration, and the installed extension were not directly verified.

Archives: `erics-tools-mobile-0.1.2.zip` and `../../chrome-sidebar/release/erics-sidebar-0.6.43.zip`. Device caches are not permanent backups. Users must connect once to download private records for offline use.

The combined mobile release also wraps the access token with a passkey, requires unlock after restart, and locks after 15 minutes of inactivity. Synthetic browser checks confirmed canceled unlock stays locked, locking removes private views, offline edits survive locking/reopening, pending changes prevent disconnect, and successful disconnect clears access. Real Apple biometric/PRF behavior remains a device verification step.
