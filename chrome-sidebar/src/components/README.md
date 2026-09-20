# Shared UI components

All extension UI is built here. `ui.js` owns native DOM construction and reusable presentation. `views.js` composes the shared pieces into screens. `tokens.css` owns the shared design tokens and title typography; `styles.css` owns the main component classes. `file-drop.js` owns reusable upload interaction. `src/app.js` mounts the screens before feature controllers attach.

| Component | Responsibility |
| --- | --- |
| AppHeader, ToolHeading, Main, Section, Stack | Shell, structure and layout |
| Heading, Text, Note, Label, Strong, Badge | Consistent typography |
| Button, Link, Field, Option, ActionGroup | Controls and accessible labels |
| Notice + setStatus, Spinner, ProgressBar | Status in one of four tones, and constant progress indicators |
| StatusCard, Highlight, Metrics, SourceNote | Compact information |
| Disclosure, DataTable, List | Expandable and structured information |
| PickRow, RecommendationCard | Reusable draft data presentation |
| UploadField + attachFileDrop | Drop/browse upload with inline feedback |
| ResultSection | One generated thing: its name, the action that makes it, its status, and the editable result with a copy action |

Components accept data and return native elements. Mount them once where possible; feature controllers can update content, disabled/hidden/loading state, and attach business callbacks. Dynamic lists use the same shared row/card components. Render external data as text, never HTML.

If no component fits, add or extend a component here first. Add a reusable class or variant here when a visual difference is needed; never style feature IDs or add feature-local CSS. Inputs must have an associated label. Buttons must expose their action and loading/disabled state.

The tests in `tests/components.test.js` enforce controller hooks, accessible fields, safe text rendering and the construction boundary. Test-only harness markup is not packaged with the extension.

