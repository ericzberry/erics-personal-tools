# Gift ideas

Somewhere to put the thought when it arrives, and a record of what was given.

Files: [`gift-data.js`](../chrome-sidebar/src/gift-data.js), `gifts-offline.js`,
`gifts.js`, `components/gifts.*`, and
[`tools-api/src/gifts.js`](../tools-api/src/gifts.js).

`{person, idea, occasion, date, price, link, status, notes}`. Only `person` and
`idea` are required, because the whole point is that an idea can be written down
the moment it occurs — usually with nothing but a name and a few words. Anything
else is added later or never. A price nobody stated is `null`, not zero, and is
never estimated.

`link` is kept only when it is an address this app would be willing to open:
[`public-url.js`](../chrome-sidebar/src/public-url.js) is the single rule for
that, shared with restaurant booking links.

`GIFT_STATUSES` is deliberately three — Idea, Bought, Given. Anything finer is
bookkeeping nobody keeps up. Each row offers exactly one step: an idea becomes
bought, a bought thing becomes given, and a given one goes back to being an idea
for next time.

Ideas group by person, and people are matched by who they are rather than by how
the name was typed, so a note captured as "ariana" joins Ariana's list instead
of starting a second one beside it; the first spelling seen is the one shown.
Within a person, what is still open comes first and what was given sinks to the
bottom of that list rather than leaving it — last year's gift is the most useful
thing to see when thinking about this year's.

Quick add can create an idea from a typed note: see [quick add](QUICK_ADD.md).
