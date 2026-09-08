# Eric's Personal Tools — 0.3.0

Status: prepared locally; not uploaded or published. Google developer dashboard requires reauthentication.

## Distribution
Private → Trusted testers. Use the owner-provided tester account from the private release setup.
The trusted-testers list applies across this publisher account; review existing entries before publishing so the audience matches the request. Do not choose Public or Unlisted.

## Store description
Your ESPN fantasy draft companion in Chrome's sidebar. Follow live practice or league picks, track your roster, and compare the next available players using your saved draft rankings, roster needs, and average draft position. View saved league rules and export captured picks. Recommendations pause when draft history is incomplete or disconnected. Points-based comparisons require compatible imported projections. Configured for Old Timer’s League, 2026, ten-team half-PPR. Not affiliated with ESPN.

## Single purpose
Help the user follow and prepare for their ESPN fantasy football draft.

## Permissions
- sidePanel: show draft advice and league rules alongside ESPN.
- `<all_urls>` host access: requested by the owner for future personal tools. Current functionality only uses ESPN; this does not yet satisfy Google’s requirement that permissions serve implemented features. Resolve this before store submission; do not present future features as existing.
- storage: save captured draft sessions and optional imported projections locally.
- Content script on fantasy.espn.com/football/draft*: read displayed draft picks, team names and draft progress. Does not submit picks or access credentials.
- No remotely hosted executable code; no analytics or external data transmission.

## Reviewer instructions
Open the sidebar to inspect saved league rules without signing in. Live capture requires an ESPN account and an active football draft or practice draft. Open or reload the draft room after installing. Keep session selection on Auto. After each pick, the count and available recommendations update. Completed, disconnected or incomplete drafts do not show actionable picks. No credentials are included in this submission.

## Submission checklist
Upload erics-sidebar-0.3.0.zip. Add icons/icon-128.png as the listing icon and store-screenshot.png (640×400). Host PRIVACY.md at a public URL and enter that URL in the dashboard if required. Complete privacy disclosures accurately, select Private / Trusted testers, add the requested tester account, and submit for review. Registration, contact verification, fees or other account requirements may still be required after sign-in.

Install the approved store listing once on each computer while signed into the tester account. Subsequent approved versions of that same listing update automatically. Local draft storage does not sync between computers.

Sources: https://developer.chrome.com/docs/webstore/publish and https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
