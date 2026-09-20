# Eric's Chrome sidebar

A standalone Chrome extension within `erics-personal-tools`. Its first tool is ESPN fantasy football: saved league settings and draft-pick tracking.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**, then choose **Load unpacked**.
3. Select `/Users/ericberry/erics-personal-tools/chrome-sidebar/dist`.
4. Pin **Eric's Sidebar** and click its toolbar icon.
5. Open or reload an ESPN football draft room after installation.
6. To test, visit ESPN's mock draft lobby and choose **Practice Draft** beside Old Timer's League. Select that practice session in the sidebar's **Draft session** menu.

The prepared build is in `dist/`. Run `npm run build` to regenerate it (Node.js required; no installed dependencies needed). After changes, rebuild, reload the extension on Chrome's extensions page, and reload the draft tab.

## Included

- A read-only ESPN draft reader capturing player, position, NFL team, fantasy team, round, pick within round, and overall pick.
- Separate real-league and practice sessions; team/player filters; local persistence and JSON export.
- Duplicate suppression, missing-pick reporting, rollback handling, and a disconnected indicator after 15 seconds without a heartbeat.
- Real league capture restricted to league 182527585, season 2026. Practice drafts retain their own league IDs.

The reader watches rendered pick messages and the roster team selector. Changes trigger a read after 300 ms, with a 5-second heartbeat. Actual latency depends on ESPN and Chrome scheduling. Keep the draft tab open. Background throttling or an ESPN layout change can delay or break capture. Existing history can only be recovered if ESPN renders it; missing picks are flagged. Commissioner rollback handling is tested with fixtures, not a live league undo.

The extension does not submit picks, modify ESPN, read cookies, or access private application state. It requests `sidePanel`, `contextMenus`, `storage`, and `<all_urls>` host access, as requested for future personal tools. Content scripts run only on ESPN football draft rooms and `https://mail.google.com/*`. Chrome still restricts protected browser pages and requires separate user enablement for file URLs or incognito access. It can refresh the public ESPN catalog and, when configured, manage AI connection settings through the owner’s Cloudflare Worker. The UI uses Chrome's [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

## Validation

On September 8, 2026, an ESPN practice draft using the league settings was observed through multiple rounds. The actual reader extracted **160 picks, 10 teams, and 16 Bedford Bridges picks** from the completed draft, with **0 rejected entries**. Slot 7 was specific to that practice session and is not a prediction or configuration for the real draft.

The real draft position is unknown until ESPN reveals the actual order near draft time. No draft slot is hardcoded. The reader associates each announced pick with ESPN's team ID and reads the round and pick number from that pick's message. Bedford Bridges has team ID 8; this identifies the team, not its draft position. Any future turn countdown or draft-position display must use the actual draft's order and remain unknown until that order is available.

Run `npm install` for the development-only DOM parser, then `npm run build && npm test`. Ten tests cover real ESPN markup, round boundaries, defense picks, duplicates, partial feeds, missing-pick recovery, rollback/reset, practice isolation, message validation, storage, and build exclusions. Fantasy team names in the fixture are anonymized.

The initial sidebar and rules search were checked in Chrome. Installation and end-to-end extension messaging in the user's Chrome profile still need validation after loading. Browser automation cannot open `chrome://extensions` because of its URL policy.

For a visual preview, run `npm run preview` and open `http://127.0.0.1:8765/sidepanel.html`. Preview mode does not capture picks.

## Layout and future sync

This sub-project has its own manifest, source, config, tests, and build. Rules live in `config/espn-league-2026.json`. Local captures in `data/` are ignored and excluded from builds, as are tests and dependencies. The full practice verification is saved locally as `data/practice-validation.json`.

The Cloudflare settings API lives in `../tools-api`. Its Worker is `erics-tools-api`, bound as `DB` to D1 database `erics-personal-tools`. It stores AI connections; ESPN data is not uploaded.

## Personal settings page (0.6.17)

Reload the unpacked extension, then type `ericberry` in Chrome’s address bar, press Tab, then Enter. This keyword opens the extension’s `settings.html` page; it is not a domain, and it only works while the extension is installed and enabled. You can also right-click the extension icon → Options, use Chrome’s Extension options button, or click Settings in the sidebar header.

The page supports fourteen named AI providers plus custom compatible services, optional default model/API URL, and encrypted API keys. See `../tools-api/PROVIDERS.md` for the full list. On first use, expand Cloud connection and enter the existing extension access token (not an AI provider key). If previously connected, the saved token is reused. The page communicates only through a restricted extension service-worker message handler, which sends authenticated requests to the fixed Cloudflare host. No external website or content script can use this handler.

Connection keys are encrypted in D1 with AES-GCM using a separate Worker secret. List/save responses contain only a `hasApiKey` indicator. A blank key on edit keeps the existing key; an explicit toggle removes it. Changing provider or API URL clears the old key unless a new key is entered. Saves/deletes use revisions to reject stale edits. Settings persist across devices after connecting each extension with the same access token. Reload connections to fetch changes made elsewhere.

After saving a connection, use Fetch models, Test connection, or the prompt playground. Tests send a small generation request and can use provider credit. Choose a text model from the suggestions or enter its ID; Z.AI/GLM and Perplexity use manual IDs. The playground sends text through the extension and Worker using the encrypted saved key. It shows text output, usage where available, and timeout/limit errors without automatic retries. This does not change Gmail’s on-device AI behavior. The earlier ESPN cloud backup controls and endpoints have been removed. Existing local drafts remain local.

## Recommendation engine

The advisor in `src/recommendations.js` recomputes locally on each draft update. It displays one or two recommended picks, the last pick considered, and reasons for moving above the highest available player on your board. No model service, API key, server, or outgoing data is required. This is a transparent deterministic decision engine, not an LLM or a calibrated outcome predictor.

The imported workbook is in `config/rankings-2026.json`. The 177-entry first tab is authoritative; its ADP values are market context. The 196 QB/RB/WR/TE positional comparisons from the second tab are retained for future discussion, not used to override the first tab. Yellow highlights have no scoring effect because their meaning has not been specified. The original workbook is unchanged. `scripts/import-rankings.py` regenerates the JSON from the workbook using Python/openpyxl.

### How it decides

1. Match ESPN selections to the board using name, position and NFL team, with suffix, punctuation, team-abbreviation and known Kenny/Kenneth Gainwell aliases. Remove selected players and count your roster, including unranked players' positions.
2. Respect position maximums and reserve enough remaining roster spots to fill mandatory starters. Evaluate FLEX across RB, WR and TE.
3. Use candidates within 15 overall ranks of the highest eligible available player. This limits deviations from your board. Filling mandatory starters can override the global board because ineligible backups are removed first.
4. Convert Combined Ranks into a linear value proxy: `highestRank + 1 − playerRank`. One rank slot is one proxy unit, not a fantasy-point forecast.
5. Allocate the league’s starters (10 QBs, 20 RBs, 20 WRs, 10 TEs), then assign 10 FLEX slots to the best-ranked remaining RB/WR/TE players. The next player at each position is its starter-replacement benchmark. This is not a waiver-wire prediction.
6. Measure rank-slot advantage over replacement and marginal improvement to your best starting lineup, including FLEX. Existing better starters reduce the value of a backup. Unranked owned players receive replacement proxy value, without inventing rankings.
7. Infer your snake slot from actual picks or displayed upcoming picks. Use ADP to compare waiting until your following turn with picking now. ADP is a heuristic, not a survival probability.
8. Preserve your board as the primary priority: bounded bonuses for lineup improvement (up to 10 ranks), discounted bench value (up to 2) and waiting cost (up to 4). If a shorter custom board lacks replacement coverage, roster-fit and ADP heuristics still work without manufacturing missing benchmarks. D/ST and K use rank and roster fit.

Stale, incomplete, disconnected and completed drafts suppress live recommendations. Projection files are neither requested nor read; previously saved projection data cannot affect advice.

### Static board and turn outlook

The supplied spreadsheet’s Combined Ranks are bundled as static JSON. No upload or board-update control is shown. Previously saved custom boards and projection files are ignored; live picks never modify the source ranking.

For each update, remove taken players, sort the remaining market queue by ADP (falling back to Combined Rank), and count picks before your next turn and the turn after it. A band of ±max(1, ceil(opponent picks × 0.2)) around the expected cutoff marks uncertain availability. Players expected to be gone before the next turn are excluded when plausible eligible choices remain. The rank-based shortlist and roster/replacement scoring are then applied to that pool. The following-turn forecast discounts one intervening selection as yours and identifies a possible later alternative at the same position.

These are transparent heuristic estimates, not calibrated probabilities or individual opponent predictions. A player can be available now and still unlikely to reach your next turn. When draft position is unknown, the UI says so and does not guess a slot. Each recommendation includes visible roster/rank reasoning and availability outlook; details remain expandable.

Shared upload components remain available for future tools, but the draft feature does not use them or bundle an Excel parser.

## Private release

