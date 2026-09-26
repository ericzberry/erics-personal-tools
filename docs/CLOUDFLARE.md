# Cloudflare runtime

Eric’s Tools uses the `erics-tools-api` Worker for its authenticated API and hosted mobile app. The Chrome extension is built and loaded separately. The existing D1 database is `erics-personal-tools`, bound as `DB`; mobile assets use the `ASSETS` binding.

The repository is the source of truth for Worker code, schema SQL, dependency metadata, tests, and deployment procedures. Cloudflare holds the deployed copy. Use the dashboard for inspection and account setup; reconcile any emergency dashboard code changes into the repository before the next deployment.

## Structure and ownership

| Location | Responsibility |
| --- | --- |
| `tools-api/src/index.js` | Request entry point, shared authentication and request limits, mobile asset responses, and capability routing |
| `tools-api/src/ai-settings.js`, `rewards.js`, `travel.js`, `cards.js`, `finance.js`, `personal.js` | Capability-specific storage and operations; `travel.js` is the generic encrypted record store the others reuse |
| `tools-api/src/providers.js`, `model-policy.js` | Provider dispatch and central task-based model selection |
| `tools-api/src/push.js`, `web-push.js` | Device subscriptions, the morning digest, and Web Push itself; reached from the `scheduled` handler as well as from routes |
| `tools-api/src/releases.js` | Public, per-app release metadata lookup |
| `tools-api/src/quota.js` | The account's D1 storage measured against the plan's limits, and the one notification sent before a limit arrives |
| `tools-api/src/backup.js`, `backup-format.js` | The quarterly backup of every table to Google Drive, on its own daily trigger, and table-by-table restore from one; see [BACKUPS.md](BACKUPS.md) |
| `tools-api/*schema.sql` | Explicit D1 schema setup and upgrades |
| `tools-api/wrangler.example.jsonc` | Versioned configuration template; actual account/database settings live in ignored `wrangler.jsonc` |
| `tools-api/package.json`, `package-lock.json`, `tests/` | Deployment commands, dependency lock, and behavior checks |
| `mobile-app/public/`, `mobile-app/build.js` | Mobile source and assembly of shared extension modules into `mobile-app/dist` |
| `tools-api/scripts/publish-release.js` | Publication of an affected app's manifest version to D1 |

Add capabilities as sibling modules in the existing service, with explicit routes and shared boundary checks. Keep provider-specific behavior in adapters and task selection in the central model policy. Follow existing handler contracts rather than importing a different app's routing convention. Introduce another Worker or database only when permissions, deployment independence, or resource isolation justify it.

Read [API setup and storage](../tools-api/README.md), [provider integration](../tools-api/PROVIDERS.md), [model routing](../tools-api/MODEL_ROUTING.md), and [mobile operation](../mobile-app/README.md) for their detailed contracts.

## Authentication and private data

The mobile shell under `/app/` and `GET /v1/releases/latest` are public. Private API operations and `/health` require the API bearer token. Keep public routes explicit; adding a capability must not accidentally bypass authentication. Mobile passkeys protect local access and encryption, while the server still validates the bearer token.

Keep API credentials, provider keys, and encryption secrets outside Git and packaged assets. Use Cloudflare secrets and the protected local configuration described in the API README. Do not rotate the storage encryption key without a plan to decrypt and re-encrypt existing records. Logs and errors must not expose tokens, private record contents, or provider request bodies.

Review automatic request logging as well as application logs when adding an integration. Keep credentials out of URLs: infrastructure may log paths and query strings before application redaction runs. If a future provider requires a secret callback URL, verify logging controls before enabling that route. Authenticate before processing private payloads, keep body reads bounded, and return a failure when durable storage fails rather than reporting acceptance.

Preserve the existing origin restrictions, mobile security headers, request validation, bound SQL parameters, and non-cacheable private responses. The mobile service-worker shell cache must never contain authenticated API responses; private offline records belong in encrypted device storage.

