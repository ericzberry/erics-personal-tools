# Taxes

Filing a tax document where it belongs, without opening Drive.

Drop a K-1, a 1099 or anything else that arrives for a tax year; the device
reads it, proposes what it is; you correct anything wrong and file it. It lands
in the year's subfolder of the tax folder in Google Drive, named the way the
rest of that folder is named.

## What the tool does

**The document is read on the device.** `statement-text.js` pulls the text out
of a PDF or a spreadsheet, or downscales a photo, exactly as it does for a
Finance statement. Only that text — or the downscaled picture — is sent to the
reading. The file itself goes one place: Drive.

**The reading is asked three questions and nothing else.** `tax-intake` returns
the form type, the issuer and the tax year printed on the document, with a
confidence and a sentence saying what it read them off. It is not asked what the
document says or what anything totals. Every answer arrives in an editable
field, and a document it cannot read still files — you name it yourself.

**The year defaults to the one just ended.** Documents arrive after their year,
so in 2026 the tool offers 2025 first, with 2026 and 2024 either side of it. A
document the reading thinks is older than that window is reported rather than
filed somewhere convenient.

**The name is settled before the bytes move.** `POST /v1/drive/plan` resolves
the year folder — creating it if this is the first document of that year —
checks whether the name is taken, and returns a ticket standing for that
destination. The upload carries the file and the ticket, so the destination
shown to you is the destination the file reaches, and no firm or fund name ever
travels in a URL that request logs would keep. A ticket is good once and for
fifteen minutes.

**A name already in the folder stops the upload.** You are shown what is there
and offered *Keep both* — which files as `… (2).pdf` — or *Replace it*, which
writes a new version over the existing file. Nothing is overwritten without
that click; `new` over a name that exists is refused by the Worker too.

**Naming.** `Type - What it is.ext`: `Form 1099 - Schwab.pdf`,
`K-1 - Averin Capital Fund I, LP.pdf`. "Other document" carries no prefix, so
its name is whatever you call it. `chrome-sidebar/src/tax-data.js` owns the
types, the years, the naming and the validation, and both the app and the
Worker answer to it.

Documents up to 20 MB. Nothing is stored on the device or in D1 except the Drive
connection itself — Drive is the record, so there is nothing here to keep
offline.

## Google Drive access

The tax folder already exists and was made by hand, so per-file access cannot
reach it: the connection uses the `drive` scope. The Worker holds the refresh
token, encrypted at rest with `SETTINGS_ENCRYPTION_KEY` in `drive_accounts`;
no page ever receives a Drive credential, and the only writes the code can make
are creating a year folder, adding a file, and replacing one you asked to
replace. There is no delete path.

`GET /v1/drive/callback` is the one route outside the bearer check, because
Google's redirect arrives without one. A single-use `state` this Worker issued,
expiring in fifteen minutes, stands in for it.

### One-time setup (owner)

The Worker reports "Google Drive is not configured" until these exist.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen. On a Workspace account choose
   **Internal** — it needs no verification and its refresh tokens do not
   expire. On a personal account choose External, add yourself as the only
   user, and **set the publishing status to In production**: an app left in
   *Testing* has its refresh token expired by Google every seven days. The
   unverified-app warning at consent is expected; there is one user.
3. Create an **OAuth client ID** of type **Web application** with the redirect
   URI `https://erics-tools-api.ezberry.workers.dev/v1/drive/callback`.
4. From the repository root:

```sh
npx wrangler d1 execute erics-personal-tools --remote --file tools-api/drive-schema.sql
```

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
```

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

5. Deploy, open **Taxes**, press **Connect Google Drive**, and approve. The tool
   waits for the consent tab and shows the connected account when it is done.

**Disconnect** deletes the stored token and the access token this Worker was
holding. It changes nothing in Drive: every filed document stays where it is.

## The folder

`TAX_ROOT_FOLDER_ID` in `chrome-sidebar/src/tax-data.js` is the top-level tax
folder. Year subfolders are named by the four-digit year and are created on
first use. Two folders for the same year is reported rather than guessed at.

## Where the code is

| Piece | File |
| --- | --- |
| Types, years, naming, validation | `chrome-sidebar/src/tax-data.js` |
| The tool, shared by both hosts | `chrome-sidebar/src/taxes.js` |
| Its DOM | `chrome-sidebar/src/components/taxes.js` / `.css` |
| Extension page | `chrome-sidebar/taxes.html` → `src/taxes-page.js` |
| Mobile mounting | `mobile-app/public/app/capabilities.js` |
| Drive access and the routes | `tools-api/src/drive.js`, `tools-api/drive-schema.sql` |
| The reading | `tools-api/src/taxes.js` (`/v1/ai-connections/:id/tax-intake`) |
| Synthetic states to look at | `chrome-sidebar/tests/taxes-preview.html` |
