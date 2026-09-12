# Gift ideas

Somewhere to put the thought when it arrives, and a record of what was given.

Files: [`gift-data.js`](../chrome-sidebar/src/gift-data.js), `gifts-offline.js`,
`gifts.js`, `components/gifts.*`, and
[`tools-api/src/gifts.js`](../tools-api/src/gifts.js).

`{person, idea, link, status}`. Deliberately three fields and a state. An idea
has to be writable the moment it occurs, and an occasion, a price or a comment
would each be a field to skip every time; what it is, in the owner's own words,
already says whatever needed saying — "the 12 inch one with the long handle" is
the idea, not a note about it.

`link` is kept only when it is an address this app would be willing to open:
[`public-url.js`](../chrome-sidebar/src/public-url.js) is the single rule for
that, shared with restaurant booking links.

There are two states. Saying an idea is bought takes it out of the list, which
is therefore only ever what is still to decide; the bought ones keep their own
view, because "what did I already get them" is the other half of deciding. It is
reversible from there.

Ideas group by person, and people are matched by who they are rather than by how
the name was typed, so a note captured as "ariana" joins Ariana's list instead
of starting a second one beside it; the first spelling seen is the one shown.


Quick add can create an idea from a typed note: see [quick add](QUICK_ADD.md).
The [page strip](../chrome-sidebar/src/page-offers.js) recognizes the page an idea
was saved from, and says whether it was already bought.
