# Backups

Once a calendar quarter the Worker writes the whole D1 database to one JSON file
in Google Drive, in the folder the owner chose:
[Eric's Tools backups](https://drive.google.com/drive/folders/1b6icdt5lQyTLjvy9dx_tvG6wiEudIrBw).
Drive keeps every file ever written; nothing deletes or replaces one. Any table,
or the whole Finance ledger at once, can be restored from any of them.

The code is [`tools-api/src/backup.js`](../tools-api/src/backup.js) (taking,
uploading, restoring, the routes) and
[`tools-api/src/backup-format.js`](../tools-api/src/backup-format.js) (the file
itself, its digests, and which versions can be read). The operator's way in is
[`tools-api/scripts/backup.mjs`](../tools-api/scripts/backup.mjs).

## When one is taken

- **Quarterly.** A daily trigger of its own, `0 8 * * *` (08:00 UTC), writes the
  quarter's backup the first day it runs in that quarter, so the file dated the
  1st of January is the ledger as the year closed. A day that fails is tried
  again the next day. When a quarter still has no backup after a second failed
  day, every subscribed device is told once, with the reason.
- **Daily, for Health.** After the quarterly check, the same trigger reads the
  `health_` tables' row count and latest write; on a day either changed it
  writes a `daily-health` file of those tables only and then removes all but
  the newest thirty `daily-health` files. Only files of that kind are ever
  removed — the quarterly, manual and safety files stay under this document's
  no-deletion rule. The state row keeps the last mark, so an unchanged day
  costs two queries and no file. A failed day keeps the last good file and
  says so in the log without any health detail.
- **Manual.** `backup.mjs run`, any time. It does not stand in for the quarter's
  own.
- **Before every restore**, automatically, of exactly the tables about to be
  replaced. A restore that cannot save that file first does not happen.

The daily trigger is the second entry in `triggers.crons`. The real
`wrangler.jsonc` is ignored by Git, so if it drifts from
`wrangler.example.jsonc` and loses that entry, no backup is ever taken and
nothing else would notice. Its expression must equal `BACKUP_CRON` in
`backup.js`, which the tests check against the template.

## What is in the file

Every table in the database, discovered when the backup runs rather than listed
in code — so a table added later is included without anyone remembering, and so
are tables no schema file declares any more but that still hold rows
(`finance_records`, `records`, `property_records`). Left out: SQLite's and
Cloudflare's own bookkeeping, and `drive_tickets`, which expire in fifteen
minutes. All tables are read in one D1 batch, which D1 runs as one transaction,
so the file is one moment of the database: a figure is never saved without the
portfolio it belongs to.

Rows are stored exactly as D1 holds them. **Nothing is decrypted.** Records the
Worker seals with `SETTINGS_ENCRYPTION_KEY` are still sealed in the file, and
values the device sealed with the passkey are sealed twice, as they are in D1.
The file therefore tells a reader nothing the database does not. The Finance
ledger's figures are plain integers in D1 (cents, dates as `YYYYMMDD`, portfolio
and firm codes), so they are plain in the file too; portfolio names, investment
names and property addresses are sealed.

```json
{
  "format": "erics-tools-backup",
  "version": 1,
  "kind": "quarterly",
  "createdAt": "2026-10-01T08:00:03.120Z",
  "quarter": "2026-Q4",
  "database": "erics-personal-tools",
  "scope": "full",
  "apps": {"chrome-sidebar": "0.6.261", "mobile-app": "0.6.261"},
  "encryption": {"envelope": 1, "cipher": "AES-256-GCM", "secret": "SETTINGS_ENCRYPTION_KEY",
                 "additionalData": "record id", "keyCheck": "e0b8232d914a5081"},
  "tables": [
    {"name": "finance_marks", "schema": "CREATE TABLE finance_marks (…)",
     "columns": ["portfolio", "class", "firm", "as_of", "cents"], "count": 412,
     "rows": [[1, 1, 3, 20260630, 4300000000], …], "sha256": "…"}
  ],
  "sha256": "…"
}
```

Named `erics-tools-backup-YYYY-MM-DD-HHMMZ-<kind>.json`, and tagged in Drive with
`appProperties` (`ericsToolsBackup` = the format version, `backupKind`,
`backupQuarter`), which is how a listing tells a backup from anything else kept
in the folder.

## Versions and compatibility

Three different versions are in play, and they are not the same thing:

| What | Where | Governs |
| --- | --- | --- |
| **Backup format** | `version` in the file; `BACKUP_VERSION` in `backup-format.js` | The file's own shape: the header, how rows and cells are written, how digests are computed |
| **Table schema** | each table's `schema` (its `CREATE TABLE`) | What columns the rows were read from |
| **Encryption envelope** | `encryption.envelope`, and the `{"v":1,…}` inside each sealed value | How sealed values open, and with which key (`keyCheck`) |

The app versions in `apps` are there to tell you what was running when the file
was written. Nothing is decided by them.

The rules:

- **A reader refuses a format newer than its own** and says so, rather than
  guessing. Use a checkout whose `BACKUP_VERSION` is at least the file's.
- **An older format is upgraded step by step** through `UPGRADES` in
  `backup-format.js` before it is used. Changing the file's shape means raising
  `BACKUP_VERSION` *and* adding the step that turns the previous version into the
  new one, so every file ever written stays readable. Digests are checked
  against the file as written, before any upgrade.
