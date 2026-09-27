import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20260923114500_pos_inventory_workspace_realtime.sql',import.meta.url),'utf8');
const financialSafety=fs.readFileSync(new URL('../supabase/migrations/20260927080500_pos_financial_sale_wins_stock_shortage.sql',import.meta.url),'utf8');
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
assert.ok(financialSafety.includes('oversold_quantity'),'manual availability must preserve shortage evidence');
assert.ok(financialSafety.includes("'shortage',v_shortage"),'Hub stock movement must preserve shortage metadata');
assert.ok(!financialSafety.includes("raise exception 'POS_STOCK_INSUFFICIENT"),'paid sale must not roll back on theoretical stock shortage');
assert.ok(!financialSafety.includes("raise exception 'POS_ITEM_AVAILABILITY_EXCEEDED"),'paid sale must not roll back on manual availability shortage');
assert.ok(financialSafety.includes('remaining_quantity=greatest(0,remaining_quantity-v_item.quantity)'),'manual availability must clamp at zero after a completed sale');

console.log('Realtime Hub/POS stock ledger and conflict-resolution guards OK');
