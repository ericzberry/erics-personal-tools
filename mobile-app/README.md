# Eric’s Tools for iPhone

Open https://erics-tools-api.ezberry.workers.dev/app/ in Safari, then Share → Add to Home Screen. Leave Open as Web App enabled if shown. Open the installed app once online and wait for Offline access: Ready before trying airplane mode.

This release is a deliberately empty app shell. It saves its own interface for offline opening. It does not yet fetch or synchronize personal records, and does not contain credentials or AI provider keys. The shell URL is public; existing personal API endpoints remain authenticated. Add device authentication and a record-specific offline sync model before adding private content. Safari can evict website storage, so offline caching is not a permanent backup.

## Development and deployment

From tools-api, `npm run dev` builds the mobile assets and runs the existing Worker. Open `/app/` on its local URL. The vanilla HTML/CSS/module structure matches the existing project's lightweight browser code; assets are served by the same Worker so future authenticated requests do not need cross-origin access.

Run `npm --prefix mobile-app test`, `npm --prefix mobile-app run build`, and `npm --prefix tools-api test` from the repository root. `npm --prefix tools-api run deploy` also builds the mobile assets before deploying both server and app.

For a mobile release, align package.json, manifest.webmanifest, releases.js, sw.js cache name, and index.html versions. Package dist, commit and push, deploy, then run `node tools-api/scripts/publish-release.js mobile-app`. Verify `/v1/releases/latest?app=mobile-app`. The existing endpoint without an app parameter continues to report only the extension release. The phone stores its last release-check attempt and makes at most one automatic request per hour, including failed requests. Updates activate on request or once all older app windows close.

The service worker precaches only the explicit shell asset list. It never caches API responses. Future content should use IndexedDB with per-record revisions and a durable pending-change queue; synchronize on opening, foregrounding, and reconnecting, without relying on iOS background execution.
