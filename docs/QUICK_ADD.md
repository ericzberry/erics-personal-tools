# Quick add

One text field and one button, which turn a line the owner types into a saved
record. It is the same field wherever it appears: the mobile home screen, and
the top of the tools that can receive what it reads.

Files: [`capture-data.js`](../chrome-sidebar/src/capture-data.js) (the targets
and the contract), `capture.js` (the controller), `capture-stores.js` (the
stores a host offers it), `components/capture.*`, and
[`tools-api/src/capture.js`](../tools-api/src/capture.js).

## The targets own their own fields

`CAPTURE_TARGETS` lists what a note may become. Each entry names the capability
that owns the record, the path its store writes to, the validator the tool
itself uses, when the note belongs to it, and the description of its fields the
reading is asked to fill in.

Those field descriptions live beside the validator they have to satisfy rather
than in the Worker's prompt, so the two cannot drift apart: adding a field means
editing one file. The Worker owns only the framing — that the note is untrusted
data, that today's date is the device's, and that the answer is one capability
or an error.

Adding a capability to `CAPTURE_TARGETS` is what lets a note become that kind of
record. The host must also pass that capability's store, which is what
`captureStores()` is for: a note typed inside one tool may turn out to belong to
another, and it should land where it belongs rather than be refused by whichever
tool happened to be open.

## Nothing is confirmed before saving

`parseCapture()` puts the reading through the capability's own validator, so a
captured record is indistinguishable from a typed one and cannot arrive in a
shape the tool would refuse to show.

The line read back afterwards is built from the stored record — never from the
model's own account of what it did, which could flatter a reading the record
does not contain — and Undo is beside it. A confirmation step would make the
owner check a reading that is usually right and would still need the same undo
when it is not.

A note that fits no target comes back as 422 carrying its own explanation: that
is the owner's to fix, not a failure of the service.

## Offline

Only the reading needs the network. The write goes through the capability's
offline store, so a note typed with no signal queues and syncs like any other
change. With no saved AI connection the field says so and writes nothing.
