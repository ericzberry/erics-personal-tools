# Areas and finding information

Both hosts use six destinations from `APP_AREAS` in
`chrome-sidebar/src/capabilities.js`: Today, Money, Travel, Info, Health, More.
The capability registry still owns stable data/tool IDs and legacy links.
The menu does not expose each data store as a separate destination.

- **Today** combines weather, Quick add and Needs attention. Reminders is its
  second view for managing dates. The embedded attention list retains its passkey
  gate, with explicit unlock so opening the weather does not raise a prompt.
- **Money** contains Net worth (formerly Finance), Cards & benefits,
  Subscriptions, and Taxes. The finance storage paths and existing URLs stay valid.
- **Travel** contains Plans and Documents. The document view filters the existing
  travel store to Passport, Visa and Trusted traveler; memberships remain in Info.
- **Info** searches People & places, Personal information, Memberships, Sizes,
  Gifts and Buy again as one collection. Adding is collapsed until requested.
  Results open the owning editor, filtered to the record's name where it has a
  search box, with one All info return action. Same-name results may still require
  choosing the record in that editor. No data is migrated or copied into a new store.
- **Health** keeps its existing private notebook.
- **More** holds Restaurants, Player rankings and sidebar Fantasy football.

`components/areas.js` composes the existing shared Tabs with actual panel nodes,
so switching areas preserves unsaved forms. The sidebar still follows the current
browser tab until the owner selects a destination. Page-specific offers remain
available. Standalone page pickers open the corresponding area through
`sidepanel.html?area=<id>`; old page URLs and card/advisor aliases still work.

## Info search and privacy

`info-data.js` projects allowlisted metadata from seven existing stores; `info.js`
loads them behind the existing shared vault gate. Search is local, token-based,
case/accent insensitive and works against downloaded offline copies. A source
failure is named rather than reported as an empty collection. A lock or disconnect
invalidates outstanding reads and clears the rendered collection.

The index never contains travel numbers, sealed values, protected notes or account
URLs. Product/gift web-search links use only the saved product description, never
the person's name or private record fields. Search results are external pages,
not verified recommendations or automatically saved product facts.

`isLoyaltyReward` in `balance-data.js` classifies independent memberships and
non-issuer loyalty balances for Info. Issuer currencies and card-linked benefits
stay with Money. Both views read and edit the same reward records; calculations
continue to see all eligible rewards. Travel numbers use the existing travel
store, partitioned in the UI by `isMembership`. No schema migration is needed.

## AI entry

Quick add uses the existing `capture.note` task, centrally selected in Settings.
It now handles people/places and subscriptions as well as reminders, sizes,
gifts and products. Subscription notes save as Review and cannot introduce
unobserved charges or generated research. Ages retain their reference year.
The saved summary and Undo remain available. Parsing requires a connection;
a failed/offline parse preserves the note for retry, while manual editors remain
usable offline. Clients declare supported destinations; older clients retain the
original four, including after a server upgrade.

Checks: `chrome-sidebar/tests/navigation.test.js`, `info.test.js`,
`attention-tools.test.js`, `tools-api/tests/capture.test.js`, and
`mobile-app/tests/tool-navigation.test.js`. The normal mobile preview uses
synthetic records and model responses; it makes no paid model calls.
