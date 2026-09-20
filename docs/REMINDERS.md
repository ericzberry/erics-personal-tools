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

**The occurrence, not the series.** Google is asked to expand the recurrences,
so what arrives is the instance the owner sees drawn on the day rather than the
series it belongs to. A series' start date is where its rule begins, which is
not always where the rule lands: one calendar here holds a birthday whose series
starts September 4th and whose every occurrence is the 5th. The record remembers
the series id (`recurringEventId`), so next year's sweep recognizes the same
birthday instead of importing a new one.

**What counts as a birthday.** Google's own contact birthdays say so outright
(`eventType: "birthday"`) and are taken at their word. Anything else has to look
like one from both sides — an all-day occurrence of something that repeats *and*
a name that says birthday — because a wedding anniversary is yearly and all-day
too, and a one-off "birthday party" belongs to no series at all. A
calendar that holds nothing but birthdays is read whole; every other one is
searched, because a calendar of ten thousand meetings cannot be read whole
inside a Worker's request budget. That budget also caps how many calendars one
sweep reads, so they are ordered before it spends any of it — the birthday
calendar first, the owner's own next — because a subscription to every national
holiday is enough to push the one that matters past the cap. A sweep that runs
out of budget says so instead of reporting a short answer as a complete one.

**An import never brings an age.** A calendar knows the day and nothing else
worth having. A yearly event made by hand starts the year somebody got round to
making it, so "every October 3rd from 2024" says the event is two years old and
says nothing about the person; even Google's own contact birthdays carry a year
only when the contact happens to have one. So `since` is left empty and the
record simply has no age, which is what a birthday typed in without a year
already does. A year on an imported record can therefore only have been put
there by somebody who knew it — which is why nothing in the sweep ever writes
that field.

This was got wrong once. The first real sweep read every entry's creation year
as a birth year and gave forty-five people an age counted from the day their
reminder was written down; those ages were cleared and the rule replaced with
this one.

**What the sweep cannot decide, it says out loud.** Two things are imported
normally and then reported, because neither is safe to settle without a person:
a title that is nothing but the word birthday, which names nobody though its day
is real; and a name that matches a birthday already written down on a day one or
two off, which is usually one person two places disagree about — but two people
really can share a name and be born a day apart, so nothing is ever skipped on
the strength of a near miss.

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

## Whose birthday it is, before anybody opens Reminders

A birthday is only useful on the day, so both hosts' home screens lead with the
fortnight ahead: `birthdaysAhead` in `reminder-data.js`, rendered by
`components/home.js` and driven by `home.js` — `home-page.js` in the panel,
`capabilities.js` on the phone.

**Two runs, because they answer two questions.** Whose birthday it is *today*
is the only day anything can be done about it, so it is set apart on its own
surface above the rest; the fortnight after it says how long there is. A run
with nobody in it is hidden rather than headed, and nothing coming leaves the
home screen exactly as it was.

The window is a fixed fourteen days rather than each record's own `notice`,
which is what `attentionSplit` reads. A passport renewal wants ninety days of
warning; a birthday given ninety would sit on the home screen for three months.
Anniversaries are left out — they roll forward the same way, but the screen says
birthdays. An age is shown only where somebody recorded the year, by the same
rule as everywhere else here.

**It reads and writes nothing**, so it has no action, no status line and no
error to report: a device that cannot reach the records shows the home screen it
always showed, and Reminders is where a connection problem is said out loud. The
records are the device's own copies, so a phone with no signal still knows whose
day it is.

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
