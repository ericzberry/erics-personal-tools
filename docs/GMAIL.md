# Gmail in Eric’s Personal Tools

Version 0.4.0 follows the active Gmail tab. It reads the latest expanded message’s subject, sender and rendered text, then offers Summarize and Generate reply. Earlier collapsed messages and attachments are not included. The sidebar names the scope explicitly.

The user clicks an action to invoke Chrome’s built-in LanguageModel API. Chrome 138+ extensions on supported hardware can use this API; the model may download on first use. The feature detects unsupported or unavailable models and shows a clear error. There is no cloud fallback, API key or subscription requirement. The current prompt configuration uses English input/output.

Generated summaries and replies appear in an editable text area with a Copy button. There is no automatic sending or Gmail mutation. Reply prompts use placeholders for unknown facts and instruct the model not to invent commitments. Email is treated as untrusted data, separate from the generation instructions.

Email text and outputs remain in sidebar memory. Nothing is saved to extension storage or sent to a server. Navigating to a different message clears output and cancels in-flight generation. Source identity is checked at action time and again before presenting a result. The draft tracker’s existing local storage is independent.

Reload Gmail after installing or updating the extension so its content script can answer the sidebar. DOM selectors are based on observed Gmail markup and can require updates if Gmail changes. A missing or collapsed message clears the current email. Messages exceeding 20,000 characters are explicitly rejected rather than silently truncated.

Validation: parser and model-lifecycle unit tests, plus a browser harness using synthetic email and a mock model for summary, editable reply, navigation clearing, and unavailable-model behavior. Actual on-device generation in the installed extension still needs a supported Chrome environment and model availability; the mock does not verify model quality.

The synthetic harness lives in chrome-sidebar/tests/ui-harness.html and is excluded from the release package. The separate gmail-sender project is not integrated or modified.

Reference: https://developer.chrome.com/docs/ai/prompt-api