## D1 data and compatibility

D1 stores durable application data here, including encrypted settings and wallets, plus public release metadata. Temporary travel research is a separate, indexed table with a 90-day inactivity retention policy; permanent reference records are unaffected. Do not apply pending-only retention to saved records or delete cloud data when a device disconnects.

Protected values inside the rewards wallet (today, card numbers) are a distinct
category: the device seals them with a key derived from the user's passkey
before they are sent, so the Worker's own encryption wraps text it has no key
for. Never add a route, log line, or AI call that expects to read one, and never
attempt server-side migration of their contents — only the device can re-seal
them. Records keep the last four digits in the clear as a display hint; nothing
else about the number leaves the device. Security codes (CVV) are never stored.

For each new data category, document its owner, purpose, encryption requirements, retention, and deletion behavior. Temporary processing data, if introduced, needs its own lifecycle; acknowledge or remove pending work only after confirmed processing. Keep unrelated capabilities' records and synchronization state isolated.

Use the existing database and checked-in schema files. Provide an explicit upgrade for existing installations and test preservation of populated records, not just initialization of an empty database. Apply required additive schema changes before deploying dependent code. Avoid dropping or rewriting data as a deployment shortcut.

Older extension versions and offline mobile clients may reconnect after deployment. Preserve compatible request and record formats, revision-conflict handling, and pending edits. Plan incompatible changes as a staged transition. A code rollback does not reverse a schema change; confirm that the previous code can read the resulting schema before using it for recovery.

When introducing a versioned queue or protocol, distinguish its format version from app release versions and record revisions. Deploy readers that understand old and new formats before producers write the new format. Keep old readers until outstanding work is drained or safely migrated, accounting for devices that have been offline. Reject unsupported formats before applying effects or advancing progress; do not silently reinterpret them or reset synchronization state during deployment.

## Durable synchronization and recovery

The existing [offline resource adapter](../chrome-sidebar/src/offline-resource.js) owns queued private-record edits shared by clients. Its queue is encrypted device state, separate from durable cloud records. Use its revision and reconciliation rules when extending data capabilities; an ordered webhook receipt stream would require a different, explicitly designed contract.

- Persist a local change and its pending state before attempting the network. Show it as waiting to sync until cloud acceptance is confirmed; a failed local write must not appear saved.
- A lost response can follow a successful server write. Reconcile the current cloud record before retrying. Each queued write carries an `operation` UUID, kept with the queued change and renewed only when the change is edited again or kept through conflict resolution; the record route stores it as the write's revision, so a snapshot showing that revision proves the write landed, and a retry of a write that already landed is answered with the record rather than 409. A change edited again while still queued keeps the names of its earlier writes, and when the cloud holds one of them the new write is based on it rather than raised as a conflict. A queued change is marked `unsent` until its first send is attempted, and that mark is cleared in storage before the request goes out: deleting a queued create simply forgets it only while the mark stands, and otherwise queues a delete like any other, which the next snapshot shows either has nothing left to delete or can be based on the revision one of the record's earlier writes produced. A queue from before the mark existed is treated as sent. Without that proof — an older Worker, a route that mints its own revisions, a queue written before operations existed — the adapter compares the normalized record content structurally (as JSON: key order ignored, arrays and nested objects compared by value) or confirms absence for deletes; content that does not match stays a conflict for review. Both are for record state, not proof that an email, payment, or other external effect happened exactly once.
- Keep pending changes after failures and preserve explicit revision conflicts for review. Do not clear a queue, advance a revision, or mark work complete to hide an error. Serialize overlapping work within the affected resource so simultaneous windows cannot discard each other's changes.
- Keep pending-state removal and the corresponding local cloud state consistent in durable storage. Test interruptions before network submission, after server commit but before the response, and before the local completion write. Recovery must retain or safely reconcile the work.
- During an outage, retain readable offline records and queued edits, and resume synchronization on reconnect or foreground. Inspect pending counts, conflicts, and actionable errors without logging private contents. Bound drain work as queues grow so synchronization does not monopolize the client.
- After restoring cloud data or replacing a database, reconcile against device revisions and outstanding edits before resuming writes. Do not treat a restored snapshot as proof that pending work completed, or reset revision state to force acceptance. If a future stream uses cursors, identify the stream as well as the position so a replacement database cannot silently reuse an old cursor.

