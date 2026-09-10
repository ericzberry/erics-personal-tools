# Shared UI components

All extension UI is built here. `ui.js` owns native DOM construction and reusable presentation. `views.js` composes the shared pieces into screens. `tokens.css` owns the shared design tokens and title typography; `styles.css` owns the main component classes. `file-drop.js` owns reusable upload interaction. `src/app.js` mounts the screens before feature controllers attach.

| Component | Responsibility |
| --- | --- |
| AppHeader, ToolHeading, Main, Section, Stack | Shell, structure and layout |
| Heading, Text, Note, Label, Strong, Badge | Consistent typography |
| Button, Link, Field, Option, ActionGroup | Controls and accessible labels |
| Notice, StatusCard, Highlight, Metrics, SourceNote | Status and compact information |
| Disclosure, DataTable, List | Expandable and structured information |
| PickRow, RecommendationCard | Reusable draft data presentation |
| UploadField + attachFileDrop | Drop/browse upload with inline feedback |
| EditableResult | Editable generated output and copy action |

Components accept data and return native elements. Mount them once where possible; feature controllers can update content, disabled/hidden/loading state, and attach business callbacks. Dynamic lists use the same shared row/card components. Render external data as text, never HTML.

If no component fits, add or extend a component here first. Add a reusable class or variant here when a visual difference is needed; never style feature IDs or add feature-local CSS. Inputs must have an associated label. Buttons must expose their action and loading/disabled state.

The tests in `tests/components.test.js` enforce controller hooks, accessible fields, safe text rendering and the construction boundary. Test-only harness markup is not packaged with the extension.

`Title` owns title typography through `.title-text`; `Heading` is its compatibility alias. `SectionTitle`, `ToolHeading`, and `SubPage` compose it. Use `Disclosure` with `titleHeading: true` for section titles; ordinary disclosure controls retain compact labels. Do not add page-specific title font overrides.

`PageHeader` and `PageBody` own page spacing with `--page-inset` and `--section-gap`. `ToolHeading` and `Main` delegate to them. Compose new screens with these modules; do not add feature-specific outer padding.

`SettingsGroup` provides a titled, bounded settings section. `ActionGroup(children, {compact: true})` keeps maintenance actions adjacent and allows wrapping. Use secondary buttons for maintenance and danger buttons for destructive actions.

Use `settings-panel--compact` on a settings disclosure for tighter insets, group spacing, and field rhythm while retaining full control sizes. Credentials starts collapsed.

`SettingsList`, `SettingsItem`, and `SettingsLink` compose flat settings navigation. Items use native disclosures, compact heading typography, dividers, and trailing chevrons; links use a trailing external-link indicator. Use these for top-level settings categories instead of separate cards.

`CapabilityNavigation` renders the shared expandable navigation from `src/capabilities.js`. Keep feature-specific actions inside their screens. The controller distinguishes Current tab automatic mode from explicit capability selection; Escape closes the list and returns focus to its summary.

`Workspace`, `WorkspaceColumns`, `FieldGrid`, `ChoiceRow`, `EvidenceList`, and `ResultBlock` provide reusable search-workspace layouts and source-backed results. Restaurant screens are composed in `restaurant-views.js` and exported through `views.js`. `SettingsGroup` accepts an optional heading level to preserve page hierarchy.

`Select` now composes `FormattedSelect` from `select.js`. The native select retains the controller ID and value, while the shared trigger and option list handle keyboard and pointer interaction. `Field` supplies the visible label; editable model suggestions use `FormattedSuggestions`, retaining custom input. `select.css` and `tokens.css` are included in every host and the mobile offline shell.

`components/rewards.js` and `rewards-tool.js` share Rewards presentation and behavior between sidebar, full tab, and mobile. `rewards-offline.js` queues encrypted per-record changes and merges them through the existing wallet revision API. Inline delete confirmation replaces the browser dialog.
