# Gmail — planned

The owner wants to read Gmail messages and perform useful actions on them inside Eric’s Personal Tools. The extension now has a clearly labeled planned Gmail view; email access and actions are not implemented.

Define the first workflow with Eric before building it: which messages to read, what to extract, and what actions to offer. Candidates for discussion include conversation summaries, extracting follow-ups, drafting replies, and organizing messages. These are possibilities, not committed functionality.

Design the integration around the shared sidebar shell and styling in DESIGN.md. Separate reading from actions that modify or send email. Do not transmit email to a reasoning service until the provider and data handling are decided. All-site host permission alone does not authorize Gmail API access; any API integration needs its own authentication and scopes. Revisit permission and privacy disclosures when functionality is implemented.

The separate gmail-sender directory is existing local work, not integrated into or bundled with the extension.