Restoring cloud data itself — from D1 Time Travel for the last week, or from a quarterly backup in Google Drive for anything older — is described in [BACKUPS.md](BACKUPS.md).

For recovery, first identify whether an operation failed to save locally, failed remotely, completed with a lost response, or conflicts with a newer record. Fix the cause and retry through the normal adapter, or use explicit conflict resolution. Disconnecting and clearing storage are not recovery shortcuts while unsynced work remains.

The [offline resource tests](../chrome-sidebar/tests/offline-resource.test.js) cover cold offline reopen, edits and deletes surviving restart, lost-response reconciliation, conflicts, failed local storage, and overlapping windows. Extend these tests for changed durability boundaries; do not assume every possible crash is already covered. Verify the actual mobile and extension flows with synthetic data as required by AGENTS.md.

## Deployment and release verification

Follow the release requirements in [AGENTS.md](../AGENTS.md). Release from a tested, committed, pushed checkout containing only the intended changes. In a shared dirty checkout, isolate the release first. Worker deployment packages mobile assets too, so an API-only fix must not deploy another task's unfinished mobile build.

1. Install locked dependencies in `tools-api` with `npm ci`. Confirm that the ignored Wrangler configuration targets the existing Worker and database, using the checked-in template. Follow the API README for initial authentication and secret provisioning.
2. Run the affected behavior and architecture checks and final app builds. From the repository root, the API suite is `npm --prefix tools-api test`; shared API behavior requires both app builds and relevant client checks. Node's SQLite-based tests require the runtime specified in the API README.
3. Align affected app versions, package the verified artifacts, inspect the staged diff, then commit and push as required by AGENTS.md. Preserve the fixed Chrome release destination.
4. Apply required schema upgrades from the release checkout using the documented D1 commands. A deploy also publishes the cron triggers in `wrangler.jsonc`; the hourly one drives [notifications](NOTIFICATIONS.md) and needs `push-schema.sql` applied and the three `VAPID_*` secrets set, or its runs end with "push is not configured" rather than failing loudly. The second, daily one is the [quarterly backup](BACKUPS.md) and needs `backup-schema.sql` applied. Deploy with `npm --prefix tools-api run deploy`. Its `predeploy` script rebuilds mobile assets before Wrangler deploys the Worker and assets; it does not run the test suite, apply schema SQL, or publish release metadata.
5. Verify the deployed service and changed behavior using synthetic records where writes are necessary. Check mobile assets and the affected authenticated operation, not just `/health`. Its current `version: 2` is a service marker, not a Git revision or app release version. Record the deployment identity reported by Wrangler; do not infer it from local Git history.
6. After successful deployment and the required packaging, commit, and push, publish each affected app separately from the repository root:

   ```sh
   node tools-api/scripts/publish-release.js chrome-sidebar
   node tools-api/scripts/publish-release.js mobile-app
   ```

   Run only the commands for the apps being released. The script reads local manifests and writes release metadata; it does not deploy or validate the release. Verify the extension version at `/v1/releases/latest` and the mobile version at `/v1/releases/latest?app=mobile-app` on the deployed service.

### Releasing from a checkout other sessions are working in

`scripts/release.js` refuses a dirty tree, and rightly: `wrangler deploy` ships
the working tree, and `predeploy` rebuilds `mobile-app/dist` from it, so a
deploy made while another session has unfinished work in `tools-api/src`,
`mobile-app/public` or `chrome-sidebar/src` publishes that work. Several
sessions edit this repository at once, so the tree is often dirty through no
fault of the release.