- **Tables are restored by column name**, not position. A column added since the
  backup takes its default. A column the backup has and the table no longer does
  makes SQLite refuse the insert, and the restore is rolled back whole. The
  preview reports both, and says when a table's `CREATE TABLE` has changed.
- **The key must match.** `keyCheck` is a hash of `SETTINGS_ENCRYPTION_KEY` —
  enough to tell two keys apart, useless for recovering one. A restore into a
  Worker holding a different key is refused, because every sealed record would
  come back as text nothing can open.
- A cell is `null`, a number or a string. Bytes (`{"base64": …}`) and
  non-finite reals (`{"real": …}`) are encoded rather than lost; no table holds
  either today, and a restore refuses a table containing them — in the file, or
  in the database now, which it has to compare before replacing — until a
  version that handles them exists.

## How a file proves it is whole

Each table carries a SHA-256 over its name, schema, columns and rows; the file
carries one over its header and the list of table digests. So one damaged table
is reported by name and the others can still be restored, and a changed header is
caught too. The Worker verifies the file before uploading it, and compares
Drive's own `sha256Checksum` of what it stored against the bytes it sent; a
mismatch fails the run and the next day's run writes a good one.

To check a file yourself — no token, no network — download it from Drive and:

```sh
node tools-api/scripts/backup.mjs verify ~/Downloads/erics-tools-backup-2026-10-01-0800Z-quarterly.json
```

## Restoring

**First, is it recent?** D1's own Time Travel restores the whole database to
any minute in the last 7 days (30 on a paid plan):
`npx wrangler d1 time-travel restore erics-personal-tools --timestamp=<ISO time>`.
That is the right tool for something noticed within the week. The quarterly
backups are for damage noticed later — the kind the Finance ledger has already
had once, when a figure silently overwrote another for weeks.

Otherwise, from the repository root:

```sh
node tools-api/scripts/backup.mjs list
node tools-api/scripts/backup.mjs restore <drive-file-id> --tables finance
```

Without `--confirm` that is a preview and changes nothing: per table, how many
rows the backup has, how many there are now, how many it would put back and how
many it would take away. Then:

```sh
node tools-api/scripts/backup.mjs restore <drive-file-id> --tables finance --confirm
```

- `--tables finance` is every `finance_` table in the file at once, which is the
  unit that makes sense for the ledger: its figures, capital accounts and
  valuations point at its portfolios, holdings and properties. `--tables
  health` is every `health_` table, from a quarterly or a `daily-health` file.
  Other tables are named individually, comma-separated.
- The restore is one D1 transaction with foreign-key checks deferred to the
  end: every named table goes back, or — a figure left pointing at a portfolio
  that is not there, a column that no longer exists — none does.
- Tables that are not named are not touched: restoring the ledger does not
  rewind a reminder written since.
- What is about to be replaced is written to Drive first as a `before-restore`
  file. Restoring from that file undoes the restore.
- If one of those tables changes while that file is being written — a device
  syncing an edit — the restore stops without changing anything, because the
  file would not hold the edit: the batch that replaces the tables first checks,
  inside the same transaction, that they are still exactly what the file saved.
  Run it again. Edits to tables that are not named do not stop it.
- After it runs, the tables are read back and compared with the backup;
  the result says whether they matched.
- On the Workers Free plan one request may make 50 D1 queries, so a restore
  takes about ten tables at a time. The ledger fits; restoring everything means
  a few runs.

Then open the app on each device so it refreshes from the restored records. A
device holding an edit queued against a newer revision will raise it as a
conflict rather than overwrite the restored row — resolve it there. See
[Durable synchronization and recovery](CLOUDFLARE.md#durable-synchronization-and-recovery).

## What this backup depends on

- **`SETTINGS_ENCRYPTION_KEY`.** Sealed rows restore only into a Worker holding
  the key they were sealed with. Cloudflare cannot show a secret once it is set,
  so keep a copy of this key somewhere safe outside Cloudflare (a password
  manager). Without it, a backup still restores the ledger's figures but not
  the names they belong to, nor any other sealed record.
- **The Google connection** Taxes set up, with the full Drive scope, and a
  connected account that can add files to the backup folder. If the folder
  belongs to another account, share it with the connected one as an editor.
- **The passkey** for values the device sealed (card numbers, personal records).
  Restoring puts those envelopes back; only the passkey or the recovery code
  opens them, exactly as before.

## Limits

- One Drive upload takes 5 MB; the database is a few hundred kilobytes. Past
  5 MB the run fails saying the upload has to become a resumable one.
- One backup reads every table in one batch, one statement each, within the
  Free plan's 50 queries: it fails, saying so, past 42 tables.
- The state the daily trigger keeps is one row in `backup_state`
  ([`backup-schema.sql`](../tools-api/backup-schema.sql)): the last quarterly
  file, the last of any kind, the last restore, a failing quarter's day
  count, and the health tables' last mark. Losing it costs at most one extra backup.

## Routes

All behind the bearer token.

| Route | Does |
| --- | --- |
| `GET /v1/backup` | What the last runs did, from D1 alone, the daily health copy included |
| `GET /v1/backup/files` | The backups in the folder, newest first |
| `POST /v1/backup/run` | Takes one now |
| `POST /v1/backup/restore` | `{fileId, tables, confirm}` — a preview unless `confirm` is exactly `true`. Reads only files in the backup folder |
