# Health

A private notebook of personal and family health history: what happened, what
is taken, what runs in the family, kept so it can be found years later or read
off at an appointment. Choose **Health** from Tools in the extension, open
`health.html` for its own page, or open it from the phone's launcher. The whole
section sits behind the shared passkey gate described in
[PROTECTED_SECTIONS.md](PROTECTED_SECTIONS.md#the-gate).

## A sentence is a record

The editor asks for one thing: **Note**. **Type** (Note, Condition, Procedure,
Medication, Allergy or reaction, Test or result) and **When** are offered beside
it and may be left alone; the date starts empty. Everything else — directions
and status for a medication, status for a condition, family side for a
relative, whether the record belongs in the summary — waits behind one
**Details** disclosure and appears only for the type it applies to. There is no
provider, facility, dose, code or confidence field: those go in the note if the
owner wants them.

The first non-empty line of the note is the record's title in a list; the whole
note is kept and shown when the row opens. Nothing rewrites or normalizes the
text: "Possible migraine, never diagnosed" is saved as those words, under the
type Note, and stays those words in search results and in the export.

**When** is kept as typed. `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `around 2012` and
`2010–2012` also get a sort position; `as a child`, `age 8` and `early 50s` are
kept as text with none. History groups records by year, newest first, with an
**Undated** group after them ordered by entry time — the entry time is never
shown as the event's date. An impossible exact date (`2012-02-30`) is refused
with the input preserved; unparseable words are never refused.

## Family

Typing **"My dad had Parkinson’s"** and pressing Save files the sentence under
Dad in Family, creating Dad the first time and reusing him after. Recognition is
a bounded pattern evaluated on the device (`detectRelative` in
`health-data.js`): a sentence starting "my" followed by a relationship word —
dad, mother, sister, maternal grandmother, mom's father, aunt Mary — and then a
verb from a short list. It organizes who the note is about and nothing more: no
condition is extracted, negation and hearsay stay in the words, and "Dad said I
have migraines" is the owner's note because "said" is not on that list. The
inferred destination is shown beside Save as **Family · Dad** with a **Change**
control; once the owner changes it, typing more never changes it back.

Two saved relatives a sentence could mean — two people labelled Aunt Mary, a
Dad and a Dad (stepfather) — are never merged: Save asks **Which relative?** and
waits. A relative is a label, an optional family side and optional aliases,
all inside the envelope; renaming one rewrites no note. Deleting a relative
says how many notes go with them and offers to move the notes first.

## Medications, review and the summary

A medication needs only its name. Its status is Unspecified until the owner
says Taking or Stopped, and an unspecified medication is shown as **Status not
recorded** rather than listed as current. Inside an open medication row,
**Change directions**, **Mark stopped**, **Mark taking** and **Resume** append a
dated entry to the record's own history: the time it was recorded and, if
given, the date it took effect ("Recorded Sep 22, 2026, effective date not
recorded" otherwise). Earlier directions are kept in the entry. A change dated
before one already recorded asks whether it describes the current regimen or an
earlier period; **History only** leaves the current directions alone. Resume
requires the directions to be reviewed before it completes.

**Review medications**, under the summary, lists current and unspecified
medications; **Mark reviewed** records the time on each. Editing a
medication's note, directions or status makes its review stale, and the
aggregate date appears only when every listed medication is reviewed as it now
stands. Opening Health reviews nothing.

The **Summary** tab is computed from saved records: allergies and reactions,
medications marked Taking, and conditions marked Ongoing are in unless a record
says **Never include**; everything else, family history and unspecified
medications included, is in only when a record says **Always include**. Empty
sections are omitted. Nothing is ever written as "No known allergies".

## Visit summary

**Create visit summary** opens a preview: one checkbox per record (the summary's
selection to start, any record addable without changing its saved preference),
the label each relative will be named by (a safely determinable relationship,
or "Relative"), and the text exactly as it will appear — names in notes
included, which is why the preview is there. The one disclosure is **"This
file will contain health information outside the vault."** **Export PDF**
writes a text PDF on the device (`pdf-write.js`, Helvetica, no library, no
network) and downloads it; the status says how many characters, if any, fell
outside the PDF's Latin character set and were written as "?". A record with an
unresolved conflict is left out until resolved. Locking closes the preview and
revokes the file URL. A downloaded copy cannot be recalled.

## What is sealed, and what the Worker sees

Every object — a record, a relative, a prior revision — is one envelope sealed
on the device with the vault key (`sealSecret`, identity `health:<id>`), and
the shared validator `normalizeHealth` refuses anything else. The envelope holds
the note, type, when, relative, directions, status, summary preference, the
medication history, the review state and, for a revision, the prior record's
contents. The Worker stores `{v:1, secret}` in `health_records` under its own
encryption, with the opaque id, revision and `updated_at`; it cannot tell a
relative from a medication from a revision, and it says so: it validates the
id, size, shape and revision of a write and nothing it cannot read. Row counts,
ciphertext sizes and request timing remain observable.

Edit history is separate revision objects, one per edit, each naming its record
inside the envelope; deleting a record deletes its revisions with it. Length
limits (8,000 characters of note, 160 of When, 500 of directions, 120 for a
label) are checked before sealing, and the actual UTF-8 size of the write is
checked against the 64 KB request boundary before it is queued.

Notes are rendered as text. No health text reaches the AI pipeline, quick add,
the home screen, notifications, the page strip, logs or URLs; the cross-window
change notice carries a random marker only.

## Offline, drafts and conflicts

The store is the shared offline adapter (`health-offline.js`), so records
download whole, edits queue before the network is tried, retries carry one
operation id and one effect, and a cold offline reopen after the first download
supports reading, search, editing, medication changes and the export with no
request. A conflicted record keeps both texts: the row shows the cloud version
beside it with **Keep my change** and **Use cloud version**, and Edit lets the
owner reconcile the text before keeping it. A stale edit of a record deleted
elsewhere raises a conflict rather than resurrecting it.

The note being written is sealed with the vault key as it changes and kept in
the device store (`health-draft`, registered in `private-resources.js`), so an
idle lock, a closed editor or a failed save leaves a recoverable copy and no
readable text. After the next unlock the section offers **Restore draft** or
**Discard**; the text is not shown until restored. Locking clears every opened
record, rendered word, search result, preview and object URL, and an operation
that finishes after a lock paints nothing.

## Backup and restore

Health tables ride in the quarterly backup like every table. In addition the
same daily trigger writes a `daily-health` file of the health tables on any day
their row count or latest write changed, and keeps the newest thirty of those
files; nothing else in the folder is ever removed. `backup.mjs restore <file>
--tables health` restores the notebook's tables. See [BACKUPS.md](BACKUPS.md).

## Files

`chrome-sidebar/src/health-data.js` (validation, dates, family detection,
summary and search projection, medication rules, export lines; imported by the
Worker), `health-offline.js` (the shared adapter and the draft store),
`health.js` (controller), `components/health.js` and `components/health.css`,
`pdf-write.js`, `health.html` + `health-page.js`; `tools-api/src/health.js`
and `tools-api/health-schema.sql`; mobile mounts `mountHealth` in its
`capabilities.js`. Tests: `tests/health-data.test.js`, `tests/health-tool.test.js`,
`tests/pdf-write.test.js`, `tools-api/tests/health.test.js`, and the daily
backup in `tools-api/tests/backup.test.js`. Preview:
`tests/health-preview.html`.

## Not in this release

Attachments (**Attach file** is absent, not a placeholder), copying Medical
entries from Personal information, AI extraction, portal integrations and
structured coding. Native passkey, background concealment and PDF handling on
the phone need an actual-device check; desktop emulation does not prove them.