Version 0.6.11 requests all-site host access. Google’s [permissions policy](https://developer.chrome.com/docs/webstore/program-policies/permissions/) prohibits requesting permissions solely for features not yet implemented; this is an unresolved store-review issue. The private tester release is prepared locally, not published. See `release/LISTING.md` for submission status.

## Shared design and future tools

The sidebar uses the [Eric’s Personal Tools design system](../docs/DESIGN.md). The compact header names the current function, selected automatically from the active tab. Gmail reads the latest expanded message and offers on-device summaries and editable reply drafts. See [Gmail behavior and requirements](../docs/GMAIL.md).

### Manual draft fallback

In **Settings**, turn **ESPN is capturing picks** off to enable **Me** or **Someone else** directly on the tier board. Turn it on to resume live capture and hide all manual controls. The choice is saved per draft. **Undo** restores captured ownership or removes a manual addition. Switching capture off starts a manual board from captured picks (or resumes saved manual corrections). Settings shows current pick and assigned draft position only in manual mode. Its optional search only returns players outside the spreadsheet after you type, so the ranked list is never duplicated. Update current pick as the manual draft progresses. Practice and real draft corrections remain separate; the visible draft is selected automatically.

All 177 Combined Ranks players are reconciled to ESPN IDs, with canonical names, positions and NFL teams displayed. The bundled public ESPN catalog includes 4,552 entries at this league's positions, including free agents and historical records. **Sync ESPN players** refreshes it without cookies or league data. Ambiguous identities are disabled; unmatched captured picks block advice. Manual corrections and catalogs stay in local extension storage.

### Tiers and early roster targets

Combined Ranks' dark horizontal borders define 11 tiers: 1–8, 9–16, 17–24, 25–41, 42–59, 60–79, 80–98, 99–124, 125–141, 142–154, and 155–177. The importer reads top/bottom borders without counting the same divider twice. Recommendations prioritize the highest plausible available tier, then adjust within that tier for overall rank, roster fit and ADP waiting cost. The existing ordinal replacement calculation remains a rank proxy, not projected points.

Early preferences target one RB by round 2, two RBs by round 4, and one TE by round 4 when possible. RB deadlines take precedence over ordinary tier ordering; round 3 reserves remaining choices for missing RB/TE targets. TE urgency can reach at most one tier below the best available tier. Explanations name the active target. Targets use the next own pick's round when known, otherwise the current round (or roster count when progress is unknown); they never assign a draft slot. Deadline bonuses stop after round 4 or when targets are satisfied. Taken players and position limits still apply in both live and manual mode.

### Tier board and on-page highlights

Recommendations appear as numbered highlights on the tier board and background colors on ESPN; the separate recommendation panel has been removed. The tier board replaces Pick history and the session dropdown. Available, Yours, and Taken have stronger, labeled colors. Recommended players also have a contrasting border and numbered NEXT PICK badge. Fully taken tiers collapse automatically and remain expandable. Expansion choices survive unchanged feed updates; a newly exhausted tier collapses. Disconnected/incomplete feeds mark uncaptured availability Unconfirmed.

The background returns recommendations directly in the response to each validated ESPN draft snapshot. The sidebar also sends immediate updates for manual corrections. A reusable content component outlines visible draftable player rows and adds a numbered label, matching ESPN IDs or exact normalized name/position/team. It never selects or drafts players. Highlights clear on draft change, stale/blocked advice, session changes, or within 15 seconds after capture updates stop. Refreshing ESPN is required after reloading the extension. Unit tests cover matching, expiry, wrong-session protection and clock changes. Live ESPN verification remains pending.

### ESPN tier colors and roster counts

Recommended visible ESPN player rows receive a blue background. Other available players in the highest remaining spreadsheet tier receive an amber background. ESPN highlights change only background colors: no badges, borders, added text, or layout changes. Blue takes precedence when both apply. Current tier means the lowest tier number with an untaken verified player, not the tier of a lower-ranked recommendation. Both highlight groups share draft/identity validation and expiry, and clear when advice is blocked. The highlight component leaves ESPN's Draft button state unchanged, including between your turns.

A prominent sticky roster strip directly beneath Bedford Bridges shows RB, WR, QB, TE, D/ST and K totals from the effective live or manual board, including players outside the spreadsheet. Counts stay visible when a captured session disconnects; unknown sessions show dashes.

Version 0.6.10 expands ESPN matching to ordinary player links and ARIA rows, without requiring pick-feed name classes or a native Draft button. The page acknowledges matching counts; the sidebar reports disconnected scripts, changed draft clocks, and no visible matching rows instead of silently swallowing failures. Live DOM verification remains pending because the user's ESPN tab is not exposed to the connected browser.

### Sticky roster and completed tiers

Bedford Bridges and Your roster share a sticky component at the top of the viewport while you scroll through later tiers. All exhausted tiers are grouped inside a single collapsed **All taken** disclosure; individual tiers remain expandable within it. Undoing a pick returns its tier to the active board. Archive expansion state survives normal feed updates. Recommendation calculations and ESPN/board highlights remain active without a duplicate recommendation panel.

Version 0.6.10 adds capture-response highlight delivery, so the page can update without an open sidebar. The component owns and installs its CSS, supports virtual div rows and reports whether matched rows have the expected painted background. The first capture runs after the highlighter is initialized. Background tests verify recommendations in capture acknowledgments; browser verification uses a standalone player-list fixture. Live ESPN validation is still pending access to the user’s draft tab.

Version 0.6.10 removes on-page badges and borders, including obsolete injected styles. Browser fixture checks confirm identical row dimensions and text before and after highlighting.

Version 0.6.11 paints row and cell backgrounds directly through CSSOM, so highlighting does not depend on ESPN accepting an injected stylesheet. Clearing advice restores previous inline background colors. A browser fixture with restrictive style CSP verifies blue/amber colors and unchanged row dimensions; the live ESPN tab remains unavailable to the connected browser.

Version 0.6.12 adds Settings → Download ESPN diagnostics and persistent highlight counts. The locally downloaded JSON includes extension versions, draft URL, advice, and bounded player-row DOM descriptions with computed colors and dimensions. This diagnostic release does not claim to resolve the live-page highlighting failure.

Version 0.6.13 supports ESPN’s nested fixedDataTable row and cell layers, identified in a user-provided diagnostic. Both frozen and scrolling cells receive background-only colors. The painted count checks the visible surface at the player name, rather than a wrapper background. Browser fixtures verify nested cell colors and unchanged row heights. The private diagnostic itself is not bundled.

Version 0.6.14 uses native data-player-id identities observed in a live practice draft, updates recycled rows on DOM changes, and preserves unchanged background colors between refreshes. Draft capture is isolated from rendering failures. Regression tests include three actual ESPN row fragments and recycled player IDs. Live verification of the installed update requires reloading the extension in Chrome; automated access to extension management is blocked.

Version 0.6.15 collapses players taken by others within tiers 5 and higher into an expandable disclosure. Available players and your picks remain outside it, including your picks in otherwise exhausted late tiers.


### RB and WR tier scarcity (0.6.17)

Scarcity is a selective cue, not a warning for every empty starting slot. No alerts appear on your first pick. RB targets follow the existing plan (one by round 2, two by round 4); WR targets allow one by round 3 and two by round 5. Only an overdue quality-starter need with one or two eligible options left in the current tier can trigger a warning. Each option must have ADP and be forecast unlikely to survive until your next pick or the turn after it. Broad tiers, uncertain forecasts, and already-exhausted positions stay quiet.

Quality means a verified ranked player above the existing starter-replacement benchmark, even if you drafted that player from a later tier. Short boards without a benchmark use current-or-better tiers. FLEX and bench depth do not increase starter targets; ownership counts still include all players.

Only the most urgent position gets a short roster note and small muted badges. Player rows keep their ownership colors and recommendations keep their blue ESPN backgrounds. Other affected ESPN players receive a soft amber highlight. Hover over a note or badge for context. Alerts recalculate with live/manual changes and clear for unknown order or blocked/stale feeds. ADP availability remains an estimate.

Regression checks cover the empty first-pick screenshot, normal early roster building, depleted tiers, missing ADP, uncertainty, recommendation colors and one-warning limits.


Version 0.6.18 collapses every fully taken tier into All taken, including late tiers containing your picks. Expand the archive to review your players; undoing a pick returns the tier to the active board.


Version 0.6.19 adds a live picks-until-your-turn count beside the next overall pick. It includes the opponent currently on the clock, follows snake-round reversals, and shows Your pick now at zero. Unknown or blocked draft progress suppresses the countdown. Manual boards update when you change the current pick.


Version 0.6.20 also shows the number of intervening picks until your following turn while you are on the clock. It excludes your current selection, labels consecutive picks as You pick again immediately, and omits the following-turn wait when no further pick is known.


Version 0.6.21 removes the highlight-status line, connection card and links, draft totals, Draft board heading, status legend, and capture-source note. The roster, pick countdown, settings and tiered player list remain; page highlights continue updating in the background.


Version 0.6.22 keeps draft progress and both pick countdowns in the sticky roster section. Players taken by other teams now fold into Taken by others starting in Tier 4; your players remain visible until the whole tier is exhausted.


Version 0.6.23 reserves the final available selections for a missing starting defense and kicker. It uses the smaller of open roster slots and known remaining snake-draft turns, so advancing a manual board cannot spend those final picks on depth. Once a defense or kicker starting slot is filled, the advisor excludes backups at that position. Earlier picks still follow the board and existing roster priorities. Required last-pick choices explain the defense/kicker need.


Version 0.6.24 adds Reset draft data at the very bottom. Reset this draft creates an empty manual board for the current session, clears its corrections, draft position and progress, and switches live capture off so ESPN history cannot immediately refill it. Other drafts, rankings and settings are preserved. Re-enabling capture uses ESPN history again; this is a board reset, not deletion of ESPN’s draft.

### Open on any computer

After installing or updating the extension, right-click a webpage and choose **Open Eric’s Personal Tools**. This native menu is created on each installation and does not depend on a saved keyboard shortcut or extension URL. The toolbar icon also opens the sidebar. Uses Chrome’s [documented context-menu side-panel launcher](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#programmatically_open_the_side_panel_on_user_interaction).

Version 0.6.25 adds the native right-click launcher.

Version 0.6.26 adds a gear in the sidebar header that opens in-sidebar Settings. Credentials and Draft are subsections; draft capture and reset controls live there. Credentials support named local secrets, replacement, and deletion. Secret inputs are masked and saved values are never rendered back into the UI. Storage access is restricted to trusted extension contexts before saving; values are not encrypted by this extension or synced. Saving credentials does not yet configure provider integrations.

Version 0.6.27 replaces free-text service names with a dropdown for OpenAI, Anthropic, and Google Gemini. Existing saved service names remain selectable so older credentials can still be replaced.

Version 0.6.28 unifies page and section titles through the shared Title component, using Bedford Bridges’ 20px Georgia typography. Settings, Credentials, Draft, Gmail, and other headings use the same type styling.

Version 0.6.29 shares PageHeader and PageBody across Settings, Fantasy, Gmail, and Home. Page insets and section spacing come from shared tokens, including header actions such as Back.

Version 0.6.30 combines the current sidebar controls with the Cloudflare AI provider gateway. Open the separate AI providers & playground page from sidebar Settings or the extension’s Options menu. Local sidebar credentials remain separate from encrypted cloud connections.

Version 0.6.31 polishes shared form spacing, shortens credential copy, and styles dropdown controls and their Chrome picker menus.

Version 0.6.32 connects sidebar Credentials to the Worker and encrypted D1 connections. Enter the Worker API_TOKEN once per browser if not already connected. Save, replace, delete and refresh use the cloud API. Supported legacy local credentials migrate after connection, and local copies are removed only after acknowledgement. Failures or conflicts retain local keys.

Version 0.6.33 distinguishes Worker authentication from saved provider keys. Sidebar save success requires a fresh cloud read confirming the provider record has a key; empty connections show No API key saved.

Version 0.6.34 connects Gmail Summarize to the existing Worker generate endpoint and a saved OpenAI D1 connection. It uses the most recently updated OpenAI connection with a key, its configured model or gpt-4.1-mini, and at most three bullets. Reading email alone never sends it. Reply generation remains on-device. No Worker redeploy or schema change is needed.
Default summary model reference: [OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Version 0.6.35 organizes Credentials into Cloud connection, Saved credentials, and Add or replace a key. Maintenance actions use adjacent bordered buttons, destructive actions have a distinct style, and shared sections keep related controls together. Repository agent guidance now defines UI/UX standards for grouping, hierarchy, spacing, accessibility, responsive layouts, and visual review.

Version 0.6.36 reconnects already-open Gmail tabs after extension updates. The sidebar injects its reader only on Gmail when the connection is missing; retries are bounded and existing listeners are replaced. Adds scripting permission for this recovery.

Version 0.6.37 makes the email subject the single page title and fixes provider requests for Cloudflare Workers: manual redirects are rejected explicitly. Requires redeploying tools-api. Runtime regression tests now exercise the actual Workers Request implementation.

Version 0.6.37 starts Credentials collapsed and reduces section padding, group gaps, and label spacing while preserving button and input sizes.

Version 0.6.38 uses a flat settings list with subtle dividers, compact section labels, and trailing chevrons. Credentials and Draft remain collapsed by default; the AI settings link uses the same row structure.

Version 0.6.39 promotes Summarize to the primary action, grows editable results to fit all text, and fixes email summaries to lightweight GPT-4.1 mini regardless of other connection model settings.


Version 0.6.39 adds a Rewards button available from every sidebar context. It opens a persistent rewards hub for manually entered points, miles, credits, discounts, eligibility notes, official source links, and use-by dates. Next actions highlights deadlines within 30 days (including passed deadlines to verify), activation requirements, and balances last updated at least 30 days ago. Search, edit, mark used, and confirmed deletion are supported. Back returns to the active tab's tool. Entries remain in local Chrome storage; there is no automatic account sync, offer discovery, cross-device sync, or background notification. Recurring benefits require a separate entry for each period. No card numbers or login credentials are needed.

Rewards validation: existing architecture and behavior suite plus deadline, validation, and navigation tests pass. Browser preview checked at 380px and 280px with a synthetic long benefit name; saving, marking used, and persistence after reload verified. Installed extension verification remains pending reload.

Version 0.6.40 removes connection default models. Gmail summaries, restaurant research, and booking-page interpretation use central task policies, reviewed model costs, capability levels, and provider model availability. Playground model selection applies only to that request. Deploy the updated Worker before using this extension release. See `../tools-api/MODEL_ROUTING.md`.


Version 0.6.41 replaces the standalone Rewards button with a shared Capabilities navigation. Current tab follows Gmail and ESPN; choosing Rewards, Gmail, or Fantasy football keeps that capability open until another is selected. Restaurants and Settings are also available from the same navigation. New destinations belong in `src/capabilities.js`, not in separate header buttons.

Rewards now sync through the existing Worker connection into an encrypted D1 wallet. Each save uses a revision to reject stale updates. Refresh runs on opening Rewards and every minute while visible and the editor is closed; explicit Refresh keeps form text intact. On conflict, refresh and review before saving again. Existing device-local records migrate with stable IDs and are removed locally only after cloud acknowledgement. Cloud failure preserves local migration data and form input. Connect each browser in Settings → Credentials. Preview mode remains local and is explicitly labeled. This syncs saved account and benefit records; balances are still manually entered. The D1 table and Worker were deployed with this update; reloading the installed extension is required for migration.

Navigation and rewards validation: narrow 280px and standard 380px browser previews, Settings return, and Escape dismissal checked; API encryption/revision and migration-recovery tests pass.

Version 0.6.41 checks the public Worker release endpoint against D1 at most hourly while the sidebar is open, persisting checks across reopenings. A compact banner announces newer builds. After packaging each release, run `node tools-api/scripts/publish-release.js` from the repository root to publish its manifest version to D1. This does not reload Chrome automatically.


Version 0.6.42 renames the navigation label to Tools and replaces the text chevron with a centered CSS chevron in a dedicated grid column. Long destination names wrap without displacing the indicator.

Version 0.6.43 adds the Restaurants workspace: source-backed name/category discovery, city and neighborhood filters, UWS travel defaults, exact and flexible party sizes, live booking-page checks, explicit name clarification, evidence links, cancellation, and manual page rechecks. Open Restaurants from the capability menu. The Worker research endpoint is deployed. See [reservation usage and validation](RESTAURANTS.md).
## Data capabilities (0.6.43)

Use the **Tools** dropdown to open Travel wallet, Rewards & benefits, Best card, Restaurants, or the **Misc** section holding Player rankings and Fantasy football. Gmail is not listed: it opens by itself when the active tab is Gmail. AI connections lives in Settings, and League rules was removed. Travel is an ordinary capability; there are no separate travel callouts on the home or settings screens. The mobile app uses the same catalog and sections.

Connect Travel wallet once with your private access token to download all records, including masked numbers and notes, into encrypted IndexedDB storage. Downloaded records can be searched, copied, added, edited, and marked for deletion offline. Changes persist before network requests and sync on refresh, reconnect, or foregrounding. Per-record revisions reject stale edits. Conflicts retain the device's changes until you choose the cloud version or explicitly keep the device's version. A lost successful response is reconciled before a retry.

Cloud and device copies are encrypted with AES-GCM. Device encryption is unlocked by the device's saved access token. Disconnect clears the local copy and token but leaves cloud records; pending changes must first be synced or resolved. Browser storage is not a permanent backup. The phone includes bundled player rankings, plus encrypted offline AI connection metadata reachable from Settings; provider keys remain on the server and provider requests require internet. Live draft capture remains an extension action.

## Travel wallet in the sidebar (0.6.46)

Travel wallet opens directly from Tools in the extension sidebar. Show number reveals a selected record inline; Hide number masks it again, and Copy number remains available. Records come first, editing and record maintenance use disclosures, and Connection settings stay collapsed after connecting. Shared mobile UI (0.1.7) has the same controls. Sync messages no longer emphasize device storage.

Validation: 133 extension tests (including component architecture, reveal/hide, edit failure preservation, deletion confirmation, and sidebar selection), 19 mobile tests, and 31 API tests pass. Synthetic browser checks covered 280px sidebar and 390px phone layouts, inline reveal, offline reopening, queued edits surviving reload and syncing on reconnect, long record names, and connected settings. Native Chrome installation and real iPhone biometric/clipboard behavior were not directly tested.

Archive: `release/erics-sidebar-0.6.192.zip`.

## Separate travel record editor (0.6.47)

Travel wallet keeps the compact searchable record list in the sidebar. Add record and Edit open a dedicated extension tab; saved changes refresh the viewing list. The editor reloads the selected record by ID, preserves failed edits, and keeps numbers masked. Done closes the editor after changes are saved or canceled. Mobile keeps its inline editor and shares the compact rows.

Archive: `release/erics-sidebar-0.6.192.zip`.

## Compact wallet controls (0.6.48)

Makes Add record, search, and entry text smaller. Search uses only the visible placeholder “find record” with an accessible hidden label. Copy uses a small icon shown on row hover or keyboard focus; touch users can reveal it by expanding the row. Routine up-to-date messages are omitted. Wallet connection controls live in sidebar Settings and are absent from browse and editor pages; mobile retains its header Settings.

Validation: 138 extension tests and 19 mobile tests pass. Synthetic 30-record UI reviewed at 280px sidebar and 390px mobile, including hover icons, keyboard access, and Settings navigation. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.192.zip`.

## Shared control style guide (0.6.49)

Defines control roles, sizes, typography, spacing, focus, and touch behavior in `docs/DESIGN.md`, linked from repository instructions. Shared Button supports an explicit compact size. Wallet Edit, Copy notes, and Delete use matching compact subtle actions; form and confirmation actions retain the appropriate stronger treatment. Replaces accumulated wallet overrides with one token-based stylesheet shared with mobile 0.1.11.

Validation: 138 extension and 19 mobile tests pass; synthetic expanded/collapsed records reviewed at 280px and 390px. Native installed Chrome and iPhone behavior remain unverified. Archive: `release/erics-sidebar-0.6.192.zip`.

### Live wallet updates (included in 0.6.49)

Saved records, deletions, and conflict resolutions notify open extension wallets through a private-data-free extension storage marker. Refresh requests received during another operation are coalesced and applied when it finishes; unsaved editor input remains protected. Browser previews retain BroadcastChannel support.

Validation: 141 extension tests, 19 mobile tests, and 31 API tests passed. Synthetic two-window browser checks verified creation and rename propagation without reopening the wallet; compact Add record layout reviewed at 280px and 390px. Installed Chrome side-panel delivery was not directly exercised; extension storage delivery and busy-refresh behavior have regression coverage.


The combined 0.6.49 / mobile 0.1.11 release also shows mobile numbers directly beside Copy, invokes saved passkeys without an extra app Unlock prompt, and removes routine up-to-date messages from shared data views. Final validation: 144 extension, 19 mobile, and 31 API tests pass. This includes the simplified record form and live sidebar propagation verified in the related tasks.

Version 0.6.50 merges restaurant reservations, rewards and central model routing with the latest mobile/offline and travel-wallet updates. One Tools menu includes all extension destinations; travel remains in the sidebar and restaurants opens its workspace. This supersedes the local reservation-only 0.6.43 package.

## Mobile home screen, hamburger menu, and a version check (0.6.73 / mobile 0.1.32)

The mobile home screen now holds nothing but the tool icons. Home is not one of
them — it is already home — so it appears only inside the menu, as the way back.
Opening a tool collapses the grid behind a hamburger naming the open screen.

Settings stopped being both a header button and an icon. The header button is
gone; Settings is a screen reached from the same grid, so the hamburger stays
available to leave it. Device settings (offline access, version) moved below the
tools frame so the whole Settings screen reads in one order: cloud connection,
AI connections, offline access, version. Its **Check for a new version** button
asks D1 directly, skipping the hourly throttle that paces automatic checks, and
reports up to date, the newer version, or that the check failed.

Explanatory prose was cut further, continuing 0.6.72: Best card's editor notes,
the Restaurants criteria and party-size hints, the reference libraries' empty
and disconnected states, the passkey recovery paragraph, and the
protected-section gate. Labels, statuses, and error messages stayed; paragraphs
describing what a feature does did not. The mobile footer went too, since
Settings now shows the version.

Validation: 218 extension, 28 mobile, and 48 API tests pass, including new
coverage for the home screen holding no Home tile, the hamburger, Settings as a
screen, and the forced release check. The mobile home screen, an open tool with
its collapsed and expanded menu, and the full Settings screen were reviewed in
the unlocked mobile shell at 375px and 320px; the sidebar Tools menu was
reviewed in the synthetic harness at 420px. Native iPhone and installed Chrome
behavior were not directly tested. Archive: `release/erics-sidebar-0.6.192.zip`.

## Tools menu sections and a mobile home screen (0.6.65 / mobile 0.1.24)

Both hosts read one grouped registry. Registry entries carry an optional `section`, and a **Misc** section now holds Fantasy football and Player rankings; everything else stays in the main, unlabelled group. Gmail left the Tools menu — it opens by itself when the active tab is Gmail, which is what Current tab always did. AI connections is reached from Settings in both hosts rather than as a tool of its own, and League rules is gone: its capability, its data page, its Settings rulebook, and its bundled mobile dataset. The draft engine still reads `config/espn-league-2026.json` for scoring and roster logic.

Mobile opens on a home screen that is the icon grid itself. Choosing a tool collapses that grid behind a **Tools** dropdown holding the same icons plus Home, so a tool keeps the screen; the home screen no longer competes with it for vertical space, and no tool selection is restored across launches.

Validation: 182 extension, 26 mobile tests pass. The sidebar Tools menu and Settings were reviewed in the synthetic harness at 400px and 320px; the mobile home screen, an open tool with its collapsed and expanded dropdown, and AI connections inside Settings were reviewed in the unlocked mobile shell at 375px. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.192.zip`.

## Travel wallet record list (0.6.61 / mobile 0.1.20)

Rebuilds the wallet list against the revised record layout in `docs/DESIGN.md`. Disclosure markers move out of the record names into a fixed right-hand column and rotate when a record opens, so they align regardless of name length. An open record becomes one contained surface block holding its number, metadata, actions, and delete confirmation instead of loose text between two rules. The find-record field returns to its intended compact filter size — the shared `.form-field` control rules had been out-specifying it, rendering a 40px/16px control — and the list's opening hairline is dropped when there are no records. The page heading is 22px with its primary action aligned to the list's right edge.

Validation: 180 extension, 26 mobile, and 44 API tests pass. Synthetic 13-record wallet reviewed at 390px and 280px in the standalone page, the sidebar, and the installed mobile shell, covering collapsed rows, an open record, delete confirmation, filtered-empty, disconnected-empty, and the editor page. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.192.zip`.

## Wallet records grouped by type (0.6.62 / mobile 0.1.21)

The wallet list is organized by category instead of one long alphabetical run. Records group under a Georgia category label in the registry's own order — Airline, Hotel, Rental car, Trusted traveler, Passport, Visa, Other — alphabetically within each group, with empty groups omitted and search filtering within the structure so only groups holding matches remain. Grouping lives in `groupTravelRecords` in `travel-data.js`, shared by the extension and mobile; a record saved under a retired category keeps its own group ahead of Other rather than dropping out of the list.

An open record is tidier for it. The category line is gone, since the group label already states it, so the block is the number, that record's own detail (expiration, and the traveler where the collapsed row does not show it), a quiet rule, then the actions. The rule separates what the record is from what you can do with it and keeps a delete confirmation visibly attached; a metadata line with nothing to say is removed rather than left as a gap.

Validation: 182 extension, 26 mobile, and 44 API tests pass, including new coverage for group order, retired categories, filtered groups, and the filtered-empty message. Synthetic 14-record wallet reviewed at 390px and 280px in the standalone page and the unlocked mobile shell, covering all seven groups, an open record with and without metadata, delete confirmation, and search filtering to one group. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.192.zip`.

## One passkey, named directly (0.6.76 / mobile 0.1.36)

Opening Finance, Personal information, or a card number asks the passkey by
name once one has answered, so the routine unlock is a plain biometric prompt
instead of a browser chooser. Enrollment on the phone now renews the one
passkey rather than adding another: an authenticator files a resident
credential under `rp.id` and `user.id` together, and a random handle made every
repeated setup — and every recovery — leave a second entry behind under the
same name, each deriving a different key. A fixed handle replaces the passkey
it renews.

Two passkeys already in a provider still derive two different keys, and an
assertion succeeds under either, so the remembered one has to be able to be
wrong. Every protected section reads its values through `vault.open()`: a
sealed value that will not open drops the remembered ID, and the next check
offers the choice again. Falling back to the recovery code drops it too.
Entries created before this release stay in the provider until they are deleted
there — the app cannot remove a credential it created, and only one of them
holds the key to existing values.

Validation: 235 extension and 24 mobile tests pass, including new coverage for
naming the remembered credential, forgetting the twin that cannot open a value,
and enrolling twice under one user handle. The native Touch ID and Face ID
sheets were not directly tested.

## Store account snapshots from a signed-in account page (0.6.85 / mobile 0.1.46)

The sidebar recognizes an account site in the tab beside it — E*TRADE to start —
and asks that page three things: its path, whether a password field is on
screen, and whether a sign-out control is. That is enough to tell a signed-in
session from a log-on form, and no page text crosses back to answer it. On a
signed-in site the panel opens Finance and offers one action, **Store account
snapshots**.

Pressing it takes the same single snapshot of the visible page that **Read the
open page** always did, and reads it as a live page: one figure per account,
each account's own total rather than a holding inside it or a sum across them,
and a balance shown without a date of its own is today's rather than dropped for
want of a printed date. What comes back is one row per account, showing what it
would update or create, with **Edit** to correct any amount and **Save** to
write them all through the same validator and offline queue as a typed edit.
Nothing is saved by reading, and **Discard** throws the whole reading away.

It still never navigates, never signs in, and never opens a tab; the sidebar
only ever reads a page the owner already has in front of them, and only when
they ask.

Validation: 259 extension, 32 mobile and 58 API tests pass, including new
coverage for host matching, the sign-in probe, the once-per-throttle page ask,
the snapshot rows and the date they carry, editing an amount before saving, and
a bad amount that stops the save without losing the rest. The panel was reviewed
at 380px and 280px against synthetic readings. The detection was not exercised
against a live E*TRADE session.

## Name a card you hold and its benefits arrive with it (0.6.88 / mobile 0.1.49)

Rewards & benefits gains the intake Best card already had, aimed at the part of a
card nobody finishes typing. Say which card you have however you name it — `amex
platinum`, `blue cash`, `jp morgan reserve` — and **Find card benefits** reads the
issuer's current pages and brings back the card and every benefit it carries: the
amount, how often it resets, whether it needs enrolling, any fixed end date, and
what the issuer says to check. A name that fits more than one real card returns
the products it could be and researches nothing until one is chosen; `blue cash`
is two cards with two different annual fees.

Nothing is saved by looking. The card and its benefits are listed the way they
will be stored, and one action saves them — the card first, so each benefit can
name it. A save that stops part way keeps what is left on screen to finish.

Two things the wallet needed to hold them. A card you hold is now an entry kind
of its own, so its benefits are filed under it and the wallet shows one card with
its benefits inside rather than forty loose rows; its number seals on the device
the way any other did, entered once on the card instead of on every benefit.
And an entry says how often it **resets** — monthly, quarterly, twice a year,
yearly — because a card credit is not a one-time offer and the unused part does
not carry over. Next actions raises a recurring credit as its period closes,
sooner for a shorter period, so a monthly credit surfaces in its last week
instead of sitting on the list all month. A credit that follows an account
anniversary rather than the calendar keeps an explicit date, because only the
owner knows the anniversary.

Only the card name typed in is sent; nothing already in the wallet leaves the
device for it. See [docs/REWARDS.md](../docs/REWARDS.md).

Validation: 283 extension, 32 mobile and 65 API tests pass, including new
coverage for the reset calendar and how near a reset each period is raised, a
benefit's link to its card, the fields the sync layer must carry, research that
must cite an issuer page it opened, a loose name answered with alternatives, and
a save that fails part way and is finished by saving again. Reviewed in the
shared wallet preview at 380px and 280px against synthetic research, populated,
offline and empty states. Live issuer research was not exercised against a real
OpenAI connection.


## A reward program's offers arrive on their own (0.6.88 / mobile 0.1.49)

Morgan Stanley Reserved Living & Giving is a membership with no balance: its
value is the catalogue of offers behind it, and that catalogue moves. It is now
read from the program's own pages instead of typed in, and refreshed whenever
you visit `msreserved.com`. The offers appear under **Program offers** in
Rewards & benefits, below your own wallet, with the wallet's search filtering
both lists and a category picker narrowing the offers further. There is no
button to press: the catalogue updates by itself, and the status line says how
many offers there are and when the whole list was last seen.

The reading follows the rule Finance already follows for an account page. The
extension never signs in, never navigates, and never opens a tab of its own; it
reads a page you already have open, in the page, and takes only the published
offer list — name, category, one-line summary, badge, dates, and the offer's own
address. Nothing about your account is read, and no session, cookie or
credential leaves the browser. None is needed: every member sees the same list.

`/offers/all_offers` carries all 136 of today's offers and every other page
carries a subset, so a reading taken elsewhere on the site asks that page for
itself from inside the tab. A reading that could not see the whole list may add
and update offers but never retire one; only a complete reading drops an offer
the program has stopped listing. `background.js` does the watching, so a visit
counts whether or not the side panel is open — always on the full listing, and
at most once every 30 minutes anywhere else.

An offer's first sighting survives every later reading, so offers that are new
to you sort to the top. That fold happens in the Worker rather than on the
device, because it is the one copy every browser writes. See
[docs/REWARD_PROGRAMS.md](../docs/REWARD_PROGRAMS.md).

Validation: 283 extension, 32 mobile and 65 API tests pass, including new
coverage for host matching, the card reader against both heading shapes, the
listing fetch and its three failure modes, partial versus complete merges,
search and category filtering, the once-per-throttle rule, and a catalogue past
the 64 KB an ordinary record is held to. `tests/draft.test.js` is included again:
its `chrome` stub now carries the tab and storage-change APIs `background.js`
uses, which is what had been hanging it. Reviewed in a new shared rewards
preview at 380px and 280px against synthetic offers. The reader itself was run
against the live `msreserved.com` from an offer page, reading all 136 offers;
the end-to-end save was not exercised against a signed-in session.

## Finding a table uses the whole page (0.6.92 / mobile 0.1.51)

Every search with an exact party size used to fail with a party-size complaint
that had nothing to do with what was typed. The app sends the Worker its
normalized search, and a fixed size travels in that as `minParty`/`maxParty`
with no `partySize` field — which the Worker's own copy of the same validator
then rejected. `searchInput` now reads a fixed size from either field and
returns `partySize` alongside the range, so its output survives the round trip
and the Worker already running in production accepts it — this release fixes
the error without waiting on a deploy, and a client still on the old shape
stays acceptable once the Worker does update. Both the API and extension suites
hold it there.

The workspace is one page instead of a narrow form beside a results column.
`WorkspaceFlow` runs the search across the full width — the two field groups sit
side by side while there is room for them — and the shortlist follows
underneath as a row of cards, appearing only once a search has returned
something. **Search for** is two choices, so it is now the new shared
`SegmentedField` rather than a dropdown holding two options. **Research
settings** is one row: shortlist size, connection, and **Reload** beside the
connection, with nothing to read when research can run.

A named restaurant can be checked across a run of dates. **Flexible dates**
takes a first and last date up to seven days apart; each date is its own page
check, confirmed against that date's own controls, and each gets its own booking
link on the phone. A category search is one evening out, so it keeps a single
date and is not offered the option. The 120-check cap now counts dates along
with party sizes and time anchors.

Validation: 289 extension, 32 mobile and 66 API tests pass, including the
normalized search surviving the Worker's validation for fixed, flexible-party
and flexible-date searches, the seven-day limit, a category search keeping one
date, per-date booking links, and the segmented control replacing the mode
dropdown. The workspace was reviewed in the restaurant preview harness at
1440px, 420px and 280px — with a synthetic three-card shortlist for the grid and
no horizontal overflow at 280px — and in the unlocked mobile shell at 390px,
where a two-date search produced a booking link for each date. Live OpenAI
research and live provider pages were not exercised.

## An unlock lasts an hour (0.6.91 / mobile 0.1.50)

The inactivity window is an hour rather than fifteen minutes. One passkey now
covers a working session instead of expiring in the middle of one.

There is one window, not several: `idle-session.js` holds it, and the phone's
lock, the sidebar's protected sections, and the wallet's card numbers all read
it from there, so they still open and close together. Nothing else about the
lock changed — a full restart starts locked, activity extends the window, a
clock that moves backwards is treated as expiry rather than extra time, a
restored session still expires when it was always going to, and **Lock now** is
still immediate.

Validation: 288 extension, 32 mobile and 65 API tests pass, including a new
check that pins the window to an hour; the existing idle tests read the same
constant and cover the longer window as they always did. Both builds pass. No
interface changed: the window is never displayed or counted down anywhere, so
there was nothing new to review on screen.

## Morgan Stanley accounts read into the snapshot (0.6.90)

Morgan Stanley joins the sites the sidebar recognizes beside it. Signed in to
Morgan Stanley Online, Finance opens with **Store account snapshots**, and one
press reads the wealth-management accounts on screen — brokerage, retirement and
the rest — into one row each, each account's own total rather than a holding
inside it or a sum across them. An account the reading cannot place is filed as a
brokerage, and a page that names no institution is filed under Morgan Stanley,
while an account the page names for itself keeps that name. Self-directed
accounts at E*TRADE from Morgan Stanley sign in separately and stay their own
entry.

The site is one site under two names — the log-on form is served from
`login.morganstanleyclientserv.com` and the signed-in application from `www.` —
so the registrable domain covers both and the log-on path falls outside the
application's own. What needed saying in the registry is which paths are the
application's: Morgan Stanley Online keeps its public pages under the same `/cs/`
prefix, marked by a `free` segment. `/cs/freecontent/logout.aspx` is exactly
where signing out lands, and none of those pages carries a password field to say
so, so they are held out of the paths the site is recognized by. A deep link
followed with no session at all is refused in place, on the application's own
path; that one page cannot be told apart, and reading it simply finds no figures.

Nothing else changed. The page still hands back a path, a loading state and two
yes/no answers and no page text, and the extension still never navigates, never
signs in, never opens a tab, and reads only the page already in front of the
owner, only when asked.

Validation: 287 extension, 32 mobile and 65 API tests pass, including new
coverage for Morgan Stanley host matching across both subdomains, the firm's
public site not being mistaken for the client one, and the site's own public
pages — the page signing out lands on, the same prefix capitalized differently,
and username enrollment — being held out of its application paths. Detection was
checked against the live signed-out `login.morganstanleyclientserv.com` log-on
form, its enrollment page, and `/cs/freecontent/logout.aspx`: the real module
calls all three the site and none of them signed in. It was not exercised against
a signed-in Morgan Stanley session. The snapshot panel was reviewed at 380px and
280px in the passkey-gate harness, which shows one open state per registered
site, and the Morgan Stanley reading was driven through Store, Edit and Save
against synthetic figures.

## Chase joins the account pages that can be read (0.6.89)

Chase is now one of the sites the sidebar recognizes beside it, on the same
terms as E*TRADE: signed in to chase.com, Finance opens with **Store account
snapshots**, and one press reads the accounts on screen into one row each.
jpmorganonline.com signs in through the same host, so J.P. Morgan accounts
arrive with the banking and card ones. An account the reading cannot place is
filed as a bank account rather than a brokerage, and a page that names no
institution is filed under Chase — while an account the page names for itself,
such as a J.P. Morgan brokerage, keeps that name.

Recognizing it took two corrections to how a signed-in page is told from a
log-on form. Chase serves both from the same `/web/auth/` path and puts its
log-on form inside a frame, so the question is now put to every frame of the
page rather than the top one alone: a password field in a frame is still a
password field. And because that frame arrives partway through the load, a
matching path only counts once the page has finished loading — a half-built
shell would otherwise read as the application it is about to refuse to become.
A rendered sign-out control still counts the moment it appears, since no log-on
page carries one. Only the top frame's path and loading state describe the tab;
a frame's own path never stands for it.

What the page hands back is unchanged — a path, a loading state and two yes/no
answers, no page text — and so is everything after it: the extension still
never navigates, never signs in, never opens a tab, and reads only the page
already in front of the owner, only when asked.

Validation: 286 extension, 32 mobile and 65 API tests pass, including new
coverage for Chase host matching, a still-loading page that must not be read as
signed in by its path, a log-on frame under the application's own path, the top
frame being found by its id rather than its position, and a second site carrying
its own label, institution and default kind through a save. The snapshot panel
was reviewed at 380px and 280px in the passkey-gate harness, which now shows one
open state per registered site; the Chase reading was driven through Store,
Edit and Save against synthetic figures. Detection was verified against the real
signed-out chase.com and secure.chase.com — including the frame timing that
motivated the loading rule — but not against a signed-in Chase session.

## Schwab accounts read into the snapshot (0.6.97)

Schwab joins the sites the sidebar recognizes beside it, on the same terms as
E*TRADE, Chase and Morgan Stanley: signed in to Schwab, Finance opens with
**Store account snapshots**, and one press reads the accounts on screen into one
row each. An account the reading cannot place is filed as a brokerage, and a page
that names no institution is filed under Charles Schwab.

It is the first site to be given a subdomain rather than a registrable domain.
The balances are only ever on client.schwab.com — www.schwab.com is the marketing
site, and schwaballiance.com now redirects there — so an ordinary visit to
schwab.com is never asked anything at all. The signed-in application is
everything under `/app/`, where signing on lands, and nothing signed out sits on
that prefix: a deep link followed with no session comes back as
`/Areas/Access/Login` carrying the path it wanted in a ReturnUrl, which is also
where the older `/Login/SignOn/` form and `/Areas/Access/SignOut` end up, and the
host's own public pages are under `/Public/`. A signed-in page outside `/app/` is
still recognized the way any other is, by its sign-out control.

Schwab serves its log-on form from a frame on a different host,
sws-gateway-nr.schwab.com. That is the rule Chase already established doing its
work again on a harder case: the top frame of that page has no password field at
all, and only a probe that asks every frame finds the one that does.

Nothing else changed. What the page hands back is still a path, a loading state
and two yes/no answers and no page text, and the extension still never
navigates, never signs in, never opens a tab, and reads only the page already in
front of the owner, only when asked.

Validation: 303 extension, 33 mobile and 75 API tests pass. `account-sites.js` is
the sidebar's alone, so mobile and the Worker are untouched by this release. New
coverage: Schwab host matching — the client subdomain recognized, the marketing
site and Schwab Alliance left alone, look-alike hosts refused — the `/app/`
application against the log-on, legacy log-on and public paths on the same host,
and the gateway frame answering for a page whose top frame carries no password
field. The snapshot panel was reviewed at 380px and 280px in the passkey-gate
harness, which shows one open state per registered site, and the Schwab reading
was driven through Store, Edit and Save against synthetic figures. Detection was
checked against the live signed-out client.schwab.com — its log-on page, the
redirect a signed-out `/app/` deep link produces, the legacy log-on path and the
sign-out path — but not against a signed-in Schwab session.

## The page in front of you says what these tools can do with it (0.6.101 / mobile 0.1.60)

The sidebar has always recognized a handful of pages, but recognizing one meant
being moved: Automatic mode follows the tab, and a tool chosen by hand never
heard about the tab at all. Now every page is looked at, and whatever these tools
can do with it appears as one row of destinations under the header — present only
when there is something, and changing nothing until it is pressed.

What a page can offer today: a gift idea saved from this exact page — including
**Bought for Celeste**, which is the half of it that stops a present being bought
twice — the snapshot beside a signed-in account site, a reward program's offers
on the program's own site, the email tools in Gmail, and draft advice on ESPN.
Pressing one goes exactly where the Tools menu goes: a capability with a page of
its own opens in a tab, a tool that lives in the panel is selected there, and the
tools that follow the tab hand the panel back to the tab. Adding another source
is one entry in `page-offers.js`.

It never offers the tool already on screen, because that would be a label for a
visible state, and it never moves the owner on its own: Automatic mode still
follows the tab, and a tool chosen by hand stays chosen.

Recognizing a page costs nothing. No page is read to answer the question — the
strip is handed the tab's URL and the sign-in answer the account-site probe had
already given — and the saved gift ideas it matches against are read from this
device's own encrypted copy through a new `saved()` on the offline adapter, which
returns what is on the device with no request and no sync. A browser that has
never been connected has no records to recognize a page with, and everything else
in the strip still works.

Validation: 316 extension, 33 mobile and 75 API tests pass, including new
coverage for a page nothing knows, a saved link matched across tracking
parameters and a trailing slash but not across a different path or host, bought
and several-ideas labels, the signed-in site's offer and its absence on the same
site's log-on page, suppression of the tool already on screen, source order, the
strip's links and buttons and where each goes, and the shell mounting the strip
under its header. The states were reviewed at 380px and 280px in the new
`tests/page-strip-preview.html` harness, which renders the real header and strip
against synthetic pages. Mobile has no tab beside it and so has no strip; it
takes this version because it ships the two shared modules this change touched.

## The draft board follows the draft, not the whole of ESPN (0.6.102)

Draft advice is worth nothing between one draft and the next, so it is offered
only inside a draft room — the same `/football/draft` pages the capture content
script already runs on. The strip stops offering it the day a draft ends and
offers it again next August with no date anywhere in the code, and Automatic
mode no longer swaps the panel to a draft board for every other page of a
fantasy season.

Validation: 316 extension tests pass, including a draft room that offers advice
and three ordinary fantasy pages that do not.

## Needs attention and subscriptions

Tools now includes **Needs attention** and **Subscriptions & renewals**. Review
upcoming dates, unused benefits, stale balances and recurring charges together.
Read bank / card statements into review candidates, confirm terms, and research
cheaper plans for a chosen country with dated sources. Saved charges and comparison
results remain available offline. See [behavior and limits](../docs/ATTENTION.md).

## Ask for the passkey where Chrome will show it (0.6.106 / mobile 0.1.64)

A locked section in the side panel — Needs attention, Finance, Subscriptions, a
card number in Rewards — sat on "Waiting for your passkey…" and no sheet ever
appeared. The gate was asking: Chrome received the request from the side panel
and never presented it, so the section waited on a prompt nobody could answer
until the request timed out a minute later.

The panel now hands the check to a small window of the extension's own
(`unlock.html`), centred over the browser window. It asks as soon as it opens,
stores the unlocked session the way any extension tab does, and closes; the
panel adopts that session and opens the section, or shows the reason and
**Unlock** when the sheet is dismissed or the window is closed. Extension tabs
and the mobile app still ask on their own page, and the recovery code is still
entered in the panel.

Validation: new coverage for a vault that delegates its check (dismissed, stored
nothing, two sections sharing one window, a session read back without a change
notification) and for the window itself (placement, another panel's answer
ignored, a failure's reason kept, a window closed by hand, a window that never
answers). The side-panel shell was driven in a browser with Chrome's window,
message and storage APIs stubbed: arriving at Needs attention opened one window
and no in-panel request, a dismissed check left **Unlock**, and a completed one
opened the section. The native Touch ID sheet inside that window, in installed
Chrome, was not directly tested.

## Every tool in the panel, and no lock row above it (0.6.107 / mobile 0.1.65)

Gift ideas, Reminders, Best card and Personal information used to open in a tab
of their own. They now mount in the side panel like the rest, beside the page the
work comes from: `PANEL_CAPABILITIES` in `capabilities.js` names the ten tools
that live there, and only Player rankings and Restaurants are still links.

An unlocked section no longer carries **Lock now** and **Recovery code** above
its heading. A row of lock maintenance over every protected tool is a label for a
state the reader can already see; the session still closes on its own idle
window, and the recovery code moved to Settings, where the rest of this device's
maintenance lives. The locked state is unchanged — **Unlock** and **Use recovery
code**.

Properties has been removed: the capability, its records, its store, the listing
reader, the listing sites it recognized, and `/v1/properties`. A note typed into
quick add is now a reminder or a gift idea. `property_records` is left in D1 and
is no longer read or written.

Taxes lists a saved AI connection by its name alone, without the provider.

Validation: 332 extension, 33 mobile and 79 API tests pass, including new
coverage that every panel capability has a section to mount into, opens in the
panel, and has its stylesheet loaded there, that only rankings and restaurants
remain links, and that an unlocked gate renders no actions at all. The panel was
driven at 400px: Gift ideas, Reminders, Best card and Personal information each
mounted in place, the locked gate showed Unlock and Use recovery code with no
other row, the unlocked gate in the vault preview showed the tool's own heading
and nothing else, and Settings listed Recovery code with one action.

## Taxes is the document in front of you, not the account behind it (0.6.108 / mobile 0.1.66)

A connected Google Drive is named nowhere in Taxes: no heading, no
`ezberry@gmail.com`, no maintenance row. That group appears only while the tool
is not connected, where **Connect Google Drive** is the whole point of it.
Filing says **File it**, and the steps say *Checking the year folder…*,
*Filing…* and *Replacing…* rather than repeating where they are going.

The **AI connection** picker is gone. The tool uses the saved connection whose
key was changed most recently and keeps it while it exists; with none saved, a
single line under the drop zone says where to save one.

A status line with nothing to say no longer draws a blank highlighted bar —
under **Files as**, under the title and wherever else one sits — and **File it**
and **Clear** are a proper action group with a gap between them rather than two
buttons touching.

**Already filed** (was *In Drive*) reads as a list instead of a column of large
underlined links: the name in the body weight, ruled rows, the date and size
quiet beneath it, and an underline only on hover.

Validation: 334 extension, 33 mobile and 79 API tests pass, including new
coverage that a connected tool renders nothing naming Drive or the account and
no connection picker, that a dropped document is read through the connection the
Worker lists first, that a sure reading leaves the status line empty, and that an
unconnected tool still offers **Connect Google Drive** and says where to save an
AI connection. The synthetic states were driven at 400px with the panel's own
stylesheet loaded: the empty notices collapse, the action group gaps, and the
filed list rules. Archive: `release/erics-sidebar-0.6.192.zip`.

## The email screen asks what to say, and the reply comes back in Eric's voice (0.6.109 / mobile 0.1.67)

The panel no longer repeats the email back at you. The message is open in the
tab beside it, so **Email text** is gone and what stands in its place is the one
thing you have to type: **What the reply should say** — *say yes, ask him to
send the form, mention I can speak to Blockthrough*. **Generate reply** is the
primary action now, with **Summarize** beside it, and both run on the model
Eric chose for his mail: Chrome's on-device `LanguageModel` and `email-ai.js`
are gone, because a draft in someone's own voice is not a job for it.

**Writing voice**, at the bottom of the screen, is where that voice comes from.
**Study my sent mail** reads up to a thousand messages Eric sent — a page of
twenty-five per request, so it can be watched, stopped and resumed — keeps only
the part he typed, and comes back with the voices it found, each named by who he
uses it with, and the instructions his replies are written from. Those
instructions are editable and saved; **Forget** deletes them. Reading sent mail
is a read-only Gmail scope on the same Google account Taxes files with, so it
needs approving once, and until then the section offers **Connect Google** and
nothing else.

Message text never reaches the browser: the Worker reads Gmail itself and the
panel is told only how far it has got. What the reading sees is what Eric wrote
— the quoted thread, forward headers and signature are cut before anything
leaves — and nothing behind the profile is kept once it is built.

Validation: 347 extension, 33 mobile and 86 API tests pass, including new
coverage that only Eric's own writing survives a reply, a forward, a signature
and a quote; that a study reads page by page, resumes where it stopped, and
never returns a quoted thread; that consent asks for Gmail as well as Drive and
a study without that scope is refused before Gmail is touched; and that a reply
carries his instruction and his learned voice while the email stays untrusted
data. The synthetic states in `tests/email-preview.html` were driven at 380px
and 280px: the field, the one action row, the progress line and the voices fit
with no horizontal overflow. Archive: `release/erics-sidebar-0.6.192.zip`.

## Writing voice reads as a section, not a button in a box (0.6.110)

The section's state and its actions share one line — *1,000 sent messages ·
Sep 18, 2026* with **Study again** and **Forget** at the end of it — and a
state with nothing to say leaves the action a line of its own instead of an
empty paragraph above it. The card keeps its bottom edge off the last thing in
it.

Its actions are quiet now. Studying, resuming, stopping and connecting are
secondary, so the one dark button on an email screen is the one that writes the
reply; **Save** turns primary only when there is an edit to keep, and **Forget**
is marked as destructive.

The page Google's consent lands on says what it actually granted — *can file
tax documents into your Drive folder and read your sent mail* — rather than
naming only the half it was opened from.

Validation: 347 extension, 33 mobile and 86 API tests pass, including that the
section's actions stay quiet except Save and Forget, and that a consent granting
Drive alone does not claim to read mail. The synthetic states were driven at
380px and 280px with no horizontal overflow. Archive:
`release/erics-sidebar-0.6.110.zip`.

## The first protected section of a session stops dead-ending (0.6.111 / mobile 0.1.68)

Opening **Needs attention** showed Chrome's *No passkeys available* while
opening **Finance** right after it went straight to Touch ID. Both sections
share one vault and one passkey, so what differed was only which came first:
the check names the credential that answered last, Chrome cannot match that ID
against a passkey held in Apple Passwords, and the failed check dropped the ID
so that the next section asked the way the very first one had.

A refused name now marks the ID as a suspect instead of dropping it, because a
passkey refused by name and a prompt dismissed by hand are the same
`NotAllowedError`. The next check names nothing, and its answer says which
happened: a different passkey means the remembered one is gone and is replaced,
and the very same passkey means this browser cannot find it by ID at all, so
naming stops there for good.

Validation: 349 extension and 33 mobile tests pass, including a browser that
answers a discoverable check with the passkey it refuses by name. The native
Touch ID sheet and Chrome's own dialog were not directly tested. Packaged with
the next release: `release/erics-sidebar-0.6.113.zip`.

## The email screen stops treating a summary and a reply as one thing (0.6.113 / mobile 0.1.69)

Summarizing a message and answering it sat under one box as two buttons, which
said they were two settings of one action. They are not: one takes a click and
nothing else, the other takes a line of instruction and the voice it is written
in. Each is now its own section — its name, its action, its status and its own
editable result with a Copy — so a summary stays put while a reply is drafted
under it, and *Writing voice* sits inside the reply, which is the only thing it
changes. The screen no longer names the model or the provider that wrote either.

Studying sent mail also stopped offering the wrong repair. Google refuses in
three ways and they are now told apart: reading too fast, which holds its place
and says to resume in a minute; a Gmail API never switched on in the Cloud
project, which says so and passes on Google's own sentence with the project in
it; and a grant that will not read mail, which the Worker records against the
connection so the panel offers **Approve reading mail** instead of a *Resume*
that would fail the same way. A single 401 is none of them — one stale access
token is worth one fresh one and one retry.

The connection itself turned out to be intact: a live page of sent mail read
without complaint after the change, so the refusal on screen had been a passing
one wearing a permission's clothes.

Validation: 349 extension, 33 mobile and 88 API tests pass, including the three
refusals told apart at the Worker, the retry after a stale token, and the repair
replacing Resume in the panel. The synthetic states — a summary, a draft, both
at once, and a refused study — were driven at 380px and 280px with no horizontal
overflow. Archive: `release/erics-sidebar-0.6.192.zip`.

## Clothing sizes, said rather than filled in (0.6.115 / mobile 0.1.70)

A new tool answers one question: what size am I here. `{brand, item, size, fit}`
is the whole record, and it holds both halves of the question, because they are
the same fact at different removes — "Lululemon · ABC joggers · M" and "Waist ·
33 in" differ only in whether a brand decided the number. An empty brand is
meaningful rather than missing: that record is a measurement, and it is filed
under **General**, which is shown first because it is the answer that holds
wherever the owner is standing. Brands follow alphabetically, matched by which
brand they are rather than by how the name was typed, so a note captured as
"lululemon" joins Lululemon instead of starting a second list beside it.

`fit` is the one optional field and it earns its place: a bare `M` is unusable a
year later without "runs slim through the thigh". Nothing else is a field — no
date, no category, no size system — and nothing converts between size systems or
compares one brand to another. A saved size is what the label said.

Quick add reads a size out of a typed line, which is the way in that matches the
subject: a size is usually said — *"Lululemon joggers are a medium"* — and the
form below the list is what that falls back to. The note goes where it belongs,
so the same field still files a gift idea or a reminder.

The tool is in the panel and on the phone like the rest, offline through the
same store, and its records are encrypted in D1 by the generic record route over
the new `size_records` table.

Validation: 355 extension, 33 mobile and 89 API tests pass, including the
grouping, the delete confirmation, an edit saving over the record it came from,
and a said size landing in sizes rather than in whichever tool was open. The
synthetic states — populated, whole-feature empty, filtered empty, disconnected —
were driven at 380px and 280px with no horizontal overflow, the panel mounted the
tool from the Tools menu, and the phone at 390×844 showed the same list and
accepted a said size from the home screen. Archive:
`release/erics-sidebar-0.6.115.zip`.

## A control never sits against the edge of the panel it is in (0.6.116)

*Resume* in **Writing voice** touched the bottom border of its panel, which
reads as clipped. The floor under it had been given to whichever child came
last, and in a panel whose voice editor is hidden that is nothing visible at
all. The space now belongs to the open panel itself, so every disclosure in the
extension keeps a floor — except the ones whose last child already carries its
own, a form stack and a list of rows, and the ones that are not boxes at all,
the Tools menu's branch and a draft card's reasoning.

Validation: 355 extension tests pass. The email screen's voice panel was driven
at 380px in its refused, stopped and learned states with the same 15px under the
last visible thing in it; the draft tiers, the Tools menu and the gift forms
were checked for the spacing they already had. Archive:
`release/erics-sidebar-0.6.116.zip`.

## Reading an account page gives back the accounts (0.6.117 / mobile 0.1.71)

Finance read the page in front of the owner by copying all of it into the intake
box and then asking, in a second press, for that copy to be read. On a Schwab
summary that copy was four thousand characters of index quotes, a
generative-AI explainer, nine article links and three screens of disclosure
around three balances — and the owner's own accounts were the part hardest to
find in it. Now one press does the whole errand, and what comes back is the
accounts.

**The snapshot is narrowed before it is sent.** `finance-page-read.js` keeps the
lines that state a figure, the short line above one that names it, and the lines
that say which account or which date a figure belongs to. Legal furniture, chart
axis labels and market data are left behind — a bare index quote is recognized
by the index named in the lines above it — and the Schwab summary above comes
down from 4,388 characters to 442, every one of them an account, a number or a
date. A page whose balances this filter cannot see is sent whole rather than
sent gutted.

**A row that already said it is not said again.** Where the accounts are laid
out in a table, the rows carry each one with its label and its columns beside
it, and the page then prints every one of those figures a second time as a bare
line in the text around them. A wealth manager's dashboard sets three money
columns against every account — what it holds, the cash inside it, and the
day's move — so twenty-eight accounts reached the reading as eighty-four
figures, each under a repeat of the account's name and none of them saying
which column it came from. A bare figure a kept row already states is dropped,
and so is one printed directly above its own percentage, which is a move rather
than money the owner has.

**One press, one errand.** Reading the open page no longer fills the intake box
with a transcript to be read again: the page is open beside the panel, where the
owner can see it better than any copy of it, and the drafts are the readout
worth looking at. Every page read is sent as a live reading now, and the
instructions were tightened to match what was asked for: one update per account
the page names, and not the portfolio-wide total at the top of it, the day's
change, a market quote, or a figure out of whatever the site is promoting.

**The action beside a signed-in site says what it will do.** *Store account
snapshots* sat as a bare button on a rule with nothing under it. It is now a
group of its own — the site's name, one sentence saying the accounts on the page
will be read and that nothing is saved until the figures have been checked, and
one action named for the site: **Read my Schwab accounts**. What it gives back
is the confirmation it always should have been tied to, one row per account,
with **Edit** before **Save these values**. While a recognized site is beside
the panel it is the one place the page is read from; the general action steps
aside, because two buttons for one errand is the confusion. The row under the
header offers it by the same name.

**The AI connection picker is gone.** Connections are managed in Settings, and
Finance now uses whichever saved connection can answer — the same rule quick add
has always followed. The screen says something only when there is no connection
at all.

Validation: 350 of 351 extension, 33 mobile and 88 API tests pass; the one
failure is `cupsfilter`, a macOS-only tool absent from this Linux container, and
is unrelated to this change. New coverage: a dashboard narrowed to its accounts
with the index quotes, marketing and axis labels dropped, a page whose figures
the filter cannot see sent whole, the open page going straight to drafts as a
live reading with no connection chosen first, and the new refusals in the live
prompt. The panel was reviewed at 380px and 280px in the passkey-gate harness —
which now also shows the panel beside an ordinary page, the state where the
general action appears — through the reading, Edit and Save. A build in a
checkout without `vendor/`, which is not in Git, failed outright in both apps
despite the comment saying it would carry on; both builds now do what that
comment promised. Not verified against a live signed-in Schwab session.

## The wallet counts your miles and reads them off the page (0.6.118 / mobile 0.1.72)

A points balance was a line you typed and then forgot to retype. Two things
change that. The wallet now opens with what its balances come to — one figure
per unit, miles and points counted separately because they are not the same
thing — and beside a program's own page it offers to read the balance instead
of asking you to copy it.

**Totals, from the entries already there.** `balance-data.js` reads the figure
and the unit back out of an entry's own value, so "82,431 miles" is miles and
"82,431" under MileagePlus is miles too, and every balance saved before today
counts without being touched. No field was added and no stored record changed
shape. A balance whose value states no number — "Globalist status" — is counted
in neither line rather than read as zero, and the note under the totals says how
many balances have gone a month without an update, because a total is only as
current as its oldest figure.

**One press beside the program's page.** `loyalty-sites.js` recognizes the
airlines, hotel groups and issuer currencies — MileagePlus, Bonvoy, Membership
Rewards, twenty-five in all — by one URL comparison and nothing else. On one of
their pages Rewards shows the program's name and a single action: it takes one
text snapshot of the page you are already looking at, sends it to
`/v1/ai-connections/:id/balance-intake`, and lists what came back. Nothing is
saved by reading. A balance for a program already in the wallet says so —
*Updates MileagePlus* — and saving it keeps everything else about that entry.
The reading never signs in, never navigates, never opens a tab, and nothing of
the wallet is sent with the page. Elite-qualifying points are not a balance and
are left in the note beside one. Which saved connection does the work is not a
question the owner is asked.

Validation: 373 extension tests, 33 mobile tests and 93 API tests pass. The panel was driven at
380px and at 280px in each of its states through
`tests/balances-preview.html` — beside a program page before a reading and
after one, on a page whose balance could not be found, and on an ordinary page
and a full tab, where no panel appears at all. Archive:
`release/erics-sidebar-0.6.118.zip`.

## Finance follows you to the bank, and says nothing until you ask (0.6.118 / mobile 0.1.72)

The sidebar knew four account sites, and only while you were signed in to one.
`FINANCE_SITES` in `account-sites.js` now recognizes about thirty institutions by
host — those four plus UBS, Fidelity, Vanguard, Merrill, the big banks, the card
issuers, the retirement and private-holding sites a figure actually comes from —
and recognizing one costs a single URL comparison, so every tab can be asked.
Land on any of them and the panel is already Finance, beside the page the
figures would come off. `ACCOUNT_SITES` is now derived from that registry: the
five whose signed-in pages have been checked against their log-on and public
pages, which is the only work that separates the two groups. UBS joined them on
2026-09-20: Online Services splits one host down its first path segment, so
`/wma/` is the whole of the application and `/cauth/` is the log-on form, the
page a refused deep link is sent to, and every public page on it.

**Arriving that way answers no question.** Being on a bank's website is not the
same as asking what you are worth, and a net worth that appears because of which
tab is open is a net worth on whatever screen you happen to be sharing. So an
arrival the sidebar made on its own is **quiet**: the totals, the breakdown, the
value over time and the record list are not hidden but unbuilt — no balance is
anywhere in the page — and no passkey sheet is raised either, because visiting a
bank is not a request to open a protected section. `vault-gate.js` grew
`automatic(on)` for exactly that, and the lock screen's own **Unlock** is
untouched for anyone who does want in.

**What is ready is everything that puts a figure in.** The site's own reading
where the page can be read, the statement drop zone, **Read the accounts on the
open page**, and a record typed by hand. One action sits beside the title —
**Show everything you hold**, named for the section it opens, because "Show
position" named neither what it would show nor how much of it, and a position
here is one investment's capital account — and one press makes it the ledger it
always was. That press
is remembered for the sitting and forgotten when the section locks, so the next
institution's page does not cover everything up and ask again. Choosing Finance
from Tools is itself the asking and opens it whole; the row under the header now
offers any institution's page, **Store Schwab figures** where the page cannot be
read and **Read my Schwab accounts** where it can, and pressing it hands the
panel back to the tab, which is the quiet arrival.

Validation: 373 extension, 33 mobile and 89 API tests pass, and both apps build.
New coverage: the registry recognizing a marketing page, a log-on page and an
institution with no reader while refusing look-alike and unencrypted hosts, one
entry per institution and per host, the readable four still derived from it; the
quiet surface built with no figure anywhere in the page and every intake path
live, **Show everything you hold** revealing the ledger, and a second arrival not covering
it up again; and the gate raising no sheet for a section the sidebar opened on
its own, then asking once when the owner does. Reviewed at 380px and 280px in
the passkey-gate harness, which gained a quiet state with a readable site and
one without, and the reveal was driven in the browser at 280px with no
horizontal overflow. Mobile shares `finance.js` and the gate but has no tab
beside it, so the arrival there is the deliberate one it always was.

## Four things a status can say, and each one looks like itself (0.6.119 / mobile 0.1.74)

Every status line in the panel used to wear the same amber, whatever it had to
report. A sync conflict, a failed save, a reading in flight and a record saved
were one colour and one shape, so the colour said nothing and the sentence had
to carry all of it. Worse, work in progress was often just a sentence: *Reading
the accounts on the open page…* appeared once and then sat perfectly still,
which is indistinguishable from a screen that has stopped.

There are four things an operation can say, so there are four tones, and
`components/status.css` owns all of them:

- **alert** — something to decide or act on: changes waiting to sync, a
  connection to make, a low-confidence reading to check. Amber, `!` in a
  rounded square.
- **error** — what was asked for did not happen. Red, `×` in a circle.
- **progress** — work is running right now. Muted forest, and a spinner that
  turns for exactly as long as the work lasts. The only tone that moves.
- **success** — it worked. Green, `✓` in a circle.

A tone is never chosen for its colour. A controller says
`setStatus(node, text, 'error')` and the look follows, which is why amber can
mean alert everywhere: nothing else is allowed to wear it, and a status line
with no tone at all — *4 offers · read 2026-09-18* — goes back to the quiet
informational note it always should have been. Clearing the text clears the
tone, so a finished operation never keeps the colour of the last one, and a new
tone replaces the previous rather than stacking on it. No tone is carried by
colour alone: the marks differ in shape as well as glyph, an error or an alert
is announced assertively while progress and success wait for a pause, and
reduced motion holds the spinner still and pulses it instead.

`Spinner` and `ProgressBar` are the same rule for an indicator that belongs
beside the thing being worked on rather than in a status line; the bar runs
indeterminate until something knows a fraction to give it. The upload zone's
private `data-state` colours are gone — an upload's result is said in the same
four tones as everything else.

Validation: 382 extension, 33 mobile and 93 API tests pass, and both apps
build. New coverage in `tests/status-tones.test.js`: one tone at a time, an
emptied line losing its colour, an unknown tone throwing, the live region and
`aria-busy` following the tone, the indeterminate-to-measured bar, every tone
having a mark of its own, and a check that no feature writes a status line
directly. Reviewed in the browser at 380px and 280px through
`tests/status-tones-preview.html` and the passkey-gate and points-and-miles
harnesses, where a reading in flight now spins and its outcome lands green or
amber on the same line.

## A tone is for what just happened, not for what the screen already shows (0.6.120 / mobile 0.1.75)

The first cut of the tones made two mistakes at once, and the locked Finance
panel showed both: a filled amber block announcing **Locked**, above its own
**Unlock** button and the sentence explaining what sealed means. Locked is not
an alert — it is the state the reader is plainly looking at — and a filled
colour block is far too much weight for a status line, so a screen with a few
of them reads as though everything is urgent.

So the rule gained two halves it should have had from the start. **A tone
reports what just happened or what is happening now**; a standing condition —
locked, disconnected, offline, a capability waiting for a saved connection —
takes no tone at all and reads as quietly as a caption. And **weight follows
meaning**: the mark and the words carry the tone, on the page's own
background. Only an error keeps a surface and a rule of its own, because only
an error has to stop the reading. An untoned status line is now a line of
muted text rather than a bordered card.

Twelve standing conditions across the panel lost their amber, starting with
the passkey gate and the wallet's sealed numbers; a failed attempt and the
wait for the sheet still speak up, in red and with a spinner.

Validation: the extension suite passes apart from the finance data work in
flight beside this change, and the tones were re-reviewed at 380px through
`tests/status-tones-preview.html`, which grew a *no tone* group, and in the
wallet, where a reading spins and lands as a green check with no block behind
it.

## Keep the amount in each asset class, not a record per CD (0.6.121 / mobile 0.1.76)

Reading an E*TRADE page produced eight records. Three of them were individual
brokered CDs, each spelling out `WSTRN ALLIANCE PHOENIX AZ CD 4.05% 10/30/2026`
to hold a hundred dollars, beside three `Net Account Value` rows and a
`Potential Benefit Value` that is not a balance at all. Every one of those
records carried a type, an institution, an owner, a currency, a liquidity, an
ownership share, a rate, commitments, tags, notes and a JSON array of every
figure ever filed for it — so the ledger grew in sentences, and D1 is not free.

The question worth answering is how much is in stocks, in bonds and in cash, in
the Eric and Ariana Berry Estate and in the IRA.

**A stored figure is now four numbers.** `finance_marks` holds portfolio, an
asset-class code, the date as `20260919`, and the amount in whole cents, keyed
by the three that identify it and stored `WITHOUT ROWID`. The words live in two
registries in `finance-data.js` and are written once, not copied onto every
entry: `ASSET_CLASSES` and `REGISTRATIONS`. The three figures that replaced the
old ledger occupy about fourteen bytes each; the records they came from were
527 bytes apiece.

**A portfolio is where value is held**, and there are a handful. Its name is the
only text in the ledger and is encrypted at rest like every other stored value.
Eight accounts held in one estate are one portfolio — that consolidation is what
the shape is for, so a checking account is not its own portfolio and a taxable
account at an institution with no title of its own joins the one taxable
portfolio rather than starting a second. `ACCOUNT_TITLES` now overrides a title
by registration, because law does: an IRA is registered to one person and cannot
sit inside a joint estate.

**AI labels; the device adds up.** The reading returns one entry per figure the
page states, saying whether it is an account's own total, a holding inside one,
or a figure across several accounts — and `foldReadings` turns that into the few
numbers the ledger keeps. A total across accounts is left out. An account
stating two totals states one. Holdings replace an account total only when they
add up to it, so three CDs beside a $1.6M net account value no longer claim the
account holds $300: the total is kept whole as **Unclassified**, which counts in
full and whose name asks to be corrected. The panel says which of these it did.

**A line that names an account is kept for its own sake.** E*TRADE's IRA card
names the account in one column and prints its balance in another, with a
contribution banner, three rows of links and a table of holdings between the two
in reading order — so the name cannot reach the figure as the label above it,
however many links are skipped. A short line that names a kind of account and
states no figure is kept where it stands, which gives every figure under a card
the account it belongs to. The account's own name then settles its registration
when the reading left that blank: an IRA is one person's by law, and it must not
take a joint estate's titling for want of a field being filled in.

**The market being shut is not an index quote.** Both were caught by one
pattern, so "Market Closed Sep 18, 2026, 4:00 PM ET" — stamped across the foot
of every E*TRADE card — made the balances near it read as market data and threw
them away. An index name still vetoes the figures under it; a market-status line
is simply dropped and takes nothing with it.

**A stock plan's potential benefit is the account's, not a position in it.**
Read as a holding it was compared against the vested balance, could not
reconcile with it — being the other half of the same account — and $248,422 was
dropped. The wording says which it is, so the device says it.

**A card's own links are not the name of the account.** The snapshot keeps the
two lines above a figure as what names it. E*TRADE prints "Show number" between
an account's name and its balances, so those two lines were "Net Account Value"
and "Show number", the account's name never travelled with its balance, and the
reading had nothing saying which figure was the IRA — which is how a retirement
account, one person's by law, was folded into a joint taxable estate. The site's
own controls are skipped, five candidates are considered for the two places, and
a line that names a figure is never deduplicated: every card says "Net Account
Value" over its balance, and dropping the second left a number under an account
with nothing saying what kind of number it was.

**Positions no account claimed are counted alone and refused beside a balance.**
A statement listing only holdings is a list of positions. The same list beside an
account's stated balance is not — those are positions inside one of the accounts,
nothing says which, and counting them adds a figure the page already counted. A
broker's top-movers table arrives exactly that way, and a last price is no more a
holding's value than a day's gain is.

**A reading that found something says so by showing it.** The status under the
panel used to read "19 figures read, folded into 3" over the three figures it
had just drawn — the count of what was thrown away, dressed as news. It is empty
on a reading that found figures now, and keeps only what a reading cannot show:
that nothing was found, that the page was longer than the limit, or that
something in it could not be turned into a figure. The review states the date
once at the top and nothing else about itself, and the actions sit a clear gap
below the last amount rather than reading as one more row of it.

**A reading is read the way the ledger is:** a heading per holder, and under it
a line per asset class with its amount. It was a flat run of figures, each
carrying a line that named the portfolio again and listed the labels it had been
read off, so an IRA beside a taxable brokerage looked like two figures in one
place rather than two holders. Nothing explains itself in the panel now — the
figures are the review, and the status line under them already says how many
were read and how many were kept.

**Read in the order it is read back:** whose money it is, then what it is in.
Sorting by portfolio number put the figures in whatever order the portfolios
happened to be created in.

**Two balances that differ are two balances.** A page printing the same number
under two names — a current value and a net value — has stated one balance
twice, and the number is what says so. Deciding it by name instead, and keeping
whichever figure said "net" or "total", is how a $122,667 IRA listed beside a
$1.6M brokerage disappeared. A figure that names no account joins the one group
of unnamed figures rather than starting an account per label, so a total and the
holdings under it are still compared, and the balances inside it are told apart
by what they state.

**One name is not one account.** A reading that names the institution rather
than the account — "E*TRADE" against the brokerage and the IRA both — used to
lose the smaller balance to the rule that an account states one balance. Before
that rule runs, a group is separated into the accounts it actually holds, on the
two things a page says that are never true of one account: a registration one
figure states and another does not share, and a different account number. A
figure equal to the rest added up is the institution's own total over them and
is left out, but only where the parts can be told apart — where nothing
separates them, the covering figure is still the one kept, because guessing that
two figures are two accounts would count a balance twice. A separated group
drops its holdings: nothing is left saying which account a position sits in.

**Liquid against illiquid is the question the classes answer together.** Every
asset class names its group, and the Breakdown leads with the two of them: cash,
stocks, bonds, crypto, vested stock and an unsplit securities total are liquid;
private equity, venture capital, hedge funds, real estate, other and unvested
stock are not. Only Unclassified belongs to neither, because value nobody has
placed cannot be called either one — that is the whole of what the name means, and the
review row now says so in four words rather than leaving it to be guessed.

**Reading a reading twice must not change it.** The Worker reads the model's
JSON into figures on its way through, and the device reads the response again.
A class arrives as an id the first time and as a code the second, and taking
only the id turned every class the model had placed back into Unclassified —
which is why a page of stocks, cash and a stock plan arrived as one Unclassified
total, and why the only classes that ever reached the ledger were the ones the
device filled in afterwards. Both forms are accepted now.

**Only a stock plan states a current value and a potential one side by side**,
and E*TRADE calls the vested half "Current Account Value" — a name with nothing
in it about vesting — so the account settles the class rather than the reading.
What has vested is marketable stock that could be sold this week, so it is
Liquid securities like any other; only the schedule beside it needs a class of
its own. Code 11 was a Vested stock class for part of a day and is retired
rather than reused.

**A securities total is not unplaced value.** A brokerage, IRA or 401(k) total
that the page never split is marketable securities whether or not it says so, so
it is filed as **Liquid securities** rather than Unclassified. Unclassified is
left for a figure whose kind of account is genuinely unstated. A stock plan is
the one account holding two different things at once, and both count: what the
page calls a current or vested value is marketable stock and joins **Liquid
securities**, and what it calls a potential, projected or unvested benefit is
**Unvested stock**. Figures saved before this stay Unclassified; nothing
rewrites a figure already filed.

**Coin is its own class.** It used to be Other, which is where a car and a
piece of furniture go, so the one thing worth knowing about it — how much of the
pile is in coin — was the thing the ledger could not say. **Crypto** is liquid:
it sells in a day like a listed share, and neither a coin nor cash is a security
but both answer what the heading asks. A page read at Coinbase or Kraken files
its figures there when the page does not place them itself, and the reading is
told what belongs in the class. Figures already saved under Other stay where
they are, and the migration from the old record-per-account ledger still files a
legacy crypto account under Other: it is re-runnable only while it writes the
same portfolio, class and date twice, and moving one would count the coin again
beside the row already there.

**A change is not a value.** A day's gain, a return, a cost basis and an
unrealized figure are printed in the same column shape as a balance, and the
reading is told to leave them out. It does not always: a top-movers table states
gains and last prices and no market value at all. Those never reconciled with an
account total, so nothing was ever counted wrongly — but an account whose only
figure came back as "Day's Gain" would have been filed at $7,036 against a $1.6M
balance, so the fold refuses a figure that names itself a change and says how
many it left out.

Unclassified is an ordinary class that sums like any other. Letting a split
supersede it would have quietly dropped a brokerage total out of a portfolio
that also held a checking balance.

`/v1/finance/backfill` retrofits the old table — every dated figure, not only
the newest; an ownership share applied once on the way across — and previews
until `--confirm`. Gone with the account record: institution, liquidity,
ownership share, rate, commitments, tags, notes, and the account number sealed
with the passkey, since there is no account entity left to hang one on. Finance
is still passkey-gated. Reviewed at 380px and 280px in the passkey-gate harness,
where a liability now states its own sign.

## A fund is not a line in the private equity total (0.6.125 / mobile 0.1.79)

Four numbers per figure is right for a brokerage account and wrong for one kind
of holding. A direct investment in a fund, a company or an SPV is a named thing
with a history of its own: what was committed, how much of that has been called,
how much has come back, and what the last capital account statement says it is
worth. Those four travel together or they say nothing — a value with no called
capital beside it cannot tell you whether it is a win — and none of them
survives being folded into a private equity total. Commitments were one of the
things the previous release gave up; they come back here as a position's own
rows rather than as fields on every account that never had one.

**A position is two rows.** `finance_holdings` is the investment: the portfolio
that holds it, its name, the kind of vehicle it is, the kind its paperwork
claims it is, and the asset class its value counts under. `VEHICLES` names the
three kinds — **Direct Fund Investment**, **Direct Equity Investment**, **SPV
Investment**. `finance_capital` is one statement: the ending capital account
value, contributions to date, distributions to date, the commitment, and the
date they were struck — four integers in cents, keyed by investment and date,
so re-filing a quarter replaces its own row exactly as a figure does. Its
revision is its own content, so no revision column is stored.

**What a document calls itself is kept apart from what the ledger files it as**,
because the two disagree. A vehicle sold as a fund is frequently a
single-company SPV in a fund's paperwork, so `vehicle` is the settled answer and
`stated` is the claim. A position whose two differ says so on its own line, and
saving a statement never reclassifies the investment: which one is true is the
owner's call.

**Reading a capital account statement is the same errand as reading anything
else.** Drop the file without saying what it is; the reading fills `capital`
instead of `readings` and `foldCapital` does the arithmetic on the device. The
model is told to report each figure under the heading the statement prints it
under and never to add a period figure to a cumulative one, derive unfunded
commitment, or compute a multiple. Cumulative figures are what is stored, so the
newest row answers on its own; a statement showing only the period's movement is
added to the last filed figure here, and the review row says that it was.

**A statement is tied to its investment by the name it prints, and to its
portfolio by the partner it is addressed to** — exact name first, then only if
it is the single candidate that fits. "Berry" is inside the Berry Family Trust,
the Berry 2020 Descendants' Irrevocable Trust, Eric Berry and the Eric and
Ariana Berry Estate; anything short of a unique answer proposes instead and says
so on the row, because a capital account filed into the wrong trust is invisible
from then on while a duplicate in the review is not.

Positions count in their portfolio and asset class on the same step function as
every other figure, so the totals, breakdowns, value over time and stale check
needed no second set of any of it. **Unfunded** sits beside the totals when
there is any — it is not a liability, nobody can demand all of it today — and
Committed, Funded, Returned, Unfunded and Value sit under **Private
investments** in the breakdown. Only the parts that have happened are shown: a
direct purchase has no commitment, and an investment signed last week has none
of it. **Private investment** is its own form under **Enter by hand** because it is its
own job, and an investment with no
statement behind it is a whole record — that is how a
commitment signed this morning is registered, counting as nothing until a figure
says otherwise.

Reviewed at 380px and 280px in the passkey-gate harness, which now carries a
trust holding a fund, an SPV whose paperwork disagrees with it, and an
investment with no statement yet. An amount no longer breaks across lines, and a
record row carries more than one note without the last reading as the next
record's first. Archive: `release/erics-sidebar-0.6.192.zip`.

## Read the statement the bank actually sent (0.6.126 / mobile 0.1.80)

A Chase statement dropped into **Subscriptions** came back as "This PDF has no
text layer — it is probably a scan", in green, on a file that is nothing but
text. Two things were wrong and both are fixed.

The file was not a scan. Banks lock a statement with an owner password and an
empty user password — anyone may open it, nobody may copy from it — and every
stream in it is encrypted. `pdf-crypt.js` is the standard security handler for
exactly that case: RC4 and AES-128, the empty user password only, checked
against the file's own `/U` rather than assumed. A PDF that genuinely wants a
password says so, and is not guessed at.

Underneath, the extractor is no longer a scan for text operators. It follows
the page tree, draws each page's content, steps into the form XObjects the text
is actually inside — inheriting the page's fonts, which is where a statement's
date column lives — decodes subset fonts through their own ToUnicode tables,
and puts the runs back into rows by where they were painted. A transaction
arrives as `08/18  PELOTON CREDIT $10/MONTH  -10.00`, not as three separate
lines or as nothing at all. Object streams are unpacked, so modern producers
read too, and inline images no longer derail the parse.

The green was the second bug. A file that did not read is an error, a file that
half read is an alert, and only a file that read is a success: a reader now
returns its own tone with its message, and Subscriptions throws when nothing
readable came out rather than reporting the failure as a result.

**The AI connection picker is gone from the whole app.** Subscriptions, Best
card, the rewards wallet's card lookup and Restaurants — on the phone as well as
the sidebar — no longer ask which saved connection should do the work. A new
`ai-connection.js` picks one that can answer, filtered by provider where a
feature needs a particular one, and says something only when there is none.
Connections are still set up once in Settings. The intake lost its explanatory
paragraph with it: the heading, the fields and the live status say what is
happening.

Reviewed at 380px and 280px in a new `tests/subscriptions-preview.html`, which
carries the intake with a connection and without one, a wallet of saved
services, and what a dropped file leaves behind: read, half read, and not read
at all. The phone's own shell was not driven for this; the view is the shared
component reviewed in the sidebar harness, and the mobile suite covers the
capability. Archive: `release/erics-sidebar-0.6.192.zip`.

## A statement carrying more of a name than the portfolio is somebody else (0.6.127 / mobile 0.1.81)

Reviewing the ledger at sidebar width caught a capital account statement
addressed to *Maisie Synthetic Berry 2021 Irrevocable Trust* matching a
portfolio called *Synthetic Berry* — a child's trust filed into an IRA, and the
one mistake in this feature nobody would ever see afterwards. The names shared a
stem and "Synthetic Berry" was the only portfolio that fitted, so the
only-candidate rule accepted it.

Containment now runs one way. A name on a statement may be a **shorter** form of
what the ledger calls the same thing — "Berry Family Trust" against "The Berry
Family Trust u/a 2019" — and never a longer one, because a holder carrying more
identity than the portfolio name is a different party however much of the name
they share. The same asymmetry does the same work for the fund: a statement for
"Acme Fund III" no longer lands on a holding called "Acme Fund", while a
statement for "Acme Fund" may land on "Acme Fund III, L.P." if that is the one
candidate. Anything short of that proposes instead and says so on the row.

A first statement showing only the period's contributions now says nothing was
filed before it rather than reporting that the figure was added to nothing.
Archive: `release/erics-sidebar-0.6.192.zip`.

## Report a saved statement where it was reviewed (0.6.128 / mobile 0.1.82)

A capital account read off the open page is reviewed in the page's own block,
but saving it reported into the intake block below — a confirmation under a
heading about something else, which is the alternating scope the Finance layout
exists to stop. The save now reports where its review is. Archive:
`release/erics-sidebar-0.6.128.zip`.

## A size list you can read down (0.6.132 / mobile 0.1.86)

Clothing sizes read upside down: the garment heading was a small grey label and
every size under it was heavier and darker than the heading that filed it, so a
list of answers had no question over it. The heading now carries the rows' own
size and ink, uppercase and ruled across the run, and a row is set in two
columns — who says so on the left, the size itself down the right, where an eye
running the list finds every answer in the same place.

Edit and Delete left the row beneath each size. A word-wide row of actions under
every record doubled the list's length and made **Delete** the loudest thing on
the screen. They are now the row's own, at the end of its line, as quiet glyphs
that appear when the row is hovered or reached by keyboard and stay put where
there is no pointer to hover with. Each is labelled with the size it would act
on — "Edit Banana Republic · M" — so a screen reader hears the record rather
than one word repeated twelve times, and the delete question names the row as
the list reads it instead of the word it happens to be stored under.

Knitwear left the shirts. The same shop cuts a sweater to a different size, and
a list that answers "what am I in a shirt here" with a jumper's number is worse
than no answer, so sweaters, hoodies, fleeces and cardigans head a run of their
own.

A said size keeps an unfamiliar brand. "Isaia shirt is M" was saving as a plain
shirt, the maker dropped on the way in — which loses exactly the sizes worth
writing down, since the brands worth recording are the ones whose sizing is not
obvious. The reading is now told that a name in front of a garment is a brand
whether or not it recognises the shop, and that an empty brand means the note
named no maker at all.

Validation: 401 extension and 33 mobile tests pass. The synthetic size list was
reviewed in the sidebar harness at 820px, 380px and the 280px minimum, and in
the unlocked mobile shell at 390px, covering the populated list with a long fit
note and a wrapped name, hover and keyboard reveal of the row actions, the
delete question and its two answers, and the connected-empty and not-connected
states. Native iPhone and installed Chrome behavior were not directly tested.
Archive: `release/erics-sidebar-0.6.192.zip`.

## The returns and the estimates, and a document that arrives locked (0.6.143 / mobile 0.1.97)

Taxes filed what arrived. What the household files and pays had nowhere to go:
five returns a year, four instalments each to two governments, and the receipts
proving they were paid. A **Filed return**, an **Estimated payment** and a
**Proof of payment** are now named from their own facts rather than from an
issuer they do not have — who filed it, which government, which quarter:
`Estimated payment - Q3 Federal - Berry 2020 Irrevocable Family Trust.pdf`.

Every document now names a taxpayer: Eric & Ariana Berry, or one of the four
trusts. From tax year 2026 that is the subfolder inside the year it lands in, so
five entities' documents no longer pile into one folder. 2025 and earlier stay
exactly as they are, and a subfolder made by hand is filed into rather than
duplicated. The reading proposes the taxpayer, the government and the quarter
along with the form and the year, and every one of them is a field to correct.

A locked document is now filed unlocked. Tax documents often arrive encrypted,
and a return that needs a password is a file that opens to a prompt nobody
remembers the answer to five years from now. The lock is read on the device: one
that only forbids editing — a bank's — opens unasked, and one that genuinely
needs a password asks for it, uses it here and saves it nowhere. An unlocked
copy is then written on the device, read back to prove it is still the same
document, and that copy is what reaches Drive. RC4, AES-128 and AES-256 are all
opened, by either the user or the owner password; when there is no password to
be had, **File it locked** files the document as it arrived and says so.

**Already filed** is a run of one-line rows. The date and the size sat under
every name, doubling the length of a list read to answer one question — is this
one already in there? — and a year's documents now sit under the taxpayer they
belong to.

Fixed along the way: a reading the model was not sure of threw instead of
warning, because the tool was asking for a status colour that no longer exists.

Validation: 430 extension, 108 Worker and 33 mobile tests pass, including locked PDFs built
at RC4 and AES-256 and unlocked end to end, and the unlocked copy opening in
Apple's own PDF engine. The synthetic Taxes states were reviewed in the sidebar
harness at 380px and the 280px minimum: a return named from its taxpayer and
government, a locked document before and after its password, and a year divided
by taxpayer. Native iPhone and installed Chrome behavior were not directly
tested. Archive: `release/erics-sidebar-0.6.192.zip`.

## An update is not the end of a session (0.6.146 / mobile 0.1.101)

Updating the extension, or pressing **Reload** on it, asked for the passkey
again. Nothing about the session had ended: `chrome.storage.session` is memory
the extension holds, so Chrome empties it whenever the extension is unloaded,
and the unlocked vault went with it.

The unlock is now kept a second time, where a reload cannot reach it and where
nobody can read it: sealed with a key that is generated non-extractable and left
in IndexedDB, with the sealed record in local storage beside it. The extension
can seal and open with that key and no code can read it back out, so neither
half opens anything on its own. A reloaded extension unseals what it had and
carries on inside the window it was already in.

Nothing about that window changed. The carried record holds the same stamp as
every other copy, so it expires on the one idle hour, **Lock now** clears it, and
a browser that has just started throws it away along with its sealing key and
asks for the passkey. The phone is unaffected — it already carries its unlock
across the one reload it has.

Validation: 431 extension and 33 mobile tests pass, including a reloaded
extension adopting the carried unlock and expiring on the original window, a
lock in one page closing the others afterwards, and the carried record holding
no readable key. The sealing and unsealing were also run against a real browser's
IndexedDB and WebCrypto, confirming that two pages sealing at once agree on one
key and that the key refuses to be exported. Reloading the installed extension
in the owner's own Chrome was not directly tested. Archive:
`release/erics-sidebar-0.6.146.zip`, which carries the two releases committed
alongside this one.

## A taxpayer's year, divided by what a document is for (0.6.151 / mobile 0.1.105)

A taxpayer's 2026 folder was a single pile again as soon as it filled: a return,
four instalments, their receipts and every K-1 behind them, all side by side.
From 2026 each taxpayer's year now divides once more, into **Filings** for what
went to a tax authority, **Payments** for the instalments and the receipts
proving they were paid, and **Supporting Documents** for everything that
arrived:

```
2026 / Berry EA 2024 Family Trust / Filings / Return - Federal - Berry EA 2024 Family Trust.pdf
```

The document type settles which of the three it is, so choosing the type answers
it. It stays a field — *Filed under* — because the cases the type cannot settle
are real ones: an extension request, a notice, anything filed as "Other
document". It decides where a document lands and never what it is called, and
2025 and earlier are untouched.

**Already filed** nests to match, each taxpayer's rows gathered under what they
are for. Reading a year is now its folder and one request per level below it,
whatever it holds, because each level asks Drive for all of its parents at once
instead of one folder at a time — a year with five taxpayers costs four
requests rather than twenty.

*Tax authority* is what the Federal-or-New-York field is called now. Beside
*Filed under* it had been *Filed with*, and two labels that near each other are
one label read twice.

Validation: 452 extension, 120 Worker and 33 mobile tests pass. The synthetic Taxes states
were reviewed in the sidebar harness at 380px and the 280px minimum: a return
with its taxpayer, category and authority answered and the whole path shown
before it moves, and a year divided twice. Native iPhone and installed Chrome
behavior were not directly tested. Archive:
`release/erics-sidebar-0.6.151.zip`.

## Whose birthday it is, before anybody opens a tool (0.6.154 / mobile 0.1.108)

The home screen both hosts open on used to say only *Ready when you are.* It now
leads with the birthdays inside the next fortnight, read from the reminders
already saved on the device.

**Today is set apart from the rest**, because it is the only day anything can be
done about it: its own sage block with a forest edge, above the run that follows.
That run says how long there is and which day it lands on — *In 4 days · Thu,
Sep 24* — because a week out there are two Thursdays. Where somebody recorded the
year, the row says the age; a birthday with no year still has none.

The window is a fixed fourteen days rather than each record's own notice, which
is what Needs attention reads. A passport renewal wants ninety days of warning,
and a birthday given ninety would sit on the home screen for three months.
Anniversaries are left out. A run with nobody in it is hidden rather than headed,
so a quiet fortnight leaves the home screen exactly as it was.

**It reads and writes nothing** — no action, no status line, no error. A device
that cannot reach the records shows the home screen it always showed, and
Reminders is where a connection problem is said out loud. The records are the
device's own copies, so a phone with no signal still knows whose day it is. On
the phone the birthdays sit above quick add, and a note typed there that turns
out to be a birthday appears in them without leaving the screen.

New coverage: the fortnight split today from what is coming and taking only
birthdays; a birthday queued for deletion left ungreeted; an empty run hidden
rather than headed; no connection and no records leaving the screen untouched;
and a refresh picking up a birthday written after the screen was built. Reviewed
in the new `/tests/home-preview.html` harness at 380px and the 280px minimum —
one today with three behind it, two today and nothing after, nobody today,
nothing at all, and not connected — and on the mobile home screen at 375px.
Native iPhone and installed Chrome behavior were not directly tested. Archive:
`release/erics-sidebar-0.6.154.zip`.

## Coinbase reads like any other account page (0.6.161 / mobile 0.1.114)

Coinbase was recognized but never readable: standing on it, Finance offered
**Read the accounts on this page** — the offer any page gets — so the reading
went out with no institution behind it and no idea what kind of money it was
looking at. It is now the fifth site the snapshot can be read from, on the same
terms as E*TRADE, Chase, Morgan Stanley and Schwab: signed in, the block is
headed **Coinbase**, one press reads the balances on screen, and what the page
does not classify is filed as **Crypto** rather than left unplaced.

The sign-in lives on a host of its own. Asking for `www.coinbase.com/home` with
no session lands on `login.coinbase.com/signin`, so reading names the www host
alone. That split matters more here than elsewhere: the form asks for an email
first and shows no password field until the step after it, so the one signal
that settles every other site — a password field on screen — would not fire on
Coinbase's log-on page at all. Leaving the log-on host out is what answers it
instead. The marketing site shares the application's host, so the application is
named by its own areas rather than by a prefix: `/home`, `/assets`,
`/accounts`, `/portfolio`, `/transactions`, `/statements`, `/settings`,
`/notifications`, `/advanced-trade`. Everything else there — `/explore`,
`/price/…`, `/learn`, the product pages — is public, has no balance on it, and
stays recognized without being read.

**A move printed under a total is not a balance.** Coinbase sets
"↘ $185.01 (1.17%) 24H" directly beneath the portfolio value, and the arrow and
the colour that say it is a change are exactly what `innerText` throws away.
Read as a figure it is $185 of somebody's money. A line that is only an amount,
a percentage in brackets and the window it was measured over is now dropped
whichever way it points — including a broker's own "-$7,036.71 (-0.42%)", which
says the same thing under a label the reading was already told to ignore.
Dropping the figure leaves its caption behind, so a caption naming a change no
longer stands in as the name of the next balance down the page: "Day's Gain"
was one line above the IRA's value.

Which forced a second rule out into the open. The two places a figure's name can
come from were being asked the same question, and they are not the same
question. The nearest line says what the figure *is* — "Net Account Value" is
printed over every card on a broker page — so it travels with each one and is
dropped only when it is already the line directly above. The line above that
says *who holds it*, and a holder repeated down the accounts grouped under it is
one heading said four times, so that place keeps the wider test. Counting a
fixed number of lines back instead made the answer depend on how much sat
between two balances: dropping one card's change line was enough to lose the
second account's "Net Account Value".

The order ticket beside the balances is furniture like any other: Quick buy,
Max, Convert and Review order each sat directly above a figure, where the reader
looks for the name of the account it belongs to.

New coverage: the pages Coinbase is read on and the public ones it is not; its
log-on host refused while staying a recognized Coinbase page; a home page read
down to the two balances with the move and the order ticket left out; a change's
caption not becoming the next balance's label; and an end-to-end read filing an
exchange's total as Crypto under its own name. Detection was checked against the
real signed-out `www.coinbase.com/home`, which is what named the log-on host;
neither the path list nor the page filter has been run against a signed-in
Coinbase session. Archive: `release/erics-sidebar-0.6.192.zip`.

## A watchlist is a list of prices, not a list of holdings (0.6.162 / mobile 0.1.115)

Read at Coinbase, the ledger came back holding $18,161 of coin against a page
saying $15,584.96. The cash was right to the cent; the crypto had something
else added to it. What the page prints under the two balances is a watchlist —
ten coins, each with a name, a ticker, a price and a move — and it is printed in
exactly the shape the owner's own money is printed in. The one line that tells
the two apart is the heading over them, and a heading states no figure, so it
was the first thing the page filter threw away. What reached the reading was a
run of coin names with money under them, which is indistinguishable from a list
of holdings — and a price is read as an amount of money held.

A market list is now recognized and dropped where it is read, before anything
leaves the browser. A heading naming one — **Watchlist**, **Trending**, **Top
movers**, **Top gainers**, **Most traded**, **Prices**, **News** — opens a run,
and the run ends where the page hands itself back to the owner: a line naming
what is held or what it comes to, a line naming or dating an account, or the
furniture a card stamps under its own table, such as the market's hours or a
link to the full portfolio. A run that only a heading could close would carry on
past a broker's movers table and take the account's balance below it with it,
which is how E*TRADE prints one. The names inside a run go with the figures: a
coin's name is no more the label of the next balance than its price is a
balance.

**A line that is only a percentage is not a figure.** "+1.42%" carries two
decimals, which is the same shape as $1.42, so every coin's 24-hour move arrived
as an amount of money under the coin's name. Those are dropped now wherever they
appear, market list or not.

Both of these are the device's own reading of the page: the figures never reach
a model, so nothing depends on a model recognizing a watchlist for what it is.
The last price in a broker's Top Movers table goes the same way, which the
ledger had been defending against downstream.

New coverage: a watchlist's prices, names and moves kept out of a reading that
still carries the balances above them; a movers table dropped while the account
printed under it keeps its name, its label and its balance; and a market word in
a site's navigation not swallowing the balances below it. Validation: 482
extension tests pass. The fix was proved against a reconstruction of the page in
the screenshot rather than a live signed-in session, which is not reachable from
here. Archive: `release/erics-sidebar-0.6.192.zip`.

## One password, eight holders, and none of them called Bank accounts (0.6.165 / mobile 0.1.118)

Chase is one sign-on over a whole family structure: a joint estate, four
irrevocable trusts, an LLC, two children's custodial accounts, and a company
that is not the owner's money at all. Read, it came back as three portfolios —
**Bank accounts**, **Credit cards**, **Investment accounts** — holding every one
of those added together. Nothing in that ledger belongs to anybody, and a trust
inside a joint estate is the mistake nobody sees once it is saved.

**A kind of account is not an account.** The heading a bank sorts its accounts
under is now taken off the front of the name it precedes, so "Investment
accounts · BERRY 2020 IRREV FAM TR (...5007)" stays one trust's account and
never names a portfolio. Where nothing but the heading names the figure, the
figure is every account under it added up: it is refused the way a dashboard's
headline total already was, and if the page states nothing else, the reading
says to open the list of accounts instead — that is the page carrying the names
and the last four digits the titling matches on.

**Two 2020 trusts, told apart.** `berry2020` matched the family trust and filed
it as the descendants' trust; neither fragment names a bare year now. The joint
accounts titled with both names written out are recognized as well, by fragments
long enough that a child's UTMA — titled to a parent as custodian — cannot be
carried into the parents' estate by the parent's name inside it.

**Money behind the password that is not counted.** A roster holder can be marked
`ignore`, and Bedford Bridge Capital is. Silence would not have left it out: an
account no title claims starts a portfolio of its own, so the way to leave
something out is to name it.

**Two figures that look like balances and are not.** A card's available credit,
which is the larger of the two and would have filed the whole limit as debt; and
the available balance a bank prints beside the present one, which is the same
money less what has not cleared and was being added to it. A card's balance is
filed as credit whatever class the reading gave it, because a debt read as cash
moves net worth by twice the figure.

**What the fold refused now reaches the screen.** Its notes were built and
thrown away — neither review rendered them — so the single line under the
figures says what was left out, which is the only evidence there is of a figure
that is not there.

New coverage: the whole Chase structure folded into one figure per class per
holder, with the two 2020 trusts apart and Bedford Bridge absent; a page that
states only its kinds filing nothing and saying where to go; a card's balance as
debt and its available credit refused; the roster's fragments pinned one account
title at a time; and Chase's two account tables read with every name and number
against its own figure. Validation: 488 extension, 33 mobile and 124 API tests
pass. The snapshot panel was reviewed against a synthetic reading of the same
structure at 380px and 280px, with no horizontal overflow. The fix was proved
against the account lists in the owner's screenshots rather than a live
signed-in session, which is not reachable from here.

## Two Amex cards, two currencies, and a button missing its bottom (0.6.166 / mobile 0.1.119)

An issuer is not one reward program. Hold an Amex Platinum and a Blue Cash and
the rewards page states two balances — 13,674 Membership Rewards points across
the points cards, and $125.49 of Reward Dollars the Blue Cash earns in money —
and the panel beside it named only the first, told the reading that everything
on the page was Membership Rewards counted in points, and had one place to put
whatever came back.

**A site answers with every currency printed on it.** `loyaltySitePrograms`
returns the programs sharing a host, the panel heads itself with all of them
("American Express Membership Rewards and Reward Dollars"), one press reads
them together, and the page offer names the issuer rather than promising one of
its programs.

**Cash back is kept as money.** `dollars` joins miles, points and Avios: a
figure a program keeps in money is stored as `$125.49`, totalled on a line of
its own — `$125.49 · cash back` — and never added to a points line. A program
the registry recognizes is counted in the currency the registry says it keeps,
so a reading that calls Reward Dollars points still stores money; 125 points
would have been a number that is wrong rather than one that is missing. The
reading is told, in the same words, that money is only ever a rewards balance
and never a statement balance, an amount due, or available credit.

**Neither balance can be saved over the other.** Matching on the provider alone
is what lets "Mileage Plus" land on the MileagePlus entry; it also let cash back
land on the points balance printed beside it. Where a reading finds more than
one figure for one provider, the program's own name decides or nothing does, and
what nothing decides is saved as a new balance. The directory offers an issuer's
second currency for the same reason: holding the provider answers for its
program only where the provider runs one.

**The last button of a section got its frame back.** The rule that strips the
separator under the last record in a run followed `:last-child` down to the last
button of the last action row and took its bottom border with it, so **Add a
reward** — the last control in the wallet — read as clipped. A control's border
is its own outline, not a rule between records, and is no longer stripped.

New coverage: a site answering with both Amex currencies; a reading that calls
reward dollars points stored as money and totalled apart from points; cash back
refusing to match the points entry while the points figure still updates it; the
directory still owing an issuer its second currency; and the API told both
currencies by name while a device that sends one is read the way it always was.
Validation: 492 extension, 33 mobile and 126 API tests pass. The panel and the
totals were reviewed against a synthetic reading of the Amex page at 420px and
280px with no horizontal overflow, and the button's restored border measured in
the rendered sidebar rather than judged by eye.

## A class line is a figure, not a document (0.6.167 / mobile 0.1.120)

In Net worth, a class inside a portfolio repeated its own date whenever it was
behind the rest of that portfolio. Cash read a day before the securities beside
it carried "2026-09-19" next to 54 cents — a qualification the reader cannot
act on, sitting in the widest part of the line. A marked balance is a figure,
not a document: its date is on the form that edits it and in the history behind
the row, both one click away.

The date still cascades where it says something. Once above the totals, for the
ledger as a whole. Under a portfolio, when that portfolio is behind the rest of
the ledger. And on a position or a property, where the date is the statement's
or the valuation's own rather than a fact about when somebody typed. The word
`liability` and a row still waiting to sync keep their place beside the figure.

Validation: 492 extension and 33 mobile tests pass, including a class line that
no longer repeats a date and a portfolio that still states one. The synthetic
ledger was reviewed at 380px and 280px in the local fixture — the half-filled
estate from the owner's screenshot, and a settled ledger with a stale custodial
account, a fund position and two properties — with no horizontal page overflow.
Installed Chrome and iPhone behavior were not directly tested.
Archive: `release/erics-sidebar-0.6.192.zip`.

## The wallet loads wherever the panel arrives on it (0.6.168)

Beside marriott.com the strip under the header offers **Read your Bonvoy
balance**. Pressing it landed on Rewards & benefits with **Read my balance**
disabled and the wallet saying it was waiting to be connected — so the reading
that had just been offered did nothing when it was pressed, and said nothing
about why. The wallet loaded only when its own row in the Tools menu was
pressed, and the strip is not that row: it selects the capability, as Needs
attention does when it opens a record.

The wallet now loads when the panel arrives on it, by whichever route brought it
there. Only the arrival loads it — the panel renders again on every poll of the
tab beside it, and loading on each of those would be a request a second.

Validation: 493 extension tests pass, including a new one that walks the strip's
own offer to the wallet and watches it reach for its records, counts a run of
renders as one arrival, and counts leaving and coming back as another. The test
fails against the previous build. Nothing rendered changed: the panel's markup
and styles are untouched, and the visible difference is a control that is live
instead of dim, which needs a connected device to see.
Archive: `release/erics-sidebar-0.6.192.zip`.

## The store listing names the tools that are there (0.6.169)

The manifest description still advertised restaurant searches, the travel
wallet, AI settings, ESPN draft advice and Gmail — the extension as it was
several dozen releases ago. Rewards, Best card, Finance, Taxes, Reminders,
Subscriptions & renewals, Gift ideas, Clothing sizes, Personal information and
Needs attention had all arrived since, and AI settings is a settings screen
rather than a tool. The description now reads off the capability registry, inside
Chrome's 132-character limit: travel wallet, rewards and cards, finance, taxes, reminders,
subscriptions, gifts, sizes, restaurants, fantasy football and Gmail.

Validation: 493 extension tests pass. Nothing rendered changed — the
description appears on the extensions page and a store listing, not in the
panel. Archive: `release/erics-sidebar-0.6.192.zip`.

## A debt reads as a debt before it is filed (0.6.170 / mobile 0.1.121)

A card's balance is stored positive and its class carries the sign, which is how
the ledger holds every liability and why the saved rows already print a mortgage
as `-$642,000 · liability`. The review panel — the screen where a reading is
checked before anything is written — printed the stored figure instead. So a
Chase read showed `Credit $15,835` in the same column, in the same shape, one
line under `Cash $2,101,804`: a debt reading as $15,835 more rather than
$15,835 less, at the one moment the figure is there to be judged.

The review now shows a liability as what it does to the total, and says the word
beside it as the ledger does, because a minus sign is a shape and some readers
will not see it. The field that corrects it is unchanged: an amount is typed as
what is owed, under the class that carries the sign, because a negative amount
is not a figure this ledger can hold.

New coverage: a card's balance reviewed as a negative figure under `Credit ·
liability`, and still typed and filed as a positive amount under the credit
class. Validation: 494 extension and 33 mobile tests pass; the review was
inspected at 380px and 280px, where the label and the figure stay on one line.

## A description that outlives the next tool (0.6.172)

0.6.169 replaced a description that had fallen several dozen releases behind
with a list of the eleven tools that are here now — which is a description that
goes stale the day a twelfth arrives, and 0.6.169 had just finished
demonstrating how far behind one gets. It now says what the extension is rather
than what is currently inside it: personal records and reminders in the
sidebar, and help with the page in front of you. Adding a capability no longer
makes it wrong.

Validation: 496 extension tests pass. Nothing rendered changed — the
description appears on the extensions page and in a store listing, never in the
panel. Archive: `release/erics-sidebar-0.6.192.zip`.

## The word over a sum is not the name of an account (0.6.173 / mobile 0.1.123)

A bank's dashboard states one figure per kind of account and no accounts at all.
Those are refused — each is every account under its heading added up — and when
nothing else is on the page the reading says so and points at the list of
accounts. A second read of the same dashboard got past both of those.

The card sum was labelled the way the page labels it, **Outstanding**. The
heading came off the front as it should, and the word left behind was taken for
the name of an account: a portfolio called OUTSTANDING holding every card added
together, offered for saving. Worse, something had been filed, so the sentence
saying the page could not answer went away with it — leaving one card balance,
`Left out: a total across accounts`, and no sign that twenty accounts were a
page away. Outstanding, owed and due are column words now, like balance and
value before them.

**The sentence follows the evidence rather than the emptiness.** It is said when
a kind's total was refused and nothing on the page named an account — not when
nothing happened to be filed. A broker's headline total printed over accounts
the page also states is a different thing and takes no such sentence: those
accounts are right there, and sending the owner elsewhere would send him away
from the page that has what he came for.

New coverage: the dashboard's three kind totals refused with the card's own word
among them, and a headline total over stated accounts leaving the guidance
unsaid. Validation: 498 extension and 33 mobile tests pass.

## The accounts are on the overview, and the note stops guessing where (0.6.176 / mobile 0.1.126)

Chase lists what one password reaches on a hash route of its own,
`#/dashboard/overview`. The link under **Open an account page** pointed at the
dashboard without it, which lands on a view stating one figure per kind of
account and no accounts at all — the page that produced a ledger of three piles
called Bank accounts, Credit cards and Investment accounts. It points at the
overview now.

The sentence said when nothing on a page named an account said to open the list
of accounts and read that instead. That is advice this code cannot give: the
accounts may be on another page, or on this one inside a group that is shut,
because a closed group prints the sum of its kind on its own heading — so a page
can hold every account and state none of them. Being told to go elsewhere would
have sent the owner off the page he wanted. It now says what is missing and
leaves where to it: *Only one total per kind of account reached the reading.
Show the accounts themselves on the page, then read again.*

Validation: 61 finance and account-site tests pass; the whole extension and
mobile suites pass from an archive of HEAD.

## The tracker says what is left; research never could (0.6.176 / mobile 0.1.126)

A card's benefits are already in the wallet — **Add a card you hold** brings back
what the card gives, how often each credit resets and what has to be enrolled in.
What no research can know is how much of one is left this month, and that is the
part that decides whether the owner does anything today. The issuer prints it:
`$200 Airline Fee Credit · $0 Earned · $200 To Go`, a tracker per credit, beside
the points balance the panel already reads.

**One press, both halves.** The same snapshot of the page in front of the owner
now comes back as balances and credits together, reviewed in one list and saved
by one press. Nothing about the errand changed: no session, cookie or credential
leaves the browser, none of the wallet is sent, and nothing is written by reading.

**What is stored is what is left.** `$0 Earned / $200 To Go` has $200 left, and
reading it the other way round would say a credit had been spent that has not
been touched — so the reading is told, in those words, which of the two figures
it is being asked for. The figure sits beside the card's own terms rather than
replacing them, because "$25 per month" and "$25 left this month" are different
facts and only one of them changes. A credit with nothing left is marked used,
which takes it off Next actions until the period turns over and the next reading
gives it back.

**Filed under the card it belongs to.** The page names the card; the wallet holds
whatever research called it. They are matched on the words that tell one card
from another — every Amex is an American Express card, so those words name
none of them — and a name that fits two equally is filed under neither, because
a Platinum's credits under a Blue Cash is worse than credits under no card.

**`remaining` is a field of its own.** Folded into `value` it would overwrite
what the card actually gives; every entry saved before a tracker was ever read
simply has none, and the row says the figure once where the terms and what is
left are the same number.

New coverage: a tracker read for what is left and not what was earned; a credit
with no such figure left out; money read as money; the same credit stated twice
kept once; a card matched on what distinguishes it and a tie filed under none; a
read credit updating the saved benefit while its notes, link and terms stay the
owner's; a spent credit going used and coming back; a card-less credit still
saying where it came from; and the API returning both halves of one reading.
Validation: 505 extension, 33 mobile and 128 API tests pass. The panel and the
saved rows were reviewed against a synthetic reading of the Amex benefits page
at 420px and 280px with no horizontal overflow.

## A heading over accounts says "accounts" (0.6.180 / mobile 0.1.130)

Naming the kinds one at a time does not end. The rule knew bank, credit and
investment; the page answered **Outstanding**, and then **External accounts**,
and each new word arrived as a portfolio holding a sum nobody holds — while the
sentence saying the page had named no account stayed quiet, because something
had been filed.

What those headings share is not the word in front but the word at the end. A
heading over a group of accounts says *accounts*, or *cards*; an account of
one's own almost never does. So the shape is the rule now — up to two words and
then the plural — and the next bank to invent a kind needs no new word here. A
heading with a real account behind it still comes off the front and leaves the
account: `External accounts · Fidelity Cash Management (...4410)` is that
account, at that balance.

New coverage: nine spellings of a group heading refused, and a heading stripped
off an account that survives it. Validation: 509 extension and 33 mobile tests
pass.

## A table is not always a `<table>` (0.6.182 / mobile 0.1.132)

Four readings of the same Chase overview came back with the same thing: the
totals in its summary panel, and not one of the twenty accounts listed below
them. The accounts were on the page the whole time. The reader could not see
them as accounts, because it looked for `<table>` and Chase builds its account
list out of divs carrying the roles that say what they are — `role="table"` over
`role="row"` over `role="cell"`, which is what a design system builds and what a
screen reader is owed.

To `innerText` a grid like that is one line per cell. An account's name, its
type, its day's change and its balance arrive as four unrelated lines, and the
rule that reassembles a figure with the line above it then crosses them: a
balance under a repeat of the name above it, a name under the wrong column,
`Joint checking (...0823)` labelled Savings. What reached the reading was a heap
of half-attached figures and one clean summary panel — so the summary panel is
what came back, every time.

A grid that declares itself a table is now read the way the element would be,
row by row, with the header saying which column each figure fell out of. Nothing
widens for it: the same figure and account tests decide which rows are worth
keeping, and the same limits bound how many.

New coverage: two ARIA grids read as tables, every account travelling with its
own number and balance, beside a summary panel of totals by kind. Validation:
511 extension and 33 mobile tests pass.

## The cards you hold are not a list to type twice (0.6.192 / mobile 0.1.142)

**Best card knew nothing about the cards the rest of the app had already seen.**
The wallet holds the cards the owner has — added there by name, or named by an
issuer's own benefits page when a credit was read off it, down to the account
the page prints beside them — and Best card, the one screen whose whole job is
to compare those cards, opened on *No cards saved* and a box to type a name
into.

**In your wallet.** The cards the wallet knows are listed under the saved ones,
each with the account it was seen under — `Card ending 1007` — and one press
researches what that card earns and opens it here, filled in and ready to save.
Only the product name is sent: `Platinum Card® (-61007)` is asked about as `The
Platinum Card®`, because the digits say whose card it is and research is about a
card anyone can look up. No card number is read, asked for or stored here.

**A card is offered only while its rates are missing.** Saved, it becomes this
tool's card and leaves that list. Which card a name is now lives in
`card-data.js` with the cards themselves, and asks for more than the credit
filing does: every word that tells a card apart has to be in the saved card's
name too, because `Chase Sapphire Reserve` shares all but one word with `Chase
Sapphire Preferred`, and a card mistaken for one already here is a card the
owner never gets offered. A name that fits two saved cards is left alone.

**And the comparison says what it could not compare.** While a card the owner
holds has no rates, the result says so — *2 cards in your wallet have no rates
yet, so they were not compared* — because a recommendation made without a card
in the owner's pocket is the one thing this screen can get wrong while looking
right.

The wallet is read and never written: this tool takes the device's own encrypted
copy with no request and no sync, downloads it once on a device that has never
opened Rewards, and a wallet it cannot read leaves the saved cards exactly as
they are.

New coverage: the wallet's cards read out of card entries and out of the cards an
issuer's page named, a program and a balance counted as neither, the account
digits kept out of the product name and shown as the card's own, one card named
twice kept once, a near-miss family name left unlinked while the card itself
links, and the tool mounted over a synthetic wallet — listing the card,
researching the product name, and dropping the row once it is saved. Validation:
535 extension, 33 mobile and 131 API tests pass from an archive of HEAD. The
standalone card view was reviewed against the synthetic wallet at 380px, 280px
and 390px: populated, nothing saved yet, the comparison caveat, and the research
that one press starts. Archive: `release/erics-sidebar-0.6.192.zip`.

## A wallet of programs, not one number over them (0.6.190 / mobile 0.1.140)

**Two figures sat at the head of the wallet: every mile added together, every
point added together, each under the count of programs it covered.** Neither is
something anybody holds. 608,082 miles is United's and Delta's in one number,
and no seat is ever booked out of it; 160,131 points is a hotel night added to
an airline award. The wallet is opened to see what a program holds, and the sum
stood between the reader and the rows that answer that.

**The rows are the answer.** The totals are gone, and so is the note beneath
them that counted balances as stale or unread — a balance that has gone out of
date is already raised by name in Next actions, which is where something to do
about it belongs, and a program awaiting its first reading says as much in its
own row. `balanceTotals`, `readBalance`, `formatTotal` and `unitLabel` go with
them; a unit is still read out of a value where a reading needs one, and cash
back is still money rather than points rounded to the dollar.

**And what is left reads as a column.** The rows are set close — 4px above and
below, the glyphs drawn to the line rather than the line to them — and a step
smaller than the wallet's body text, so a run of programs is read down one
column of names and one of figures. A finger still gets the target the touch
rule gives it; only a pointer sees the smaller glyph. A wallet of six programs
that ran 290px now runs 200px.

New coverage: the tests that asserted the sums are gone with them, and cash
back keeps its own check — `$125.49` as the wallet's own value, never 125
points. Validation: 533 extension and 33 mobile tests pass. The synthetic
wallet was reviewed at 380px in the standalone harness: no totals block, the
rows at 33px each, and the two-line and metadata rows still legible. Archive:
`release/erics-sidebar-0.6.190.zip`.

## Money the quarter takes back, under the birthdays (0.6.187 / mobile 0.1.137)

**A card credit stops being spendable when its period closes, and nobody opens
the wallet to find that out.** The home screen both hosts open on led with
birthdays and nothing else. A third run now follows the fortnight: every benefit
with real money left whose deadline — its own date, or the close of the period it
repeats on — lands inside the quarter you are in now, largest first.
`creditsThisQuarter` in `rewards-data.js` decides it, beside the Next actions
rule it is not.

**A $50 floor is what earns a place here.** A $15 ride credit resetting on
Tuesday is true and not worth interrupting anybody for, and Next actions in the
wallet still lists every one of them. What the issuer's own tracker says is
*left* wins over what the card gives, so a credit half spent reads `$62.50 left ·
Synthetic Gold · In 10 days`; one already used, one worth something that is not
money — four lounge visits — and one whose period closes next quarter are all
left off. Six rows is what a glance holds, and the rest are counted under them
with what they come to: `3 more · $405`.

**Today's birthdays keep the top of the screen**, on the surface they always
had. The two stores are read independently, so a wallet that will not open
leaves the birthdays exactly where they were, and neither run reports a
connection problem — Reminders and Rewards are where that is said out loud. The
records are the device's own copies, so a phone with no signal still knows what
is about to reset.

New coverage: the quarter's run ordered by money with a small credit, a used
one, a balance, a card and a period closing next quarter all left off; a tracker
figure winning over the card's terms and nothing left counting as nothing; a
deadline already past belonging to the wallet; the floor itself; six rows and
the rest counted; and a wallet that cannot be read leaving the birthdays alone.
Validation: 536 extension, 33 mobile and 130 API tests pass from an archive of
HEAD. Reviewed in `/tests/home-preview.html` at 380px and the 280px minimum —
one birthday today with three behind it and three credits before the quarter
closes, nobody today with money about to reset, more credits than a glance
holds, and nothing in either — and on the mobile home screen at 375px, where the
tracker figure reads back off the phone's own copy. Native iPhone and installed
Chrome behavior were not directly tested. Archive:
`release/erics-sidebar-0.6.187.zip`.

## The heading rule, back, and a credit score is not money (0.6.194 / mobile 0.1.144)

Two things came out of one Chase reading. The panel offered a portfolio called
**Chase accounts** holding $2,101,804 — a heading over a group, read as the name
of an account — and another called **Credit Journey** holding $737 of cash,
which is a credit score.

The heading rule had been generalized in 0.6.180 so that a new kind of heading
needed no new word: up to two words and then the plural, because what those
headings share is the end of the phrase and not the front. That change was
reverted by accident in `7b61d45`, along with its test, and the enumerated list
came back — which is why a fourth spelling walked straight through. It is
restored, with Chase accounts among the spellings it is now tested against.

A credit score is the other kind of thing that is not a balance. It is three
digits in the range of a small balance, the bank files it beside the money under
a product name of its own, and nothing about its shape says what it is. Only its
name does, so the name is what refuses it — on the figure or on the account,
because the bank is as likely to put it on one as the other. The reading is told
the same.

Validation: 537 extension and 33 mobile tests pass.

## United, not United Airlines MileagePlus (0.6.195 / mobile 0.1.145)

**Every row in the wallet printed a currency's full name.** "United Airlines
MileagePlus", "Delta Air Lines SkyMiles", "IHG One Rewards" — three and four
words each, wrapping to two lines at sidebar width, in a list whose point is
the figure on the other side of them. Nobody holds two United currencies, so
every word after the brand was a word the owner already knew.

**The brand names the row.** United, Delta, Marriott, IHG, Amex. It is a field
on the program in `loyalty-sites.js` — `short` — so what a wallet prints is a
fact about the program rather than a rule a screen applies to a string. A
program no registry knows says its source, which is the shortest true thing
about it. An issuer running two currencies keeps them apart by name: **Amex**
for Membership Rewards, **Amex cash** for Reward Dollars. And the full name is
still there where naming it is the point — the panel that offers to read a
program's page, and the question asked before a row is deleted.

**The rows are read in runs.** Airlines, Hotels, Rail, Card points, the Cards
you hold, then Other. Each is one alphabetical column under its heading, a run
with nothing in it draws no heading, and which run a program belongs to is its
`kind` in the same registry. A wallet is now scanned by what a thing is instead
of by the day it was saved.

Four tools each kept a private copy of the one line that heads a run of
records; this run takes a shared `RecordGroup` in `ui.js` instead, which is
where the next one should come from too.

New coverage: the brand for a known program, for an issuer's two currencies,
for one nothing recognizes and for a card and a credit, which keep their own
names; every program in the catalogue carrying a brand and a run, with no two
brands the same; and the mounted wallet drawing Airlines, Rail, Card points,
Cards and Other in that order, each column alphabetical. Validation: 541
extension and 33 mobile tests pass from an archive of this release. The
synthetic wallet was reviewed at 380px and at 300px: four runs, their headings
set above rows they are larger than, and no horizontal overflow. Archive:
`release/erics-sidebar-0.6.195.zip`.
