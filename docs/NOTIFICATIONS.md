# Notifications

How a reminder reaches Eric when the app is closed. One notification, at his
own morning hour, on the days something is actually due.

Files: [`tools-api/src/web-push.js`](../tools-api/src/web-push.js) (the
protocol), [`tools-api/src/push.js`](../tools-api/src/push.js) (subscriptions,
the digest, the hourly run), the `scheduled` handler in `tools-api/src/index.js`,
and on the phone `mobile-app/public/app/push.js`, `push-bridge.js`, and the
`push`/`notificationclick` handlers in `sw.js`.

## No library

Web Push is two small specs — payload encryption (RFC 8291, `aes128gcm`) and
application-server identification (RFC 8292, VAPID) — and both are implementable
with WebCrypto alone. That is why there is no npm dependency here: the Worker
would otherwise carry, and have to keep current, a package for the one job of
saying that something is due.

The push service never sees what a notification says. The payload is encrypted
to the subscription's own public key, so Apple or Google forward an opaque
record that only that device can open. The record is bound to both public keys,
so it cannot be replayed at another subscription.

[`tools-api/tests/push.test.js`](../tools-api/tests/push.test.js) opens a record
with a receiver written from the spec rather than from the sending code, checks
that another device's keys cannot open it, and verifies the VAPID signature and
its audience. Extend that test rather than trusting the sending path against
itself.

## The subscription is a capability

A push endpoint is a URL that lets whoever holds it push to that phone. It is
stored encrypted like every other record, and the listing route deliberately
returns only the host, the time zone and the hour — never the endpoint.

`lastSentOn` is server-kept and ignored on input: a device cannot tell the
Worker it has already been notified today.

## Once, in the morning, only when there is something

The cron runs hourly because "morning" is a different instant in every time
zone. Each subscription stores its own `timeZone` and `hour` (8 by default), and
a run sends only to the devices whose hour it currently is, at most once per
that device's own day.

Nothing is sent when nothing is due. A notification every morning saying there
is nothing to say would train the owner to ignore the ones that matter.

One reminder speaks for itself — its title, and how long until it is due. More
than one becomes a count and the first few names: a notification is a reason to
open the app, not a replacement for it.

## The phone's two halves

The browser half is in the top-level page (`push.js`): permission and the
subscription belong to the page the owner is looking at, not to the frame inside
it, and Safari grants notification permission only to an installed app. The
authenticated half is in the frame (`push-bridge.js`), because the access token
lives there and nowhere else. They talk by postMessage, and the bridge trusts a
message no further than its origin and its own parent.

Turning it on subscribes this browser and saves it under a device id kept in
`localStorage`, so re-subscribing updates the same row rather than accumulating
them. Turning it off deletes the row and then unsubscribes.

Every push shows a notification. That is the bargain `userVisibleOnly` makes
with the browser, and silently dropping one risks the subscription.

## Operating it

Three Worker secrets, set once with `npx wrangler secret put`:
`VAPID_PUBLIC_KEY` (base64url of the uncompressed P-256 public point),
`VAPID_PRIVATE_KEY` (base64url of the raw 32-byte private scalar), and
`VAPID_SUBJECT` (a `mailto:` address the push service can use). Generate the
pair with WebCrypto and never print the private half. Rotating them invalidates
every existing subscription: each device has to turn reminders on again.

`GET /v1/push/key` is public — a device needs it before it has anything to
authenticate with, and every push carries it anyway.

The hourly trigger lives in `wrangler.jsonc` (`triggers.crons`), and
`push-schema.sql` must be applied before deploying the routes that use it. See
[CLOUDFLARE.md](CLOUDFLARE.md).

`POST /v1/push/test` sends to every subscribed device immediately. It exists
because the only way to know notifications work is to receive one, and waiting
until tomorrow morning is not a test.
