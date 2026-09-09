# Eric's Chrome sidebar

A standalone Chrome extension within `erics-personal-tools`. Its first tool is ESPN fantasy football: saved league rules and draft-pick tracking.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**, then choose **Load unpacked**.
3. Select `/Users/ericberry/erics-personal-tools/chrome-sidebar/dist`.
4. Pin **Eric's Sidebar** and click its toolbar icon.
5. Open or reload an ESPN football draft room after installation.
6. To test, visit ESPN's mock draft lobby and choose **Practice Draft** beside Old Timer's League. Select that practice session in the sidebar's **Draft session** menu.

The prepared build is in `dist/`. Run `npm run build` to regenerate it (Node.js required; no installed dependencies needed). After changes, rebuild, reload the extension on Chrome's extensions page, and reload the draft tab.

## Included

- All saved league rules, searchable: 53 scoring entries, 23 roster-position settings, waivers, trades, keepers, and playoffs.
- A read-only ESPN draft reader capturing player, position, NFL team, fantasy team, round, pick within round, and overall pick.
- Separate real-league and practice sessions; team/player filters; local persistence and JSON export.
- Duplicate suppression, missing-pick reporting, rollback handling, and a disconnected indicator after 15 seconds without a heartbeat.
- Real league capture restricted to league 182527585, season 2026. Practice drafts retain their own league IDs.

The reader watches rendered pick messages and the roster team selector. Changes trigger a read after 300 ms, with a 5-second heartbeat. Actual latency depends on ESPN and Chrome scheduling. Keep the draft tab open. Background throttling or an ESPN layout change can delay or break capture. Existing history can only be recovered if ESPN renders it; missing picks are flagged. Commissioner rollback handling is tested with fixtures, not a live league undo.

The extension does not submit picks, modify ESPN, read cookies, or access private application state. It requests `sidePanel`, `contextMenus`, `storage`, and `<all_urls>` host access, as requested for future personal tools. Content scripts run only on ESPN football draft rooms and `https://mail.google.com/*`. Chrome still restricts protected browser pages and requires separate user enablement for file URLs or incognito access. It makes no external network calls of its own. The UI uses Chrome's [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

## Validation

On September 8, 2026, an ESPN practice draft using the league settings was observed through multiple rounds. The actual reader extracted **160 picks, 10 teams, and 16 Bedford Bridges picks** from the completed draft, with **0 rejected entries**. Slot 7 was specific to that practice session and is not a prediction or configuration for the real draft.

The real draft position is unknown until ESPN reveals the actual order near draft time. No draft slot is hardcoded. The reader associates each announced pick with ESPN's team ID and reads the round and pick number from that pick's message. Bedford Bridges has team ID 8; this identifies the team, not its draft position. Any future turn countdown or draft-position display must use the actual draft's order and remain unknown until that order is available.

Run `npm install` for the development-only DOM parser, then `npm run build && npm test`. Ten tests cover real ESPN markup, round boundaries, defense picks, duplicates, partial feeds, missing-pick recovery, rollback/reset, practice isolation, message validation, storage, and build exclusions. Fantasy team names in the fixture are anonymized.

The initial sidebar and rules search were checked in Chrome. Installation and end-to-end extension messaging in the user's Chrome profile still need validation after loading. Browser automation cannot open `chrome://extensions` because of its URL policy.

For a visual preview, run `npm run preview` and open `http://127.0.0.1:8765/sidepanel.html`. Preview mode does not capture picks.

## Layout and future sync

This sub-project has its own manifest, source, config, tests, and build. Rules live in `config/espn-league-2026.json`. Local captures in `data/` are ignored and excluded from builds, as are tests and dependencies. The full practice verification is saved locally as `data/practice-validation.json`.

There is no sync server yet. Hosting, authentication, protocol, and scope remain TBD. A future server belongs in a separate sub-project; the JSON draft snapshot can be its input.

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

Version 0.6.26 adds a gear in the sidebar header that opens in-sidebar Settings. Credentials and Draft are subsections; draft capture, league rules, and reset controls live there. Credentials support named local secrets, replacement, and deletion. Secret inputs are masked and saved values are never rendered back into the UI. Storage access is restricted to trusted extension contexts before saving; values are not encrypted by this extension or synced. Saving credentials does not yet configure provider integrations.
