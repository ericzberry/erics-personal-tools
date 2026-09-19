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
| `reminders.html` | `src/reminders-page.js` | Reminders: dated commitments, and the quick-add note |
| `gifts.html` | `src/gifts-page.js` | Gift ideas, from the thought to the thing given |
| `sizes.html` | `src/sizes-page.js` | Clothing sizes: what the label says, brand by brand, and the measurements behind it |
| `attention.html` | `src/attention-page.js` | Needs attention across saved records |
| `subscriptions.html` | `src/subscriptions-page.js` | Recurring charges, renewal decisions and alternatives |
| `unlock.html` | `src/unlock-page.js` | The small window the side panel opens to ask for the passkey, which the panel cannot raise itself |
| `taxes.html` | `src/taxes-page.js` | Taxes: file a K-1 or 1099 into Google Drive |
| `restaurants.html` | `src/restaurant-page.js` | Restaurant reservation workspace |
| `data.html` | `src/data-page.js` | Read-only player rankings reference data |

Every capability except Player rankings and Restaurants is a side-panel tool as
well as a tab: `PANEL_CAPABILITIES` in `capabilities.js` names them, the sidebar's
capability list drops their `href`, and `capability-links.js` mounts each into the
panel on first use. The panel is the home for a tool — it sits beside the page the
work comes from, which is why a K-1 can be dragged out of an open mail message
straight into Taxes. Their `.html` pages above still stand on their own, so each
controller mounts only when its own root element is present.

Not page-mounted: `src/background.js` (service worker: settings bridge, draft
state, release checks, launcher) and the content scripts
`src/content.js`, `src/gmail-content.js`, `src/espn-highlights-content.js`,
`src/draft-reader.js`, `src/gmail-reader.js`, `src/components/espn-highlights.js`
(these are classic scripts with `var` globals, not ES modules).

### `src/components/` — all DOM construction

`ui.js` (primitives and reusable presentation) · `views.js` (screens composed from
them) · `tokens.css` (design tokens) · `status.css` (the four status tones and the
progress indicators, imported by `tokens.css` so every host has them) ·
`styles.css` (component classes) ·
`select.js`/`select.css` (the shared formatted `Select`/combobox — required for
every dropdown) · `file-drop.js`/`upload.css` (all uploads) · plus per-feature component
modules: `capabilities.*`, `cards.*`, `travel.*`, `rewards.js`, `finance.*`, `personal.js`,
`vault.*` (the shared lock screen), `taxes.*`, `reminders.*`, `gifts.*`, `sizes.*`, `capture.*`
(the one-line note field, used on its own wherever a record can be typed),
`restaurant-views.js`,
`workspace.css`, `sidebar-launcher.js`.
See `src/components/README.md` and `chrome-sidebar/AGENTS.md`.

### `src/` shared core (used by more than one host or feature)

- **Navigation / registry** — `capabilities.js` (the capability registry both hosts
  read; every entry needs an `icon`), `navigation.js`, `capability-links.js`,
  `page-offers.js` (which capabilities have something for the page in front of
  the owner — one entry per source, and no page is read to answer it) and
  `page-strip.js` (the controller for the row under the header that offers
  them; `context-panel.js` hands it the tab it already watches).
- **Links** — `public-url.js`: the one reading of "a link safe to show and
  open", used by gift links and restaurant booking links alike.
- **Offline + sync** — `offline-resource.js` (the generic offline-first adapter),
  `offline-storage.js` (encrypted IndexedDB), `cloud-storage.js` (`CLOUD_URL`,
  `cloudRequest`, `cloudUpload` for a file too big to travel as JSON,
  `CONNECTION_KEY`), `travel-changes.js` (cross-window change notification),
  `private-disconnect.js`.
- **Device-held secrets** — `secret-vault.js` (WebAuthn PRF key derivation,
  sealed envelopes, the recovery code, `sharedVault()` — one vault per host so a
  single passkey opens every protected section — and `vaultSessionStore()`,
  which keeps the unlocked session in `chrome.storage.session` so it survives a
  page and covers every extension tab), `idle-session.js` (the canonical
  one-hour inactivity gate, used by the mobile app lock and the vault),
  `auto-unlock.js` (one unlock attempt per arrival, shared by the mobile app
  lock and the gate), and `vault-gate.js` (the whole-section lock screen used by
  Finance and Personal information, which asks for the passkey on arrival).
  `vault-window.js` is the sidebar's alone: Chrome shows no passkey sheet for a
  request from the side panel, so `app.js` gives the panel's vault
  `unlockInWindow()`, which runs the check in `unlock.html` and lets the panel
  adopt the session it stores.
