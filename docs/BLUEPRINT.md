# Repository blueprint

A map of where things live, so a task can find the right file without reading the
whole repository. This is orientation, not rules: the rules stay in
[AGENTS.md](../AGENTS.md), the nested `AGENTS.md` files, and the guides listed at
the end.

**Keep this file current.** Any change to the repository's structure — a new or
removed directory, entry point, app, shared module, HTML page, schema file, API
route family, build/test command, or a change to which modules mobile shares —
must update this blueprint in the same commit. A blueprint that no longer matches
the tree is worse than none. This file is documentation only; editing it alone
does not require an app version increment or a release.

## Three apps, one shared core

| App | Directory | Runs as | Version source |
| --- | --- | --- | --- |
| Chrome sidebar extension | `chrome-sidebar/` | Chrome side panel + extension tabs | `chrome-sidebar/manifest.json` + `package.json` |
| Mobile web app | `mobile-app/` | Installable iPhone web app, served by the Worker at `/app/` | `mobile-app/package.json`, `manifest.webmanifest`, `releases.js`, `sw.js` cache name |
| API | `tools-api/` | Cloudflare Worker + D1 (`erics-personal-tools`, binding `DB`) | n/a (deployed, release metadata in D1) |

`chrome-sidebar/src/` is the canonical home of shared UI components, data
adapters, and validation. Mobile does not have its own copies: `mobile-app/build.js`
copies a named list of sidebar modules into `dist/app/shared/`. The Worker imports
sidebar validation modules directly (`../../chrome-sidebar/src/...`). So a change
under `chrome-sidebar/src/` can affect all three apps — check `mobile-app/build.js`
and `grep -r chrome-sidebar tools-api/src` before assuming otherwise.

## chrome-sidebar/

### Entry points (HTML → controller)

| Page | Controller | Purpose |
| --- | --- | --- |
| `sidepanel.html` | `src/app.js` | The side panel shell; mounts views, then navigation and feature controllers |
| `settings.html` | `src/settings-page.js` | Connections, credentials, AI settings |
| `travel.html` | `src/travel-page.js` | Travel wallet browse/editor tab |
| `rewards.html` | `src/rewards.js` | Rewards & benefits |
| `cards.html` | `src/cards-page.js` | Best card |
| `finance.html` | `src/finance-page.js` | Finance ledger (passkey-gated); also mounts inside the side panel |
| `personal.html` | `src/personal-page.js` | Personal information (passkey-gated) |
| `restaurants.html` | `src/restaurant-page.js` | Restaurant reservation workspace |
| `data.html` | `src/data-page.js` | Read-only player rankings reference data |

Travel, Rewards and Finance are side-panel tools as well as tabs: they have no
`href` in the capability registry, and `capability-links.js` mounts each into the
panel on first use. Their `.html` pages above still stand on their own, so each
controller mounts only when its own root element is present.

Not page-mounted: `src/background.js` (service worker: settings bridge, draft
state, release checks, launcher) and the content scripts
`src/content.js`, `src/gmail-content.js`, `src/espn-highlights-content.js`,
`src/draft-reader.js`, `src/gmail-reader.js`, `src/components/espn-highlights.js`
(these are classic scripts with `var` globals, not ES modules).

### `src/components/` — all DOM construction

`ui.js` (primitives and reusable presentation) · `views.js` (screens composed from
them) · `tokens.css` (design tokens) · `styles.css` (component classes) ·
`select.js`/`select.css` (the shared formatted `Select`/combobox — required for
every dropdown) · `file-drop.js`/`upload.css` (all uploads) · plus per-feature component
modules: `capabilities.*`, `cards.*`, `travel.*`, `rewards.js`, `finance.*`, `personal.js`,
`vault.*` (the shared lock screen), `restaurant-views.js`, `workspace.css`,
`sidebar-launcher.js`.
See `src/components/README.md` and `chrome-sidebar/AGENTS.md`.

### `src/` shared core (used by more than one host or feature)

- **Navigation / registry** — `capabilities.js` (the capability registry both hosts
  read; every entry needs an `icon`), `navigation.js`, `capability-links.js`.
- **Offline + sync** — `offline-resource.js` (the generic offline-first adapter),
  `offline-storage.js` (encrypted IndexedDB), `cloud-storage.js` (`CLOUD_URL`,
  `cloudRequest`, `CONNECTION_KEY`), `travel-changes.js` (cross-window change
  notification), `private-disconnect.js`.
