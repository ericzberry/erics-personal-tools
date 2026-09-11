# Eric’s AI settings service

Worker: `https://erics-tools-api.ezberry.workers.dev`. Existing D1 database: `erics-personal-tools`, binding `DB`.

The extension-only settings page is `chrome-sidebar/settings.html`. Open it with the `ericberry` address-bar keyword (Tab, Enter), the extension’s Options menu, or Settings in its sidebar header. Chrome must have the extension installed and enabled. It is not a hosted website or a custom URL scheme.

The page uses extension messages. A service-worker bridge accepts only the exact installed settings and sidebar pages, keeps the extension access token in trusted local storage, and calls this fixed Worker. Other websites and content scripts cannot invoke settings operations. No `externally_connectable` or web-accessible page is declared.

## Storage and API

Every endpoint requires `Authorization: Bearer <API_TOKEN>`. This is a personal, single-owner API; a bearer token grants access to the owner’s connections. It is separate from a Cloudflare account token and from AI provider credentials.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Checks authentication and schema; reports version 2 |
| GET | `/v1/ai-connections` | Lists connections with `hasApiKey`; never returns a key |
| PUT | `/v1/ai-connections/<uuid>` | Creates or updates a connection |
| DELETE | `/v1/ai-connections/<uuid>` | Removes a connection and its key |

PUT accepts `{name, provider, model, baseUrl, apiKey?, revision}`. Supported providers come from the shared registry described in [AI integrations](PROVIDERS.md). Custom providers additionally accept `apiFormat`: `chat`, `responses` or `anthropic`. Revision is null for creation; use the returned revision to update or delete. DELETE accepts `{revision}`. Conflicts return 409; reload connections before editing again. API URLs, if supplied, must use HTTPS and exclude embedded credentials, query parameters and fragments.

Keys and connection fields are encrypted together with AES-256-GCM in `ai_connections.value`, with random nonces and the connection ID as authenticated additional data. IDs, revisions and timestamps remain available for querying. Encryption uses `SETTINGS_ENCRYPTION_KEY`, a separate 32-byte hex Worker secret. Blank/omitted keys on page edits keep the saved key; the remove-key toggle explicitly sends an empty string. Changing provider or API URL without a replacement key clears the old one. The Worker decrypts internally and only returns masked settings. Possession of the access token does not reveal saved keys through these endpoints, but permits replacement and deletion.

Bodies are limited to 64 KB, SQL uses bound parameters, responses disable caching, and no website CORS access is granted. The extension omits cookies and rejects redirects. Provider calls and credential testing are now implemented; see [AI integrations](PROVIDERS.md). It does not upload ESPN or Gmail data. The previous `/v1/records/*` endpoints are retired; any legacy rows are left untouched.

## Deployment

