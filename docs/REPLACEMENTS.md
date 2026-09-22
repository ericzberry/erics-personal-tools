# Replacement drawer

Things Eric liked enough to buy again, kept precisely enough to buy the same
one: the paint colour, the pillow's model, the charging cable, the printer
cartridge, the running shoe — and where it came from.

Files: [`replacement-data.js`](../chrome-sidebar/src/replacement-data.js),
`replacements-offline.js`, `replacements.js`, `components/replacements.*`, and
[`tools-api/src/replacements.js`](../tools-api/src/replacements.js), over
`replacement_records` (`tools-api/replacements-schema.sql`).

`{item, variant, where, note}`.

- `item` is what the thing is, as it would be looked for — *Bedroom paint*,
  *Printer ink*, *Running shoes*.
- `variant` is the answer, and required: the exact thing in as many words as it
  takes — maker, model, colour name and code, finish, size and width, length
  and wattage, part number. It is the reason the record exists, so it is never
  shortened to fit a column.
- `where` is where it was bought: a shop's name, or the page it was bought
  from. One field rather than two, because an address already names its shop
  and a shop without a page is still an answer. Anything written like an
  address is held to the same rule as every saved link (`public-url.js`), and
  is shown by its shop — `amazon.com` — with the page one glyph away.
- `note` is what the next purchase needs to know — *two gallons does the room*,
  *every 400 miles*.

```
Bedroom paint                                  ⧉ ✎ 🗑
Benjamin Moore Hale Navy HC-154, Regal Select eggshell
Home Depot · Two gallons does the room
Printer ink                                  ⧉ ↗ ✎ 🗑
HP 67XL black, 3YM57AN
staples.com
```

The list is one run, alphabetical by item. The drawer is opened to find one
thing, so it is searched rather than browsed: the search reads every field,
including a page's shop name. There are no categories, dates, prices or
quantities, because each would be one more thing to skip every time a
favourite is written down.

Each row's own actions are glyphs at the end of its line: **Copy** takes the
variant — what goes into a shop's search box — then **Open** where a page was
saved, **Edit** and **Delete**. Deleting asks first, in words, under the row.

Quick add can file a thing here from a typed note — *"the bedroom is Hale Navy
eggshell, from Home Depot"*; see [quick add](QUICK_ADD.md). A note that only
says what size Eric wears still belongs in [clothing sizes](SIZES.md); a note
naming a particular product to buy again belongs here, size and all.

Offline like every record tool: the whole record comes to the device, a change
is written there first and synced after, and the store is registered in
`private-resources.js`.
