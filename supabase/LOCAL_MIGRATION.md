
# LocalStorage migration strategy

Do NOT delete or overwrite local data when Supabase login is introduced.

Recommended first-run flow:

1. Detect existing localStorage data.
2. Snapshot it as immutable JSON.
3. Compute a SHA-256 hash.
4. Authenticate the user.
5. Ask whether the user wants to import this device's existing data.
6. Create a `migration_batches` row with status `pending`.
7. Upsert data in dependency order:
   organization -> restaurant -> ingredients -> recipes -> recipe_ingredients
   -> employees -> payroll -> sales -> temperatures -> documents/advice.
8. Validate counts and totals.
9. Mark the migration `completed`.
10. Keep the local snapshot until the user confirms the cloud copy is correct.

Never silently destroy localStorage during this migration.

For duplicate protection, every imported logical record should eventually carry
a stable `legacy_id` / `source_id` in the target schema. That field can be
added in the next migration once the exact V16 localStorage keys are mapped.