- **Per-capability data + offline wrappers** — `travel-data.js`/`travel-offline.js`,
  `card-data.js`/`cards-offline.js`, `rewards-data.js`/`rewards-offline.js`,
  `rewards-sync.js`, `balance-data.js` (points and miles: what a page reading
  may become, which saved balance it updates, and the per-unit totals the
  wallet opens with — shared with mobile and the Worker),
  `program-data.js`/`program-offline.js` (the offer
  catalogues reward programs publish, read-only on every host),
  `finance-data.js`/`finance-offline.js` (the ledger: the asset-class and
  registration code registries, the portfolio and figure validators, the totals
  and the series, `foldReadings` — which turns what a page states into the few
  figures the ledger keeps — `legacyLedger` for the retrofit, and
  `ACCOUNT_TITLES`, the portfolio an institution settles by itself — one title,
  overridden by registration where law requires it, or a `holders` roster where
  one sign-on covers several titles and the account names which; plus `VEHICLES`
  and the direct-investment rows — a holding and its dated capital accounts —
  with `positionsOn` for what a position is worth and what it cost, and
  `foldCapital`, which ties a capital account statement to the investment it
  names),
  `personal-data.js`/`personal-offline.js`,
  `reminder-data.js`/`reminders-offline.js` (dated commitments; the next date is
  computed from an anchor and an interval, never stored),
  `gift-data.js`/`gifts-offline.js` (gift ideas, grouped by who they are for),
  `size-data.js`/`sizes-offline.js` (clothing sizes and body measurements in one
  record shape, grouped by brand with General first),
  `capture-data.js`/`capture-stores.js` (what a typed note may become: the
  capability that owns the record, the path its store writes to, the validator
  that decides it, and the stores a host offers quick add),
  `tax-data.js` (no offline wrapper:
  Taxes keeps nothing on the device). The `*-data.js` modules own validation and
  are also imported by the Worker.
- **Statement intake** — `statement-text.js` (turns a dropped file into text or
  a downscaled image, entirely on the device), `pdf-text.js` (the PDF text-layer
  extractor, with its own confidence reporting), `finance-page-read.js` (one
  text snapshot of the tab the owner is looking at, narrowed to the lines that
  carry a figure and the lines that name one). All three ship to mobile
  too, because `finance.js` imports them statically; the page reader needs
  `chrome.scripting` and hides its own button where there is none.
  `account-sites.js` is the sidebar's alone: `FINANCE_SITES`, the registry of
  institutions worth recognizing, and `ACCOUNT_SITES`, the four of them whose
  signed-in pages can be read (E*TRADE, Chase, Morgan Stanley, Schwab), plus the
  in-page probe that says whether the owner is already signed in to one.
  `context-panel.js` drives both from the tab it already watches: any recognized
  page turns the panel to Finance quietly — intake ready, figures unbuilt, no
  passkey prompt — and a signed-in site adds the snapshot prompt.
  `loyalty-sites.js` is the same registry for reward programs that keep a
  balance (United, Marriott, Membership Rewards): one URL comparison says
  whether the tab beside the panel is a program's own site, which is what makes
  Rewards offer to read the balance off it. Like `account-sites.js` it is the
  sidebar's alone; the reading itself is `finance-page-read.js`, unchanged.
  `reward-programs.js` is the counterpart for reward programs (MS Reserved): the
  in-page reader that lifts the published offer catalogue off the program's own
  pages, and the watcher `background.js` registers, so a visit updates the
  catalogue whether or not the panel is open.
- **Capability controllers** — `travel.js`, `cards.js`, `rewards-tool.js`,
  `finance.js`, `personal.js`, `reminders.js`, `gifts.js`, `sizes.js`, `capture.js`, `taxes.js`, `data-library.js`,
  `restaurant-search.js`, `reservation-*.js`.
- **AI** — `ai-providers.js` (public provider metadata, shared with the Worker),
  `email-cloud.js` (the email summary and the reply, both through the Worker).
