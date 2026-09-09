# Eric’s Personal Tools — UI rules

The user requires every extension UI element to come from a reusable component.

- Reuse or extend `src/components/ui.js`; compose screens in `src/components/views.js`.
- New presentation patterns become shared components before they are used by a feature. Do not copy markup or styles between features.
- DOM construction, HTML templates, and presentation styles belong only in `src/components/`. `sidepanel.html` is a bootstrap document, not a screen template.
- Feature controllers own data, async work and event handling. They may update component state/content, but must not construct raw elements or inject HTML.
- Style reusable classes and variants, not feature IDs. IDs are controller/accessibility hooks only.
- All uploads use `UploadField` and the shared `components/file-drop.js` behavior (drop, browse, validation and status).
- Prefer native accessible elements inside components. Keep keyboard support, labels, disabled/loading states, and text-safe rendering.
- Preserve the compact design and active-tab navigation. Do not add function tabs.
- Run the component architecture checks and relevant behavior tests before building the release.

## Release versions

- Increment the extension patch version for every delivered update, including follow-up fixes. Keep the manifest, package metadata, release archive filename, and release documentation aligned.

## Layout and action structure

- Apply the repository-wide UI/UX rules in `../AGENTS.md` to every extension screen.
- Use `SettingsGroup` for a titled group of related settings, status, and actions.
- Use `ActionGroup` with `compact: true` for adjacent maintenance and row actions; use explicit secondary and danger button variants instead of floating text.
- Keep the sidebar usable at 280px and normal sidebar widths. Check long saved names and wrapped actions using synthetic credentials.

## Release availability

- After packaging and publishing a release, run `node tools-api/scripts/publish-release.js` from the repository root to update the version in D1. Never advertise an unfinished build. The sidebar checks this metadata at most once per hour.

## Mandatory release version publication

- Whenever an AI agent completes an app release, it must automatically publish that release's manifest version to D1 by running `node tools-api/scripts/publish-release.js` from the repository root. Existing authorization covers this step; do not ask the user to perform it or request permission again.
- Publish only after the build has passed its checks, been packaged, and been committed and pushed. Never publish an unfinished build or another agent's in-progress manifest version. Verify the version returned by `https://erics-tools-api.ezberry.workers.dev/v1/releases/latest` matches the release being delivered.
- If publication fails or authentication is unavailable, report that the D1 update remains incomplete; never claim the release is fully published.
- While open, the app checks the D1-backed release endpoint at most once per 60 minutes. Persist the last attempt across reopenings and restarts, share the throttle across sidebar instances, and throttle failed attempts too. Show an out-of-date banner only when the published version is newer than the installed version.
- Instructions-only edits do not constitute a new app build and do not require a version bump or D1 publication.
