# Repository guidance for all coding agents

This file holds repository-wide rules. Supporting documents hold architecture, component catalogues, rationale, and operating procedures. Keep rules concise and update affected supporting docs alongside behavior changes. Adapt outside examples to this repository; do not import another app's features, paths, commands, infrastructure assumptions, or design system.

## Read before working

- Read the applicable nested `AGENTS.md` and relevant documents before editing. Verify documented behavior against the implementation; correct stale guidance when it is within the task's scope.
- Keep shared rules here and project-specific rules in the relevant project's guidance. Link to the canonical explanation rather than maintaining competing copies.

| Work | Read |
| --- | --- |
| Repository orientation | [README.md](README.md) and the relevant project's README |
| Extension behavior and setup | [chrome-sidebar/AGENTS.md](chrome-sidebar/AGENTS.md), [chrome-sidebar/README.md](chrome-sidebar/README.md) |
| UI, controls, or layout | [docs/UI_COMPONENTS.md](docs/UI_COMPONENTS.md), its relevant host guide, and [docs/DESIGN.md](docs/DESIGN.md) |
| Rendered UI review and acceptance | [docs/VISUAL_QA.md](docs/VISUAL_QA.md) |
| Mobile, offline access, or shared assets | [mobile-app/README.md](mobile-app/README.md) and the shared modules included by `mobile-app/build.js` |
| API, authentication, storage, or deployment | [tools-api/README.md](tools-api/README.md), the affected schema files, and the package scripts |
| Cloudflare runtime, D1 lifecycle, or Worker release | [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) |
| AI calls or provider integrations | [model routing](tools-api/MODEL_ROUTING.md), [providers](tools-api/PROVIDERS.md) |
| Gmail or restaurant workflows | [Gmail](docs/GMAIL.md) or [restaurants](chrome-sidebar/RESTAURANTS.md) |

## Scope and concurrent work

- Inspect the branch, working-tree changes, and staged diff before editing. Preserve existing edits, including edits to the same file; never stash, reset, overwrite, or commit unrelated work to obtain a clean checkout.
- Work directly in `/Users/ericberry/erics-personal-tools`. Do not create sibling copies, release checkouts, or worktrees unless the user explicitly requests one. Fetch and reconcile released changes here, preserving unfinished edits. Build and package from this repository.
- Keep each commit scoped to one working logical change. Stage explicit paths or hunks and inspect the entire staged diff before committing. A path alone does not isolate another task's edits within the same file.
- Resolve conflicts by preserving both changes' intent. Do not select an entire side merely to make a build pass, force-push shared history, or remove a worktree containing unfinished work.
- Stop only processes owned by the current task after verifying their identity; shared previews and other agents' jobs are not disposable cleanup.

## Shared logic and service boundaries

- Before adding a helper, constant, data adapter, or component, search for its existing owner and consumers. Extend the canonical implementation and verify affected consumers instead of copying logic into feature controllers or the mobile app.
- Keep feature logic in capability modules and provider differences in provider adapters. Shared routers, storage, synchronization, and UI components must not accumulate provider-specific exceptions.
- Keep Worker source, schema changes, build configuration, and deployment procedures in the repository; credentials and local account configuration stay outside Git. Deploy the tested repository version. Reconcile emergency dashboard edits into source before the next deployment.
- For schema changes, provide an explicit upgrade path for existing D1 data; fresh-database initialization is not an upgrade test. Follow this repo's SQL/deployment conventions, verify existing-record preservation, and apply required schema changes before code that depends on them.
- Extension and offline mobile clients can remain on older versions. Keep API and queued-record formats compatible during rollout, and reject unsupported versions without deleting pending work or advancing synchronization state.
- Bound external requests, polling, payloads, and retries. Retry only when duplicate effects are prevented or the operation is safe to repeat; a timeout does not prove that a write or billable request failed.

## UI and UX standards

