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

Archive: `release/erics-sidebar-0.6.46.zip`.

## Separate travel record editor (0.6.47)

Travel wallet keeps the compact searchable record list in the sidebar. Add record and Edit open a dedicated extension tab; saved changes refresh the viewing list. The editor reloads the selected record by ID, preserves failed edits, and keeps numbers masked. Done closes the editor after changes are saved or canceled. Mobile keeps its inline editor and shares the compact rows.

Archive: `release/erics-sidebar-0.6.47.zip`.

## Compact wallet controls (0.6.48)

Makes Add record, search, and entry text smaller. Search uses only the visible placeholder “find record” with an accessible hidden label. Copy uses a small icon shown on row hover or keyboard focus; touch users can reveal it by expanding the row. Routine up-to-date messages are omitted. Wallet connection controls live in sidebar Settings and are absent from browse and editor pages; mobile retains its header Settings.

Validation: 138 extension tests and 19 mobile tests pass. Synthetic 30-record UI reviewed at 280px sidebar and 390px mobile, including hover icons, keyboard access, and Settings navigation. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.48.zip`.

## Shared control style guide (0.6.49)

Defines control roles, sizes, typography, spacing, focus, and touch behavior in `docs/DESIGN.md`, linked from repository instructions. Shared Button supports an explicit compact size. Wallet Edit, Copy notes, and Delete use matching compact subtle actions; form and confirmation actions retain the appropriate stronger treatment. Replaces accumulated wallet overrides with one token-based stylesheet shared with mobile 0.1.11.

Validation: 138 extension and 19 mobile tests pass; synthetic expanded/collapsed records reviewed at 280px and 390px. Native installed Chrome and iPhone behavior remain unverified. Archive: `release/erics-sidebar-0.6.49.zip`.

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
behavior were not directly tested. Archive: `release/erics-sidebar-0.6.73.zip`.

## Tools menu sections and a mobile home screen (0.6.65 / mobile 0.1.24)

Both hosts read one grouped registry. Registry entries carry an optional `section`, and a **Misc** section now holds Fantasy football and Player rankings; everything else stays in the main, unlabelled group. Gmail left the Tools menu — it opens by itself when the active tab is Gmail, which is what Current tab always did. AI connections is reached from Settings in both hosts rather than as a tool of its own, and League rules is gone: its capability, its data page, its Settings rulebook, and its bundled mobile dataset. The draft engine still reads `config/espn-league-2026.json` for scoring and roster logic.

Mobile opens on a home screen that is the icon grid itself. Choosing a tool collapses that grid behind a **Tools** dropdown holding the same icons plus Home, so a tool keeps the screen; the home screen no longer competes with it for vertical space, and no tool selection is restored across launches.

Validation: 182 extension, 26 mobile tests pass. The sidebar Tools menu and Settings were reviewed in the synthetic harness at 400px and 320px; the mobile home screen, an open tool with its collapsed and expanded dropdown, and AI connections inside Settings were reviewed in the unlocked mobile shell at 375px. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.65.zip`.

## Travel wallet record list (0.6.61 / mobile 0.1.20)

Rebuilds the wallet list against the revised record layout in `docs/DESIGN.md`. Disclosure markers move out of the record names into a fixed right-hand column and rotate when a record opens, so they align regardless of name length. An open record becomes one contained surface block holding its number, metadata, actions, and delete confirmation instead of loose text between two rules. The find-record field returns to its intended compact filter size — the shared `.form-field` control rules had been out-specifying it, rendering a 40px/16px control — and the list's opening hairline is dropped when there are no records. The page heading is 22px with its primary action aligned to the list's right edge.

Validation: 180 extension, 26 mobile, and 44 API tests pass. Synthetic 13-record wallet reviewed at 390px and 280px in the standalone page, the sidebar, and the installed mobile shell, covering collapsed rows, an open record, delete confirmation, filtered-empty, disconnected-empty, and the editor page. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.61.zip`.

## Wallet records grouped by type (0.6.62 / mobile 0.1.21)

The wallet list is organized by category instead of one long alphabetical run. Records group under a Georgia category label in the registry's own order — Airline, Hotel, Rental car, Trusted traveler, Passport, Visa, Other — alphabetically within each group, with empty groups omitted and search filtering within the structure so only groups holding matches remain. Grouping lives in `groupTravelRecords` in `travel-data.js`, shared by the extension and mobile; a record saved under a retired category keeps its own group ahead of Other rather than dropping out of the list.

An open record is tidier for it. The category line is gone, since the group label already states it, so the block is the number, that record's own detail (expiration, and the traveler where the collapsed row does not show it), a quiet rule, then the actions. The rule separates what the record is from what you can do with it and keeps a delete confirmation visibly attached; a metadata line with nothing to say is removed rather than left as a gap.

Validation: 182 extension, 26 mobile, and 44 API tests pass, including new coverage for group order, retired categories, filtered groups, and the filtered-empty message. Synthetic 14-record wallet reviewed at 390px and 280px in the standalone page and the unlocked mobile shell, covering all seven groups, an open record with and without metadata, delete confirmation, and search filtering to one group. Native iPhone and installed Chrome behavior were not directly tested. Archive: `release/erics-sidebar-0.6.62.zip`.

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
