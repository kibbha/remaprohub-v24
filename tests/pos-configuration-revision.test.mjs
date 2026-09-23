import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260923130000_pos_configuration_revisions.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');

assert.ok(sql.includes('create table if not exists public.pos_configuration_revisions'),'revision table');
assert.ok(sql.includes('pos_bump_configuration_revision'),'revision trigger function');
for(const table of ['pos_catalog_items','pos_tables','pos_operators','pos_printers','pos_payment_terminals','pos_provider_connections','pos_layout_versions']){
  assert.ok(sql.includes('on public.'+table),'tracks '+table);
}
assert.ok(!sql.includes('on public.pos_layout_drafts'),'draft edits must not push to POS');
assert.ok(edge.includes('action==="configuration_head"'),'cheap head endpoint');
assert.ok(edge.includes('configurationRevision:Number(revisionResult?.data?.revision)||0'),'bootstrap carries revision');
assert.ok(edge.includes('"configuration_head"'),'operator-exempt member endpoint');
console.log('POS configuration revision checks passed');
