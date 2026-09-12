# ezberry.net

The `ezberry-site` Worker: a home page, `/privacy` and `/terms` — the three links
Google's OAuth consent screen asks for. `www.` and trailing slashes redirect to
the canonical path; anything else is a 404.

All of it is string constants in `src/index.js`, with no build step. `CONTACT`
and `UPDATED` at the top are the two most likely to need a change. Keep the
privacy policy true of what `tools-api/src/drive.js` actually does.

A separate Worker from the API on purpose: no bindings, no secrets, no D1, so the
public apex is never a way into private data, and it deploys without rebuilding
mobile. It has no version and is not part of an app release.

```sh
cd site && npm run deploy
```

`wrangler.example.jsonc` is the shape of the ignored `wrangler.jsonc` beside it;
add `account_id` to a copy. The apex is a `custom_domain`, so Cloudflare creates
the DNS record and the certificate — nothing goes into the zone by hand.

In the Google Cloud Console under **Branding**, with `ezberry.net` as an
authorized domain:

| Field | Value |
| --- | --- |
| Application home page | `https://ezberry.net` |
| Application privacy policy link | `https://ezberry.net/privacy` |
| Application terms of service link | `https://ezberry.net/terms` |
