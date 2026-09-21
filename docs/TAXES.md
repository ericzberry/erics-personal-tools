# Taxes

Filing a tax document where it belongs, without opening Drive.

Drop a K-1, a 1099 or anything else that arrives for a tax year — or a return
you filed, a quarterly voucher, the receipt that paid it; the device reads it,
proposes what it is; you correct anything wrong and file it. It lands in the
year's subfolder of the tax folder in Google Drive, named the way the rest of
that folder is named. A document that arrives locked is filed unlocked.

## What the tool does

**The document is read on the device.** `statement-text.js` pulls the text out
of a PDF or a spreadsheet, or downscales a photo, exactly as it does for a
Finance statement. Only that text — or the downscaled picture — is sent to the
reading. The file itself goes one place: Drive.

**The connection is not part of the tool.** A connected Drive is named nowhere:
no heading, no account, no maintenance row. The Google Drive group appears only
while the tool is not connected, where **Connect Google Drive** is the whole
point of it. Nor is an AI connection asked for — the tool uses the saved
connection with a key that was changed most recently (`/v1/ai-connections`
answers most recent first) and keeps it while it exists. With no usable
connection saved, one line under the drop zone says where to save one.
Disconnecting Drive is therefore not offered from the tool once it is connected.

**The reading is asked what it takes to name and place the document, and
nothing else.** `tax-intake` returns the form type, the issuer, the tax year
printed on it, which of the five taxpayers it belongs to, and — for a return or
an instalment — which government and which quarter. It is not asked what the
document says or what anything totals. Every answer arrives in an editable
field, and a document it cannot read still files — you name it yourself.

**Whose it is, and what that decides.** Five taxpayers file here: Eric & Ariana
Berry and the four trusts, listed in `tax-data.js`. Every document names one,
which the reading proposes and you correct. It decides two things: from tax year
2026 it is the first subfolder inside the year the document lands in, and for a
return or an instalment it is part of the filed name. 2025 and earlier were
filed straight into the year folder and stay that way, so nothing already filed
moves. A subfolder you made by hand is filed into rather than duplicated.

**What it is for, and what that decides.** Inside a taxpayer's year, from 2026,
a document sits under one of three things — what went to a tax authority, what
was paid, and everything backing the two up:

| Filed under | What goes there |
| --- | --- |
| `Filings` | A filed return, and anything else sent to a tax authority |
| `Payments` | Quarterly estimates and the receipts proving they were paid |
| `Supporting Documents` | K-1s, 1099s, W-2s, statements, receipts — everything that arrives |

The document type settles this in every ordinary case, so choosing the type
answers it. It stays a field because the cases it does not settle are real: an
extension request, a notice, anything filed as "Other document". It changes
where a document lands and never what it is called.

**A return, an instalment and its receipt are named from their own facts.** They
have no issuer, so they are not asked for one; they are asked which government —
Federal or New York — and, for a quarterly payment, which quarter:

- `Return - Federal - Eric & Ariana Berry.pdf`
- `Estimated payment - Q3 Federal - Berry 2020 Irrevocable Family Trust.pdf`
- `Proof of payment - Q2 New York - Berry EA 2021 Irrevocable Family Trust.pdf`

The taxpayer is in the name as well as in the folder, so a return downloaded on
its own still says whose it is.

**A locked document is filed unlocked.** Tax documents often arrive encrypted.
`pdf-crypt.js` reads the lock and says which kind it is. A file locked only
against editing — a bank's statement, with an empty user password — opens
without anyone being asked. A file that genuinely needs a password stops and
asks for it; the password is used on the device and is never saved or sent
anywhere. `pdf-unlock.js` then writes an unlocked copy — every object decrypted
and written back, `/Encrypt` gone, the cross-reference table rebuilt — and reads
that copy back before offering it, because filing a quietly corrupted return
would be worse than filing a locked one. The copy is what reaches Drive, so the
document still opens in five years. RC4, AES-128 and AES-256 locks are all
opened, by the user password or the owner password. When there is no password to
be had, **File it locked** files the document exactly as it arrived and says so.

**The year defaults to the one just ended.** Documents arrive after their year,
so in 2026 the tool offers 2025 first, with 2026 and 2024 either side of it. A
document the reading thinks is older than that window is reported rather than
filed somewhere convenient.

**The name is settled before the bytes move.** `POST /v1/drive/plan` resolves
the folders — the year, and from 2026 the taxpayer and then what the document is
for, creating whichever of them is not there yet — checks whether the name is
taken, and returns a ticket standing for that destination. The upload carries the file and the ticket, so the destination
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
types, the taxpayers, the years, the naming, the folder path and the validation,
and both the app and the Worker answer to it.

**It opens in the side panel**, beside the message a document arrives in, so a
K-1 can be dragged out of an open mail message and onto the drop zone without a
tab in between. An attachment dragged that way is not a file yet — the page
hands over Chrome's `DownloadURL`, a type, a name and a URL — so
`components/file-drop.js` fetches it with the session's cookies, because an
attachment URL resolves only for the signed-in reader. A real file dropped from
the desktop still takes the direct path and never touches the network.

Documents up to 20 MB. Nothing is stored on the device or in D1 except the Drive
connection itself — Drive is the record, so there is nothing here to keep
offline.

## Google Drive access

