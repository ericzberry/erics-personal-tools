# Shared UI components

All extension UI is built here. `ui.js` owns native DOM construction and reusable presentation. `views.js` composes the shared pieces into screens. `styles.css` owns the design tokens and component classes. `file-drop.js` owns reusable upload interaction. `src/app.js` mounts the screens before feature controllers attach.

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
