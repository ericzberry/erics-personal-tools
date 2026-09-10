# Shared UI components

One component foundation serves three hosts. Read this guide first, then the relevant companion:

| Host | Guide | Primary concern |
| --- | --- | --- |
| Extension sidebar | [Extension](UI_COMPONENTS_EXTENSION.md) | Compact, context-aware work at 280–380px |
| Mobile app | [Mobile](UI_COMPONENTS_MOBILE.md) | Touch, private offline data, and a single page scroll |
| Pages opened by the extension | [Full-tab pages](UI_COMPONENTS_PAGES.md) | Focused editors, settings, and wider workspaces |

[DESIGN.md](DESIGN.md) owns tokens, typography, control roles, and density values. This document owns component selection and extension principles. The [component source README](../chrome-sidebar/src/components/README.md) maps implementation ownership. [VISUAL_QA.md](VISUAL_QA.md) owns rendered acceptance. Host guides adapt composition and interaction; they do not define separate palettes or copies of controls.

## Implementation ownership

Shared DOM primitives live in `chrome-sidebar/src/components/ui.js`; `views.js` and sibling component modules compose screens. `tokens.css` owns the palette and title typography; `styles.css` owns base components; shared styles such as `travel.css`, `select.css`, and `workspace.css` support their corresponding components. Feature controllers own data, async operations, and callbacks, and update component state rather than constructing presentation markup.

Mobile has its own shell in `mobile-app/public/app/` and imports shared modules assembled by `mobile-app/build.js`. Keep host shell behavior there and reusable capability presentation in the shared layer. Full-tab extension documents load their components directly from the extension package. Do not edit generated `dist` files or maintain hand-copied mobile implementations.

The catalogue below describes existing exports, not a promise that each component has every desirable option. Read the function signature and existing consumers before use. New patterns must be implemented before a feature can rely on them; this repo does not have the source app's global template enhancers, dialog helpers, pager, or component guard commands.

## Pick a component

| Need | Existing component | Guidance |
| --- | --- | --- |
| App identity and tool selection | `AppHeader`, `CapabilityNavigation`, `CapabilityMenu`, `CapabilityLauncher` | Use the capabilities registry and general Tools navigation; a registry `section` groups entries under a heading in both hosts |
| Page heading and body | `PageHeader`, `PageBody`; `ToolHeading` and `Main` aliases | One page title; shared insets and section rhythm |
| Section heading or secondary view | `SectionTitle`, `SubPage`, `Section` | Name the group and provide a meaningful return path |
| Layout | `Stack`, `ActionGroup`, `Workspace`, `WorkspaceColumns`, `FieldGrid` | Compose layout before introducing new wrappers |
| Text and supporting detail | `Title`, `Text`, `Note`, `Strong`, `Label` | `Heading` aliases `Title`; `Label` is a text span, not an input label |
| Form and labeled inputs | `Form`, `FormStack`, `FormField`, `Field` | `Field` supplies an associated label and control |
| Actions and links | `Button`, `Link`, `CopyIconButton` | Choose role and density explicitly; use real links for navigation |
| Select or editable suggestions | `Select`, `Field` with `kind: 'select'` or `list` | Shared formatted trigger and open menu; keep custom text for suggestions |
| Boolean choice | `Toggle`, `ChoiceRow` | Keep the explanation and click target together |
| Secondary detail | `Disclosure`, `ExpandableRecord` | Current status and frequent actions remain discoverable |
| Compact saved records | `RecordRow`, `ExpandableRecord` | Avoid a card for every line of metadata |
| Settings | `SettingsList`, `SettingsItem`, `SettingsLink`, `SettingsGroup` | Flat navigation; named groups for status, fields, and maintenance |
| Feedback and facts | `Notice`, `Badge`, `StatusCard`, `SourceNote` | Use truthful text; `Notice` provides status semantics, not an entire error workflow |
| Data comparison | `DataTable`, `List` | Keep headers meaningful; choose records over a table when columns add no value |
| Research results | `ResultBlock`, `EvidenceList`, `OutputText` | Separate evidence, generated conclusions, and operation status |
| Editable generated output | `EditableResult` | Keep editing and copying available; preserve edits across async work |
| Upload | `UploadField` with `attachFileDrop` | Shared browse/drop handling, validation, and inline feedback |
| Specialized domain presentation | Existing modules such as `travel.js`, `restaurant-views.js`, and draft components | Reuse the relevant view rather than duplicating its rows in another host |

## Add or extend in this order

