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

Hub can now prepare an immutable bundle snapshot containing the active catalog (including prices and tax), published layout, tables, active floor plan, printer/KDS routes, terminal payment capabilities, payment-method policy and KDS alert thresholds. The manager sees a preview count, edits the policy in the draft, publishes one version in a database transaction, and can restore an older version by creating a new version. POS verifies the SHA-256 checksum and schema before applying the bundle to its local configuration. Printer and terminal connection health is read live and merged by ID; it is never frozen in a publication. The head revision increments at publication; a subsequent direct configuration edit supersedes the catalog/layout/device bundle and POS resumes live reads. The published payment policy remains effective until another policy is published, including after direct configuration edits. Open orders, reservations, receipts, payments and offline queues remain outside the bundle. A rollback is refused if an active product, table, printer or terminal no longer exists in the live database.

## Next contract milestone

1. Add cross-reference and tax validation to the server-side preview, including standalone layout buttons, table IDs, routing and incompatible schemas.
2. Replace the transitional mixed endpoint refresh with one server response. POS already writes a managed offline snapshot as one record; operational records remain separate.
3. Keep provider credentials in server-side secret storage and reference them by ID only. Authorization and operator sessions must remain live server checks; never trust an offline permission snapshot to approve a sensitive action.
4. Make the behavior of historical prices and removed items explicit in the checkout API. A payment queued offline before a newly published restriction may be rejected at synchronization and needs cashier resolution.

The current bundle covers catalog, layout, floor plan, tables, printer/KDS routes, terminal capabilities, payment policy and KDS alert thresholds. The older direct publication controls remain available; their edits supersede the catalog/layout/device snapshot. The published payment policy continues to be enforced server-side across POS checkout actions and remains visible to POS even when another direct configuration edit supersedes the snapshot.
