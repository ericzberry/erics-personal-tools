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
