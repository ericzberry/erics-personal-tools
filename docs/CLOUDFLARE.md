# Cloudflare runtime

Eric’s Tools uses the `erics-tools-api` Worker for its authenticated API and hosted mobile app. The Chrome extension is built and loaded separately. The existing D1 database is `erics-personal-tools`, bound as `DB`; mobile assets use the `ASSETS` binding.

The repository is the source of truth for Worker code, schema SQL, dependency metadata, tests, and deployment procedures. Cloudflare holds the deployed copy. Use the dashboard for inspection and account setup; reconcile any emergency dashboard code changes into the repository before the next deployment.

## Structure and ownership

| Location | Responsibility |
| --- | --- |
| `tools-api/src/index.js` | Request entry point, shared authentication and request limits, mobile asset responses, and capability routing |
| `tools-api/src/ai-settings.js`, `rewards.js`, `travel.js` | Capability-specific storage and operations |
| `tools-api/src/providers.js`, `model-policy.js` | Provider dispatch and central task-based model selection |
| `tools-api/src/releases.js` | Public, per-app release metadata lookup |
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

D1 stores durable application data here, including encrypted settings and wallets, plus public release metadata. It is not a temporary webhook inbox. Do not apply pending-only retention to saved records or delete cloud data when a device disconnects.

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
- A lost response can follow a successful server write. Reconcile the current cloud record before retrying. The existing adapter compares normalized record values or confirmed absence for deletes; that approach is for record state, not proof that an email, payment, or other external effect happened exactly once.
- Keep pending changes after failures and preserve explicit revision conflicts for review. Do not clear a queue, advance a revision, or mark work complete to hide an error. Serialize overlapping work within the affected resource so simultaneous windows cannot discard each other's changes.
- Keep pending-state removal and the corresponding local cloud state consistent in durable storage. Test interruptions before network submission, after server commit but before the response, and before the local completion write. Recovery must retain or safely reconcile the work.
- During an outage, retain readable offline records and queued edits, and resume synchronization on reconnect or foreground. Inspect pending counts, conflicts, and actionable errors without logging private contents. Bound drain work as queues grow so synchronization does not monopolize the client.
- After restoring cloud data or replacing a database, reconcile against device revisions and outstanding edits before resuming writes. Do not treat a restored snapshot as proof that pending work completed, or reset revision state to force acceptance. If a future stream uses cursors, identify the stream as well as the position so a replacement database cannot silently reuse an old cursor.

For recovery, first identify whether an operation failed to save locally, failed remotely, completed with a lost response, or conflicts with a newer record. Fix the cause and retry through the normal adapter, or use explicit conflict resolution. Disconnecting and clearing storage are not recovery shortcuts while unsynced work remains.

The [offline resource tests](../chrome-sidebar/tests/offline-resource.test.js) cover cold offline reopen, edits and deletes surviving restart, lost-response reconciliation, conflicts, failed local storage, and overlapping windows. Extend these tests for changed durability boundaries; do not assume every possible crash is already covered. Verify the actual mobile and extension flows with synthetic data as required by AGENTS.md.

## Deployment and release verification

Follow the release requirements in [AGENTS.md](../AGENTS.md). Release from a tested, committed, pushed checkout containing only the intended changes. In a shared dirty checkout, isolate the release first. Worker deployment packages mobile assets too, so an API-only fix must not deploy another task's unfinished mobile build.

1. Install locked dependencies in `tools-api` with `npm ci`. Confirm that the ignored Wrangler configuration targets the existing Worker and database, using the checked-in template. Follow the API README for initial authentication and secret provisioning.
2. Run the affected behavior and architecture checks and final app builds. From the repository root, the API suite is `npm --prefix tools-api test`; shared API behavior requires both app builds and relevant client checks. Node's SQLite-based tests require the runtime specified in the API README.
3. Align affected app versions, package the verified artifacts, inspect the staged diff, then commit and push as required by AGENTS.md. Preserve the fixed Chrome release destination.
4. Apply required schema upgrades from the release checkout using the documented D1 commands. Deploy with `npm --prefix tools-api run deploy`. Its `predeploy` script rebuilds mobile assets before Wrangler deploys the Worker and assets; it does not run the test suite, apply schema SQL, or publish release metadata.
5. Verify the deployed service and changed behavior using synthetic records where writes are necessary. Check mobile assets and the affected authenticated operation, not just `/health`. Its current `version: 2` is a service marker, not a Git revision or app release version. Record the deployment identity reported by Wrangler; do not infer it from local Git history.
6. After successful deployment and the required packaging, commit, and push, publish each affected app separately from the repository root:

   ```sh
   node tools-api/scripts/publish-release.js chrome-sidebar
   node tools-api/scripts/publish-release.js mobile-app
   ```

   Run only the commands for the apps being released. The script reads local manifests and writes release metadata; it does not deploy or validate the release. Verify the extension version at `/v1/releases/latest` and the mobile version at `/v1/releases/latest?app=mobile-app` on the deployed service.

The service is [erics-tools-api.ezberry.workers.dev](https://erics-tools-api.ezberry.workers.dev); the mobile entry point is [/app/](https://erics-tools-api.ezberry.workers.dev/app/). A push, deployment, D1 publication, delivered extension directory, and installed client version are separate outcomes. Chrome may still need Reload, and an open mobile client may retain its older service worker. State any live or device verification that could not be completed.

These documentation instructions do not themselves require a deployment or release publication.

## Resource use

Budget the service's capabilities together, including mobile asset requests that pass through the Worker, API polling, D1 operations, and external provider calls. Verify the account's current plan and measured usage when assessing capacity; do not copy another project's quota or assume all request types have the same billing treatment.

Prefer bounded requests and batches, meaningful refreshes, and queries that avoid rewriting unchanged records. Preserve the persisted, at-most-hourly release-check throttle, including failed attempts and shared sidebar instances. Keep useful offline reads local.

Set explicit request and output limits for new external operations. Retry only safe or deduplicated operations; timeouts may leave completed writes or billable AI calls. Measure the added traffic and storage when expanding a capability, and do not enable paid services or increase spending limits silently.
