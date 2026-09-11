# Reminders and quick add

Dates the owner wants brought back to them: a birthday, a car service, a renewal
with a deadline. One capability, `reminders`, plus the one-line note field that
can create a record without a form.

Files: [`reminder-data.js`](../chrome-sidebar/src/reminder-data.js) (the shared
validator and all the date arithmetic), `reminders-offline.js`, `reminders.js`
and `components/reminders.*` for the tool; `capture-data.js`, `capture.js` and
`components/capture.*` for quick add; [`tools-api/src/reminders.js`](../tools-api/src/reminders.js)
and [`tools-api/src/capture.js`](../tools-api/src/capture.js) on the Worker.

## A record is an anchor and an interval

`{kind, title, subject, date, since, every, notice, completed, notes}`.

Nothing stores a next date. `date` is the anchor and `every` is the interval in
months; `nextDue()` works out what that means today. A record cannot go stale
sitting in D1 or on a phone that was offline for a month, and marking a service
done is a change to one date rather than a rewrite of a schedule.

**The two kinds of repeat are not the same thing**, and `REMINDER_EVENT_KINDS`
is the line between them:

- **Events** — Birthday, Anniversary. They happen whether or not anyone attends
  to them, so once the date passes the next one is next year. They are never
  marked done: `canMarkDone()` is false for them, and both hosts omit the
  action, because completing a birthday would overwrite the date it falls on
  with today's.
- **Obligations** — Service, Renewal, Appointment, Other. `date` is the last
  time the work was done, so the record falls due one interval after it and
  *stays* there, accumulating however many days late it is, until someone marks
  it done. Marking it done re-anchors `date` to that day. A one-off obligation
  sets `completed` instead and leaves the list.

`since` is a four-digit year and exists only so an age can be shown. It is never
inferred from `date`, whose year may be nothing more than the day a birthday was
first typed in — a birthday captured as "today" has no age and must not grow one
a year later.

`notice` is per record: a fortnight is plenty for a birthday, where a passport
renewal wants ninety days. `attentionSplit()` uses each record's own notice to
decide what leads the list.

## Quick add

`mountCapture()` renders one text field and one button. The note goes to
`POST /v1/ai-connections/:id/capture` with the device's own day; the Worker
reads it into `{capability, record}` and `parseCapture()` puts it through the
same validator the tool uses, so a captured record is indistinguishable from a
typed one and cannot arrive in a shape the tool would refuse. A note that names
no date comes back as 422 with its own explanation, not as a server error.

Nothing is confirmed before saving. The line read back afterwards is built from
the stored record — never from the model's own account of what it did — and Undo
is beside it. The write goes through the capability's offline store, so a note
typed with no signal queues like any other change; only the reading needs the
network.

`CAPTURE_TARGETS` is the list of what a note may become. Adding a capability to
it is what lets quick add create that kind of record, and the host must pass
that capability's store in `stores`.

Quick add lives on the mobile home screen (`#capability-capture`, hidden as soon
as a tool is open) and at the top of the Reminders tool on both hosts.

## What the Worker does not do

`tools-api/src/reminders.js` is the generic encrypted record store with a
different table. It validates the anchor and the interval and never computes a
due date, an age, or what needs attention — the device does that, against its
own day. See [CLOUDFLARE.md](CLOUDFLARE.md) for the store's contract.

## Not built yet

Nothing delivers a reminder off the screen. A due date is surfaced when a host
is opened, and that is all: there is no push notification, no email, and no
scheduled job. Delivery needs a Worker cron trigger, stored push subscriptions,
and the installed mobile app's permission; it is deliberately a separate piece
of work from the records themselves.
