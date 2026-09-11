# Eric’s Tools for iPhone

Open https://erics-tools-api.ezberry.workers.dev/app/ in Safari, then Share → Add to Home Screen. Leave Open as Web App enabled if shown. Open the installed app once online and wait for Offline access: Ready before trying airplane mode.

Version 0.1.32 opens on a home screen that holds nothing but the tool icons: Travel wallet, Rewards & benefits, Best card, Finance, Personal information, Restaurants, and Player rankings under **Misc**, plus Settings. Opening a tool — or Settings — collapses those icons behind a hamburger menu naming the open screen; Home appears there as the way back. Settings is one of those screens rather than a header button, and it holds the cloud connection, AI connections, offline access, and a **Check for a new version** button. AI connections moved into Settings, and League rules was removed. There is no featured travel callout. Reference data is bundled for offline use. Set up a mobile passkey using the same private access token as the extension, then download private records and AI connection metadata.

Downloaded travel numbers and notes are encrypted in IndexedDB and stay masked in the interface. Search and copy work offline. Adds, edits, and deletions are saved in a durable queue before a network attempt. Changes synchronize when opening/foregrounding, reconnecting, or refreshing. Conflicts retain the local version for explicit review; failed or uncertain requests do not discard pending changes. AI connection metadata can be read offline, while provider keys stay on the server and provider operations require internet.

The mobile app requires a passkey before showing data. Apple Passwords on iOS 18 or later supports the required WebAuthn PRF encryption; other providers must support PRF too. Setup first creates the passkey, then a second button verifies it and encrypts the connection token. A legacy plaintext mobile token is removed only after the encrypted envelope is saved. Unsupported providers and canceled prompts fail closed.

Unlock requests identify the saved credential with the `internal` transport, matching platform-only enrollment. This asks Safari to use the passkey available on this device rather than offer external security keys. iOS controls the final confirmation sheet; this does not guarantee removal of its “More Options” button or bypass user verification. Verify the native prompt on an iPhone when releasing changes to this flow.

Passkey PRF plus HKDF derives an AES-GCM wrapping key. Local storage contains only the wrapped token, random salt/IV, credential ID, and token fingerprint. The plaintext token and wrapping key are never written to local storage; the only place the token appears outside memory is the seconds-long update handoff described below. The token continues to unlock the shared encrypted IndexedDB records; no changes are made to extension authentication or API bearer-token validation. This is a local encryption gate, not a server-side WebAuthn login or a revocable server session. The extension remains accessible using its existing saved token.

Unlocking the app also opens its protected sections. Finance, Personal information, and the wallet's card numbers are sealed with a second key derived from the same passkey, so the unlock assertion evaluates both salts at once and hands the record key to the private frame. One verification covers the app and the records it holds for the same one-hour window; a provider that evaluates only one salt still unlocks the app, and each protected section then asks for itself. The record key is never persisted and is dropped with the token when the app locks. Because the app's lock governs that session, protected sections show no Lock now or recovery controls of their own on mobile; recovery runs through Recover access on the lock screen.

After an hour of inactivity (including time outside the app), the app destroys its private frame and drops the in-memory token. Backgrounding hides the private view immediately; foregrounding checks elapsed time before access, without extending the idle interval. Trusted taps, typing, and scrolling extend the interval during active use. A full page/app restart always starts locked, and nothing saves a key or session token to bypass verification. The one exception is the reload the app itself performs to apply an update: the unlock it is already holding is handed to the page that replaces it, through that tab's session storage. It is written as the reload is triggered, read once and removed before it is used, and refused if it is stale, already used, or for a different saved lock — and it resumes the inactivity window it had rather than starting a new one, so applying an update costs neither a second passkey nor extra unlocked time. Saved offline data can be unlocked without a network request once the passkey is available on that device. Private reads and network requests check the lock directly to prevent suspended-page timer races.

Recovery requires the original access token and a new supported passkey. It preserves the data-encryption key and pending changes; replacement is committed only after verification succeeds. Keep the original token safe: losing the passkey and token can make unsynced edits unrecoverable. Disconnect clears the encrypted private cache and wrapped token, leaving cloud data intact; synchronize or resolve pending changes first. It does not delete the passkey from Apple Passwords. Safari can evict storage, so the offline copy is not a permanent backup. Locking does not clear previously copied OS clipboard text.

## Development and deployment

### Restaurants (0.1.12)