Apply these rules to every user-facing interface in this repository. Follow each project's component architecture and established visual language.

## Structure and hierarchy

- Group related status, content, and actions in a named section. A user should immediately see what each action affects.
- Anchor maintenance actions such as Refresh and Disconnect to their connection or resource. Never distribute bare actions across unexplained whitespace.
- Separate connection setup, saved records, and editing forms with headings and consistent spacing. Use a divider or subtle surface when it clarifies the boundary.
- Establish a clear reading order: heading, explanation/status, content or fields, then actions.
- Keep the most important action visually dominant; normally use one primary action per form or task group.
- Use progressive disclosure for secondary detail. Keep current status and necessary actions discoverable.
- Put the selected tool and saved information first on mobile. Keep device and connection maintenance secondary, omit unlocked-state banners and manual lock controls, and let tool content use the page scroll instead of a small nested scrolling box.
- Avoid redundant cards inside cards, gratuitous shadows, decorative icons, and oversized headings. Every visual boundary should explain a relationship. Capability launcher icons are navigation, not decoration, and are the exception.

## Controls and interaction

- Follow the action roles, density sizes, and state rules in [docs/DESIGN.md](docs/DESIGN.md). Use shared component variants; do not independently resize feature buttons.

- Make buttons visibly interactive. Use consistent primary, secondary, quiet, and destructive variants; reserve quiet text actions for clearly established contexts.
- Keep related buttons adjacent with a consistent gap. Use content-width actions unless equal widths serve a deliberate choice or layout.
- Label actions with concrete verbs. Keep labels stable and distinguish disconnecting a device from deleting stored data.
- Visually distinguish destructive actions, explain their effect, and provide undo or confirmation when loss is consequential. Never rely on color alone.
- Keep labels close to their inputs. Use persistent labels rather than placeholders as the only instruction.
- Preserve user input after failed operations. Show actionable errors near the affected workflow.
- Provide useful empty, loading, success, error, disabled, and disconnected states. Prevent duplicate submissions and layout jumps during async work.
- Keep secret values masked and never expose saved secrets in previews, logs, or screenshots.

## Visual consistency and accessibility

- Reuse shared components and design tokens for spacing, typography, colors, borders, and radii. Add reusable variants instead of one-off feature styles.
- Use a consistent spacing scale, with smaller gaps within a group and larger gaps between groups. Align related edges and baselines.
- Match the product's density. Compact layouts still need readable text, breathing room, and comfortable click targets.
- Use semantic HTML, associated labels, logical heading levels, keyboard navigation, visible focus, and accessible status announcements.
- Maintain readable contrast for text and controls; communicate state with text or shape as well as color.
- Support narrow layouts, zoom, long names, and wrapping action groups without clipping or horizontal overflow. Do not impose fixed heights on variable content.
- Respect reduced motion and avoid animation that obstructs work.

## Review before delivery

- Follow [docs/VISUAL_QA.md](docs/VISUAL_QA.md) and the [shared component and host guides](docs/UI_COMPONENTS.md).

- Inspect the rendered interface at its actual target size and a narrow supported size. A passing build is not a visual review.
- Check alignment, grouping, hierarchy, wrapping, focus visibility, and all changed interaction states using synthetic data.
- Exercise relevant interactions and run the existing architecture and behavior checks. Add tests for meaningful behavior changes, not superficial markup duplication.
- Fix visible defects before packaging. If a visual or live-environment check could not be completed, state that limit accurately.

## AI model selection

- Connections store provider access, not default models. Production features identify their task and use the central task policy to choose a model.
- Select the least expensive available, reviewed candidate that meets the task's capability and tool requirements. Increase requirements for more complex inputs; never silently lower them to save cost.
- Keep capability tiers, pricing sources, output budgets, and selection tests centralized. Add representative quality evaluations as tasks and model choices expand.
- Honor explicit user model choices within the relevant task policy, never as a global default. Manual model IDs belong only to per-request playground experiments. Never copy model constants into feature controllers.

