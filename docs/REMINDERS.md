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

## Birthdays already in the calendar

Nobody types a birthday twice. They are in a calendar because somebody put them
there — often Google itself, out of the contacts — so Reminders reads them
rather than asking to be told again.
[`tools-api/src/calendar.js`](../tools-api/src/calendar.js) does the reading and
`calendarBirthday` in `reminder-data.js` turns one event into one record.

**The Worker does it, not a device.** The Google refresh token lives there and
no page ever sees it, and the sweep has to happen whether or not the app is
open. It rides the same hourly cron as the [notifications](NOTIFICATIONS.md) and
decides for itself that thirty days have passed. *Look for birthdays now* on the
Reminders screen runs the same sweep on demand, on either host.

**One consent, three things.** `calendar.readonly` was added to the Google
connection [Taxes](TAXES.md) already makes, beside Drive and read-only Gmail. A
connection made before it exists keeps working and simply cannot read a
calendar: the screen says so and offers the rest of the consent rather than a
sweep that would fail. Nothing here ever creates, moves or deletes an event.

**What counts as a birthday.** Google's own contact birthdays say so outright
(`eventType: "birthday"`) and are taken at their word. Anything else has to look
like one from both sides — an all-day date that repeats every year *and* a name
that says birthday — because a wedding anniversary is yearly and all-day too. A
calendar that holds nothing but birthdays is read whole; every other one is
searched, because a calendar of ten thousand meetings cannot be read whole
inside a Worker's request budget. That budget also caps how many calendars one
sweep reads, so they are ordered before it spends any of it — the birthday
calendar first, the owner's own next — because a subscription to every national
holiday is enough to push the one that matters past the cap. A sweep that runs
out of budget says so instead of reporting a short answer as a complete one.

**The year is the only judgement, and it turns on who wrote the event.** Google's
own contact birthdays carry `eventType: "birthday"` and start on the date of
birth, so that year is a year somebody was born in. An event made by hand does
not: its series starts the day it was created, so "every October 3rd from 2024"
says the event is two years old, not the person. Only Google's own are trusted
with a year; everything else keeps the day and gets no `since`, which is the
rule above applied to an import — a birthday with no year has no age rather
than an invented one.

This was got wrong once, and the first real sweep gave forty-five people an age
counted from the day their reminder was created. *Look again from the start* is
the repair: a sweep that starts over brings `since` back into line with what the
calendar says, and touches nothing else on the record, because a name tidied up
or a note added since the import is the owner's and not the calendar's.

**A title that names nobody** — one that is nothing but the word birthday — is
still saved, because the day is real, but the sweep reports it so somebody can
say whose it is.

**Nothing is written twice and nothing already there is touched.** Three things
are checked in order for each event: the sweep's own record of every event it
has already settled, kept in `calendar_scans`; a reminder this app already wrote
from that event, matched on its `sourceId`; and a birthday the owner typed in
themselves, matched on `sameBirthday` — the same day and the same name, ignoring
the year, because one of the two may carry a placeholder. A match is left
exactly as it is, notes and anchor date and all.

The first of those is why a birthday deleted by hand stays deleted instead of
coming back next month. *Look again from the start* forgets it, which is the
only way back to one.

## Quick add

A typed note can create a reminder without the form. The note field is shared
with every other capability it can write to — see [quick add](QUICK_ADD.md).

## What the Worker does not do

`tools-api/src/reminders.js` is the generic encrypted record store with a
different table. It validates the anchor and the interval and never computes a
due date, an age, or what needs attention — the device does that, against its
own day. See [CLOUDFLARE.md](CLOUDFLARE.md) for the store's contract.

## Getting told

A reminder reaches the phone as a notification at its own morning hour, on the
days something is due. See [notifications](NOTIFICATIONS.md).

The extension has no equivalent: it is a side panel that is either open or not,
and a browser that is closed cannot be told anything.
