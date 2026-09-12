# Reminders and quick add

Dates the owner wants brought back to them: a birthday, a car service, a renewal
with a deadline. One capability, `reminders`, plus the one-line note field that
can create a record without a form.

Files: [`reminder-data.js`](../chrome-sidebar/src/reminder-data.js) (the shared
validator and all the date arithmetic), `reminders-offline.js`, `reminders.js`
and `components/reminders.*` for the tool;
[`tools-api/src/reminders.js`](../tools-api/src/reminders.js) on the Worker.

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

A typed note can create a reminder without the form. The note field is shared
with every other capability it can write to — see [quick add](QUICK_ADD.md).

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