## Automatic commit and push

- For every requested app change, increment each affected app version by at least 0.0.1, complete required checks and final builds, then commit and push the change before handing it back. Do not wait for a separate request to increment, commit, or push. Honor explicit requests to leave work uncommitted.
- Keep unrelated unfinished work out of the commit. Coordinate overlapping edits in this repository and stage only the intended changes; do not create another checkout.

## Canonical project and Chrome release location

- The only active source checkout is `/Users/ericberry/erics-personal-tools`. Build the extension to `/Users/ericberry/erics-personal-tools/chrome-sidebar/dist` and mobile to this repository’s `mobile-app/dist`.
- The legacy `/Users/ericberry/erics-tools-compact-release` path is a compatibility symlink to this repository so Chrome’s existing Load unpacked path keeps working. Never replace it with a separate checkout or copy release files there.
- Verify the canonical build’s manifest and release contents. Chrome may still require Reload to activate the files; distinguish delivered files from the version actually loaded.
- Previous checkouts and unpublished edits were preserved under `.git/consolidation-archive` and the named consolidation recovery stash. Do not restore old snapshots over newer releases without reviewing their differences.

## Mandatory version increment on every commit

- Every commit affecting the extension or mobile app must increment that app's patch version in the same commit. This includes fixes, refactors, tests, app documentation, and follow-up commits; “commit and push” is not an exception. Do not defer the increment to a later release commit.
- Increment both app versions when a commit affects both apps, including shared code or API behavior consumed by both. Determine affected apps from actual dependencies, not only the edited directory.
- Keep each affected app's version references aligned: extension manifest and package/lock metadata; mobile package, manifest, release-check version, service-worker cache version, and displayed version. Keep packaged archives and release documentation aligned when producing a release.
- Before committing, inspect the staged diff and verify that every affected app has a new version. Repository-wide instructions-only changes with no affected app do not require an app version increment.
- A version increment alone does not publish a release. Complete the build, checks, packaging, deployment, and D1 publication when delivering an app release, and report any incomplete step accurately.

## Mandatory release version publication

- Whenever an AI agent completes an app release, it must automatically publish that release's manifest version to D1 by running `node tools-api/scripts/publish-release.js` from the repository root. Existing authorization covers this step; do not ask the user to perform it or request permission again.
- Publish only after the build has passed its checks, been packaged, and been committed and pushed. Never publish an unfinished build or another agent's in-progress manifest version. Verify the version returned by `https://erics-tools-api.ezberry.workers.dev/v1/releases/latest` matches the release being delivered.
- If publication fails or authentication is unavailable, report that the D1 update remains incomplete; never claim the release is fully published.
- While open, the app checks the D1-backed release endpoint at most once per 60 minutes. Persist the last attempt across reopenings and restarts, share the throttle across sidebar instances, and throttle failed attempts too. Show an out-of-date banner only when the published version is newer than the installed version.
- Repository-wide instructions-only edits with no affected app do not constitute an app release and do not require D1 publication. Apply the per-commit version rule above to all app-affecting commits.

## Data capabilities, mobile, and offline access

