# Hub → POS configuration contract

Hub owns restaurant configuration. Supabase stores the shared state; POS reads it and keeps a local copy for offline service. Sales, payments and queued events belong to POS and must never be overwritten by a configuration refresh.

## Current contract

| Domain | Hub action | POS read | Publication state |
| --- | --- | --- | --- |
| Catalog, prices, tax and recipe metadata | `sync_catalog` | `bootstrap` | Direct write; no draft or rollback yet |
| Touches, menus and modifiers | `save_layout_draft`, `publish_layout`, `restore_layout_version` | `bootstrap.layout` | Immutable published versions; restore copies a past version to a draft, then requires publication |
| Floor plan | `save_floor_plan`, `publish_floor_plan`, `restore_floor_plan_version` | `floor_plan_current`, `list_tables` | Per-plan version history |
| Tables, operators, printers, terminals and providers | Individual management actions | Dedicated list actions | Direct writes; no shared draft or rollback yet |

`pos_configuration_revisions` is a per-restaurant change counter, bumped by configuration table triggers. POS polls `configuration_head`; after a change, it fetches the managed resources and persists them locally. POS checks the counter before and after a refresh and retains its previous offline copy if publication overlaps its reads. An update may therefore take another polling cycle to appear.

Hub can now prepare an immutable bundle snapshot containing the active catalog (including prices and tax), published layout, tables and active floor plan. The manager sees a preview count, publishes one version in a database transaction, and can restore an older version by creating a new version. POS verifies the SHA-256 checksum and schema before applying the bundle to its local catalog/layout/tables/floor plan. The head revision increments at publication; a subsequent direct configuration edit supersedes the bundle and POS resumes live reads. Open orders, reservations, receipts, payments and offline queues remain outside the bundle. A rollback is refused if its catalog or active tables no longer exist in the live database.

## Next contract milestone

1. Move the remaining direct-write domains into the bundle: payment methods, printers/KDS routing, permissions and settings. Keep provider credentials in server-side secret storage and reference them by ID only.
2. Add cross-reference and tax validation to the server-side preview, including standalone layout buttons, table IDs, routing and incompatible schemas.
3. Replace the transitional mixed endpoint refresh and separate local cache writes with one server response and one atomic local snapshot write.
4. Preserve operational records, open orders, payment state, device settings and offline queue outside the bundle; make the behavior of historical prices and removed items explicit in the checkout API.

The current bundle covers catalog, layout and floor plan, with tables. The older direct publication controls remain available; their edits supersede a published bundle. This transitional behavior is displayed in Hub so the manager can prepare a fresh bundle after a direct change.