Build and deploy from an archive of the commit instead, which ships exactly
`HEAD` and nothing uncommitted:

```sh
T=$(mktemp -d)
git archive HEAD | tar -x -C "$T"
cp -R chrome-sidebar/vendor "$T/chrome-sidebar/vendor"   # see below
cp tools-api/wrangler.jsonc "$T/tools-api/wrangler.jsonc"
ln -s "$PWD/tools-api/node_modules" "$T/tools-api/node_modules"
npm --prefix "$T/tools-api" run deploy
```

**Copy `vendor/` in, or the build quietly loses the spreadsheet reader.**
`chrome-sidebar/vendor/` is not in Git, so an archive arrives without it, and
both builds are written to warn and carry on rather than fail — a green build
whose packaged extension cannot read an `.xlsx` statement, and, because mobile's
build copies the same directory, a deploy that stops serving
`/app/vendor/read-xlsx.js` to the phone. The warning is one line in a passing
build; read it.

The same applies to `scripts/publish-release.js`, which reads local manifests:
run it against the archive, or it publishes whatever version number another
session happens to have mid-bump in the tree.

**When the commit is staged hunks rather than whole files, prove the index, not
the working tree.** `npm test` and `npm run build` read the tree, and in a
shared checkout the tree is your change plus somebody else's half-finished one —
so a green run says the two work together, which is not what is about to be
committed, and a red one is as likely to be their edit against your test as a
real failure. Extract the index and run the checks there:

```sh
T=$(mktemp -d)
git checkout-index -a -f --prefix="$T/"
cp -R chrome-sidebar/vendor "$T/chrome-sidebar/vendor"
ln -s "$PWD/chrome-sidebar/node_modules" "$T/chrome-sidebar/node_modules"
npm --prefix "$T/chrome-sidebar" test && npm --prefix "$T/chrome-sidebar" run build
```

A failure that appears only in the tree and not in the extracted index is
usually two sessions disagreeing about one name — a renamed element id against
the other session's older assertion — rather than a flake. Do not re-run it
until it passes; find out which of the two trees it is failing in.

The service is [erics-tools-api.ezberry.workers.dev](https://erics-tools-api.ezberry.workers.dev); the mobile entry point is [/app/](https://erics-tools-api.ezberry.workers.dev/app/). A push, deployment, D1 publication, delivered extension directory, and installed client version are separate outcomes. Chrome may still need Reload, and an open mobile client may retain its older service worker. State any live or device verification that could not be completed.

## The Worker's own hostname

The Worker answers on **`tools.ezberry.net`**, and on its `workers.dev` host as well. Both are served at once and `workers_dev` stays on: a client still running an older version keeps reaching the host it was built with, so no version ever has to be installed by a deadline. The `tools` hostname is bound by a proxied placeholder DNS record plus a Worker route, because the dashboard's custom-domain flow would not match the zone; a `custom_domain` entry in `routes` is the tidier shape if it ever starts working.

`CLOUD_URL` in [`chrome-sidebar/src/cloud-storage.js`](../chrome-sidebar/src/cloud-storage.js) is the single place a client's host is decided, and `scripts/release.js` reads the same constant so a release cannot confirm a host the apps no longer call.

**`CLOUD_URL` is also the passkey's identity, and that is the expensive part.** `secret-vault.js` derives `VAULT_RP_ID` from its hostname for extension pages, and the phone app reaches the same ID through `location.hostname` because it is served from that very host. One passkey opens the protected sections in both places precisely because those two agree.

Changing the host therefore re-keys the vault, in three ways at once. A credential registered against one relying-party ID cannot be asserted against another, so the passkey stops answering. The key that seals card numbers, account details and personal records is the PRF output of that credential, so those envelopes stop opening. And moving one client without the other leaves the extension and the phone on different IDs, splitting the vault. The recovery code still opens existing records — it carries the key material itself — but a passkey enrolled against the new hostname produces a different key, and nothing re-seals existing records under it.

The move from `workers.dev` to `tools.ezberry.net` was made deliberately, at the one moment it was free: no sealed value existed anywhere — no personal records, no finance account details, no card or travel numbers — so the only cost was enrolling a passkey again. **That moment will not come back.** Any future move must start by reading out every sealed value while the current passkey still works, and should begin by pinning `VAULT_RP_ID` to a literal independent of `CLOUD_URL`, so that only the phone is affected.

Moving the clients is therefore two releases, never one:

1. **Serve the new host.** Bind it to the Worker and confirm it answers. Nothing is affected, because no client knows about it.
2. **Point the clients at it.** Change `CLOUD_URL`, rebuild both apps, package, release and publish — then re-enroll the passkey, and re-add the phone app from the new origin, which is a fresh install with its own storage and access token.

`/` redirects to `/app/`, so the bare hostname opens the phone app rather than returning the `401` every other unrecognized path gets. A Worker route needs a proxied DNS record to match against; a custom domain creates its own.

## Storage against the limit

The account is on the **Workers free plan**: 500 MB per D1 database, 5 GB across
every database, at most 10 databases. `erics-personal-tools` is the only one,
and it was 303 kB at 24 tables when this was written — three ten-thousandths of
what it is allowed. The paid plan's numbers (10 GB per database, 250 GB across
the account) are in `chrome-sidebar/src/quota-data.js` beside the free ones, and
`CLOUDFLARE_PLAN=paid` is the whole of the switch if the account ever moves.