`Notice`, `setStatus`, `Spinner` and `ProgressBar` are the whole status
vocabulary. A controller says what kind of thing happened —
`setStatus(node, text, 'alert' | 'error' | 'progress' | 'success')` — and
`status.css` supplies the colour, the mark and, for progress, a spinner that
turns for as long as the work does. An unknown tone throws, clearing the text
clears the tone, and a new tone replaces the last rather than stacking on it.
Never write `status.textContent` or colour a status line from a feature
stylesheet: both are a second vocabulary, which is what this one replaces. Pass
no tone for a standing condition — locked, disconnected, offline, or simply
what is listed — because a tone reports an event, and only an error is drawn
with a surface of its own.
`Spinner` and `ProgressBar` are for an indicator beside the thing being worked
on; `ProgressBar` runs indeterminate until `setProgress` gives it a fraction.
The meanings are defined in [DESIGN.md](../../../docs/DESIGN.md#status-tones)
and reviewed together at `tests/status-tones-preview.html`.

`Title` owns title typography through `.title-text`; `Heading` is its compatibility alias. `SectionTitle`, `ToolHeading`, and `SubPage` compose it. Use `Disclosure` with `titleHeading: true` for section titles; ordinary disclosure controls retain compact labels. Do not add page-specific title font overrides. `GroupTitle` is the separate, sans-serif label for a run of records through `.group-title`; use it — not `Title` — where a heading names a group rather than a page or section. It is set at the records' own size and ink and a step heavier, never shrunk into a pale eyebrow below the rows it heads.

`PageHeader` and `PageBody` own page spacing with `--page-inset` and `--section-gap`. `ToolHeading` and `Main` delegate to them. Compose new screens with these modules; do not add feature-specific outer padding.

`SettingsGroup` provides a titled, bounded settings section. `ActionGroup(children, {compact: true})` keeps maintenance actions adjacent and allows wrapping. Use secondary buttons for maintenance and danger buttons for destructive actions.

Use `settings-panel--compact` on a settings disclosure for tighter insets, group spacing, and field rhythm while retaining full control sizes. Settings items start collapsed.

`SettingsList`, `SettingsItem`, and `SettingsLink` compose flat settings navigation. Each thing a settings screen manages appears once: the cloud connection is the travel wallet's own connection panel, and AI connections are a link to the page that owns them. Items use native disclosures, compact heading typography, dividers, and trailing chevrons; links use a trailing external-link indicator. Use these for top-level settings categories instead of separate cards.

`CapabilityNavigation` renders the shared expandable sidebar navigation from `src/capabilities.js`, `CapabilityLauncher` the icon grid, and `CapabilityMenu` the mobile dropdown that wraps that grid. All three group entries by the registry's `section`, so an entry moves in both hosts at once; the sidebar shows a named section as one row that opens to reveal its tools, so give every section an icon in `src/capabilities.js`. Keep feature-specific actions inside their screens. The sidebar controller distinguishes Current tab automatic mode — which the toggle names and the menu does not list — from explicit capability selection, and marks the selected row with `aria-current` alone; Escape closes the list and returns focus to its summary. Mobile starts on Home with the grid shown in place and its summary hidden; once a tool is open the summary is the menu button, which wears the shared `Select` trigger's chrome — surface, border, and a caret that flips — and the open grid is drawn as the panel joined to its lower edge.

`ExpandableRecord` and `RecordRow` build ruled record lists, and `TravelGroup` heads a run of them with a `GroupTitle` category label, ruled off from its records by `.record-group-title`. `ExpandableRecord` owns the disclosure marker: `travel.css` draws it as a stroked chevron in a fixed right-hand column on `.record-row-toggle::after`, and an open row takes the surface fill so its number, metadata, actions, and confirmation read as one block. Grouping order comes from `groupTravelRecords` in `travel-data.js`, which follows the category registry and keeps retired categories rather than dropping their records — group in the data helper, not in a feature controller. Do not append a marker character to a record's name or restyle these rows per feature; the rules live in [DESIGN.md](../../../docs/DESIGN.md#record-layout).

`RowAction` and `RowLink` are what a record's own actions look like: a 24x24 stroked glyph through `IconButton`, carrying the label that names the record it would act on — "Edit Banana Republic · M", not "Edit" — which is what a screen reader reads and what a paused pointer shows. The shared verbs are `EDIT_GLYPH`, `DELETE_GLYPH`, `DONE_GLYPH`, `UNDO_GLYPH`, `SHOW_GLYPH`, `HIDE_GLYPH`, `COPY_GLYPH`, `OPEN_GLYPH` and `HISTORY_GLYPH`; `RowLink` is the same action where it opens a page elsewhere. `travel.css` owns how they wait at the end of `.record-line` and appear on hover, keyboard focus, or touch.

`RecordRow` is the pattern in use: the name on its line with these actions at the end of it, the record's detail and notes beneath, and `extra` — a delete confirmation, a sync conflict, a revealed value — inside the row under them. `SizeRow` adds one column, the size itself, between the name and the actions. Never stack an `ActionGroup` of Edit and Delete under every row: it doubles a list's length and makes its loudest thing the word Delete. A decision only some records are raising does belong there, in words, because it needs a sentence to be understood; the rules live in [DESIGN.md](../../../docs/DESIGN.md#row-actions).

`Workspace`, `WorkspaceFlow`, `FieldGrid`, `ChoiceRow`, `EvidenceList`, and `ResultBlock` provide reusable search-workspace layouts and source-backed results. `WorkspaceFlow` runs a workspace down the page — the search uses the full width and its results follow underneath — rather than pinning a form into a narrow side column; `.workspace-form` places the field groups side by side while the page is wide enough. Restaurant screens are composed in `restaurant-views.js` and exported through `views.js`. `SettingsGroup` accepts an optional heading level to preserve page hierarchy.

`SegmentedField` is the form control for a choice of two or three: the options stay visible side by side instead of hiding inside a menu. It is a real radio group in a `fieldset`, so keyboard and screen-reader behavior are native, and it exposes `value` like the `Select` it replaces, which is how a controller reads and sets it. Use `Select` once a choice has more options than fit a row.

`Select` now composes `FormattedSelect` from `select.js`. The native select retains the controller ID and value, while the shared trigger and option list handle keyboard and pointer interaction. `Field` supplies the visible label; editable model suggestions use `FormattedSuggestions`, retaining custom input. `select.css` and `tokens.css` are included in every host and the mobile offline shell.

`components/rewards.js` and `rewards-tool.js` share Rewards presentation and behavior between sidebar, full tab, and mobile. `rewards-offline.js` queues encrypted per-record changes and merges them through the existing wallet revision API. Inline delete confirmation replaces the browser dialog.

`ProtectedField` and `MaskedValue` present values that are encrypted on the
device before they are saved — today a card number on a rewards entry. The
resting state is masked: `MaskedValue` renders the last four digits, and a full
number appears only after `secret-vault.js` has been unlocked, in a monospaced
run so digits can be read back without miscounting. `ProtectedField` leaves its
inputs empty while a value is stored, because an empty input means "keep what is
saved"; removing a stored value is a separate, explicit action supplied by the
controller into the field's `-actions` group. Never render a protected value
through an ordinary `Field` or `RecordRow` detail line.