- **Device-held secrets** — `secret-vault.js` (WebAuthn PRF key derivation,
  sealed envelopes, the recovery code, `sharedVault()` — one vault per host so a
  single passkey opens every protected section — and `vaultSessionStore()`,
  which keeps the unlocked session in `chrome.storage.session` so it survives a
  page and covers every extension tab), `idle-session.js` (the canonical
  15-minute inactivity gate, used by the mobile app lock and the vault),
  `auto-unlock.js` (one unlock attempt per arrival, shared by the mobile app
  lock and the gate), and `vault-gate.js` (the whole-section lock screen used by
  Finance and Personal information, which asks for the passkey on arrival).
- **Per-capability data + offline wrappers** — `travel-data.js`/`travel-offline.js`,
  `card-data.js`/`cards-offline.js`, `rewards-data.js`/`rewards-offline.js`,
  `rewards-sync.js`, `finance-data.js`/`finance-offline.js`,
  `personal-data.js`/`personal-offline.js`. The `*-data.js` modules own validation
  and are also imported by the Worker.
- **Statement intake** — `statement-text.js` (turns a dropped file into text or
  a downscaled image, entirely on the device), `pdf-text.js` (the PDF text-layer
  extractor, with its own confidence reporting), `finance-page-read.js` (one
  text snapshot of the tab the owner is looking at). All three ship to mobile
  too, because `finance.js` imports them statically; the page reader needs
  `chrome.scripting` and hides its own button where there is none.
- **Capability controllers** — `travel.js`, `cards.js`, `rewards-tool.js`,
  `finance.js`, `personal.js`, `data-library.js`, `restaurant-search.js`,
  `reservation-*.js`.
- **AI** — `ai-providers.js` (public provider metadata, shared with the Worker),
  `email-ai.js` (on-device), `email-cloud.js` (via Worker).
- **Credentials / settings** — `credentials.js`, `credential-services.js`,
  `credential-migration.js`, `settings.js`, `settings-bridge.js`.
- **Releases** — `release-check.js` (hourly throttle), `release-banner.js`.
- **Fantasy football** — `draft-*.js`, `espn-*.js`, `manual-draft.js`,
  `player-identity.js`, `recommendations.js`, `session-selection.js`,
  `page-advice.js`, `ranking-import.js`, `sidepanel.js`.
- **Gmail** — `gmail-connection.js`, `gmail-reader.js`, `gmail-content.js`,
  `context-panel.js`.

### Other

`config/` seasonal JSON (also copied to mobile) · `icons/` · `scripts/build.js`
(copies pages, `src`, `config`, `icons` into `dist/`) · `scripts/import-rankings.py` ·
`vendor/` third-party readers copied into `dist/` by the build (`read-xlsx.js`, reached by `statement-text.js` at `../vendor/`) · `release/` packaged zips and store listing · `tests/` `node --test` behavior tests
plus browser preview harnesses (`*-preview.html`, `ui-harness.html`).

## mobile-app/

Source lives in `public/app/` and is copied to `dist/` by `build.js`, which also
copies the shared sidebar modules into `dist/app/shared/` and the config JSON into
`dist/app/data/`. **Adding a shared module to mobile means adding it to the list in
`build.js` and to the `SHELL` array in `sw.js`.**

- `index.html` → `app.js` — the outer, locked shell: passkey unlock, release check,
  service worker registration. `mobile-security.js` and `passkey-vault.js` own
  locking (the inactivity gate and the one-attempt-per-arrival rule are the
  shared `idle-session.js` and `auto-unlock.js`); `releases.js` holds `VERSION`.
- `unlocked.html` → `unlocked.js` — the disposable unlocked frame that actually runs
  the tools; `mobile-session.js` guards access to it, `tool-layout.js` sizes it.
- `capabilities.js` — mounts capabilities from the shared registry and mirrors the
  chosen screen to the shell; `tool-navigation.js`/`.css` render the home-screen
  icon grid and, once a tool or Settings is open, the same grid behind the
  hamburger menu.
- `restaurants.js` + `restaurant-cache.js` — mobile restaurant view and its
  read-only download cache.
- `sw.js` — offline shell cache; its cache name carries the version.
- `tests/` behavior tests plus `preview-server.js` / `cards-preview-server.js`.

## tools-api/

- `src/index.js` — the router. Serves `/app/*` (mobile assets, with CSP),
  `/health`, `/v1/releases/latest`, `/v1/ai-connections/:id/{models,test,generate,restaurants,card-category,card-research}`,
  `/v1/rewards`, `/v1/cards[/…]`, `/v1/travel[/…]`, `/v1/finance[/…]`,
  `/v1/personal[/…]`. The AI-connection family also serves `finance-intake`,
  the one route allowed a request body over 64 KB because a statement image
  travels inline.
