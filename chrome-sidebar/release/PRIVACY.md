# Eric’s Personal Tools privacy policy

Updated September 8, 2026. Applies to version 0.6.25.

Eric’s Personal Tools displays contextual assistance alongside ESPN and Gmail. It checks the active tab’s URL to select the appropriate function; it does not retain browsing history.

In ESPN football draft rooms, the extension reads visible selections, team names and identifiers, league and season identifiers, draft order and progress. Captured sessions are stored in Chrome extension storage on your device. The extension retains up to ten practice sessions and the configured league session.

In Gmail, the sidebar reads the latest expanded message’s subject, sender and rendered text. This data stays in memory, is not saved to extension storage, and is cleared when the message or context changes or the sidebar closes. When you click Summarize or Generate reply, the text is processed using Chrome’s on-device AI. Chrome may download its model from Google before first use; email content is not sent to Google or another server for generation. Generated text stays in sidebar memory unless you copy it. Copied text is placed on your system clipboard, which is governed by your device and clipboard-sync settings.

The extension does not transmit captured email or draft information to its developer or any server, sell data, use analytics, read passwords or cookies, or automatically submit draft picks or email. Links to ESPN or Gmail open those services under their own policies.

Exporting draft history creates a local JSON file. You control subsequent sharing. Rankings are bundled statically. Custom ranking and projection data saved by older versions is no longer read; uninstalling also removes that legacy data. Uninstalling clears extension storage; exported files and copied text remain until you delete or replace them. Draft storage is not synced across computers by this version.

This version declares all-site host permission at the owner’s request for planned personal tools. Current page-reading scripts run only in ESPN football draft rooms and Gmail. Other sites are not read beyond identifying the active tab’s URL to select a function.

Manual draft corrections are saved locally, separately for each draft session, and used only when manual mode is active. The extension bundles a public ESPN player catalog and offers a refresh that requests public player and NFL team data from ESPN without cookies. These requests do not include your draft, rankings, or email content. Refreshed player identities are cached locally.

Recommendations are passed locally to the captured ESPN draft tab via draft-capture responses and sidebar updates to highlight matching visible players. This does not submit selections or send draft data to an external server. Highlights expire when draft-capture and sidebar updates stop.

The contextMenus permission adds a webpage right-click launcher. Clicking it opens the sidebar in that Chrome window; the launcher does not store or transmit the clicked page, link, or selected text.
