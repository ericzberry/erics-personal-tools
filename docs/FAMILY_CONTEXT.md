# Family & places

An ordinary shared capability holds reference facts the owner wants the app's AI
features to use. It is separate from passkey-sealed Personal information: the
Worker can decrypt these facts to include relevant context in a provider request.
Names or descriptive labels, relationship (You, Partner, Child, Other), location
and short notes are editable on both hosts. Other people are not counted as family.

An age is stored with its reference year. For target year Y the projection is
`age + Y - ageYear`. It is a year-based estimate, not an invented birthday. The
app displays the current-year estimate and the original reference. The provider
receives both so a request for a later travel year can use the proper estimate.

`people-data.js` owns validation, projection and relevance; `people-offline.js`
uses the common encrypted offline queue and revision conflict rules. `people.js`
and `components/people.js` render the same editor in both hosts. The extension's
standalone entry is `people.html` / `people-page.js`. The registry includes the
store in disconnect and token-change cleanup.

`/v1/people` and `/snapshot` use the generic encrypted D1 record store. Apply
`tools-api/people-schema.sql` as an additive migration before deploying. These
reference records have no automatic expiry; explicit deletion removes them.
The AI connection loader reads up to 40 recent reference records. The central
provider adapter adds only records relevant to family or a named person in the
user input. Current explicit instructions override defaults. Reference notes are
data, never instructions. No extra model call or model selection is introduced.

Tests: `people.test.js`, `people-controller.test.js`, API `people.test.js` and
`owner-context.test.js`, plus the common offline tests. The synthetic visual
fixture is `tests/people-preview.html`; the normal mobile preview includes it too.
