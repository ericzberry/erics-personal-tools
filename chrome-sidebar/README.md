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

The extension does not submit picks, modify ESPN, read cookies, or access private application state. It requests `sidePanel`, `storage`, and `<all_urls>` host access, as requested for future personal tools. The current content script runs only on `https://fantasy.espn.com/football/draft*`. Chrome still restricts protected browser pages and requires separate user enablement for file URLs or incognito access. It makes no external network calls of its own. The UI uses Chrome's [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

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

The advisor in `src/recommendations.js` recomputes locally on each draft update. It displays one top choice and up to two nearby alternatives, the last pick considered, and reasons for moving above the highest available player on your board. No model service, API key, server, or outgoing data is required. This is a transparent deterministic decision engine, not an LLM or a calibrated outcome predictor.

The imported workbook is in `config/rankings-2026.json`. The 177-entry first tab is authoritative; its ADP values are market context. The 196 QB/RB/WR/TE positional comparisons from the second tab are retained for future discussion, not used to override the first tab. Yellow highlights have no scoring effect because their meaning has not been specified. The original workbook is unchanged. `scripts/import-rankings.py` regenerates the JSON from the workbook using Python/openpyxl.

### How it decides

1. Match ESPN selections to the board using name, position and NFL team, with suffix, punctuation, team-abbreviation and known Kenny/Kenneth Gainwell aliases. Remove selected players and count your roster, including unranked players' positions.
2. Respect position maximums and reserve enough remaining roster spots to fill mandatory starters. Evaluate FLEX across RB, WR and TE.
3. Use candidates within 15 overall ranks of the highest eligible available player. This limits deviations from your board. Filling mandatory starters can override the global board because ineligible backups are removed first.
4. Without full projections, use rank-based heuristics: up to 8 ranks of roster-fit adjustment, lower backup weights (RB 0.55, WR 0.4, TE 0.2, QB 0.1), declining further with depth. A bounded ADP waiting adjustment adds at most 5 ranks. These are initial tunable preferences, not point projections. Display nearby positional depth but do not interpret ordinal rank gaps as fantasy-point gaps.
5. With complete offensive projections, allocate league-wide starting demand: 10 QBs, 20 RBs, 20 WRs, 10 TEs, plus 10 FLEX players chosen by projected points. The next player outside this pool at each position is the **starter-replacement benchmark**. This is not a waiver-wire replacement estimate; bench drafting, injuries and weekly streaming are not modeled as such.
6. Calculate each candidate's projected points above that benchmark and its marginal improvement to your best starting lineup. Empty slots use replacement-level placeholders. Existing better starters, FLEX allocation and bench value affect the result. Bench upside itself is not quantified by a season-total forecast.
7. Infer your snake slot from actual own picks or ESPN's displayed future own-pick numbers, never from the team ID, roster dropdown order, or the practice draft. Compare with the best same-position alternative whose ADP is at or beyond your following turn. This is a coarse waiting-cost estimate, not a probability of survival. It does not yet predict each opponent's individual next choice.
8. Points mode uses bounded rank adjustments: marginal lineup gain / 20 capped at 10, discounted bench PAR capped at 2, and 0.35 × waiting-cost / 20 capped at 4. The baseline remains negative overall rank. These scales are tunable heuristics, not fitted coefficients. The complete breakdown is returned by the engine.

Draft completion, unknown draft state, a stale/disconnected feed, missing pick history, and unreadable picks suppress recommendations. Before connecting a draft, the panel shows a clearly marked pre-draft baseline. Practice recommendations remain isolated from real draft recommendations.

### Projection input

The workbook contains ranks and ADP, not projected points. Therefore the shipped advisor starts in **Rank estimates** mode and does not invent PAR values. Use **Points above replacement → Import league projections (JSON)** to add real projections. They stay in local extension storage and can be removed in the same panel.

Required structure (the point value below is a schema example, not a player forecast):

```json
{
  "leagueId": 182527585,
  "seasonId": 2026,
  "scoring": "half-ppr",
  "units": "season_total_points",
  "source": "Your projection provider and as-of date",
  "players": [
    {"name": "Jahmyr Gibbs", "position": "RB", "nflTeam": "DET", "points": 300}
  ]
}
```

Include all 154 ranked offensive players to enable points comparisons. The engine validates matching identity, league, season, scoring label, finite point values and duplicates, and requires enough coverage to establish each positional replacement. It cannot independently verify that a provider's point totals actually use every league scoring rule; the source must supply league-compatible season totals. Partial coverage stays in ranking mode. D/ST and K follow board priority and roster fit; offensive PAR does not estimate their value.

Twenty tests now cover the reader/storage pipeline and advisor, including unknown versus observed draft slots, drafted-player exclusion, QB depth, roster limits, mandatory completion, FLEX replacement demand, scarcity-sensitive point comparisons, missing projections and stale feeds. Synthetic projections are used only in tests. The actual completed practice draft was also replayed locally at several pick counts to verify changing recommendations.

## Private release

Version 0.2.1 requests all-site host access. Google’s [permissions policy](https://developer.chrome.com/docs/webstore/program-policies/permissions/) prohibits requesting permissions solely for features not yet implemented; this is an unresolved store-review issue. The private tester release is prepared locally, not published. See `release/LISTING.md` for submission status.