1. `npm ci`; sign in with `npx wrangler login --device` if necessary.
2. Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc` and set the existing database ID/account ID. Do not create another database.
3. `npx wrangler d1 execute erics-personal-tools --remote --file=schema.sql` adds the table without dropping legacy data.
4. Set secrets with `npx wrangler secret put API_TOKEN` and `npx wrangler secret put SETTINGS_ENCRYPTION_KEY`. The first is a random access token of at least 32 characters; the second is 64 hex characters from 32 cryptographically random bytes. Do not change the encryption secret without decrypting/re-encrypting existing records first.
5. `npm test`, then `npm run deploy`.
6. In `../chrome-sidebar`, run tests, `npm run build`, reload the unpacked extension and open Options.

The access token for this installation is in the ignored `.env.extension-token` file; the encryption key is in ignored `.env.settings-encryption-key`. Both are owner-readable only and excluded from extension builds. Retain the encryption key securely to preserve access to saved settings; do not paste it into the extension. Local emulator test secrets belong in ignored `.dev.vars`.

## Verification

Tests cover authentication, AES-GCM storage, masked responses, key retention/removal, destination changes, revision conflicts, validation and deletion. Node tests use SQLite and require Node 22.13+. The extension also tests the message boundary, page add/edit/delete flow and component architecture. Live checks use a temporary synthetic connection and remove it afterward; personal provider keys are not needed. Native Chrome registration of the options page and keyword requires reloading the installed extension.


## Rewards sync

`POST /v1/ai-connections/:uuid/card-benefits` accepts `{name}` — a rough or exact credit card name — and returns `{card, benefits}`: one wallet `card` entry and the benefits it carries, each already in the wallet's entry shape, or `{matches:[{name,note}]}` when the name fits more than one real product. It requires an OpenAI connection, web-search evidence, and the issuer page it cites to be one the search actually opened. It stores nothing; the owner reviews and saves. See [REWARDS.md](../docs/REWARDS.md).

`GET /v1/rewards` returns `{entries, revision, updatedAt}`; `PUT /v1/rewards` accepts `{entries, revision}`. This single-owner wallet lives in `rewards_wallet`, encrypted with the existing `SETTINGS_ENCRYPTION_KEY` and protected by `API_TOKEN`. A stale revision returns 409. Entries are validated, IDs must be unique, the request limit is 64 KB, and at most 500 entries are accepted. Emptying the list removes its saved entries. No bank or airline API connections are created.

`GET /v1/rewards/programs` (and `/snapshot`, for offline synchronization) returns `{records}` — one catalogue of published offers per reward program. `GET /v1/rewards/programs/:id` returns `{catalog}` or `{catalog: null}`; `PUT /v1/rewards/programs/:id` accepts a reading taken from the program's own site and returns the stored result. These live in `program_catalogs` (apply `npx wrangler d1 execute erics-personal-tools --remote --file programs-schema.sql`), encrypted with the same key and protected by the same token. The write folds the reading into what is already stored rather than replacing it, so simultaneous readings from two browsers cannot lose offers or reset how long the owner has had one, and a partial reading — one taken somewhere other than the program's full listing — may add and update but never retire an offer. The request limit is 256 KB because a whole catalogue is one document, and at most 500 offers are accepted. Only programs in the shared registry are addressable; anything else returns 404. See [reward programs](../docs/REWARD_PROGRAMS.md).

The extension migrates legacy device records only after acknowledgement and refreshes the D1 wallet when opened and once a minute while visible outside editing. Apply the additive schema before deploying the Worker.

## Restaurant research

`POST /v1/ai-connections/<uuid>/restaurants` accepts `{search}` and uses the saved OpenAI key and central restaurant research policy. It requires live web-search sources, filters ungrounded restaurant/booking URLs, and returns an explicitly bounded shortlist. It never returns live reservation inventory from web snippets. The extension separately reads rendered booking pages, with `restaurant.availability` handling uncertain layouts through the existing generate endpoint. Research has a 120-second provider timeout; other requests retain their existing limits. See [reservation behavior and validation](../chrome-sidebar/RESTAURANTS.md).
## Travel wallet

## Taxes and Google Drive

`/v1/drive/*` files tax documents into the owner's Drive. Apply
`npx wrangler d1 execute erics-personal-tools --remote --file drive-schema.sql`
and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with `npx wrangler secret
put`; without them the routes report that Drive is not configured rather than
failing. The refresh token is encrypted with the same `SETTINGS_ENCRYPTION_KEY`
and never leaves the Worker. `GET /v1/drive/callback` is deliberately outside
the access-token check, because Google's redirect carries none; a single-use
`state` this Worker issued stands in for it. `POST /v1/drive/plan` resolves a
destination and returns a ticket, and `POST /v1/drive/upload` takes the file
itself with that ticket — the one route whose body is not JSON, capped at 20 MB
by its declared `Content-Length`. Consent, the scope and the one-time Google
Cloud setup are in [docs/TAXES.md](../docs/TAXES.md).

Apply `npx wrangler d1 execute erics-personal-tools --remote --file travel-schema.sql` before deploying the travel endpoints. `GET /v1/travel` returns only record metadata; authenticated `GET /v1/travel/:id` retrieves a number and notes. Authenticated `GET /v1/travel/snapshot` returns full records for encrypted offline synchronization. `PUT` and `DELETE` require the current revision (null for new records). Records use the existing AES-GCM encryption key with travel-specific authenticated context. The phone and extension use the same authenticated endpoints. Service-worker caching excludes all API responses.

Apply `npx wrangler d1 execute erics-personal-tools --remote --file reminders-schema.sql` before deploying `/v1/reminders`, which is the same generic record store over `reminder_records`. It validates a reminder's anchor date and repeat interval and never computes a due date; the device works out what today means. `POST /v1/ai-connections/:id/capture` reads one short typed note into a record one of the record routes already accepts, and returns 422 with its own explanation when the note names nothing datable. See [reminders](../docs/REMINDERS.md).
