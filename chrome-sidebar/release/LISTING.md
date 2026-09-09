# Eric's Personal Tools — 0.6.50

Status: prepared locally; not uploaded or published. Google developer dashboard requires reauthentication.

## Distribution
Private → Trusted testers. Use the owner-provided tester account from the private release setup.
The trusted-testers list applies across this publisher account; review existing entries before publishing so the audience matches the request. Do not choose Public or Unlisted.

## Store description
Choose data tools from the Tools dropdown. Save and copy travel loyalty and document numbers offline, sync changes across connected devices, and view saved league rules and rankings. Your ESPN fantasy draft companion in Chrome's sidebar. Follow live practice or league picks, track your roster, and get one or two highlighted picks using fixed spreadsheet rankings, roster needs, and estimated availability at your next two turns. View saved league rules and a tiered board with ownership colors, inline manual corrections, and blue recommendation highlights and amber current-tier highlights in ESPN, plus prominent counts by roster position. A compact scarcity cue appears only when a starter is due and the last one or two current-tier RB or WR options are unlikely to last; blue recommendations retain priority. Recommendations pause when draft history is incomplete or disconnected. Combined Ranks provide the replacement-value proxy automatically. Configured for Old Timer’s League, 2026, ten-team half-PPR. Summarize the current Gmail message with OpenAI through your Worker and D1 key, or generate an editable reply using Chrome’s on-device AI. Requires a supported computer and Chrome 138+ for local generation. Not affiliated with ESPN or Google.

## Single purpose
Provide a contextual personal productivity sidebar for the current page: ESPN draft assistance and Gmail writing assistance. The broader product scope must be accurately reviewed under the store’s single-purpose policy.

## Permissions
- sidePanel: show draft advice and league rules alongside ESPN.
- `<all_urls>` host access: requested by the owner for future personal tools. Current functionality only uses ESPN and Gmail; this does not yet satisfy Google’s requirement that permissions serve implemented features. Resolve this before store submission; do not present future features as existing.
- contextMenus: add “Open Eric’s Personal Tools” to the webpage right-click menu.
- storage: save captured draft sessions and user-entered credentials locally.
- Content script on fantasy.espn.com/football/draft*: read displayed draft picks, team names and draft progress. Does not submit picks or access credentials.
- Gmail content script: read the latest expanded email on request from the sidebar. Email text stays in sidebar memory and is processed by Chrome’s local model only after an action click. Generated replies are editable and copied by the user, never sent automatically.
- No remotely hosted executable code or analytics. Public ESPN player refresh requests contain no captured draft or email data.

## Reviewer instructions
Open the sidebar to inspect saved league rules without signing in. Live capture requires an ESPN account and an active football draft or practice draft. Open or reload the draft room after installing. The draft is selected automatically. Settings contains the ESPN is capturing picks toggle. Switch it off for manual Me / Someone else buttons on the tier board, and on to hide those buttons and resume the live feed. After each pick, the count and available recommendations update. Completed, disconnected or incomplete drafts do not show actionable picks. No credentials are included in this submission.

## Submission checklist
Upload erics-sidebar-0.6.50.zip. Add icons/icon-128.png as the listing icon and store-screenshot.png (640×400). Host PRIVACY.md at a public URL and enter that URL in the dashboard if required. Complete privacy disclosures accurately, select Private / Trusted testers, add the requested tester account, and submit for review. Registration, contact verification, fees or other account requirements may still be required after sign-in.

Install the approved store listing once on each computer while signed into the tester account. Subsequent approved versions of that same listing update automatically. Local draft storage does not sync between computers.

Sources: https://developer.chrome.com/docs/webstore/publish and https://developer.chrome.com/docs/webstore/cws-dashboard-distribution

## Gmail reviewer flow

Open and expand an email in Gmail, then open the sidebar. It shows the subject and sender of the latest expanded message. Choose Summarize to send this message to OpenAI through your Worker using the saved D1 key. Generate reply uses Chrome’s local model, which may download on first use; unsupported hardware or browser versions show an explicit message. Generated text is editable and can be copied. No send, archive, delete, label, or Gmail API scopes are used. Switching messages clears the prior output.

## AI connection settings

Options opens the extension-only AI settings page and prompt playground. Provider credentials are encrypted in the owner’s Cloudflare D1 database. Fetch models, Test connection and Run prompt make requests through the Worker to the selected provider; tests and prompts may incur provider charges. Local sidebar credentials remain separate and are not automatically uploaded. No provider keys or cloud access tokens are bundled.