1. **Reuse:** search the catalogue, source, and consumers. A near match usually needs composition or an existing variant.
2. **Separate layout from controls:** grids, insets, and columns belong in shared layout components or documented host modifiers. A layout change must not create another button, input, menu, or card style. Keep extension presentation inside `src/components/`; the other app's permission for page-local CSS does not apply here.
3. **Add a variant when only one context differs:** preserve current defaults and consumer behavior. Use semantic roles or host modifiers rather than feature-ID selectors or repeated override chains. Size comes from shared density options, not controller-supplied padding.
4. **Add a component when the interaction is new:** document its purpose, when to avoid it, inputs, state ownership, accessibility, lifecycle, and reference consumer. Implement it with shared tokens and native semantics. Keep business actions in callbacks rather than embedding API calls in presentation.
5. **Deliver to every affected host:** include required modules and styles in the mobile build and offline shell. Review consumers before changing a shared default; extend relevant behavior and architecture checks. Remove replaced duplicates within the task's scope without turning the change into unrelated cleanup.

Document the final component API alongside the implementation. Do not describe a proposed component as already available or create an exemption merely to bypass an architecture check.

## Actions, forms, and selection

Use `Button` with an explicit role from DESIGN.md: primary, secondary, subtle, or destructive, and the appropriate density. Its legacy default is quiet, so do not rely on that default for a form's main action. Keep related actions in `ActionGroup`; stable labels and disabled/loading states should not change their size unexpectedly. Confirm consequential deletion beside the affected record using the existing pattern.

`Link` currently defaults to a new tab. Choose the target deliberately for internal navigation and make an external destination understandable. Avoid nested interactive elements, such as a clickable whole row containing another button.

Use `Field` or `FormField` for persistent labels, supporting descriptions, and inline errors. Do not use the exported `Label` span as a replacement for a form label. Preserve typed values, caret, selection, and focus when updating results. Disable duplicate submission while a request is pending; errors should identify how to recover without clearing the form.

`Select` wraps a hidden native select as the controller's value source and creates the shared visible combobox and list. Controllers update the underlying select through its supported value/options contract; they must not paint a second trigger. The component synchronizes programmatic changes and option mutations. Test both those updates and user selection when changing it. Editable suggestions use the shared combobox and retain free text; a datalist may supply data but must not appear as a native suggestion popup.

Preserve keyboard navigation, type-ahead, Escape, outside dismissal, disabled options, visible selection, and focus return. Menus must fit the available viewport without clipping under ancestor overflow. Keep current component state classes and ARIA attributes; do not import a universal `active` class convention from another app.

## Records, tables, and disclosure

Keep names and primary values readable at normal body size. Put brief metadata close to its record, with secondary content under disclosure. Use one boundary for one relationship; avoid a card inside a card solely to restyle the contents. Distinguish status from ordinary facts using text and existing semantics, not arbitrary badge colors.

Use a table when column comparison matters. `DataTable` is a simple rendering component; it does not provide sorting, paging, stacked mobile rows, or a keyboard-accessible scrolling wrapper automatically. If those behaviors are needed, add them to the shared layer and verify them before use. Prefer readable stacked records in narrow hosts. For an essential wide comparison, provide a labeled, keyboard-accessible table scroll region rather than clipping columns or making the whole page scroll horizontally.

When pagination becomes necessary, design one reusable control with the visible range, known total, navigation, and disabled/busy behavior. Do not invent totals when a service only offers a next cursor. Keep deliberate append behavior distinct from page navigation, and retain filters and selection across refreshes.

## State and component lifecycle

Compose empty, loading, error, pending, and success states from existing primitives until a reusable pattern is needed. Whole-feature empty and filtered empty need different explanations; neither should be produced by a failed request. Avoid routine up-to-date banners and duplicated zero summaries. Keep long operations honest about pending versus completed work.

Mount shared components once where practical. Refresh data without resetting unrelated input or reattaching duplicate handlers. Ignore stale async results when the query, record, or view has changed. Clean up component-owned listeners, observers, and pending work when replacing a mounted instance. Initialization must remain safe for dynamically inserted views; no global auto-enhancement system should be assumed.

Use the existing shared data notifications and adapters when records change across views or windows. A component should report an outcome through its callback or existing notification mechanism, not reach into another page's private DOM selectors. Notifications must not carry private record values merely to trigger a refresh.

## Dialogs and accessibility

Prefer existing inline edit and confirmation patterns for small tasks. If a modal or drawer becomes necessary, add a shared implementation with a labeled dialog, initial focus, contained keyboard focus, dismissal behavior, background interaction control, and focus restoration. Preserve unsaved input on failure or accidental dismissal. Do not assume `appConfirm`, `appToast`, or other helpers from the source document exist here.

Use semantic HTML, associated field labels, unique IDs, visible focus, readable contrast, and status announcements appropriate to the change. Keep external data as text; do not inject provider HTML. Host wrappers must not hide content or controls from keyboard access. Review long labels, zoom, reduced motion, and all changed states following VISUAL_QA.md.
