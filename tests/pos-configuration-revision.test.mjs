import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260923112111_pos_configuration_revisions.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');
const validation=fs.readFileSync(new URL('../supabase/migrations/20260926072000_pos_bundle_cross_validation.sql',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

assert.ok(sql.includes('create table if not exists public.pos_configuration_revisions'),'revision table');
assert.ok(sql.includes('language plpgsql security invoker set search_path=public as $'),'trigger uses valid invoker PL/pgSQL delimiter');
assert.ok(sql.includes('pos_bump_configuration_revision'),'revision trigger function');
for(const table of ['pos_catalog_items','pos_tables','pos_operators','pos_printers','pos_payment_terminals','pos_provider_connections','pos_layout_versions']){
  assert.ok(sql.includes('on public.'+table),'tracks '+table);
}
assert.ok(!sql.includes('on public.pos_layout_drafts'),'draft edits must not push to POS');
assert.ok(edge.includes('action==="configuration_head"'),'cheap head endpoint');
assert.ok(edge.includes('configurationRevision:Number(revisionResult?.data?.revision)||0'),'bootstrap carries revision');
assert.ok(edge.includes('"configuration_head"'),'operator-exempt member endpoint');
assert.ok(edge.includes('action==="bundle_validate"'),'Hub can validate a draft before publication');
assert.ok(validation.includes('create or replace function public.pos_bundle_validate'),'server-side bundle validator');
for(const code of ['LAYOUT_PRODUCT_MISSING','LAYOUT_MODIFIER_MISSING','MENU_CHOICE_PRODUCT_MISSING','FLOOR_TABLE_MISSING','PAYMENT_METHOD_REQUIRED']){
  assert.ok(validation.includes(code),'bundle validation covers '+code);
}
assert.ok(validation.includes('BUNDLE_VALIDATION_FAILED'),'publication is blocked when cross-validation fails');
console.log('POS configuration revision checks passed');

for(const token of ['data-pos-catalog-row','name="price"','name="taxRate"','name="category"','name="active"','pos-publication-preview']){
  assert.ok(app.includes(token),'Hub POS catalog/publication UI includes '+token);
}
assert.ok(app.includes("schedulePosCatalogAutoSync('catalog-editor')"),'catalog editor persists through the existing Hub catalog sync path');

for(const token of ['data-pos-operator-form','data-pos-printer-form','data-pos-terminal-form']){
  assert.ok(app.includes(token),'Hub POS device editor includes '+token);
}
for(const legacy of ["prompt('Nom affiché'","prompt('Adresse / ID matériel'","prompt('ID terminal prestataire'"]){
  assert.ok(!app.includes(legacy),'legacy prompt editor removed: '+legacy);
}

assert.ok(app.includes('data-pos-provider-form'),'payment providers use the structured inline editor');
assert.ok(!app.includes("prompt('Statut : waiting_contract"),'legacy payment-provider prompt editor is removed');
const bundleCardStart=app.indexOf('function posBundleCard()');
const methodLabelsAt=app.indexOf('const methodLabels=',bundleCardStart);
const previewAt=app.indexOf('const preview=',bundleCardStart);
assert.ok(methodLabelsAt>bundleCardStart&&methodLabelsAt<previewAt,'payment labels are initialized before publication preview rendering');