- `src/travel.js` — the generic encrypted record store; `src/cards.js`,
  `src/finance.js` and `src/personal.js` reuse it for `card_records`,
  `finance_records` and `personal_records`. `src/rewards.js`, `src/releases.js`,
  `src/ai-settings.js`.
- `src/providers.js` (provider adapters, including the text/image content parts
  every format renders in its own shape) and `src/model-policy.js` (the central
  task → model policy and priced catalogue, where `vision` marks a model that may
  be sent an image — never copy model IDs into features).
- Schema: `schema.sql` (`ai_connections`, `rewards_wallet`), `travel-schema.sql`
  (`travel_records`), `cards-schema.sql` (`card_records`), `finance-schema.sql`
  (`finance_records`), `personal-schema.sql` (`personal_records`),
  `release-schema.sql` (`app_releases`). Schema changes need an explicit upgrade
  path for existing data.
- `scripts/publish-release.js` — publishes a release version to D1 (required step of
  every app release). `wrangler.example.jsonc` — config template; real config and
  credentials stay outside Git.

## finance-intake/

Not an app: a small operator directory Claude uses to file statements into the
Finance ledger over `/v1/finance`, so figures reach the app without being typed
in. `ledger.mjs` is dependency-free Node that lists records and appends dated
snapshots — it cannot delete, and previews every write until `--confirm`.
`RUNBOOK.md` is the procedure a run follows; `README.md` covers setup and the
snapshot file format. The bearer token comes from `TOOLS_API_TOKEN`, then the
login keychain (`erics-tools-api` / `API_TOKEN`), then a gitignored
`credentials/api-token`. It cannot be stored in D1: it is the credential that
gates every route, so nothing there is reachable without presenting it first. Changing the ledger's record shape means re-reading
`chrome-sidebar/src/finance-data.js`, which is the validator both this and the
Worker answer to.

## Common tasks → where to start

| Task | Start at |
| --- | --- |
| Add a capability (tool) | `chrome-sidebar/src/capabilities.js` (id, label, href, 24x24 `icon`), a page + controller, a `*-data.js`/`*-offline.js` pair, mobile mounting in `mobile-app/public/app/capabilities.js`, the shared list in `mobile-app/build.js`, the `SHELL` list in `sw.js`, and a Worker route if it stores records |
| Change a control's look | `chrome-sidebar/src/components/ui.js` + `styles.css`/`tokens.css` — never in a feature controller |
| Add a dropdown | `components/select.js` via `FormField({kind:'select'})` |
| Change stored record shape | the `*-data.js` validator (shared by app and Worker), the matching `*-schema.sql` with an upgrade path, and the offline adapter's revision/normalize |
| Add a value the cloud must not be able to read | `chrome-sidebar/src/secret-vault.js` — seal on the device, store the envelope in the record, and keep only a safe hint (such as last four digits) in the clear |
| Put a whole capability behind the passkey | `chrome-sidebar/src/vault-gate.js` — mount the gate, then mount the tool into its `content` and load nothing until it unlocks; arriving at the section asks for the passkey on its own |
| Add or change an AI call | `tools-api/src/model-policy.js` for the task policy, `src/providers.js` for provider differences |
| Change offline/sync behavior | `chrome-sidebar/src/offline-resource.js` (shared by every capability) |
| Change what mobile ships | `mobile-app/build.js` shared list **and** `sw.js` `SHELL` |

## Commands (from the repository root)

```sh
npm --prefix chrome-sidebar test && npm --prefix mobile-app test && npm --prefix tools-api test
```

```sh
npm --prefix chrome-sidebar run build && npm --prefix mobile-app run build
```

`npm --prefix tools-api run deploy` (builds mobile first) · `node tools-api/scripts/publish-release.js`.

## Where the rules are

`AGENTS.md` (repository-wide) · `chrome-sidebar/AGENTS.md` (extension UI and
release) · `docs/DESIGN.md`, `docs/UI_COMPONENTS.md` (+ `_EXTENSION`, `_MOBILE`,
`_PAGES`), `docs/VISUAL_QA.md` · `docs/CLOUDFLARE.md` · `tools-api/MODEL_ROUTING.md`,
`tools-api/PROVIDERS.md` · `docs/GMAIL.md`, `docs/BEST_CARD.md`,
`docs/PROTECTED_SECTIONS.md`, `chrome-sidebar/RESTAURANTS.md`.