Choose **Restaurants** in Tools to research a restaurant or category using the same source-backed research and criteria as the extension. City, neighborhood, editorial criteria, date/time window, and flexible party size are supported. Open a restaurant's **Booking pages** to choose a provider and party size; OpenTable and Tock also offer hourly links across the requested window. Confirm the filters on the provider before booking. The iPhone web app cannot inspect other sites' signed-in tabs, so these links never claim confirmed availability. Automatic live page inspection remains an extension capability.

The latest successfully downloaded shortlist, addresses, rating/source details, booking destinations, and original search are encrypted in device storage. They remain readable after a cold offline reopen and are timestamped; past dates require a new search before opening booking links. New research and provider pages require internet. Failed and canceled research preserve the prior download. A cache failure is visible and retains the old download. Disconnect clears the restaurant download along with other private copies. Browser storage remains evictable.

This is a read-only research download, not an editable saved-search database: it does not write cloud records, expose offline edits, or require a pending-write queue. A newer download wins when concurrent searches finish out of order. Research is never automatically repeated or billed on reconnect; only connection metadata refreshes. The passkey transport preference from the preceding fix is included in this release.

From tools-api, `npm run dev` builds the mobile assets and runs the existing Worker. Open `/app/` on its local URL. The vanilla HTML/CSS/module structure matches the existing project's lightweight browser code; assets are served by the same Worker so future authenticated requests do not need cross-origin access.

Run `npm --prefix mobile-app run build`, `npm --prefix mobile-app test`, and `npm --prefix tools-api test` from the repository root. `npm --prefix tools-api run deploy` also builds the mobile assets before deploying both server and app.

For a mobile release, align package.json, manifest.webmanifest, releases.js, sw.js cache name, and index.html versions. Package dist, commit and push, deploy, then run `node tools-api/scripts/publish-release.js mobile-app`. Verify `/v1/releases/latest?app=mobile-app`. The existing endpoint without an app parameter continues to report only the extension release. The phone stores its last release-check attempt and makes at most one automatic request per hour, including failed requests. Updates activate on request or once all older app windows close.

The service worker precaches the explicit shell, all shared modules, and bundled reference data. It never caches authenticated API responses. The reusable offline resource adapter stores encrypted records, revisions, and pending changes in IndexedDB. It synchronizes in the foreground rather than relying on iOS background execution.

For local UI validation, build first and run `node mobile-app/tests/preview-server.js`, then open `http://localhost:8791/app/`. This test server uses only a synthetic credential and synthetic records, with mock passkey/PRF, cancellation, offline, and idle controls. Its fixtures are outside the public directory and never included in a release. Mock tests do not verify the native iPhone Face ID prompt or a real provider’s PRF behavior.

Mobile 0.1.5 starts passkey verification automatically when a configured app opens, returns locked to the foreground, or reaches its inactivity lock while visible. Each automatic attempt runs once; canceling or browser refusal leaves an Unlock with passkey button, without repeated prompts. Verification is still required; automatic prompting never bypasses the passkey or extends an expired session.

Mobile 0.1.6 puts saved content directly below Tools, remembers the selected tool, and sizes the private frame to its content for a single page scroll. Connection maintenance follows the content; offline setup details are collapsed under App details, opening automatically if setup fails. The unlocked banner and manual lock button are removed; passkey and inactivity protection remain.

Mobile 0.1.8 shares compact expandable wallet rows for long lists: Copy stays visible, tapping a program reveals its number and actions, and adding or editing stays inline. The extension opens its editor in a separate tab.

Mobile 0.1.9 moves cloud connection maintenance and offline details into Settings at the top of the app. The tool view omits the introductory helper text and empty divider. Closing Settings restores the selected tool and any form input.

Mobile 0.1.42 shows an available update at the top of the app, above the tools, rather than below them.

Mobile 0.1.43 keeps the passkey that opened the app when an update reloads it: applying an update reopens the tools where they were instead of asking for the same passkey again. The unlock is handed to the reloading page for seconds only, read once, and keeps the inactivity window it already had.

Mobile 0.1.47 carries the shared Finance modules behind the extension's new
**Store account snapshots** action. Reading the tab beside the panel is the
sidebar's alone — the phone has no such page and shows no snapshot prompt — so
nothing changes here beyond keeping the shared ledger code in step.

Mobile 0.1.49 carries the same **Add a card you hold** intake as the extension:
name a card, review the benefits research brings back, and save them into the
wallet, where the card holds its own benefits. Recurring credits state how often
they reset and are raised as their period closes.


Mobile 0.1.49 shows a reward program's published offers under **Program offers**
in Rewards & benefits, downloaded like any other record so they stay readable
with no signal. The phone never reads one: that needs the browser signed in to
the program's site. See [reward programs](../docs/REWARD_PROGRAMS.md).