- **Writing voice** — `voice-data.js` (what Eric wrote, taken out of what he
  sent; the profile's limits and validation; the guidance a reply is given) and
  `writing-voice.js` (the panel that studies, corrects and forgets it).
  `voice-data.js` is imported by the Worker, which does the reading.
- **Settings** — `settings.js` (the sidebar Settings screen: open, close, and
  build the wallet whose connection panel is the screen's one cloud connection),
  `settings-bridge.js`, `credential-migration.js` (legacy local keys → D1, run by
  the AI connections page). AI connections and their keys live only on
  `settings.html`; no second key form exists.
- **Releases** — `release-check.js` (hourly throttle), `release-banner.js`.
- **Fantasy football** — `draft-*.js`, `espn-*.js`, `manual-draft.js`,
  `player-identity.js`, `recommendations.js`, `session-selection.js`,
  `page-advice.js`, `ranking-import.js`, `sidepanel.js`.
- **Gmail** — `gmail-connection.js`, `gmail-reader.js`, `gmail-content.js`,
  `context-panel.js`. The email screen shows no copy of the message: it is open
  in the tab beside the panel. See [GMAIL.md](GMAIL.md).

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
  chosen screen to the shell, and mounts the shared quick-add note on the home
  screen (`#capability-capture`), which is hidden as soon as a tool is open; `tool-navigation.js`/`.css` render the home-screen
  icon grid and, once a tool or Settings is open, the same grid behind the
  hamburger menu.
- `restaurants.js` + `restaurant-cache.js` — mobile restaurant view and its
  read-only download cache.
- `push.js` (in the shell) and `push-bridge.js` (in the frame) — notifications:
  the browser half where the page is, the authenticated half where the token is.
- `sw.js` — offline shell cache; its cache name carries the version, plus the
  `push` and `notificationclick` handlers.
- `tests/` behavior tests plus `preview-server.js` / `cards-preview-server.js`.

## tools-api/

- `src/index.js` — the router. Serves `/app/*` (mobile assets, with CSP),
  `/health`, `/v1/releases/latest`, `/v1/ai-connections/:id/{models,test,generate,restaurants,card-category,card-research,card-benefits,balance-intake,capture}`,
  `/v1/rewards`, `/v1/rewards/programs[/…]`, `/v1/cards[/…]`, `/v1/travel[/…]`,
  `/v1/finance[/…]`, `/v1/personal[/…]`, `/v1/reminders[/…]`, `/v1/gifts[/…]`, `/v1/sizes[/…]`,
  `/v1/push/…`, `/v1/drive/…`, `/v1/voice[/scan]`. `/v1/push/key` is public like the release route,
  because a device needs it before it can subscribe to anything. The AI-connection family
  also serves `finance-intake` and `tax-intake`, the routes allowed a request
  body over 64 KB because a statement or document image travels inline;
  `/v1/rewards/programs/:id` is allowed 256 KB because a program's whole offer
  catalogue is one document.
  `/v1/drive/callback` is the one route outside the bearer check — Google's
  redirect carries a single-use `state` instead (see [TAXES.md](TAXES.md)).
- `src/travel.js` — the generic encrypted record store; `src/cards.js`,
  `src/personal.js`, `src/reminders.js`, `src/gifts.js` and `src/sizes.js`
  reuse it for `card_records`, `personal_records`,
  `reminder_records`, `gift_records` and `size_records`.
  `src/finance.js` does not: the ledger is two relational tables, so it has its
  own handler, its own `p3` / `3-1-20260919` addressing, and the
  `/v1/finance/backfill` route that retrofits the record-per-account table.
  `src/capture.js` is not a store: it reads one typed note into a record one of
  them already accepts. `src/push.js` and `src/web-push.js` are the
  notification side: subscriptions, the morning digest, and Web Push itself
  (RFC 8291 and 8292) written against WebCrypto with no dependency. The
  `scheduled` export in `src/index.js` is the hourly trigger they run on. `src/rewards.js` (the
  wallet, the issuer research that turns one card name into the card and the
  benefits it carries, and the reading that turns a loyalty page into a points
  balance),
  `src/programs.js` (one catalogue document per reward program, folded into what
  is stored on every write), `src/releases.js`, `src/ai-settings.js`. `src/drive.js` is not a record store: it holds the
  owner's Google Drive connection and files tax documents through it, and
  `src/taxes.js` is the reading that names one.
  `src/voice.js` is the other thing that Google connection is for: it reads a
  page of sent mail at a time, keeps the study's place between calls, and turns
  what Eric wrote into the profile his replies are written from.
- `src/providers.js` (provider adapters, including the text/image content parts
  every format renders in its own shape) and `src/model-policy.js` (the central
  task → model policy and priced catalogue, where `vision` marks a model that may
  be sent an image — never copy model IDs into features).
- Schema: `schema.sql` (`ai_connections`, `rewards_wallet`), `travel-schema.sql`
  (`travel_records`), `cards-schema.sql` (`card_records`), `finance-schema.sql`
  (`finance_portfolios`, `finance_marks`, `finance_holdings`, `finance_capital`), `personal-schema.sql` (`personal_records`),
  `reminders-schema.sql` (`reminder_records`), `gifts-schema.sql` (`gift_records`), `sizes-schema.sql` (`size_records`),
  `push-schema.sql` (`push_subscriptions`),
  `drive-schema.sql` (`drive_accounts`, `drive_tickets`),
  `voice-schema.sql` (`voice_profiles`),
  `release-schema.sql` (`app_releases`). Schema changes need an explicit upgrade
  path for existing data.
- `scripts/publish-release.js` — publishes a release version to D1 (required step of
  every app release). `wrangler.example.jsonc` — config template; real config and
  credentials stay outside Git.

## site/

The public `ezberry-site` Worker on `ezberry.net`: a home page, `/privacy` and
`/terms`, which are the links Google's OAuth consent screen asks for. Markup,
styles and text are string constants in `src/index.js`; no build step. Separate
from the API Worker on purpose — no bindings, no secrets, no D1 — and not part of
an app release: no version, nothing published to D1. `cd site && npm run deploy`.

## finance-intake/

Not an app: a small operator directory Claude uses to file statements into the
Finance ledger over `/v1/finance`, so figures reach the app without being typed
in. `ledger.mjs` is dependency-free Node that lists portfolios with their
figures and appends dated ones — it cannot delete, and previews every write
until `--confirm`. `backfill.mjs` drives the one-time retrofit of the
record-per-account ledger through `/v1/finance/backfill`, previewing until
`--confirm`. `api.mjs` is the bearer token and the request wrapper both scripts
share. `RUNBOOK.md` is the procedure a run follows; `README.md` covers setup and
the figure file format. The bearer token comes from `TOOLS_API_TOKEN`, then the
login keychain (`erics-tools-api` / `API_TOKEN`), then a gitignored
`credentials/api-token`. It cannot be stored in D1: it is the credential that
gates every route, so nothing there is reachable without presenting it first. Changing the ledger's record shape means re-reading
`chrome-sidebar/src/finance-data.js`, which is the validator both this and the
Worker answer to.

## scripts/

`release.js` — the whole release as one command, meant to be aliased. It refuses
a checkout with uncommitted changes or with untracked files inside a directory
the builds copy, pushes only when there is something to push (so an unreachable
GitHub does not abort a release already on origin), runs the three test suites,
builds and packages the extension, builds mobile, deploys the Worker, publishes
both versions to D1, and then reads the release endpoint back to confirm.
`--skip-tests`, `--repackage`, `--open`.

## Attention and subscription modules

`src/attention-data.js` is the shared attention projection; `attention.js` and
`components/attention.js` render it, with `attention-stores.js` wiring extension
stores. `subscription-data.js`, `subscriptions-offline.js`, `subscriptions.js`
and `components/subscriptions.js` own subscription validation, storage and UI.
Mobile copies all except extension-only `attention-stores.js` and page controllers;
its existing stores are passed directly. All copied modules are in its offline shell.

`tools-api/src/subscriptions.js` serves `/v1/subscriptions[/snapshot|/:id]` through
the generic store and the `subscription-intake` / `subscription-research` AI
operations. `tools-api/subscriptions-schema.sql` adds `subscription_records`.
See [attention and subscriptions](ATTENTION.md) for behavior and release limits.
The extension build now includes `attention.html` and `subscriptions.html`.

## Common tasks → where to start

| Task | Start at |
| --- | --- |
| Add a capability (tool) | `chrome-sidebar/src/capabilities.js` (id, label, href, 24x24 `icon`), a page + controller, a `*-data.js`/`*-offline.js` pair, mobile mounting in `mobile-app/public/app/capabilities.js`, the shared list in `mobile-app/build.js`, the `SHELL` list in `sw.js`, and a Worker route if it stores records |
| Change a control's look | `chrome-sidebar/src/components/ui.js` + `styles.css`/`tokens.css` — never in a feature controller |
| Say that something failed, needs attention, is running, or worked | `setStatus(node, text, tone)` from `components/ui.js`, with `Spinner`/`ProgressBar` for an in-place indicator — never a colour chosen in a feature |
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
The public site deploys on its own: `cd site && npm run deploy`.

A whole release, in the required order, is one command:

```sh
node scripts/release.js
```

## Where the rules are

`AGENTS.md` (repository-wide) · `chrome-sidebar/AGENTS.md` (extension UI and
release) · `docs/DESIGN.md`, `docs/UI_COMPONENTS.md` (+ `_EXTENSION`, `_MOBILE`,
`_PAGES`), `docs/VISUAL_QA.md` · `docs/CLOUDFLARE.md` · `tools-api/MODEL_ROUTING.md`,
`tools-api/PROVIDERS.md` · `docs/GMAIL.md`, `docs/BEST_CARD.md`, `docs/REWARDS.md`,
`docs/PROTECTED_SECTIONS.md`, `docs/TAXES.md`, `docs/REWARD_PROGRAMS.md`,
`docs/REMINDERS.md`, `docs/GIFTS.md`, `docs/QUICK_ADD.md`, `docs/NOTIFICATIONS.md`,
`chrome-sidebar/RESTAURANTS.md`.
