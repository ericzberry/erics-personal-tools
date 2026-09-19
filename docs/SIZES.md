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
a size every brand agrees on.

The list is read garment first, because that is how the question arrives —
standing in a shop, what am I in a shirt here. Each garment heads its own run,
and the rows under it go from the general to the particular: the size that holds
anywhere, then the measurements that describe it in the order a body is usually
taken, then what each brand calls the same body.

```
SHIRTS
  General · M
  Neck · 15.5 in
  Sleeve · 34 in
  Chest · 40 in
  Banana Republic · M
  Brooks Brothers · Dress shirt · 15.5 / 34
PANTS
  Waist · 33 in
  Inseam · 32 in
  Lululemon · ABC joggers · M
```

The garment is read off `item` rather than stored beside it, so every record
already saved files itself and there is no third field to fill in. A measurement
names the thing it measures — a neck is a shirt, an inseam is a pair of trousers
— and a part is looked for inside the garment it belongs to, so "pants length"
is an inseam while a sleeve stays with shirts. A word the registry has not
learned keeps its own name under **Other**, where it is visible rather than lost.
The garment is searchable although it is never typed on the record: looking for
a shirt finds the neck measurement.

A row says what the heading has not already said. The brand leads when one
decided the size; otherwise the measurement's own name does, or **General** when
the record is the garment's plain size. The item is repeated only when it
distinguishes this record from the others under the heading, so "Dress shirt"
survives and a plain "Shirt" does not. A brand is matched by which brand it is
rather than by how the name was typed, so a note captured as "lululemon" reads
as Lululemon on every row instead of starting a second spelling beside it.

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
