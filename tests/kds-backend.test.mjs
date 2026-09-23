import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/036_pos_kds_advanced.sql','utf8');
const edge=readFileSync('supabase/functions/remapro-pos-sync/index.ts','utf8');

for(const column of ['production_priority','production_sent_at','production_started_at','production_ready_at','production_served_at'])assert.ok(migration.includes(column),column+' missing');
for(const fn of ['pos_set_production_priority','pos_recall_production_order','pos_production_metrics'])assert.ok(migration.includes(fn),fn+' missing');
assert.match(migration,/avg_ready_minutes/);
assert.match(migration,/avg_served_minutes/);
assert.match(migration,/production_served_at=null/,'recall must reopen served items');
assert.match(migration,/idempotent.*priority/s,'priority retry must be idempotent');
assert.match(migration,/kitchen_status='ready'.*idempotent/s,'recall retry must be idempotent once items are already ready');
assert.match(edge,/advancedKds:true/);
assert.match(edge,/action==="set_production_priority"/);
assert.match(edge,/action==="recall_production_order"/);
assert.match(edge,/pos_production_metrics/);
assert.match(edge,/production_priority/);
assert.match(edge,/production_started_at/);
console.log('Advanced KDS backend schema, metrics, priority and recall checks passed');