The tax folder already exists and was made by hand, so per-file access cannot
reach it: the connection uses the `drive` scope. The same connection also
carries read-only Gmail, which is how the writing voice is learned — see
[GMAIL.md](GMAIL.md) — and read-only Calendar, which is where Reminders finds
the birthdays already written down — see [REMINDERS.md](REMINDERS.md). One
Google account, one refresh token, one thing to renew; `GOOGLE_SCOPES` in
`src/drive.js` is the whole list. The Worker holds the refresh
token, encrypted at rest with `SETTINGS_ENCRYPTION_KEY` in `drive_accounts`;
no page ever receives a Drive credential, and the only writes the code can make
are creating a folder in the path a filing needs, adding a file, and replacing
one you asked to replace. There is no delete path.

`GET /v1/drive/callback` is the one route outside the bearer check, because
Google's redirect arrives without one. A single-use `state` this Worker issued,
expiring in fifteen minutes, stands in for it. The `state` records the redirect
URI it was issued against, so a consent begun on one hostname is completed on
that same hostname.

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

   Branding asks for a home page, a privacy policy and terms of service. The
   [`site/`](../site) Worker serves all three on `ezberry.net`, which must also
   be listed as an authorized domain: `https://ezberry.net`,
   `https://ezberry.net/privacy`, `https://ezberry.net/terms`. Keep what that
   policy claims true of `src/drive.js`.

3. Create an **OAuth client ID** of type **Web application**. Register **both**
   of the Worker's hostnames as authorized redirect URIs:

   - `https://tools.ezberry.net/v1/drive/callback`
   - `https://erics-tools-api.ezberry.workers.dev/v1/drive/callback`

   `src/drive.js` derives the redirect URI from the origin the request arrived
   on, so a client still calling the `workers.dev` host consents against that
   host and one on `tools.ezberry.net` consents against that one. Registering
   both means moving hosts never touches the OAuth client — see
   [CLOUDFLARE.md](CLOUDFLARE.md).
4. From `tools-api/`, not the repository root — every one of these reads the
   ignored `wrangler.jsonc` beside them to know which Worker and database it is
   talking to, and hangs looking for it anywhere else:

```sh
cd tools-api && npx wrangler d1 execute erics-personal-tools --remote --file drive-schema.sql
```

```sh
cd tools-api && npx wrangler secret put GOOGLE_CLIENT_ID
```

```sh
cd tools-api && npx wrangler secret put GOOGLE_CLIENT_SECRET
```

   Each secret command prompts for the value on a hidden input: paste it and
   press Return, and expect to see nothing as you type. Run these in a terminal
   you can type into rather than through an editor's run button, which may not
   attach a keyboard to the prompt.

5. Deploy, open **Taxes**, press **Connect Google Drive**, and approve. The tool
   waits for the consent tab, and when it is answered the group disappears: a
   connected tool is a drop zone, the fields and what is already filed.

**Disconnect** deletes the stored token and the access token this Worker was
holding. It changes nothing in Drive: every filed document stays where it is. It
sits beside **Connect Google Drive**, so it is reachable only while the tool
shows that group — a connected tool shows nothing about its connection, and
disconnecting means calling `POST /v1/drive/disconnect`.

## The folder

`TAX_ROOT_FOLDER_ID` in `chrome-sidebar/src/tax-data.js` is the top-level tax
folder. Year subfolders are named by the four-digit year and are created on
first use. From `TAX_SUBFOLDER_FROM_YEAR` — 2026 — each year is divided again:

```
2026 / Berry EA 2024 Family Trust / Filings / Return - Federal - Berry EA 2024 Family Trust.pdf
```

Folders are named by the taxpayer's own label and the category's. The Worker
walks that path from the tax folder down, using each folder it finds and making
each one it does not. Two folders of the same name in the same place is reported
rather than guessed at.

**Already filed** lists a year's own documents, then each taxpayer's, then each
of theirs by what it is for — one line per document, wherever in the year it
sits. It is read to answer one question — is this one already in there? — so a
row is the name and nothing else. Reading a year is finding its folder and one
Drive request per level below it, because each level is asked for all of its
parents at once rather than one folder at a time.

The tool's sections are disclosures (UI-35). **File a document** starts open,
since filing is what the tool is opened for; **Already filed** starts shut, so
a year of dozens of names is there when asked for rather than under every drop.

## Where the code is

| Piece | File |
| --- | --- |
| Types, taxpayers, categories, years, naming, folders, validation | `chrome-sidebar/src/tax-data.js` |
| The tool, shared by both hosts | `chrome-sidebar/src/taxes.js` |
| Its DOM | `chrome-sidebar/src/components/taxes.js` / `.css` |
| Extension page | `chrome-sidebar/taxes.html` → `src/taxes-page.js`; also mounted into the side panel by `capability-links.js` |
| Mobile mounting | `mobile-app/public/app/capabilities.js` |
| Drive access and the routes | `tools-api/src/drive.js`, `tools-api/drive-schema.sql` |
| The reading | `tools-api/src/taxes.js` (`/v1/ai-connections/:id/tax-intake`) |
| Opening a locked document | `chrome-sidebar/src/pdf-crypt.js` |
| Writing the unlocked copy | `chrome-sidebar/src/pdf-unlock.js` |
| Synthetic states to look at | `chrome-sidebar/tests/taxes-preview.html` |
| What the states must hold to | `chrome-sidebar/tests/taxes-tool.test.js` |
| Locked PDFs to test against | `chrome-sidebar/tests/fixtures/locked-pdf.js` |
