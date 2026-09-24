# Hub → POS configuration contract

Hub owns restaurant configuration. Supabase stores the shared state; POS reads it and keeps a local copy for offline service. Sales, payments and queued events belong to POS and must never be overwritten by a configuration refresh.

## Current contract

| Domain | Hub action | POS read | Publication state |
| --- | --- | --- | --- |
| Catalog, prices, tax and recipe metadata | `sync_catalog` | `bootstrap` | Direct write; no draft or rollback yet |
| Touches, menus and modifiers | `save_layout_draft`, `publish_layout`, `restore_layout_version` | `bootstrap.layout` | Immutable published versions; restore copies a past version to a draft, then requires publication |
| Floor plan | `save_floor_plan`, `publish_floor_plan`, `restore_floor_plan_version` | `floor_plan_current`, `list_tables` | Per-plan version history |
| Tables, operators, printers, terminals and providers | Individual management actions | Dedicated list actions | Direct writes; no shared draft or rollback yet |

`pos_configuration_revisions` is a per-restaurant change counter, bumped by configuration table triggers. POS polls `configuration_head`; after a change, it fetches the managed resources and persists them locally. The counter is a change signal, not an immutable published bundle. POS checks the counter before and after a refresh and retains its previous offline copy if publication overlaps its reads. An update may therefore take another polling cycle to appear.

## Next contract milestone

1. Introduce one draft bundle per restaurant with a schema version and an optimistic draft revision. Cover catalog, prices and tax, layout, floor plan, payment methods, printers and KDS routing, permissions and settings. Keep provider credentials in server-side secret storage and reference them by ID only.
2. Validate references and constraints on the server; provide a Hub preview of the exact bundle POS would receive. Reject missing products, invalid tax and price values, dangling table IDs and incompatible schema versions.
3. Publish through one transaction that inserts an immutable bundle, advances one published pointer and its revision, and records actor, time and checksum. POS must fetch the bundle by published revision, verify schema and checksum, then replace its local configuration snapshot as one unit.
4. Rollback by publishing a new version copied from a previous bundle. Preserve every version and the audit trail; never rewrite an earlier publication.
5. Keep operational records, open orders, payment state, device settings and offline queue outside the bundle. Specify safe migration behavior for a removed product or table still referenced by an open order.

The current UI and API support versioned publication for layout and floor plans only. Do not label other domains as draft or rollback capable until the bundle transaction and POS reader are implemented and tested against a real database.
