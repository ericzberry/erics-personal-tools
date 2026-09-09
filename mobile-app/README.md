# Eric’s Tools for iPhone

Open https://erics-tools-api.ezberry.workers.dev/app/ in Safari, then Share → Add to Home Screen. Leave Open as Web App enabled if shown. Open the installed app once online and wait for Offline access: Ready before trying airplane mode.

Version 0.1.3 uses the shared **Capabilities** dropdown: Travel wallet, league rules, player rankings, and AI connections. There is no featured travel callout. Reference data is bundled for offline use. Set up a mobile passkey using the same private access token as the extension, then download private records and AI connection metadata.

Downloaded travel numbers and notes are encrypted in IndexedDB and stay masked in the interface. Search and copy work offline. Adds, edits, and deletions are saved in a durable queue before a network attempt. Changes synchronize when opening/foregrounding, reconnecting, or refreshing. Conflicts retain the local version for explicit review; failed or uncertain requests do not discard pending changes. AI connection metadata can be read offline, while provider keys stay on the server and provider operations require internet.

The mobile app requires a passkey before showing data. Apple Passwords on iOS 18 or later supports the required WebAuthn PRF encryption; other providers must support PRF too. Setup first creates the passkey, then a second button verifies it and encrypts the connection token. A legacy plaintext mobile token is removed only after the encrypted envelope is saved. Unsupported providers and canceled prompts fail closed.

Passkey PRF plus HKDF derives an AES-GCM wrapping key. Local storage contains only the wrapped token, random salt/IV, credential ID, and token fingerprint. The plaintext token and wrapping key are never persisted. The token continues to unlock the shared encrypted IndexedDB records; no changes are made to extension authentication or API bearer-token validation. This is a local encryption gate, not a server-side WebAuthn login or a revocable server session. The extension remains accessible using its existing saved token.

After 15 minutes of inactivity (including time outside the app), the app destroys its private frame and drops the in-memory token. Backgrounding hides the private view immediately; foregrounding checks elapsed time before access, without extending the idle interval. Trusted taps, typing, and scrolling extend the interval during active use. Lock now locks immediately. A full page/app restart always starts locked; no plaintext key or session token is saved to bypass verification. Saved offline data can be unlocked without a network request once the passkey is available on that device. Private reads and network requests check the lock directly to prevent suspended-page timer races.

Recovery requires the original access token and a new supported passkey. It preserves the data-encryption key and pending changes; replacement is committed only after verification succeeds. Keep the original token safe: losing the passkey and token can make unsynced edits unrecoverable. Disconnect clears the encrypted private cache and wrapped token, leaving cloud data intact; synchronize or resolve pending changes first. It does not delete the passkey from Apple Passwords. Safari can evict storage, so the offline copy is not a permanent backup. Locking does not clear previously copied OS clipboard text; save in-progress forms before using Lock now.

## Development and deployment

From tools-api, `npm run dev` builds the mobile assets and runs the existing Worker. Open `/app/` on its local URL. The vanilla HTML/CSS/module structure matches the existing project's lightweight browser code; assets are served by the same Worker so future authenticated requests do not need cross-origin access.

Run `npm --prefix mobile-app run build`, `npm --prefix mobile-app test`, and `npm --prefix tools-api test` from the repository root. `npm --prefix tools-api run deploy` also builds the mobile assets before deploying both server and app.

For a mobile release, align package.json, manifest.webmanifest, releases.js, sw.js cache name, and index.html versions. Package dist, commit and push, deploy, then run `node tools-api/scripts/publish-release.js mobile-app`. Verify `/v1/releases/latest?app=mobile-app`. The existing endpoint without an app parameter continues to report only the extension release. The phone stores its last release-check attempt and makes at most one automatic request per hour, including failed requests. Updates activate on request or once all older app windows close.

The service worker precaches the explicit shell, all shared modules, and bundled reference data. It never caches authenticated API responses. The reusable offline resource adapter stores encrypted records, revisions, and pending changes in IndexedDB. It synchronizes in the foreground rather than relying on iOS background execution.

For local UI validation, build first and run `node mobile-app/tests/preview-server.js`, then open `http://localhost:8791/app/`. This test server uses only a synthetic credential and synthetic records, with mock passkey/PRF, cancellation, offline, and idle controls. Its fixtures are outside the public directory and never included in a release. Mock tests do not verify the native iPhone Face ID prompt or a real provider’s PRF behavior.
