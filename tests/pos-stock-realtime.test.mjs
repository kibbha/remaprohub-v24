import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20260923114500_pos_inventory_workspace_realtime.sql',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../supabase/functions/remapro-sync/index.ts',import.meta.url),'utf8');
const docs=fs.readFileSync(new URL('../docs/stock-sync.md',import.meta.url),'utf8');

assert.ok(sql.includes('pos_inventory_workspace_realtime'));
assert.ok(sql.includes("m->>'posMovementId'=new.id::text"));
assert.ok(sql.includes("'{stockMoves}'"));
assert.ok(sql.includes('revision=v_next_revision'));
assert.ok(sql.includes("'{stockMoves}',to_jsonb(v_next_revision)"));
assert.ok(sql.includes('acknowledged_at=coalesce(acknowledged_at,now())'));
assert.ok(!sql.includes("'{stock}'"),'POS sales must not overwrite stock master data');
assert.ok(sync.includes('conflictingKeys'));
assert.ok(sync.includes('recorded>baseRevision'));
assert.ok(docs.includes('SYNC_CONFLICT'));
assert.ok(docs.includes('posMovementId'));
console.log('Realtime Hub/POS stock ledger and conflict-resolution guards OK');