**A database cannot measure itself.** `PRAGMA page_count` from the Worker comes
back `SQLITE_AUTH`, so the size is read from Cloudflare's own API and needs a
credential nothing else here holds:

- `CLOUDFLARE_ACCOUNT_ID` — a plain var in `wrangler.jsonc`, not a secret.
- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token scoped to **Account · D1 ·
  Read** and nothing else, set with `npx wrangler secret put CLOUDFLARE_API_TOKEN`.
  It reads sizes; it must never be given write scopes, and it is not the
  Worker's own `API_TOKEN`.

Without both, `GET /v1/storage` answers 503 saying which is missing and the
hourly sweep logs that it is unconfigured. Neither is a failure of anything
else, and no size is ever guessed from the rows the Worker can see.

Apply `storage-usage-schema.sql`. Its one `storage_usage` row holds the last
reading and the threshold band it was last announced at. The reading is sizes
and a timestamp only: what the plan allows is applied when the row is served,
never stored beside it, so changing `CLOUDFLARE_PLAN` is answered by the reading
already in hand rather than at the next sweep — which is the hour someone who
just changed plans would be looking. The row is account
telemetry, so it is not encrypted, no device queues edits to it, and it may be
deleted at the cost of one repeated notification.

The reading is taken hourly by the cron and stands for an hour, so opening
Settings normally costs no request to Cloudflare; Refresh there is the owner
asking for it now. A reading Cloudflare refuses does not replace the one already
held — the screen keeps the figure and says how old it is.

**Crossing 75%, 90% or 100% sends one notification** to every subscribed device,
through the same Web Push path as the morning digest. Sitting above a threshold
sends nothing more; falling back below one re-arms it. This is the point of the
feature: the plan can be changed before the limit is reached, not after.

## Resource use

Budget the service's capabilities together, including mobile asset requests that pass through the Worker, API polling, D1 operations, and external provider calls. Verify the account's current plan and measured usage when assessing capacity; do not copy another project's quota or assume all request types have the same billing treatment.

Prefer bounded requests and batches, meaningful refreshes, and queries that avoid rewriting unchanged records. Preserve the persisted, at-most-hourly release-check throttle, including failed attempts and shared sidebar instances. Keep useful offline reads local.

Set explicit request and output limits for new external operations. Retry only safe or deduplicated operations; timeouts may leave completed writes or billable AI calls. Measure the added traffic and storage when expanding a capability, and do not enable paid services or increase spending limits silently.
