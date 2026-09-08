# Eric's Personal Tools — 0.6.2

Status: prepared locally; not uploaded or published. Google developer dashboard requires reauthentication.

## Distribution
Private → Trusted testers. Use the owner-provided tester account from the private release setup.
The trusted-testers list applies across this publisher account; review existing entries before publishing so the audience matches the request. Do not choose Public or Unlisted.

## Store description
Your ESPN fantasy draft companion in Chrome's sidebar. Follow live practice or league picks, track your roster, and get one or two explained picks using fixed spreadsheet rankings, roster needs, and estimated availability at your next two turns. View saved league rules and export captured picks. Recommendations pause when draft history is incomplete or disconnected. Combined Ranks provide the replacement-value proxy automatically. Configured for Old Timer’s League, 2026, ten-team half-PPR. Also summarize the current Gmail message or generate an editable reply using Chrome’s on-device AI. Requires a supported computer and Chrome 138+ for local generation. Not affiliated with ESPN or Google.

## Single purpose
Provide a contextual personal productivity sidebar for the current page: ESPN draft assistance and Gmail writing assistance. The broader product scope must be accurately reviewed under the store’s single-purpose policy.

## Permissions
- sidePanel: show draft advice and league rules alongside ESPN.
- `<all_urls>` host access: requested by the owner for future personal tools. Current functionality only uses ESPN and Gmail; this does not yet satisfy Google’s requirement that permissions serve implemented features. Resolve this before store submission; do not present future features as existing.
- storage: save captured draft sessions locally.
- Content script on fantasy.espn.com/football/draft*: read displayed draft picks, team names and draft progress. Does not submit picks or access credentials.
- Gmail content script: read the latest expanded email on request from the sidebar. Email text stays in sidebar memory and is processed by Chrome’s local model only after an action click. Generated replies are editable and copied by the user, never sent automatically.
- No remotely hosted executable code; no analytics or external data transmission.

## Reviewer instructions
Open the sidebar to inspect saved league rules without signing in. Live capture requires an ESPN account and an active football draft or practice draft. Open or reload the draft room after installing. Keep session selection on Auto. After each pick, the count and available recommendations update. Completed, disconnected or incomplete drafts do not show actionable picks. No credentials are included in this submission.

## Submission checklist
Upload erics-sidebar-0.6.2.zip. Add icons/icon-128.png as the listing icon and store-screenshot.png (640×400). Host PRIVACY.md at a public URL and enter that URL in the dashboard if required. Complete privacy disclosures accurately, select Private / Trusted testers, add the requested tester account, and submit for review. Registration, contact verification, fees or other account requirements may still be required after sign-in.

Install the approved store listing once on each computer while signed into the tester account. Subsequent approved versions of that same listing update automatically. Local draft storage does not sync between computers.

Sources: https://developer.chrome.com/docs/webstore/publish and https://developer.chrome.com/docs/webstore/cws-dashboard-distribution

## Gmail reviewer flow

Open and expand an email in Gmail, then open the sidebar. It shows the subject and sender of the latest expanded message. Choose Summarize or Generate reply. Chrome may download its local model on first use; unsupported hardware or browser versions show an explicit message. Generated text is editable and can be copied. No send, archive, delete, label, or Gmail API scopes are used. Switching messages clears the prior output.
