# Clothing sizes

What size Eric wears, brand by brand, and the measurements that answer the
question when no label is to hand.

Files: [`size-data.js`](../chrome-sidebar/src/size-data.js), `sizes-offline.js`,
`sizes.js`, `components/sizes.*`, and
[`tools-api/src/sizes.js`](../tools-api/src/sizes.js).

`{brand, item, size, fit}`. One record shape covers both halves of the question,
because they are the same fact at different removes: "Lululemon · ABC joggers ·
M" and "Waist · 33 in" differ only in whether a brand decided the number.
Splitting them would mean two lists to search and two forms to remember, when
what is wanted is one answer to "what size am I here".

`brand` empty is meaningful rather than missing: that record is a measurement, or
a size every brand agrees on, and it is filed under **General**. General is shown
first, because it is the answer that holds wherever the owner is standing; the
brands follow in alphabetical order, and a brand is matched by which brand it is
rather than by how the name was typed, so a note captured as "lululemon" joins
Lululemon instead of starting a second list beside it.

`fit` is the one optional field, and it earns its place: a bare `M` is unusable a
year later without "runs slim through the thigh", and a bare `33 in` without
"measured in March". Nothing else is a field — no date, no category, no size
system — because each would be one more thing to skip every time.

Nothing here converts between size systems or compares one brand to another. A
saved size is what the label said, and the app does not have an opinion about it.

Quick add can create a size from a typed note: see [quick add](QUICK_ADD.md). It
is the way in that matches the subject, because a size is usually said rather
than filled in — *"Lululemon joggers are a medium"* — and the form below the list
is what it falls back to.
