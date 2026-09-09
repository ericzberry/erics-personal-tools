# Mobile 0.1.5 — automatic passkey prompt

A configured mobile app starts passkey verification automatically on opening, returning locked to the foreground, or reaching its inactivity lock while visible. Canceled or rejected automatic requests leave the manual Unlock button available and do not loop. Lock now remains a deliberate lock until another visit. Extension authentication is unchanged.

Validation: all 18 mobile tests pass, including duplicate lifecycle events, cancellation, manual locking, idle expiry, encryption, and access guards. Synthetic browser tests verified automatic reopening without a tap, automatic idle prompting, cancellation remaining locked, manual Lock now, and the narrow layout. Real iPhone Face ID/PRF prompts and Safari user-gesture restrictions were not directly tested; the manual button remains available when required.

Archive: `erics-tools-mobile-0.1.5.zip`.

---

# Offline data release — mobile 0.1.3 / extension 0.6.43

Shared Capabilities navigation replaces travel callouts. Travel records support encrypted device storage, offline copy/search/edit/delete, durable queued changes, optimistic revisions, lost-response reconciliation, and explicit conflict resolution. Mobile also includes bundled league rules/player rankings and encrypted offline AI connection metadata. Provider keys stay on the server.

Validation: 132 extension tests, 31 API tests, and 13 mobile tests passed. Browser checks used synthetic data. With the test server stopped, the app reopened from its service worker, read cached records, invoked copy, and saved an edit. The edit survived a second reopen and reached the server after reconnection. Offline rules and AI metadata, 280px/390px layouts, masked values, search, and capability selection were checked. Clipboard payload construction is tested; native iPhone Safari, OS clipboard integration, and the installed extension were not directly verified.

Archives: `erics-tools-mobile-0.1.3.zip` and `../../chrome-sidebar/release/erics-sidebar-0.6.43.zip`. Device caches are not permanent backups. Users must connect once to download private records for offline use.

The combined mobile release also wraps the access token with a passkey, requires unlock after restart, and locks after 15 minutes of inactivity. Synthetic browser checks confirmed canceled unlock stays locked, locking removes private views, offline edits survive locking/reopening, pending changes prevent disconnect, and successful disconnect clears access. Real Apple biometric/PRF behavior remains a device verification step.

Mobile 0.1.3 also fixes Cloudflare HTML canonicalization for the unlocked frame. Both exact frame routes allow same-origin framing, the .html route serves without redirecting, and the new shell cache replaces any previously cached restrictive frame response.

## Tools label — mobile 0.1.4 / extension 0.6.44

Renames the shared navigation label to Tools, with Choose a tool prompts. Updated AGENTS.md and current instructions to use the same name. Extension (132) and mobile (13) tests pass; shared UI reviewed at 280px and 390px.

## Mobile 0.1.7 — travel numbers first

Travel records now offer Show number / Hide number alongside Copy number. Connection settings remain collapsed below content, connected token setup is hidden, and editing and record maintenance are disclosed on demand. Removes the emphasis on device storage from shared sync messages. The extension 0.6.46 now opens the wallet inside its sidebar.

Validation: 133 extension, 19 mobile, and 31 API tests pass. Synthetic browser checks verified narrow layouts, reveal after offline reopening, a queued edit surviving reload, and successful reconnect synchronization. Real iPhone biometric and OS clipboard behavior remain unverified.

Archive: `erics-tools-mobile-0.1.7.zip`.

## Mobile 0.1.9 — header Settings

Moves offline details and connection maintenance behind the header Settings button. Removes the tool helper text and navigation divider. Selected tools and input survive Settings toggles.

Validation: 19 mobile, 138 extension, and 31 API tests passed; mobile build passed. Synthetic browser review at 280px and 390px verified Settings, hidden maintenance on the tool view, and preserved search input. Native iPhone rendering was not directly tested.

Archive: `erics-tools-mobile-0.1.9.zip`.

## Mobile 0.1.10 — compact travel controls

Smaller search and entry text, a hidden accessible search label, and copy icons disclosed on hover, keyboard focus, or expanded touch rows. Removes routine up-to-date messages. Connection controls remain in header Settings. Shared extension update: 0.6.48.

Validation: 138 extension and 19 mobile tests pass; synthetic phone layout reviewed at 390px. Native iPhone behavior was not directly tested. Archive: `erics-tools-mobile-0.1.10.zip`.
