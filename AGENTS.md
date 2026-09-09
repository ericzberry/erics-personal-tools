# UI and UX standards for all agents

Apply these rules to every user-facing interface in this repository. Follow each project's component architecture and established visual language.

## Structure and hierarchy

- Group related status, content, and actions in a named section. A user should immediately see what each action affects.
- Anchor maintenance actions such as Refresh and Disconnect to their connection or resource. Never distribute bare actions across unexplained whitespace.
- Separate connection setup, saved records, and editing forms with headings and consistent spacing. Use a divider or subtle surface when it clarifies the boundary.
- Establish a clear reading order: heading, explanation/status, content or fields, then actions.
- Keep the most important action visually dominant; normally use one primary action per form or task group.
- Use progressive disclosure for secondary detail. Keep current status and necessary actions discoverable.
- Avoid redundant cards inside cards, gratuitous shadows, decorative icons, and oversized headings. Every visual boundary should explain a relationship.

## Controls and interaction

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

- Inspect the rendered interface at its actual target size and a narrow supported size. A passing build is not a visual review.
- Check alignment, grouping, hierarchy, wrapping, focus visibility, and all changed interaction states using synthetic data.
- Exercise relevant interactions and run the existing architecture and behavior checks. Add tests for meaningful behavior changes, not superficial markup duplication.
- Fix visible defects before packaging. If a visual or live-environment check could not be completed, state that limit accurately.

## AI model selection

- Connections store provider access, not default models. Production features identify their task and use the central task policy to choose a model.
- Select the least expensive available, reviewed candidate that meets the task's capability and tool requirements. Increase requirements for more complex inputs; never silently lower them to save cost.
- Keep capability tiers, pricing sources, output budgets, and selection tests centralized. Add representative quality evaluations as tasks and model choices expand.
- Honor explicit user model choices within the relevant task policy, never as a global default. Manual model IDs belong only to per-request playground experiments. Never copy model constants into feature controllers.

## Mandatory release version publication

- Whenever an AI agent completes an app release, it must automatically publish that release's manifest version to D1 by running `node tools-api/scripts/publish-release.js` from the repository root. Existing authorization covers this step; do not ask the user to perform it or request permission again.
- Publish only after the build has passed its checks, been packaged, and been committed and pushed. Never publish an unfinished build or another agent's in-progress manifest version. Verify the version returned by `https://erics-tools-api.ezberry.workers.dev/v1/releases/latest` matches the release being delivered.
- If publication fails or authentication is unavailable, report that the D1 update remains incomplete; never claim the release is fully published.
- While open, the app checks the D1-backed release endpoint at most once per 60 minutes. Persist the last attempt across reopenings and restarts, share the throttle across sidebar instances, and throttle failed attempts too. Show an out-of-date banner only when the published version is newer than the installed version.
- Instructions-only edits do not constitute a new app build and do not require a version bump or D1 publication.
