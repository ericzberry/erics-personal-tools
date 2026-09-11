# Restaurant reservations

Open **Restaurants** from the sidebar’s capability menu, or **Settings → Restaurant reservations**. The workspace opens in its own extension tab and uses your existing Chrome sessions on booking sites.

Mobile 0.1.12 also exposes **Restaurants** in the shared Tools menu, with the same research form, source details, and verified booking destinations. Its latest downloaded shortlist is encrypted and available offline. Mobile opens the provider for manual availability checks; automatic signed-in page inspection requires the extension. See `../mobile-app/README.md` for offline behavior and limits. Extension 0.6.51 shares the registry and workspace components with this mobile release.

## Search

The workspace is one page: the search fills its width, and the shortlist and availability appear underneath it. **Search for** is two side-by-side choices rather than a menu.

- **A specific restaurant:** enter a name, including an approximate spelling, and a city. Research returns source-backed identities and addresses. A correction, multiple candidates, or a longer-travel location requires selecting the restaurant you meant.
- **A category:** describe the criterion, such as “exactly 2 Michelin stars,” “NYT top 20 restaurants in the latest list,” or “Infatuation score above 8.5.” Sources include the rating/rank and publication date when verified. Ambiguous editorial criteria are explained in the shortlist. Inaccessible or unverified ratings are omitted.
- Enter a city and optionally a neighborhood. NYC defaults to excluding LES, East Village, Brooklyn and Queens from category searches. **Include longer travel options** expands the geography. A specifically named restaurant in those areas remains selectable with a travel warning. Unknown neighborhoods require selection rather than being silently treated as nearby.
- Set the date and a local time window. A named restaurant also accepts **Flexible dates**: a first and last date, up to seven days, each checked separately. A category search is one evening out and keeps a single date, so the option is offered only for a specific restaurant.
- Use an exact party size or **Flexible party size** to check each size in a range independently (1–20 people, at most eight sizes).
- Click **Find restaurants**, review the shortlist and sources, select candidates, then **Check selected restaurants**.

The shortlist is bounded to 6, 12, or 24 candidates; it is not an exhaustive city catalogue. Booking searches are capped at 120 page checks per run, counting every date, party size, and time anchor. Narrow the selection or the date/party/time range for larger searches.

## Live checks

Discovery checks current official reservation instructions and listings on OpenTable, Resy, Tock, SevenRooms, and other direct booking sites. Only source-backed booking URLs are opened. A missing provider link means no verified destination was found, not that the restaurant has no tables there.

The extension opens one temporary background tab at a time, applies that check's own date and party query parameters, waits for stable rendered content, and reads the booking controls. Each date in a flexible-date search is its own page check and is confirmed against that date's own controls. Resy uses its all-day view. OpenTable and Tock are queried at hourly anchors across the requested window (including the end); observations are deduplicated. These are page observations, not a complete inventory API.

Confirmed times require the restaurant heading, selected date, exact guest count, and enabled time controls. Time search selectors, calendar dates, opening hours, waitlists, and disabled buttons do not count. An explicit message is required for “no tables” or “not released.” Empty pages, login, CAPTCHA, unexpected layouts, and unverifiable context produce **Needs attention**, not “sold out.” Partial failures remain visible even when other searches find tables.

Click **Open booking page**, complete login/verification and set the requested filters, then return to **Recheck page**. User-opened pages remain open. The app does not book a table, join a waitlist, accept restaurant terms, or pay a deposit. Finish booking on the provider.

**Stop search** preserves completed observations. It prevents subsequent checks; an AI request already sent may still finish and be billed. Keep the workspace tab open while searching. Search inputs are saved on this device; result observations are session-only and are not an ongoing monitor.

## Connection and deployment

Use an existing OpenAI connection with a saved API key. **Research settings** holds the shortlist size and the connection on one row, with **Reload** beside the connection; it states something only when research cannot run. Model selection follows the central `restaurant.research` and `restaurant.availability` task policies; it does not use a connection default model.

Deploy `../tools-api` to enable `POST /v1/ai-connections/<id>/restaurants`, then rebuild and reload the extension. No restaurant-specific schema migration or additional Chrome permission is needed. Web research uses OpenAI’s Responses web-search tool with source references: [official web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search).

Search requests and rendered booking-page content are sent through the existing authenticated Worker to the saved OpenAI connection. Keys remain server-side. The reader does not inspect cookies, browser session stores, password fields, or application state; email addresses are redacted from rendered text. The extension does not expose the workspace or its privileged message bridge to websites.

## Validation and current limits

The automated suite covers input validation, the normalized search surviving the Worker's own re-validation, flexible dates and their limit, location defaults, source filtering, name clarification, provider URLs, time anchors, exact date/party evidence, false-time rejection, partial failures, cancellation, stale criteria, trusted messaging, and tab ownership. The synthetic browser harness at `tests/restaurant-preview.html` exercises the real controller and result UI without any external requests and is excluded from the extension build.

The UI was inspected at 1440px, 420px and 280px, with no horizontal overflow at 280px, and the mobile workspace at 390px. The actual reader was checked against a live Resy restaurant page and correctly recognized its selected date/guest count and explicit no-table message. Full installed-extension checks, live OpenAI research, and live OpenTable/Tock/SevenRooms results have not been verified. Some sites require interactive experience selection or expose booking UI in cross-origin frames; those currently need manual attention. Booking site changes can break extraction. No anti-bot bypass or universal booking-provider support is claimed.
