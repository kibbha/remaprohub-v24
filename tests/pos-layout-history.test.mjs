import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');
const pos=fs.readFileSync(new URL('../src/pos.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const editor=fs.readFileSync(new URL('../src/pos-layout.js',import.meta.url),'utf8');

assert.ok(edge.includes('restore_layout_version'),'restore action');
assert.ok(edge.includes('.eq("restaurant_id",restaurantId).eq("version",version)'),'restore is restaurant scoped');
assert.ok(edge.includes('draft_revision:revision'),'restore creates a new draft revision');
assert.ok(edge.includes('limit(12)'),'history is bounded');
assert.ok(edge.includes('published_by'),'history carries publisher metadata');
assert.ok(pos.includes('restorePosLayoutVersionToDraft'),'Hub client exposes restore');
assert.ok(pos.includes('layoutHistory:Array.isArray(layoutAdmin?.history)?layoutAdmin.history:[]'),'admin snapshot exposes history');
assert.ok(editor.includes('Historique des publications'),'history UI');
assert.ok(editor.includes('Restaurer en brouillon'),'safe restore wording');
assert.ok(editor.includes('ne modifie pas les caisses tant que vous ne republiez pas'),'restore does not auto-publish');
assert.ok(app.includes('restoreCurrentPosLayout'),'restore handler');
assert.ok(app.includes('onRestore:version=>restoreCurrentPosLayout(version)'),'editor is wired to restore');
console.log('Hub POS layout history/restore checks passed');