- Every capability that stores or presents personal/reference data must also be available in the mobile app. Build mobile parity with the capability; do not deliver an extension-only data feature or an online-only mobile shell for it.
- Data that does not inherently require a live service must remain usable offline after its first successful download. Save the actual records and required reference assets, not only the app shell. Keep online-only actions (generation, live capture, external requests) separate from offline data access.
- Use the shared capabilities registry for navigation: the sidebar's Tools dropdown and the mobile launcher both read it. Add features such as Travel wallet as ordinary entries; do not add special home-page callouts, one-off feature links, or new function tabs.
- Give every capability an `icon` in the same change that registers it: a 24x24 stroked SVG path drawn with `currentColor`, sized and colored by the shared launcher styles. The mobile launcher renders one icon per capability, so an entry without an icon cannot be reached there. Keep the launcher alphabetical by label; registry order sets only the default tool.
- Reuse shared components and data adapters across extension and mobile. Persist private records in encrypted device storage, keep secret values masked, and never put authenticated responses in the service-worker shell cache.
- Support durable offline changes with per-record revisions, a pending-change queue, reconnect/foreground synchronization, explicit sync status, and conflict resolution. Never overwrite newer cloud data or discard unsynced changes silently.
- Disconnecting a device must explain and clear its private offline copies while leaving cloud records intact. Require pending changes to be synchronized or explicitly resolved before disconnecting. Browser storage can be evicted; do not present a device cache as a permanent backup.
- Verify a cold offline reopen, access to private values without a network request, queued edits surviving a restart, reconnection, conflicts, and cache clearing. Check the sidebar Tools dropdown and the mobile tool launcher at mobile and narrow sidebar widths.

## Complete app fixes through release

- A request to fix or change an app includes delivering the working change through the established release process. Do not stop at diagnosis, a local patch, passing tests, or a build and make the user ask again to release it. Honor an explicit request for investigation-only, review-only, or code-only work.
- Before reporting an app fix as complete, finish relevant behavior and visual checks, increment and align every affected app version, build the final changes, package the artifacts, inspect the staged diff, commit and push, deploy the affected services/mobile app, publish each affected app's version to D1, and verify the live versions and changed behavior where accessible. Follow the release ordering and publication rules below.
- Existing authorization for the app change covers these normal release steps. Do not ask a redundant "should I release it?" question or end with "fixed locally, not released" while authorized release work remains possible.
- If other tasks have unfinished changes, reconcile them in this canonical checkout and coordinate release versions. Preserve unpublished edits in a recoverable form when consolidation is explicitly authorized. Do not publish unfinished work or create sibling checkouts to bypass coordination.
- Distinguish code committed, artifact packaged, service deployed, update version published, and update installed. Do not imply that an extension archive is installed or published to a store. Provide the artifact and any remaining user installation step clearly.
- If a real blocker prevents delivery, complete all independent safe steps and report the exact blocked action, evidence, and minimum user action needed. Do not describe an unreleased fix as resolved. Repository-wide instructions-only edits do not require an app release.

## Mandatory build after every change

- After any change, automatically compile/build every affected app before handing the work back, committing, or packaging. Do not wait for the user to ask, and do not treat a small fix or follow-up as an exception.
- From the repository root, run `npm --prefix chrome-sidebar run build` for extension changes and `npm --prefix mobile-app run build` for mobile changes. Run both for shared code, shared assets, API behavior used by both apps, or repository-wide changes.
- Build after the final edit, including version and configuration updates; a build from before the latest change does not count. Fix build failures and rerun the affected build before claiming completion. If blocked, report which build remains incomplete and why.
- Building does not replace required tests, visual review, version increments, packaging, deployment, or D1 release publication. Never publish another task's unfinished work merely because it builds.

## User density preference

- Prefer compact interfaces with minimal whitespace. Use normal body-size record values, 2–4px gaps within record details, and 8–12px between related groups. Avoid stacked container padding and oversized numbers; preserve accessible shared control hit targets.

## Formatted controls

- Every dropdown must use the shared formatted `Select` component, including its open options menu, on extension and mobile. Do not ship plain browser/OS select menus or feature-specific dropdown implementations.
- Format all controls with shared typography, spacing, surfaces, borders, focus and disabled states. Keep persistent labels and compact layouts; preserve accessible touch targets.
- Dropdowns must support keyboard navigation, type-ahead, Escape, outside dismissal, long labels, disabled options, and visible selected states. Share assets with mobile and include them in its offline shell.

- Editable suggestion menus (such as model IDs) also use the shared formatted combobox; keep custom text entry available instead of exposing a native datalist popup.
