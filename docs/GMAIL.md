# Gmail in Eric’s Personal Tools

The panel follows the active Gmail tab. It reads the latest expanded message’s
subject, sender and rendered text, then offers two things: a summary of it, and
a reply written the way Eric writes. Earlier collapsed messages and attachments
are not included.

## The screen

**The message is not shown here.** It is open in the tab beside the panel, and
a second copy of it only pushed the reply further down. The panel shows who it
is from, that it is reading the latest expanded message, and then the two things
it can do with it.

**Reading it and answering it are two sections, not two buttons.** They are
different jobs — one takes a click and nothing else, the other takes a line of
instruction and the voice it is written in — so each is a section of its own,
under a rule, with its own name, its own action, its own status line and its own
editable result with a Copy. Neither overwrites the other: a summary stays put
while a reply is drafted under it.

**Summary** is the first section: its name, and *Summarize* at the end of the
same line. Nothing to type.

**What the reply should say.** A rough line — *say yes, ask him to send the
form, mention I can speak to Blockthrough* — is the whole input. It is not a
form to fill in; it is the goal, and the draft resolves it. Left empty, the
reply answers the message as it stands. The line is cleared when a different
message is opened, because it belonged to that message.

**Generate reply** is the one primary action on the screen, at the foot of the
*Reply* section with *Writing voice* under it, because the voice is the only
thing on this screen that changes what it writes. Both actions run through the
Worker on the saved OpenAI connection: `email.reply` and `email.summary` in
[the task policy](../tools-api/MODEL_ROUTING.md), both on the model Eric chose
for his mail. The screen never names the model or the provider. There is no
on-device model any more; Chrome's built-in `LanguageModel` was removed with
`email-ai.js` when the reply moved to the same place the summary already was.

Each output lands in its own editable text area, with the Copy for it appearing
in that section's title row. Nothing is ever sent and nothing in Gmail is
modified. The draft uses `[bracketed placeholders]`
wherever a fact, date, figure or decision is Eric's to supply, and is told never
to invent a commitment, an availability or work as already done.

Eric's instruction is trusted; the message being answered is not. They travel
as separate fields (`goal` and `email`) with the prompt saying which is which,
so nothing inside an email can pose as the thing being asked for.

## Writing voice

The reply is only as good as its impression of how Eric writes, so that
impression is learned from the record of it: his own sent mail.

**Study my sent mail**, under *Writing voice* at the bottom of the screen, reads
up to a thousand sent messages and produces two things — the distinct voices it
found, each named by who Eric uses it with, and the instructions a model is
given to write in them. The instructions are editable and saved: the study is a
first draft of the voice, not the last word on it.

**How the reading works.** One call to `POST /v1/voice/scan` takes one page of
twenty-five sent messages, so the Worker stays well inside its request budget
and the panel can show progress and stop. Each message is reduced to the part
Eric typed — `writtenPortion` in `voice-data.js` cuts at the quote, the forward
header, the `From:`/`Sent:` block and the signature delimiter, and drops `>`
lines — and a message with nothing of his own left in it is skipped. Samples
accumulate until they fill one prompt, then that batch is read into a short
account of how he writes and the samples are dropped. When Gmail runs out, a
thousand samples are in, or twenty batches have been read, those accounts are
combined into the profile.

**It can be stopped and resumed.** The Worker holds the page it reached, the
accounts already read and the samples not yet folded into one, so closing the
panel mid-study loses only the asking. The button says *Resume*, and *Study
again* starts over. **Forget** deletes the row.

**What travels where.** Message text never reaches the browser: the Worker reads
Gmail itself and the panel is told only how far it has got. What reaches OpenAI
is the part Eric wrote, with the recipient and subject line of each message —
not the quoted thread, and nothing the profile is built from is kept afterwards.
The profile itself is stored in D1 in the same AES-GCM envelope as the AI
connections, and the whole row goes when the voice is forgotten.

**Where it is used.** `voiceGuidance` turns the stored profile into the section
of the reply's system prompt that describes the voices and who each is for, so
one call picks the right one for the recipient. A voice that has not been
learned, or cannot be read, makes for a plainer reply rather than a failed one.

## Google access

Reading sent mail uses `https://www.googleapis.com/auth/gmail.readonly` on the
same Google account the tax filing uses — one connection, one refresh token, one
thing to renew. Nothing here writes to, sends or deletes mail, and the panel
never receives a Google credential.

The scope was added after that connection already existed, so it needs
approving once. Until then the section offers one action and nothing else:
**Connect Google** when there is no connection at all, and **Approve reading
mail** when there is one Google will not let read mail. The study is refused
before Gmail is touched, saying what is missing.

**Google refuses in two different ways, and they need different repairs.** A
project that never switched the Gmail API on is fixed in the Google console and
no amount of consenting again will touch it, so that refusal says so and passes
on Google's own sentence, which carries the project and the link. Any other
refusal is the grant itself: the Worker writes that down against the connection,
so the next thing the panel asks reports a connection that cannot read mail and
offers the consent again instead of a *Resume* that would fail the same way.
Reconnecting replaces that record, which is what clears it.

### One-time setup (owner)

1. In the same [Google Cloud](https://console.cloud.google.com/) project as the
   Drive access, enable the **Gmail API**.
2. If the consent screen lists scopes explicitly, add
   `.../auth/gmail.readonly` to it.
3. From `tools-api/`:

```sh
cd tools-api && npx wrangler d1 execute erics-personal-tools --remote --file voice-schema.sql
```

4. Open the email screen in Gmail, expand *Writing voice*, press **Connect
   Google** and approve reading mail. Then **Study my sent mail**. A thousand
   messages take a few minutes, one page at a time, with the count running.

## Limits

An email over 20,000 characters is rejected rather than truncated. A reply's
prompt is capped at 30,000 characters, and the voice is kept whole while a very
long thread loses its tail. One instruction is 1,200 characters. A study reads
at most a thousand samples in at most twenty batches.

Email text and outputs stay in panel memory; nothing is written to extension
storage. Navigating to another message clears the output and cancels in-flight
generation, and the source is checked at click time and again before a result is
shown. Reload Gmail after installing or updating the extension so its content
script can answer the panel. The DOM selectors follow observed Gmail markup and
can need updating if Gmail changes.

## Where the code is

| Piece | File |
| --- | --- |
| Reading the open message | `chrome-sidebar/src/gmail-reader.js`, `src/gmail-content.js`, `src/gmail-connection.js` |
| The screen and its wiring | `chrome-sidebar/src/components/views.js` (`GmailView`, `VoiceView`), `src/context-panel.js` |
| Summary and reply | `chrome-sidebar/src/email-cloud.js` |
| The voice panel | `chrome-sidebar/src/writing-voice.js` |
| Extraction, limits and validation | `chrome-sidebar/src/voice-data.js` |
| Reading sent mail and building the profile | `tools-api/src/voice.js`, `tools-api/voice-schema.sql` |
| The Google connection both features use | `tools-api/src/drive.js` (`GOOGLE_SCOPES`) |
| Synthetic states to look at | `chrome-sidebar/tests/email-preview.html` |
| What the behavior must hold to | `chrome-sidebar/tests/{voice-data,writing-voice,email-cloud,gmail}.test.js`, `tools-api/tests/voice.test.js` |

Reference: https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list
